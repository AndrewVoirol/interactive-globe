import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['tests/**/*.{test,spec}.{ts,js,tsx,jsx}'],
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
