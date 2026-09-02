import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.{test,spec}.ts', 'tests/**/*.{test,spec}.js'],
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
