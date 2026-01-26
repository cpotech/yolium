#!/usr/bin/env node

/**
 * Build script for Yolium Electron app.
 *
 * This script builds all Vite targets (main, preload, renderer) to the
 * expected output directories. Used for E2E testing where we need the
 * build artifacts without running the full electron-forge package step.
 *
 * Output:
 *   - .vite/build/main.js (main process)
 *   - .vite/build/preload.js (preload script)
 *   - .vite/renderer/main_window/ (renderer)
 */

import { build } from 'vite';
import { builtinModules } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { mkdirSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

// All Node.js built-in modules that should be externalized for Electron main process
const nodeBuiltins = [
  ...builtinModules,
  ...builtinModules.map(m => `node:${m}`),
];

// External modules that are native or need special handling
const externalModules = [
  'electron',
  'node-pty',
  'dockerode',
  'ssh2',
  'electron-store',
  'electron-log',
  'sudo-prompt-alt',
];

async function buildMain() {
  console.log('Building main process...');
  await build({
    configFile: false,
    root: projectRoot,
    build: {
      outDir: resolve(projectRoot, '.vite/build'),
      lib: {
        entry: resolve(projectRoot, 'src/main.ts'),
        formats: ['cjs'],
        fileName: () => 'main.js',
      },
      rollupOptions: {
        external: [...nodeBuiltins, ...externalModules],
        output: {
          // Ensure proper CJS format for Electron
          format: 'cjs',
          entryFileNames: 'main.js',
        },
      },
      minify: false,
      emptyOutDir: false,
      // Target Node.js (Electron uses Node.js for main process)
      target: 'node20',
      // Don't copy public assets for main process
      copyPublicDir: false,
    },
    // Disable SSR-specific transforms
    ssr: {
      target: 'node',
      noExternal: false,
    },
    resolve: {
      // Ensure we're resolving for Node.js environment
      conditions: ['node'],
    },
  });
}

async function buildPreload() {
  console.log('Building preload script...');
  await build({
    configFile: false,
    root: projectRoot,
    build: {
      outDir: resolve(projectRoot, '.vite/build'),
      lib: {
        entry: resolve(projectRoot, 'src/preload.ts'),
        formats: ['cjs'],
        fileName: () => 'preload.js',
      },
      rollupOptions: {
        external: [...nodeBuiltins, 'electron'],
        output: {
          format: 'cjs',
          entryFileNames: 'preload.js',
        },
      },
      minify: false,
      emptyOutDir: false,
      target: 'node20',
      copyPublicDir: false,
    },
    resolve: {
      conditions: ['node'],
    },
  });
}

async function buildRenderer() {
  console.log('Building renderer...');
  await build({
    configFile: resolve(projectRoot, 'vite.renderer.config.ts'),
    root: projectRoot,
    build: {
      outDir: resolve(projectRoot, '.vite/renderer/main_window'),
      emptyOutDir: true,
    },
  });
}

async function main() {
  // Ensure output directories exist
  const buildDir = resolve(projectRoot, '.vite/build');
  const rendererDir = resolve(projectRoot, '.vite/renderer/main_window');

  if (!existsSync(buildDir)) {
    mkdirSync(buildDir, { recursive: true });
  }
  if (!existsSync(rendererDir)) {
    mkdirSync(rendererDir, { recursive: true });
  }

  try {
    // Build all targets
    await buildMain();
    await buildPreload();
    await buildRenderer();

    console.log('\nBuild complete!');
    console.log('  Main:     .vite/build/main.js');
    console.log('  Preload:  .vite/build/preload.js');
    console.log('  Renderer: .vite/renderer/main_window/');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

main();
