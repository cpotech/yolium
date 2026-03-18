import { defineConfig } from 'vite';
import path from 'path';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config
export default defineConfig({
  plugins: [tailwindcss()],
  server: {
    host: '127.0.0.1',
  },
  resolve: {
    alias: {
      '@renderer': path.resolve(__dirname, '../src/renderer'),
      '@shared': path.resolve(__dirname, '../src/shared'),
    },
  },
});
