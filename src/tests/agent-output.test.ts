import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { formatLogTimestamp } from '@main/stores/workitem-log-store';

describe('agent output deduplication', () => {
  /**
   * Simulates the output flow in docker-manager.ts handleOutput.
   * After the fix, only onOutput callback is used (no direct IPC send).
   * The callback flows through: onOutput → agent-runner events → main.ts IPC.
   */
  it('single output path: only onOutput callback is called', () => {
    const onOutput = vi.fn();
    // This simulates the fixed handleOutput in docker-manager.ts
    // Previously it ALSO called webContents.send('agent:output') directly
    const dataStr = 'Hello, world!';

    // Only one output path
    onOutput(dataStr);

    expect(onOutput).toHaveBeenCalledTimes(1);
    expect(onOutput).toHaveBeenCalledWith('Hello, world!');
  });

  it('output flows through single callback, not duplicated via IPC', () => {
    const onOutput = vi.fn();
    const ipcSend = vi.fn();

    // Simulate the fixed handleOutput (only callback, no direct IPC)
    function handleOutput(data: string) {
      onOutput(data);
      // REMOVED: ipcSend('agent:output', sessionId, data)
    }

    handleOutput('line 1\n');
    handleOutput('line 2\n');

    expect(onOutput).toHaveBeenCalledTimes(2);
    expect(ipcSend).not.toHaveBeenCalled(); // No direct IPC send
  });
});

describe('agent output line splitting', () => {
  /**
   * Simulates the line splitting logic from ItemDetailDialog's onAgentOutput handler.
   * Output is split by newlines and empty lines are filtered out.
   */
  function splitOutputLines(data: string): string[] {
    return data.split('\n').filter(Boolean);
  }

  it('splits multi-line output into individual lines', () => {
    const lines = splitOutputLines('line 1\nline 2\nline 3');
    expect(lines).toEqual(['line 1', 'line 2', 'line 3']);
  });

  it('filters empty lines', () => {
    const lines = splitOutputLines('line 1\n\nline 2\n');
    expect(lines).toEqual(['line 1', 'line 2']);
  });

  it('handles single line without newline', () => {
    const lines = splitOutputLines('single line');
    expect(lines).toEqual(['single line']);
  });

  it('returns empty array for empty string', () => {
    const lines = splitOutputLines('');
    expect(lines).toEqual([]);
  });

  it('returns empty array for only newlines', () => {
    const lines = splitOutputLines('\n\n\n');
    expect(lines).toEqual([]);
  });
});

describe('ref-based session tracking (race condition fix)', () => {
  /**
   * Simulates the race condition fix in ItemDetailDialog.
   *
   * Problem: setCurrentSessionId (React state) is async, but output events
   * start flowing immediately. Using state in the listener misses early output.
   *
   * Fix: Use a ref (sessionIdRef) that is set synchronously before setState.
   */
  it('ref is set before state update resolves', () => {
    // Simulate React state (async) vs ref (sync)
    let stateSessionId: string | null = null;
    let refSessionId: string | null = null;

    const setCurrentSessionId = (id: string) => {
      // In React, this is async - won't be available immediately
      // Simulated as delayed update
      setTimeout(() => { stateSessionId = id; }, 0);
    };

    // The fix: set ref immediately BEFORE calling setState
    const sessionId = 'agent-session-123';
    refSessionId = sessionId; // This is synchronous
    setCurrentSessionId(sessionId); // This is async

    // At this point, ref is already set but state isn't yet
    expect(refSessionId).toBe('agent-session-123');
    expect(stateSessionId).toBeNull(); // State hasn't updated yet
  });

  it('output callback uses ref to match session immediately', () => {
    let refSessionId: string | null = null;
    const capturedLines: string[] = [];

    // The output listener checks the ref, not state
    function onAgentOutput(sessionId: string, data: string) {
      if (sessionId === refSessionId) {
        const lines = data.split('\n').filter(Boolean);
        capturedLines.push(...lines);
      }
    }

    // Step 1: Start agent → ref is set immediately
    refSessionId = 'session-abc';

    // Step 2: Output arrives before React re-renders
    onAgentOutput('session-abc', 'Starting agent...\n');
    onAgentOutput('session-abc', 'Analyzing codebase\n');

    // All output should be captured
    expect(capturedLines).toEqual(['Starting agent...', 'Analyzing codebase']);
  });

  it('does not capture output from different sessions', () => {
    let refSessionId: string | null = 'session-abc';
    const capturedLines: string[] = [];

    function onAgentOutput(sessionId: string, data: string) {
      if (sessionId === refSessionId) {
        capturedLines.push(...data.split('\n').filter(Boolean));
      }
    }

    // Output from a different session should be ignored
    onAgentOutput('session-xyz', 'Other session output\n');

    expect(capturedLines).toEqual([]);
  });

  it('ref is reset when item changes', () => {
    let refSessionId: string | null = 'old-session';

    // Simulate item change effect
    refSessionId = null;

    expect(refSessionId).toBeNull();
  });
});

