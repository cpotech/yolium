import { defineConfig } from 'vite';
import path from 'path';

// https://vitejs.dev/config
export default defineConfig({
  css: {
    postcss: path.resolve(__dirname, 'postcss.config.js'),
  },
});
