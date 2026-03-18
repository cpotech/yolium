import { describe, it, expect } from 'vitest';
import { getFolderName, getErrorMessage } from '@main/lib/error-utils';

describe('getFolderName', () => {
  it('should extract folder name from unix path', () => {
    expect(getFolderName('/home/user/projects/my-app')).toBe('my-app');
  });

  it('should extract folder name from windows path', () => {
    expect(getFolderName('C:\\Users\\name\\Documents\\project')).toBe('project');
  });

  it('should return original path when no separators present', () => {
    expect(getFolderName('my-app')).toBe('my-app');
  });

  it('should handle trailing slashes', () => {
    expect(getFolderName('/home/user/projects/my-app/')).toBe('my-app');
  });

  it('should handle empty string input', () => {
    expect(getFolderName('')).toBe('');
  });
});

describe('getErrorMessage', () => {
  it('should extract error message from Error instance', () => {
    expect(getErrorMessage(new Error('something went wrong'))).toBe('something went wrong');
  });

  it('should return string representation for non-Error values', () => {
    expect(getErrorMessage('string error')).toBe('string error');
    expect(getErrorMessage(42)).toBe('42');
  });

  it('should return "Unknown error" for null/undefined', () => {
    expect(getErrorMessage(null)).toBe('null');
    expect(getErrorMessage(undefined)).toBe('undefined');
  });
});
