import { defineConfig } from 'vite';
import path from 'path';

// https://vitejs.dev/config
export default defineConfig({
  css: {
    postcss: path.resolve(__dirname, 'postcss.config.js'),
  },
  resolve: {
    alias: {
      '@renderer': path.resolve(__dirname, '../src/renderer'),
      '@shared': path.resolve(__dirname, '../src/shared'),
    },
  },
});
