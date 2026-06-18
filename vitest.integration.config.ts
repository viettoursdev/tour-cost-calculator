import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/supabase/**/*.test.ts'],
    environment: 'node',
    hookTimeout: 30_000,
    testTimeout: 30_000,
    fileParallelism: false, // shared DB — run files serially to avoid cross-test interference
  },
});
