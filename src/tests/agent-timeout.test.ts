// src/tests/agent-timeout.test.ts
import { describe, it, expect } from 'vitest';

// Default timeout constant (mirrors docker-manager.ts)
const DEFAULT_AGENT_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Simulates the timeout resolution logic from createAgentContainer.
 * Uses custom timeout if provided, otherwise falls back to default.
 */
function resolveTimeoutMs(timeoutMs?: number): number {
  return timeoutMs ?? DEFAULT_AGENT_TIMEOUT_MS;
}

/**
 * Simulates the timeout parsing logic from agent-loader.ts parseAgentDefinition.
 * Only accepts positive numbers.
 */
function parseTimeout(value: unknown): number | undefined {
  if (value != null && typeof value === 'number' && value > 0) {
    return value;
  }
  return undefined;
}

/**
 * Simulates the timeout conversion from agent-runner.ts startAgent.
 * Converts minutes to milliseconds, or returns undefined if no timeout.
 */
function agentTimeoutToMs(timeoutMinutes?: number): number | undefined {
  return timeoutMinutes ? timeoutMinutes * 60 * 1000 : undefined;
}

/**
 * Simulates the dynamic timeout comment from agent-runner.ts onExit handler.
 */
function buildTimeoutComment(agentTimeout?: number): string {
  const timeoutMinutes = agentTimeout || 30;
  return `Agent timed out (no activity for ${timeoutMinutes} minutes)`;
}

describe('agent timeout configuration', () => {
  describe('resolveTimeoutMs', () => {
    it('uses custom timeout when provided', () => {
      const result = resolveTimeoutMs(60 * 60 * 1000); // 60 min
      expect(result).toBe(60 * 60 * 1000);
    });

    it('falls back to default (30 min) when not provided', () => {
      const result = resolveTimeoutMs(undefined);
      expect(result).toBe(30 * 60 * 1000);
    });

    it('default timeout is 30 minutes', () => {
      expect(DEFAULT_AGENT_TIMEOUT_MS).toBe(30 * 60 * 1000);
    });
  });

  describe('parseTimeout', () => {
    it('accepts a positive number', () => {
      expect(parseTimeout(60)).toBe(60);
    });

    it('accepts fractional numbers', () => {
      expect(parseTimeout(0.5)).toBe(0.5);
    });

    it('rejects zero', () => {
      expect(parseTimeout(0)).toBeUndefined();
    });

    it('rejects negative numbers', () => {
      expect(parseTimeout(-5)).toBeUndefined();
    });

    it('rejects null', () => {
      expect(parseTimeout(null)).toBeUndefined();
    });

    it('rejects undefined', () => {
      expect(parseTimeout(undefined)).toBeUndefined();
    });

    it('rejects strings', () => {
      expect(parseTimeout('60')).toBeUndefined();
    });
  });

  describe('agentTimeoutToMs', () => {
    it('converts minutes to milliseconds', () => {
      expect(agentTimeoutToMs(60)).toBe(60 * 60 * 1000);
    });

    it('returns undefined when no timeout configured', () => {
      expect(agentTimeoutToMs(undefined)).toBeUndefined();
    });

    it('returns undefined for zero timeout (falsy)', () => {
      expect(agentTimeoutToMs(0)).toBeUndefined();
    });
  });

  describe('buildTimeoutComment', () => {
    it('shows custom timeout in comment', () => {
      expect(buildTimeoutComment(60)).toBe('Agent timed out (no activity for 60 minutes)');
    });

    it('shows default 30 minutes when no custom timeout', () => {
      expect(buildTimeoutComment(undefined)).toBe('Agent timed out (no activity for 30 minutes)');
    });

    it('shows 10 for a 10-minute timeout', () => {
      expect(buildTimeoutComment(10)).toBe('Agent timed out (no activity for 10 minutes)');
    });
  });

  describe('end-to-end timeout flow', () => {
    it('code-agent with timeout: 60 produces 3600000ms', () => {
      // Simulate: agent.timeout = 60 (from frontmatter)
      const agentTimeout = parseTimeout(60);
      expect(agentTimeout).toBe(60);

      // agent-runner converts to ms
      const timeoutMs = agentTimeoutToMs(agentTimeout);
      expect(timeoutMs).toBe(3600000);

      // docker-manager resolves it
      const effective = resolveTimeoutMs(timeoutMs);
      expect(effective).toBe(3600000);
    });

    it('plan-agent without timeout uses default 30 min', () => {
      // Simulate: agent.timeout = undefined (no frontmatter field)
      const agentTimeout = parseTimeout(undefined);
      expect(agentTimeout).toBeUndefined();

      // agent-runner converts to ms
      const timeoutMs = agentTimeoutToMs(agentTimeout);
      expect(timeoutMs).toBeUndefined();

      // docker-manager resolves to default
      const effective = resolveTimeoutMs(timeoutMs);
      expect(effective).toBe(30 * 60 * 1000);
    });
  });
});
