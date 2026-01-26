import { useEffect, useRef } from 'react';
import type { Terminal } from '@xterm/xterm';
import type { IDisposable } from '@xterm/xterm';

/**
 * Hook to track terminal current working directory via OSC 7 escape sequences.
 *
 * OSC 7 format: ESC ] 7 ; file://hostname/path/to/dir BEL
 *
 * Most modern shells emit this automatically (bash via vte.sh, zsh, fish).
 * If user's shell doesn't emit OSC 7, labels will show initial cwd only.
 */
export function useTerminalCwd(
  terminal: Terminal | null,
  onCwdChange: (cwd: string) => void
): void {
  const disposableRef = useRef<IDisposable | null>(null);

  useEffect(() => {
    if (!terminal) return;

    // Register OSC 7 handler
    // OSC 7 data format: file://hostname/path/to/dir
    disposableRef.current = terminal.parser.registerOscHandler(7, (data: string) => {
      try {
        // Parse the file:// URL
        const url = new URL(data);
        if (url.protocol === 'file:') {
          const cwd = decodeURIComponent(url.pathname);
          onCwdChange(cwd);
        }
      } catch {
        // Invalid URL format, try direct path
        // Some shells send just the path without file:// prefix
        if (data.startsWith('/')) {
          onCwdChange(data);
        }
      }
      return true; // Mark as handled
    });

    return () => {
      disposableRef.current?.dispose();
      disposableRef.current = null;
    };
  }, [terminal, onCwdChange]);
}