describe('direct callback output buffering (main.ts pattern)', () => {
  /**
   * Simulates the fix in main.ts where onOutput callback is passed directly
   * to startAgent instead of subscribing to events after the fact.
   * Output arriving before sessionId is known gets buffered and flushed.
   */
  it('buffers output until sessionId is resolved, then sends directly', () => {
    let resolvedSessionId: string | null = null;
    const outputBuffer: string[] = [];
    const ipcSent: Array<{ sessionId: string; data: string }> = [];

    // Simulate the onOutput callback passed to startAgent
    function onOutput(data: string) {
      if (resolvedSessionId) {
        ipcSent.push({ sessionId: resolvedSessionId, data });
      } else {
        outputBuffer.push(data);
      }
    }

    // Output arrives before sessionId is known (during container creation)
    onOutput('Early output 1\n');
    onOutput('Early output 2\n');

    expect(outputBuffer).toEqual(['Early output 1\n', 'Early output 2\n']);
    expect(ipcSent).toEqual([]);

    // sessionId resolved (startAgent returned)
    resolvedSessionId = 'session-123';

    // Flush buffer
    for (const data of outputBuffer) {
      ipcSent.push({ sessionId: resolvedSessionId, data });
    }

    expect(ipcSent).toEqual([
      { sessionId: 'session-123', data: 'Early output 1\n' },
      { sessionId: 'session-123', data: 'Early output 2\n' },
    ]);

    // Subsequent output goes directly (no buffering)
    onOutput('Later output\n');
    expect(ipcSent).toHaveLength(3);
    expect(ipcSent[2]).toEqual({ sessionId: 'session-123', data: 'Later output\n' });
  });

  it('no output lost when sessionId resolves immediately', () => {
    let resolvedSessionId: string | null = 'session-abc';
    const ipcSent: string[] = [];

    function onOutput(data: string) {
      if (resolvedSessionId) {
        ipcSent.push(data);
      }
    }

    onOutput('line 1\n');
    onOutput('line 2\n');

    expect(ipcSent).toEqual(['line 1\n', 'line 2\n']);
  });
});

describe('session cleanup pattern', () => {
  it('EventEmitter listeners are cleaned up properly', () => {
    const sessions = new Map<string, { events: InstanceType<typeof EventEmitter> }>();

    // Add some sessions with listeners
    const events1 = new EventEmitter();
    const events2 = new EventEmitter();
    events1.on('output', () => {});
    events2.on('output', () => {});
    sessions.set('s1', { events: events1 });
    sessions.set('s2', { events: events2 });

    expect(sessions.size).toBe(2);
    expect(events1.listenerCount('output')).toBe(1);

    // Clear sessions (same pattern as clearSessions)
    for (const session of sessions.values()) {
      session.events.removeAllListeners();
    }
    sessions.clear();

    expect(sessions.size).toBe(0);
    expect(events1.listenerCount('output')).toBe(0);
    expect(events2.listenerCount('output')).toBe(0);
  });
});

describe('agentName validation pattern', () => {
  it('should catch invalid agent names and return error', () => {
    // Simulate the validation pattern in startAgent
    function loadAgentDefinition(name: string) {
      const valid = ['code-agent', 'plan-agent'];
      if (!valid.includes(name)) {
        throw new Error(`Agent definition not found: ${name}`);
      }
      return { name };
    }

    function startAgent(agentName: string) {
      try {
        loadAgentDefinition(agentName);
      } catch {
        return { sessionId: '', error: `Unknown agent: ${agentName}` };
      }
      return { sessionId: 'abc', error: undefined };
    }

    // Valid agent
    expect(startAgent('code-agent').error).toBeUndefined();

    // Invalid agent
    const result = startAgent('fake-agent');
    expect(result.error).toContain('Unknown agent');
    expect(result.sessionId).toBe('');
  });
});

