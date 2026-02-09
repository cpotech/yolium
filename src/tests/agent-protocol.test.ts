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

    it('should parse create_item message with agentProvider', () => {
      const json = '{"type":"create_item","title":"Add auth","description":"Implement JWT","branch":"feature/auth","agentProvider":"claude","order":1}';
      const result = parseProtocolMessage(json);

      expect(result).toEqual({
        type: 'create_item',
        title: 'Add auth',
        description: 'Implement JWT',
        branch: 'feature/auth',
        agentProvider: 'claude',
        order: 1,
      });
    });

    it('should parse create_item message with legacy agentType field', () => {
      const json = '{"type":"create_item","title":"Add auth","description":"Implement JWT","branch":"feature/auth","agentType":"claude","order":1}';
      const result = parseProtocolMessage(json);

      expect(result).toEqual({
        type: 'create_item',
        title: 'Add auth',
        description: 'Implement JWT',
        branch: 'feature/auth',
        agentProvider: 'claude',
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

    it('should parse create_item without description (defaults to empty string)', () => {
      const json = '{"type":"create_item","title":"Task","agentProvider":"claude","order":1}';
      const result = parseProtocolMessage(json);

      expect(result).toEqual({
        type: 'create_item',
        title: 'Task',
        description: '',
        branch: undefined,
        agentProvider: 'claude',
        order: 1,
        model: undefined,
      });
    });

    it('should parse update_description message', () => {
      const json = '{"type":"update_description","description":"Improved description with more detail"}';
      const result = parseProtocolMessage(json);

      expect(result).toEqual({
        type: 'update_description',
        description: 'Improved description with more detail',
      });
    });

    it('should reject update_description without description field', () => {
      const json = '{"type":"update_description"}';
      const result = parseProtocolMessage(json);
      expect(result).toBeNull();
    });

    it('should reject update_description with non-string description', () => {
      const json = '{"type":"update_description","description":123}';
      const result = parseProtocolMessage(json);
      expect(result).toBeNull();
    });

    it('should parse add_comment message', () => {
      const json = '{"type":"add_comment","text":"## Analysis\\n\\nThe codebase uses React."}';
      const result = parseProtocolMessage(json);

      expect(result).toEqual({
        type: 'add_comment',
        text: '## Analysis\n\nThe codebase uses React.',
      });
    });

    it('should reject add_comment without text field', () => {
      const json = '{"type":"add_comment"}';
      const result = parseProtocolMessage(json);
      expect(result).toBeNull();
    });

    it('should reject add_comment with non-string text', () => {
      const json = '{"type":"add_comment","text":123}';
      const result = parseProtocolMessage(json);
      expect(result).toBeNull();
    });

    it('should parse create_item with model field', () => {
      const json = '{"type":"create_item","title":"Task","description":"Do it","agentProvider":"claude","order":1,"model":"opus"}';
      const result = parseProtocolMessage(json);

      expect(result).toEqual({
        type: 'create_item',
        title: 'Task',
        description: 'Do it',
        branch: undefined,
        agentProvider: 'claude',
        order: 1,
        model: 'opus',
      });
    });

    it('should parse create_item without model', () => {
      const json = '{"type":"create_item","title":"Task","description":"Do it","agentProvider":"codex","order":2}';
      const result = parseProtocolMessage(json);

      expect(result).toEqual({
        type: 'create_item',
        title: 'Task',
        description: 'Do it',
        branch: undefined,
        agentProvider: 'codex',
        order: 2,
        model: undefined,
      });
    });
  });

  describe('extractProtocolMessages', () => {
    it('should extract @@YOLIUM: messages from output', () => {
      const output = `Starting analysis...
@@YOLIUM:{"type":"create_item","title":"Task 1","description":"Do thing","agentProvider":"claude","order":1}
More output here
@@YOLIUM:{"type":"complete","summary":"Done"}
Final line`;

      const results = extractProtocolMessages(output);

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        type: 'create_item',
        title: 'Task 1',
        description: 'Do thing',
        agentProvider: 'claude',
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

    it('should extract update_description messages from output', () => {
      const output = `Working on improvements...
@@YOLIUM:{"type":"update_description","description":"Refined task description"}
@@YOLIUM:{"type":"complete","summary":"Done"}`;

      const results = extractProtocolMessages(output);
      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        type: 'update_description',
        description: 'Refined task description',
      });
      expect(results[1].type).toBe('complete');
    });

    it('should extract add_comment messages from output', () => {
      const output = `Analyzing codebase...
@@YOLIUM:{"type":"add_comment","text":"Found 3 relevant files"}
More analysis...
@@YOLIUM:{"type":"complete","summary":"Done"}`;

      const results = extractProtocolMessages(output);
      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        type: 'add_comment',
        text: 'Found 3 relevant files',
      });
      expect(results[1].type).toBe('complete');
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
