import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { PublisherGithub } from '@electron-forge/publisher-github';
import path from 'path';
import fs from 'fs';

// Modules that are external to the Vite bundle and must be copied
// These are externalized in config/vite.main.config.ts and need to be available at runtime
const externalModules = ['node-pty', 'dockerode', 'ssh2', 'gray-matter', 'better-sqlite3'];

// Find a module's package.json, checking nested node_modules if not at root
function findModulePath(moduleName: string, rootNodeModules: string, parentModulePath?: string): string | null {
  // First check the root node_modules
  const rootPath = path.join(rootNodeModules, moduleName);
  if (fs.existsSync(path.join(rootPath, 'package.json'))) {
    return rootPath;
  }

  // If we have a parent module, check various locations
  if (parentModulePath) {
    // Check parent's nested node_modules (child of parent)
    const nestedPath = path.join(parentModulePath, 'node_modules', moduleName);
    if (fs.existsSync(path.join(nestedPath, 'package.json'))) {
      return nestedPath;
    }

    // Check sibling modules (same node_modules directory as parent)
    // parentModulePath is like /root/node_modules/dockerode/node_modules/tar-fs
    // We want to check /root/node_modules/dockerode/node_modules/<moduleName>
    const parentDir = path.dirname(parentModulePath);
    if (parentDir.endsWith('node_modules')) {
      const siblingPath = path.join(parentDir, moduleName);
      if (fs.existsSync(path.join(siblingPath, 'package.json'))) {
        return siblingPath;
      }
    }
  }

  return null;
}

// Get all dependencies of a module recursively, handling nested node_modules
function getModuleDependencies(
  moduleName: string,
  rootNodeModules: string,
  visited = new Set<string>(),
  parentModulePath?: string
): Array<{ name: string; path: string }> {
  if (visited.has(moduleName)) return [];
  visited.add(moduleName);

  const modulePath = findModulePath(moduleName, rootNodeModules, parentModulePath);
  if (!modulePath) return [];

  const pkgPath = path.join(modulePath, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  const deps = Object.keys(pkg.dependencies || {});

  const allDeps: Array<{ name: string; path: string }> = [{ name: moduleName, path: modulePath }];
  for (const dep of deps) {
    allDeps.push(...getModuleDependencies(dep, rootNodeModules, visited, modulePath));
  }
  return allDeps;
}

// Recursively copy a directory
async function copyDir(src: string, dest: string): Promise<void> {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

const config: ForgeConfig = {
  packagerConfig: {
    asar: {
      // Unpack all node_modules so external modules and their deps can load
      unpack: '**/node_modules/**',
    },
    name: 'Yolium Desktop',
    executableName: 'yolium-desktop',
    // App icon (without extension - Electron picks .ico/.icns/.png based on platform)
    icon: 'assets/icon/favicon',
    // Copy docker and icon directories to resources folder for production builds
    extraResource: ['src/docker', 'src/agents', 'assets/icon'],
  },
  rebuildConfig: {
    // Skip rebuilding node-pty as it has prebuilt binaries for Windows
    // This avoids the winpty build failure (missing GetCommitHash.bat)
    onlyModules: [],
  },
  hooks: {
    // Copy native modules to the packaged app
    // Vite externals are not automatically included, so we must copy them manually
    packageAfterCopy: async (_config, buildPath) => {
      const nodeModulesSrc = path.resolve(__dirname, '..', 'node_modules');
      const nodeModulesDest = path.join(buildPath, 'node_modules');

      if (!fs.existsSync(nodeModulesDest)) {
        fs.mkdirSync(nodeModulesDest, { recursive: true });
      }

      // Collect all modules to copy (including transitive dependencies)
      // Uses a Map to track unique modules by name, storing their source paths
      const visited = new Set<string>();
      const modulesToCopy = new Map<string, string>();

      for (const mod of externalModules) {
        const deps = getModuleDependencies(mod, nodeModulesSrc, visited);
        deps.forEach(d => {
          // Only add if not already tracked (first found wins)
          if (!modulesToCopy.has(d.name)) {
            modulesToCopy.set(d.name, d.path);
          }
        });
      }

      // Copy each module to the flat destination node_modules
      for (const [modName, srcPath] of modulesToCopy) {
        const dest = path.join(nodeModulesDest, modName);
        if (fs.existsSync(srcPath) && !fs.existsSync(dest)) {
          await copyDir(srcPath, dest);
          console.log(`Copied module: ${modName}`);
        }
      }
    },
  },
  makers: [
    new MakerSquirrel({
      setupIcon: 'assets/icon/favicon.ico',
    }),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({
      options: {
        icon: 'assets/icon/web-app-manifest-512x512.png',
      },
    }),
    new MakerDeb({
      options: {
        icon: 'assets/icon/web-app-manifest-512x512.png',
      },
    }),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main.ts',
          config: 'config/vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'config/vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'config/vite.renderer.config.ts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: false,
    }),
  ],
  publishers: [
    new PublisherGithub({
      repository: {
        owner: process.env.GITHUB_REPOSITORY_OWNER || '',
        name: process.env.GITHUB_REPOSITORY_NAME || 'yolium',
      },
      prerelease: false,
      draft: true, // Creates as draft so you can review before publishing
    }),
  ],
};

export default config;
