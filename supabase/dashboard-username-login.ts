// Single-file copy for Supabase Dashboard > Edge Functions > Editor.
// Generated from functions/username-login/{helpers,handler,index}.ts.
// Only relative imports were removed; the login behavior is unchanged.
// Keep "Verify JWT" disabled for this pre-login password endpoint.
// Configure ALLOWED_ORIGINS with your exact website origin before using it.
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

export const USERNAME_PATTERN = /^[a-z0-9_]{3,24}$/;
export const MAX_REQUEST_BYTES = 8192;

export function parseCredentials(value: unknown): { identifier: string; password: string } | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.identifier !== 'string' || typeof record.password !== 'string') return null;
  const identifier = record.identifier.trim().toLowerCase();
  if (
    !USERNAME_PATTERN.test(identifier) ||
    record.password.length < 1 ||
    record.password.length > 128
  )
    return null;
  return { identifier, password: record.password };
}

export function allowedOrigins(configured: string | undefined): Set<string> {
  const candidates = (configured ?? 'http://localhost:5173,http://127.0.0.1:5173').split(',');
  const origins = new Set<string>();
  for (const candidate of candidates) {
    try {
      const parsed = new URL(candidate.trim());
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;
      if (parsed.username || parsed.password || parsed.search || parsed.hash) continue;
      if (parsed.pathname !== '/') continue;
      origins.add(parsed.origin);
    } catch {
      // Ignore invalid configuration entries rather than allowing wildcards.
    }
  }
  return origins;
}

export function responseHeaders(origin: string | null, origins: Set<string>): Headers {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    Vary: 'Origin',
  });
  if (origin && origins.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set(
      'Access-Control-Allow-Headers',
      'authorization, x-client-info, apikey, content-type',
    );
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  }
  return headers;
}

export async function readBoundedJson(request: Request): Promise<unknown> {
  const length = request.headers.get('content-length');
  if (length && Number(length) > MAX_REQUEST_BYTES) throw new Error('request_too_large');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('missing_body');
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_REQUEST_BYTES) throw new Error('request_too_large');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
}

export async function privateHash(value: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
}

export function rateLimitAddress(headers: Headers): string {
  // IP headers depend on the hosting proxy and must not be our only defense.
  // The independent username bucket cannot be bypassed by spoofing this value.
  const candidate = headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() ?? 'unknown';
  return /^[a-fA-F0-9.:]{3,64}$/.test(candidate) ? candidate : 'unknown';
}

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

function injectedKey(mapName: string, legacyName: string): string | undefined {
  try {
    const keys = JSON.parse(Deno.env.get(mapName) ?? '{}');
    if (typeof keys.default === 'string' && keys.default) return keys.default;
  } catch {
    // Legacy projects use the individual injected variables instead.
  }
  return Deno.env.get(legacyName);
}

const origins = allowedOrigins(Deno.env.get('ALLOWED_ORIGINS'));
const projectUrl = Deno.env.get('SUPABASE_URL');
const publicKey = injectedKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY');
const secretKey = injectedKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY');

const handler = createLoginHandler({
  origins,
  secretKey,
  configured: Boolean(projectUrl && publicKey && secretKey),
  createBackend() {
    const options = { auth: { persistSession: false, autoRefreshToken: false } };
    // New per-request clients prevent a successful sign-in from changing the
    // authorization state of an admin client reused by another request.
    const admin = createClient(projectUrl!, secretKey!, options);
    const userClient = createClient(projectUrl!, publicKey!, options);
    return {
      async allowLogin(usernameHash, ipHash) {
        const { data, error } = await admin.rpc('consume_username_login_limits', {
          p_username_hash: usernameHash,
          p_ip_hash: ipHash,
        });
        if (error) throw new Error('limiter_unavailable');
        return data === true;
      },
      async findEmail(username) {
        const { data: profile, error: profileError } = await admin
          .from('account_profiles')
          .select('id')
          .eq('username', username)
          .maybeSingle();
        if (profileError) throw new Error('profile_lookup_unavailable');
        if (!profile) return null;
        const { data, error } = await admin.auth.admin.getUserById(profile.id);
        if (error) throw new Error('account_lookup_unavailable');
        return data.user?.email ?? null;
      },
      async verifyPassword(email, password) {
        const { data, error } = await userClient.auth.signInWithPassword({ email, password });
        if (error || !data.session) return null;
        return {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        };
      },
    };
  },
});

Deno.serve(handler);
