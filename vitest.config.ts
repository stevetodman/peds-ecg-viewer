import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/visual/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/index.ts'],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@types': resolve(__dirname, 'src/types'),
      '@config': resolve(__dirname, 'src/config'),
      '@data': resolve(__dirname, 'src/data'),
      '@signal': resolve(__dirname, 'src/signal'),
      '@renderer': resolve(__dirname, 'src/renderer'),
      '@pediatric': resolve(__dirname, 'src/pediatric'),
      '@utils': resolve(__dirname, 'src/utils'),
    },
  },
});
