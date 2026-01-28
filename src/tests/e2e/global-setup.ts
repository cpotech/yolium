import * as fs from 'fs';
import * as path from 'path';

/**
 * Global setup for Playwright E2E tests.
 * Verifies the Electron app is built before tests run.
 */
export default async function globalSetup(): Promise<void> {
  const buildDir = path.join(__dirname, '../../../.vite/build');
  const rendererDir = path.join(__dirname, '../../../.vite/renderer/main_window');

  const requiredFiles = [
    { path: path.join(buildDir, 'main.js'), name: 'Main process' },
    { path: path.join(buildDir, 'preload.js'), name: 'Preload script' },
    { path: path.join(rendererDir, 'index.html'), name: 'Renderer' },
  ];

  const missingFiles = requiredFiles.filter(f => !fs.existsSync(f.path));

  if (missingFiles.length > 0) {
    console.error('\n');
    console.error('='.repeat(60));
    console.error('ERROR: App build incomplete!');
    console.error('='.repeat(60));
    console.error('\nMissing build artifacts:');
    missingFiles.forEach(f => console.error(`  - ${f.name}: ${f.path}`));
    console.error('\nE2E tests require the app to be built first.');
    console.error('\nRun: npm run build');
    console.error('\nOr run npm run test:e2e which builds automatically.');
    console.error('\n');
    process.exit(1);
  }
}
