import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      // Native modules cannot be bundled by Rollup
      // They must be loaded at runtime from node_modules
      // - node-pty: pseudo-terminal for shell spawning
      // - dockerode: Docker API client (depends on ssh2 with native crypto)
      // - gray-matter: YAML frontmatter parser (has complex dependencies)
      external: ['node-pty', 'dockerode', 'ssh2', 'gray-matter'],
    },
  },
  resolve: {
    // Ensure node-pty is treated as external in all contexts
    mainFields: ['module', 'main'],
  },
});
