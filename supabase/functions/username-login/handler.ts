import {
  parseCredentials,
  privateHash,
  rateLimitAddress,
  readBoundedJson,
  responseHeaders,
} from './helpers.ts';

export interface LoginTokens {
  access_token: string;
  refresh_token: string;
}

export interface LoginBackend {
  allowLogin(usernameHash: string, ipHash: string): Promise<boolean>;
  findEmail(username: string): Promise<string | null>;
  verifyPassword(email: string, password: string): Promise<LoginTokens | null>;
}

interface Dependencies {
  origins: Set<string>;
  secretKey: string | undefined;
  configured: boolean;
  createBackend(): LoginBackend;
}

export function createLoginHandler(dependencies: Dependencies) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin');
    const headers = responseHeaders(origin, dependencies.origins);
    const respond = (status: number, payload: Record<string, unknown>) =>
      new Response(JSON.stringify(payload), { status, headers });

    if (origin && !dependencies.origins.has(origin))
      return respond(403, { error: 'origin_not_allowed' });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return respond(405, { error: 'method_not_allowed' });
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
      return respond(400, { error: 'invalid_credentials' });
    if (!dependencies.configured || !dependencies.secretKey)
      return respond(503, { error: 'login_temporarily_unavailable' });

    let credentials: ReturnType<typeof parseCredentials>;
    try {
      credentials = parseCredentials(await readBoundedJson(request));
    } catch {
      return respond(400, { error: 'invalid_credentials' });
    }
    if (!credentials) return respond(400, { error: 'invalid_credentials' });

    try {
      const backend = dependencies.createBackend();
      const [usernameHash, ipHash] = await Promise.all([
        privateHash(`username:${credentials.identifier}`, dependencies.secretKey),
        privateHash(`ip:${rateLimitAddress(request.headers)}`, dependencies.secretKey),
      ]);
      if (!(await backend.allowLogin(usernameHash, ipHash)))
        return respond(429, { error: 'too_many_attempts' });

      // Unknown usernames also reach Auth password verification. The response
      // never reveals the registered email or explicitly confirms an account.
      const email =
        (await backend.findEmail(credentials.identifier)) ??
        `missing-${usernameHash}@invalid.example`;
      const tokens = await backend.verifyPassword(email, credentials.password);
      if (!tokens) return respond(401, { error: 'invalid_credentials' });
      return respond(200, {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
      });
    } catch {
      // SDK errors can contain identifiers. Return no exception text or logs.
      return respond(503, { error: 'login_temporarily_unavailable' });
    }
  };
}
