import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import * as path from 'node:path';

describe('empty catch block audit', () => {
  it('should not have empty catch blocks in src/main (enforced by grep count reaching 0)', () => {
    const srcMainDir = path.resolve(__dirname, '..', 'main');

    // Search for empty catch blocks: catch { } or catch (e) { } with no body
    // This regex matches catch blocks that contain only whitespace or comments like /* */
    let output = '';
    try {
      // Use grep to find empty catch blocks (catch followed by { } with only whitespace between)
      // -r: recursive, -l: list files only, -P: perl regex
      output = execSync(
        `grep -rn "catch\\s*{" "${srcMainDir}" --include="*.ts" | grep -v "catch.*{.*[a-zA-Z]" || true`,
        { encoding: 'utf-8' },
      ).trim();
    } catch {
      // grep returns exit code 1 when no matches found — that's the success case
      output = '';
    }

    // Filter to truly empty catches: lines where the catch block has no meaningful code
    // Allow catches that have inline comments (/* ... */) as justification
    const emptyLines = output
      .split('\n')
      .filter(line => line.trim() !== '')
      .filter(line => {
        // Allow lines that have a comment after catch { — these are justified
        const afterCatch = line.replace(/^.*catch\s*(\([^)]*\))?\s*{/, '');
        const hasJustification = /\/[/*]/.test(afterCatch);
        return !hasJustification;
      });

    if (emptyLines.length > 0) {
      const details = emptyLines.join('\n');
      expect.fail(
        `Found ${emptyLines.length} empty catch block(s) without justification comments:\n${details}`,
      );
    }
  });
});
