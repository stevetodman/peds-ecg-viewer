import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
      '@types': resolve(import.meta.dirname, 'src/types'),
      '@config': resolve(import.meta.dirname, 'src/config'),
      '@data': resolve(import.meta.dirname, 'src/data'),
      '@signal': resolve(import.meta.dirname, 'src/signal'),
      '@renderer': resolve(import.meta.dirname, 'src/renderer'),
      '@pediatric': resolve(import.meta.dirname, 'src/pediatric'),
      '@utils': resolve(import.meta.dirname, 'src/utils'),
    },
  },
  build: {
    // `tsc` emits the declaration tree and renderer subpath before Vite
    // creates the distributable root bundle. Preserve both outputs.
    emptyOutDir: false,
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.ts'),
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
