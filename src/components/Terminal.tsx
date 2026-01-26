import React, { useEffect, useRef, useCallback } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { useTerminalCwd } from '../hooks/useTerminalCwd';
import '@xterm/xterm/css/xterm.css';

interface TerminalProps {
  sessionId: string;
  isVisible: boolean;
  isContainer?: boolean;  // If true, use container IPC; if false, use PTY IPC
  onCwdChange?: (cwd: string) => void;
  onExit?: (exitCode: number) => void;
  className?: string;
}

export function Terminal({
  sessionId,
  isVisible,
  isContainer = false,
  onCwdChange,
  onExit,
  className,
}: TerminalProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const mountedRef = useRef(true);

  // CWD tracking via OSC 7
  const handleCwdChange = useCallback((cwd: string) => {
    onCwdChange?.(cwd);
  }, [onCwdChange]);

  useTerminalCwd(terminalRef.current, handleCwdChange);

  // Initialize terminal
  useEffect(() => {
    if (!containerRef.current) return;

    mountedRef.current = true;

    const terminal = new XTerm({
      cursorBlink: true,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 14,
      theme: {
        background: '#0a0a0a',
        foreground: '#ffffff',
        cursor: '#ffffff',
        cursorAccent: '#0a0a0a',
        black: '#000000',
        red: '#e06c75',
        green: '#98c379',
        yellow: '#e5c07b',
        blue: '#61afef',
        magenta: '#c678dd',
        cyan: '#56b6c2',
        white: '#abb2bf',
        brightBlack: '#5c6370',
        brightRed: '#e06c75',
        brightGreen: '#98c379',
        brightYellow: '#e5c07b',
        brightBlue: '#61afef',
        brightMagenta: '#c678dd',
        brightCyan: '#56b6c2',
        brightWhite: '#ffffff',
      },
      scrollback: 10000,
      // NOTE: allowProposedApi crashes in production due to Vite minification bug
      // The DECRQM responses are handled manually in handleDataWithQueryResponses below
      // allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    // Load WebGL addon for performance (disabled for debugging)
    // TODO: Re-enable after fixing OpenCode TUI issue
    // try {
    //   const webglAddon = new WebglAddon();
    //   terminal.loadAddon(webglAddon);
    //   webglAddon.onContextLoss(() => {
    //     webglAddon.dispose();
    //   });
    // } catch (e) {
    //   console.warn('WebGL addon failed, using canvas:', e);
    // }

    terminal.open(containerRef.current);

    // Only fit if visible
    if (isVisible) {
      fitAddon.fit();
      const { cols, rows } = terminal;
      if (isContainer) {
        window.electronAPI.resizeYolium(sessionId, cols, rows);
      } else {
        window.electronAPI.resizeTerminal(sessionId, cols, rows);
      }
    }

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Handle user input -> PTY or container
    const onDataDisposable = terminal.onData((data) => {
      if (isContainer) {
        window.electronAPI.writeYolium(sessionId, data);
      } else {
        window.electronAPI.writeTerminal(sessionId, data);
      }
    });

    // Handle output -> terminal (from PTY or container)
    // Strip DECRQM queries before writing to avoid xterm.js minification bug crash
    // Then send manual responses for terminal capability detection
    const handleDataWithQueryResponses = (data: string) => {
      // Patterns that cause xterm.js to crash in production (minification bug)
      // DECRQM: ESC [ ? Ps $ p
      // XTVERSION: ESC [ > Ps q
      const decrqmPattern = /\x1b\[\?(\d+)\$p/g;
      const xtversionPattern = /\x1b\[>(\d+)q/g;

      // Collect queries before stripping
      const decrqmQueries: string[] = [];
      let match;
      while ((match = decrqmPattern.exec(data)) !== null) {
        decrqmQueries.push(match[1]);
      }

      const hasDAQuery = data.includes('\x1b[c') || data.includes('\x1b[0c');
      const hasXTVersion = xtversionPattern.test(data);

      // Strip problematic sequences before writing to terminal
      let cleanData = data
        .replace(/\x1b\[\?\d+\$p/g, '')  // Strip DECRQM queries
        .replace(/\x1b\[>\d+q/g, '');     // Strip XTVERSION queries

      // Write cleaned data to terminal
      terminal.write(cleanData);

      // Send manual DECRPM responses
      for (const mode of decrqmQueries) {
        let response: string;
        switch (mode) {
          case '1016': // SGR mouse pixels
          case '1004': // Focus events
          case '2004': // Bracketed paste
          case '2026': // Synchronized output
            response = `\x1b[?${mode};2$y`; // Mode recognized, reset
            break;
          case '2027': // Grapheme clusters
          case '2031': // Movement units
            response = `\x1b[?${mode};0$y`; // Mode not recognized
            break;
          default:
            response = `\x1b[?${mode};0$y`; // Default: not recognized
        }
        if (isContainer) {
          window.electronAPI.writeYolium(sessionId, response);
        } else {
          window.electronAPI.writeTerminal(sessionId, response);
        }
      }

      // Send DA response
      if (hasDAQuery || hasXTVersion) {
        const daResponse = '\x1b[?1;2c';
        if (isContainer) {
          window.electronAPI.writeYolium(sessionId, daResponse);
        } else {
          window.electronAPI.writeTerminal(sessionId, daResponse);
        }
      }
    };

    const cleanupData = isContainer
      ? window.electronAPI.onContainerData((sid, data) => {
          if (sid === sessionId && mountedRef.current) {
            handleDataWithQueryResponses(data);
          }
        })
      : window.electronAPI.onTerminalData((sid, data) => {
          if (sid === sessionId && mountedRef.current) {
            terminal.write(data);
          }
        });

    // Handle exit (from PTY or container)
    const cleanupExit = isContainer
      ? window.electronAPI.onContainerExit((sid, exitCode) => {
          if (sid === sessionId && mountedRef.current) {
            terminal.write(`\r\n\x1b[90m[Container exited with code ${exitCode}]\x1b[0m\r\n`);
            onExit?.(exitCode);
          }
        })
      : window.electronAPI.onTerminalExit((sid, exitCode) => {
          if (sid === sessionId && mountedRef.current) {
            terminal.write(`\r\n\x1b[90m[Process exited with code ${exitCode}]\x1b[0m\r\n`);
            onExit?.(exitCode);
          }
        });

    // Handle resize
    const handleResize = () => {
      if (!isVisible || !containerRef.current || containerRef.current.offsetParent === null) {
        return;
      }
      fitAddon.fit();
      const { cols, rows } = terminal;
      if (isContainer) {
        window.electronAPI.resizeYolium(sessionId, cols, rows);
      } else {
        window.electronAPI.resizeTerminal(sessionId, cols, rows);
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(containerRef.current);
    window.addEventListener('resize', handleResize);

    // Keyboard shortcut handler
    // Strategy: Only intercept Ctrl+Shift+ for Yolium commands.
    // Let unmodified Ctrl+ pass through to terminal/TUI apps.
    terminal.attachCustomKeyEventHandler((event) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modKey = isMac ? event.metaKey : event.ctrlKey;

      if (modKey) {
        // Ctrl+Shift+ combinations: let Electron menu handle these for Yolium
        if (event.shiftKey) {
          // Yolium tab shortcuts: Ctrl+Shift+T, W, ], [, /
          if (['t', 'w', '[', ']', '/'].includes(event.key.toLowerCase())) {
            return false; // Let Electron handle
          }
        }

        // Ctrl+Q: quit (standard, keep intercepted)
        if (event.key.toLowerCase() === 'q') {
          return false;
        }

        // Ctrl+PageUp/PageDown: tab navigation (browser convention)
        if (event.key === 'PageUp' || event.key === 'PageDown') {
          return false; // Let Electron handle
        }

        // Copy/paste
        if (['c', 'v'].includes(event.key.toLowerCase())) {
          if (event.key.toLowerCase() === 'c' && !terminal.hasSelection()) {
            return true; // No selection, let terminal handle Ctrl+C as SIGINT
          }
          return false; // Let browser/Electron handle copy/paste
        }

        // All other Ctrl+ shortcuts: pass through to terminal/TUI
        // This allows Ctrl+T, Ctrl+W, etc. to work in OpenCode/Claude Code
      }
      return true;
    });

    return () => {
      mountedRef.current = false;
      onDataDisposable.dispose();
      cleanupData();
      cleanupExit();
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
      terminal.dispose();
    };
  }, [sessionId, isContainer]); // Re-run if sessionId or isContainer changes

  // Handle visibility changes - re-fit when becoming visible
  useEffect(() => {
    if (isVisible && fitAddonRef.current && terminalRef.current && containerRef.current) {
      // Small delay to ensure container is rendered
      requestAnimationFrame(() => {
        if (containerRef.current?.offsetParent !== null) {
          fitAddonRef.current?.fit();
          const { cols, rows } = terminalRef.current!;
          if (isContainer) {
            window.electronAPI.resizeYolium(sessionId, cols, rows);
          } else {
            window.electronAPI.resizeTerminal(sessionId, cols, rows);
          }
          // Focus the terminal when it becomes visible
          terminalRef.current?.focus();
        }
      });
    }
  }, [isVisible, sessionId, isContainer]);

  return (
    <div
      ref={containerRef}
      className={`h-full w-full ${className || ''}`}
      style={{
        padding: '8px',
        display: isVisible ? 'block' : 'none',
      }}
    />
  );
}
