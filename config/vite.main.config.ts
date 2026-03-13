import { defineConfig } from 'vite';
import path from 'path';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      // Native modules cannot be bundled by Rollup
      // They must be loaded at runtime from node_modules
      // - node-pty: pseudo-terminal for shell spawning
      // - dockerode: Docker API client (depends on ssh2 with native crypto)
      // - gray-matter: YAML frontmatter parser (has complex dependencies)
      // - better-sqlite3: native SQLite bindings for schedule database
      external: ['node-pty', 'dockerode', 'ssh2', 'gray-matter', 'better-sqlite3'],
    },
  },
  resolve: {
    alias: {
      '@main': path.resolve(__dirname, '../src/main'),
      '@shared': path.resolve(__dirname, '../src/shared'),
    },
    // Ensure node-pty is treated as external in all contexts
    mainFields: ['module', 'main'],
  },
});
