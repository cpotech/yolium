import { describe, it, expect } from 'vitest';
import { parseProtocolMessage, extractProtocolMessages } from '../lib/agent-protocol';

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
  });
});
