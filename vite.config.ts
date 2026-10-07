import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';

export default defineConfig(({ command, mode }) => {
  // Vite embeds public bindings in its bundle: reject private keys before building.
  const environment = loadEnv(mode, process.cwd(), 'VITE_SUPABASE_');
  const publicKey = environment.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (command === 'build' && publicKey) {
    let validPublicKey = publicKey.startsWith('sb_publishable_');
    if (!validPublicKey && publicKey.split('.').length === 3) {
      try {
        validPublicKey =
          JSON.parse(Buffer.from(publicKey.split('.')[1], 'base64url').toString()).role === 'anon';
      } catch {
        validPublicKey = false;
      }
    }
    if (!validPublicKey)
      throw new Error(
        'Use the Supabase Publishable key or legacy anon key. A private key must never be bundled in the frontend.',
      );
  }
  return {
    plugins: [react()],
    test: { include: ['src/**/*.test.ts'], setupFiles: ['./src/test-setup.ts'] },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('/node_modules/@supabase/')) return 'supabase';
            if (/\/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react';
          },
        },
      },
    },
  };
});
