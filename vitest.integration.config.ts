import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Well-known Supabase-CLI local dev values (not secret; identical across all local installs).
const LOCAL_SUPABASE_URL = 'http://127.0.0.1:54321';
const LOCAL_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(LOCAL_SUPABASE_URL),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(LOCAL_SUPABASE_ANON_KEY),
  },
  test: {
    include: ['tests/supabase/**/*.test.ts', 'tests/etl/**/*.test.ts'],
    environment: 'node',
    hookTimeout: 30_000,
    testTimeout: 30_000,
    fileParallelism: false, // shared DB — run files serially to avoid cross-test interference
  },
});
