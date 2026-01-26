import * as fs from 'fs';
import * as path from 'path';

/**
 * Global setup for Playwright E2E tests.
 * Verifies the Electron app is built before tests run.
 */
export default async function globalSetup(): Promise<void> {
  const buildPath = path.join(__dirname, '../.vite/build/main.js');

  if (!fs.existsSync(buildPath)) {
    console.error('\n');
    console.error('='.repeat(60));
    console.error('ERROR: App build not found!');
    console.error('='.repeat(60));
    console.error('\nE2E tests require the app to be built first.');
    console.error('\nRun one of these commands before running E2E tests:');
    console.error('  npm start          # Build and run (Ctrl+C to stop)');
    console.error('  npm run package    # Build only (slower)');
    console.error('\nThen run:');
    console.error('  npm run test:e2e');
    console.error('\n');
    process.exit(1);
  }
}