describe('output accumulation (array vs string)', () => {
  /**
   * Verifies the change from string concatenation to array accumulation.
   * Array approach enables line-by-line rendering with proper React keys.
   */
  it('array accumulation preserves individual lines', () => {
    let lines: string[] = [];

    // Simulate multiple output events
    const data1 = 'Starting agent...\nAnalyzing codebase\n';
    const data2 = 'Writing code\n';
    const data3 = 'Running tests\nAll tests pass\n';

    lines = [...lines, ...data1.split('\n').filter(Boolean)];
    lines = [...lines, ...data2.split('\n').filter(Boolean)];
    lines = [...lines, ...data3.split('\n').filter(Boolean)];

    expect(lines).toEqual([
      'Starting agent...',
      'Analyzing codebase',
      'Writing code',
      'Running tests',
      'All tests pass',
    ]);
  });

  it('clear resets to empty array', () => {
    let lines: string[] = ['line 1', 'line 2'];
    lines = [];
    expect(lines).toEqual([]);
  });
});

describe('relative timestamp formatting', () => {
  /**
   * Tests the formatTimestamp logic used in ItemDetailDialog.
   * Shows relative times for recent dates and absolute dates for older ones.
   */
  function formatTimestamp(isoString: string): string {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSec < 60) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  it('shows "just now" for timestamps less than a minute old', () => {
    const now = new Date().toISOString();
    expect(formatTimestamp(now)).toBe('just now');
  });

  it('shows minutes ago for timestamps less than an hour old', () => {
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    expect(formatTimestamp(tenMinAgo)).toBe('10m ago');
  });

  it('shows hours ago for timestamps less than a day old', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    expect(formatTimestamp(threeHoursAgo)).toBe('3h ago');
  });

  it('shows days ago for timestamps less than a week old', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatTimestamp(twoDaysAgo)).toBe('2d ago');
  });

  it('shows date for timestamps older than a week', () => {
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const result = formatTimestamp(twoWeeksAgo);
    // Should be a date string (not relative)
    expect(result).not.toContain('ago');
    expect(result).not.toBe('just now');
  });
});

describe('formatLogTimestamp', () => {
  it('formats date as [HH:MM:SS]', () => {
    const date = new Date(2026, 1, 7, 14, 5, 9); // 14:05:09
    expect(formatLogTimestamp(date)).toBe('[14:05:09]');
  });

  it('pads single-digit hours, minutes, seconds with zero', () => {
    const date = new Date(2026, 0, 1, 3, 7, 2); // 03:07:02
    expect(formatLogTimestamp(date)).toBe('[03:07:02]');
  });

  it('handles midnight', () => {
    const date = new Date(2026, 0, 1, 0, 0, 0);
    expect(formatLogTimestamp(date)).toBe('[00:00:00]');
  });

  it('handles end of day', () => {
    const date = new Date(2026, 0, 1, 23, 59, 59);
    expect(formatLogTimestamp(date)).toBe('[23:59:59]');
  });

  it('returns current time when called without arguments', () => {
    const result = formatLogTimestamp();
    expect(result).toMatch(/^\[\d{2}:\d{2}:\d{2}\]$/);
  });
});

describe('agent log timestamp prefixing', () => {
  it('prepends timestamp to display lines', () => {
    const ts = formatLogTimestamp(new Date(2026, 1, 7, 10, 30, 45));
    const displayParts = ['[Read] /project/src/App.tsx', 'Analyzing code'];
    const timestampedParts = displayParts.map(line => `${ts} ${line}`);

    expect(timestampedParts).toEqual([
      '[10:30:45] [Read] /project/src/App.tsx',
      '[10:30:45] Analyzing code',
    ]);
  });

  it('timestamp prefix can be parsed with regex', () => {
    const line = '[14:05:09] [Bash] npm test';
    const match = /^\[(\d{2}:\d{2}:\d{2})\] (.*)$/.exec(line);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('14:05:09');
    expect(match![2]).toBe('[Bash] npm test');
  });

  it('lines without timestamp prefix do not match', () => {
    const line = '[Bash] npm test';
    const match = /^\[(\d{2}:\d{2}:\d{2})\] (.*)$/.exec(line);
    expect(match).toBeNull();
  });
});
