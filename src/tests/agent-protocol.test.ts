import { describe, it, expect } from 'vitest';
import { parseProtocolMessage, extractProtocolMessages } from '@main/services/agent-protocol';

describe('agent-protocol', () => {
  describe('parseProtocolMessage', () => {
    it('should parse ask_question message', () => {
      const json = '{"type":"ask_question","text":"Which auth?","options":["OAuth","JWT"]}';
      const result = parseProtocolMessage(json);

      expect(result).toEqual({
        type: 'ask_question',
        text: 'Which auth?',
        options: ['OAuth', 'JWT'],
      });
    });

    it('should parse create_item message', () => {
      const json = '{"type":"create_item","title":"Add auth","description":"Implement JWT","branch":"feature/auth","agentType":"claude","order":1}';
      const result = parseProtocolMessage(json);

      expect(result).toEqual({
        type: 'create_item',
        title: 'Add auth',
        description: 'Implement JWT',
        branch: 'feature/auth',
        agentType: 'claude',
        order: 1,
      });
    });

    it('should parse complete message', () => {
      const json = '{"type":"complete","summary":"Created 4 items"}';
      const result = parseProtocolMessage(json);

      expect(result).toEqual({
        type: 'complete',
        summary: 'Created 4 items',
      });
    });

    it('should parse error message', () => {
      const json = '{"type":"error","message":"Failed to analyze"}';
      const result = parseProtocolMessage(json);

      expect(result).toEqual({
        type: 'error',
        message: 'Failed to analyze',
      });
    });

    it('should return null for invalid JSON', () => {
      expect(parseProtocolMessage('not json')).toBeNull();
    });

    it('should return null for unknown message type', () => {
      expect(parseProtocolMessage('{"type":"unknown"}')).toBeNull();
    });

    it('should parse progress message with all fields', () => {
      const json = '{"type":"progress","step":"ci-fix","detail":"Fixing test failure","attempt":2,"maxAttempts":5}';
      const result = parseProtocolMessage(json);

      expect(result).toEqual({
        type: 'progress',
        step: 'ci-fix',
        detail: 'Fixing test failure',
        attempt: 2,
        maxAttempts: 5,
      });
    });

    it('should parse progress message without optional fields', () => {
      const json = '{"type":"progress","step":"analyze","detail":"Analyzing codebase"}';
      const result = parseProtocolMessage(json);

      expect(result).toEqual({
        type: 'progress',
        step: 'analyze',
        detail: 'Analyzing codebase',
        attempt: undefined,
        maxAttempts: undefined,
      });
    });

    it('should reject progress missing required fields', () => {
      expect(parseProtocolMessage('{"type":"progress","step":"analyze"}')).toBeNull();
      expect(parseProtocolMessage('{"type":"progress","detail":"something"}')).toBeNull();
    });

    it('should parse create_item with model field', () => {
      const json = '{"type":"create_item","title":"Task","description":"Do it","agentType":"claude","order":1,"model":"opus"}';
      const result = parseProtocolMessage(json);

      expect(result).toEqual({
        type: 'create_item',
        title: 'Task',
        description: 'Do it',
        branch: undefined,
        agentType: 'claude',
        order: 1,
        model: 'opus',
      });
    });

    it('should parse create_item without model (backward compat)', () => {
      const json = '{"type":"create_item","title":"Task","description":"Do it","agentType":"codex","order":2}';
      const result = parseProtocolMessage(json);

      expect(result).toEqual({
        type: 'create_item',
        title: 'Task',
        description: 'Do it',
        branch: undefined,
        agentType: 'codex',
        order: 2,
        model: undefined,
      });
    });
  });

  describe('extractProtocolMessages', () => {
    it('should extract @@YOLIUM: messages from output', () => {
      const output = `Starting analysis...
@@YOLIUM:{"type":"create_item","title":"Task 1","description":"Do thing","agentType":"claude","order":1}
More output here
@@YOLIUM:{"type":"complete","summary":"Done"}
Final line`;

      const results = extractProtocolMessages(output);

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        type: 'create_item',
        title: 'Task 1',
        description: 'Do thing',
        agentType: 'claude',
        order: 1,
      });
      expect(results[1]).toEqual({
        type: 'complete',
        summary: 'Done',
      });
    });

    it('should handle output with no protocol messages', () => {
      const output = 'Just regular output\nNo special messages';
      const results = extractProtocolMessages(output);
      expect(results).toEqual([]);
    });

    it('should skip malformed protocol messages', () => {
      const output = `@@YOLIUM:not valid json
@@YOLIUM:{"type":"complete","summary":"OK"}`;

      const results = extractProtocolMessages(output);
      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('complete');
    });

    it('should extract progress messages from mixed output', () => {
      const output = `Starting work...
@@YOLIUM:{"type":"progress","step":"analyze","detail":"Reading codebase"}
Some log output
@@YOLIUM:{"type":"progress","step":"implement","detail":"Writing code","attempt":1,"maxAttempts":5}
@@YOLIUM:{"type":"complete","summary":"Done"}`;

      const results = extractProtocolMessages(output);
      expect(results).toHaveLength(3);
      expect(results[0].type).toBe('progress');
      expect(results[1].type).toBe('progress');
      expect(results[2].type).toBe('complete');
    });
  });
});
