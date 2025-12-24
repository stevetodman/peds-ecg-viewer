import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
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
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'PedsEcgViewer',
      fileName: 'peds-ecg-viewer',
    },
    rollupOptions: {
      external: [],
      output: {
        globals: {},
      },
    },
  },
});
