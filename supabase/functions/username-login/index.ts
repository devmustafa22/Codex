import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { allowedOrigins } from './helpers.ts';
import { createLoginHandler } from './handler.ts';

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
