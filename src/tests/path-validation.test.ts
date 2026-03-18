import { describe, it, expect } from 'vitest';
import { isPathWithinBase } from '@main/lib/error-utils';

describe('isPathWithinBase', () => {
  it('should reject paths containing .. segments', () => {
    expect(isPathWithinBase('/home/user/../etc/passwd', '/home/user')).toBe(false);
  });

  it('should reject paths that resolve outside allowed base directory', () => {
    expect(isPathWithinBase('/etc/passwd', '/home/user')).toBe(false);
  });

  it('should accept valid absolute paths within base directory', () => {
    expect(isPathWithinBase('/home/user/project/file.txt', '/home/user')).toBe(true);
  });

  it('should reject paths with encoded traversal sequences', () => {
    // path.resolve handles these, so /home/user/../../etc resolves to /etc
    expect(isPathWithinBase('/home/user/../../etc/passwd', '/home/user')).toBe(false);
  });

  it('should accept paths with .. in filename (e.g. file..name.txt)', () => {
    expect(isPathWithinBase('/home/user/file..name.txt', '/home/user')).toBe(true);
  });

  it('should reject symlink-based traversal when resolved path escapes base', () => {
    // The function uses path.resolve which handles this canonically
    // A path like /home/user/subdir/../../etc resolves to /etc
    expect(isPathWithinBase('/home/user/subdir/../../etc/passwd', '/home/user')).toBe(false);
  });
});
