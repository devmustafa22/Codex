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
