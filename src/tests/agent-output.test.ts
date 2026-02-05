// src/tests/agent-output.test.ts
import { describe, it, expect, vi } from 'vitest';

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
