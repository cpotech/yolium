import { describe, it, expect } from 'vitest';
import { parseProtocolMessage, extractProtocolMessages, extractFirstJsonObject } from '@main/services/agent-protocol';

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

    it('should parse progress message with step="model" and a Claude provider/model detail', () => {
      const json = '{"type":"progress","step":"model","detail":"claude/opus"}';
      const result = parseProtocolMessage(json);

      expect(result).toEqual({
        type: 'progress',
        step: 'model',
        detail: 'claude/opus',
        attempt: undefined,
        maxAttempts: undefined,
      });
    });

    it('should parse progress message with step="model" and a Codex provider/model detail', () => {
      const json = '{"type":"progress","step":"model","detail":"codex/codex-default"}';
      const result = parseProtocolMessage(json);

      expect(result).toEqual({
        type: 'progress',
        step: 'model',
        detail: 'codex/codex-default',
        attempt: undefined,
        maxAttempts: undefined,
      });
    });

    it('should parse run_result message with outcome, summary, and tokensUsed', () => {
      const json = '{"type":"run_result","outcome":"completed","summary":"Posted 2 tweets","tokensUsed":1440}';

      expect(parseProtocolMessage(json)).toEqual({
        type: 'run_result',
        outcome: 'completed',
        summary: 'Posted 2 tweets',
        tokensUsed: 1440,
      });
    });

    it('should parse run_result message without tokensUsed', () => {
      const json = '{"type":"run_result","outcome":"no_action","summary":"No new mentions"}';

      expect(parseProtocolMessage(json)).toEqual({
        type: 'run_result',
        outcome: 'no_action',
        summary: 'No new mentions',
        tokensUsed: undefined,
      });
    });

    it('should reject run_result when outcome is missing', () => {
      expect(parseProtocolMessage('{"type":"run_result","summary":"Missing outcome"}')).toBeNull();
    });

    it('should reject run_result when summary is missing', () => {
      expect(parseProtocolMessage('{"type":"run_result","outcome":"completed"}')).toBeNull();
    });

    it('should parse action message with action, data, and timestamp', () => {
      const json = '{"type":"action","action":"tweet_posted","data":{"tweetId":"123","dryRun":true},"timestamp":"2026-03-11T09:00:00.000Z"}';

      expect(parseProtocolMessage(json)).toEqual({
        type: 'action',
        action: 'tweet_posted',
        data: { tweetId: '123', dryRun: true },
        timestamp: '2026-03-11T09:00:00.000Z',
      });
    });

    it('should parse action message with empty data object', () => {
      const json = '{"type":"action","action":"mentions_checked","data":{}}';

      expect(parseProtocolMessage(json)).toEqual({
        type: 'action',
        action: 'mentions_checked',
        data: {},
        timestamp: undefined,
      });
    });

    it('should default action data to an empty object when omitted or invalid', () => {
      expect(parseProtocolMessage('{"type":"action","action":"mentions_checked"}')).toEqual({
        type: 'action',
        action: 'mentions_checked',
        data: {},
        timestamp: undefined,
      });
      expect(parseProtocolMessage('{"type":"action","action":"mentions_checked","data":"bad"}')).toEqual({
        type: 'action',
        action: 'mentions_checked',
        data: {},
        timestamp: undefined,
      });
    });

    it('should reject action message when action is missing', () => {
      expect(parseProtocolMessage('{"type":"action","data":{}}')).toBeNull();
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

    it('should parse set_test_specs message', () => {
      const json = '{"type":"set_test_specs","specs":[{"file":"src/tests/foo.test.ts","description":"Unit tests for foo","specs":["should return empty array","should throw on invalid input"]}]}';
      const result = parseProtocolMessage(json);

      expect(result).toEqual({
        type: 'set_test_specs',
        specs: [
          {
            file: 'src/tests/foo.test.ts',
            description: 'Unit tests for foo',
            specs: ['should return empty array', 'should throw on invalid input'],
          },
        ],
      });
    });

    it('should parse set_test_specs with multiple files', () => {
      const json = '{"type":"set_test_specs","specs":[{"file":"src/tests/a.test.ts","description":"A tests","specs":["test1"]},{"file":"src/tests/b.test.ts","description":"B tests","specs":["test2","test3"]}]}';
      const result = parseProtocolMessage(json);

      expect(result).toEqual({
        type: 'set_test_specs',
        specs: [
          { file: 'src/tests/a.test.ts', description: 'A tests', specs: ['test1'] },
          { file: 'src/tests/b.test.ts', description: 'B tests', specs: ['test2', 'test3'] },
        ],
      });
    });

    it('should reject set_test_specs without specs array', () => {
      expect(parseProtocolMessage('{"type":"set_test_specs"}')).toBeNull();
      expect(parseProtocolMessage('{"type":"set_test_specs","specs":"not-array"}')).toBeNull();
    });

    it('should reject set_test_specs with empty specs array', () => {
      expect(parseProtocolMessage('{"type":"set_test_specs","specs":[]}')).toBeNull();
    });

    it('should filter out invalid spec entries in set_test_specs', () => {
      const json = '{"type":"set_test_specs","specs":[{"file":"valid.test.ts","description":"Valid","specs":["test1"]},{"bad":"entry"}]}';
      const result = parseProtocolMessage(json);

      expect(result).toEqual({
        type: 'set_test_specs',
        specs: [{ file: 'valid.test.ts', description: 'Valid', specs: ['test1'] }],
      });
    });

    it('should parse comment as alias for add_comment', () => {
      const json = '{"type":"comment","text":"Access: I can read/write files."}';
      const result = parseProtocolMessage(json);

      expect(result).toEqual({
        type: 'add_comment',
        text: 'Access: I can read/write files.',
      });
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

    it('should extract a model progress message when it is the first line of agent output', () => {
      const output = `@@YOLIUM:{"type":"progress","step":"model","detail":"claude/claude-opus-4-6"}
Starting work...
@@YOLIUM:{"type":"progress","step":"analyze","detail":"Reading codebase"}
@@YOLIUM:{"type":"complete","summary":"Done"}`;

      const results = extractProtocolMessages(output);
      expect(results.length).toBeGreaterThanOrEqual(3);
      expect(results[0]).toEqual({
        type: 'progress',
        step: 'model',
        detail: 'claude/claude-opus-4-6',
        attempt: undefined,
        maxAttempts: undefined,
      });
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

    it('should extract multiple protocol messages concatenated on a single line (Codex format)', () => {
      // Codex CLI concatenates multiple @@YOLIUM: messages on one stdout line
      const output = '@@YOLIUM:{"type":"add_comment","text":"Analysis summary"}\\n@@YOLIUM:{"type":"ask_question","text":"What should I do?"}';

      const results = extractProtocolMessages(output);
      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        type: 'add_comment',
        text: 'Analysis summary',
      });
      expect(results[1]).toEqual({
        type: 'ask_question',
        text: 'What should I do?',
      });
    });

    it('should handle Codex duplicate output with multiple messages per line', () => {
      // Codex repeats its full output as a result dump — each copy has messages on one line
      const output = `codex
@@YOLIUM:{"type":"add_comment","text":"Found files"}\\n@@YOLIUM:{"type":"complete","summary":"Done"}
@@YOLIUM:{"type":"add_comment","text":"Found files"}\\n@@YOLIUM:{"type":"complete","summary":"Done"}
tokens used
5000`;

      const results = extractProtocolMessages(output);
      // Should find 4 messages (2 per line × 2 lines) — dedup happens in agent-runner, not here
      expect(results).toHaveLength(4);
      expect(results[0].type).toBe('add_comment');
      expect(results[1].type).toBe('complete');
    });

    it('should handle protocol message with trailing text after JSON', () => {
      const output = '@@YOLIUM:{"type":"complete","summary":"Done"} some trailing text';

      const results = extractProtocolMessages(output);
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        type: 'complete',
        summary: 'Done',
      });
    });

    it('should extract run_result messages from mixed stdout lines', () => {
      const output = `drafting...
@@YOLIUM:{"type":"progress","step":"tweet","detail":"Preparing output"}
stdout noise
@@YOLIUM:{"type":"run_result","outcome":"completed","summary":"Posted scheduled thread","tokensUsed":2100}`;

      const results = extractProtocolMessages(output);

      expect(results).toHaveLength(2);
      expect(results[1]).toEqual({
        type: 'run_result',
        outcome: 'completed',
        summary: 'Posted scheduled thread',
        tokensUsed: 2100,
      });
    });

    it('should extract action messages from multi-message Codex-style output', () => {
      const output = '@@YOLIUM:{"type":"action","action":"tweet_posted","data":{"tweetId":"123","dryRun":true}} @@YOLIUM:{"type":"action","action":"mentions_checked","data":{"count":12},"timestamp":"2026-03-11T09:15:00.000Z"}';

      const results = extractProtocolMessages(output);

      expect(results).toEqual([
        {
          type: 'action',
          action: 'tweet_posted',
          data: { tweetId: '123', dryRun: true },
          timestamp: undefined,
        },
        {
          type: 'action',
          action: 'mentions_checked',
          data: { count: 12 },
          timestamp: '2026-03-11T09:15:00.000Z',
        },
      ]);
    });
  });

  describe('extractFirstJsonObject', () => {
    it('should extract a simple JSON object', () => {
      expect(extractFirstJsonObject('{"a":1}')).toBe('{"a":1}');
    });

    it('should extract JSON with trailing text', () => {
      expect(extractFirstJsonObject('{"a":1}extra')).toBe('{"a":1}');
    });

    it('should handle nested objects', () => {
      expect(extractFirstJsonObject('{"a":{"b":2}}')).toBe('{"a":{"b":2}}');
    });

    it('should handle strings with braces', () => {
      expect(extractFirstJsonObject('{"text":"hello {world}"}')).toBe('{"text":"hello {world}"}');
    });

    it('should handle escaped quotes in strings', () => {
      expect(extractFirstJsonObject('{"text":"say \\"hi\\""}rest')).toBe('{"text":"say \\"hi\\""}');
    });

    it('should handle escaped backslashes', () => {
      expect(extractFirstJsonObject('{"path":"C:\\\\Users"}rest')).toBe('{"path":"C:\\\\Users"}');
    });

    it('should return null for no JSON object', () => {
      expect(extractFirstJsonObject('no json here')).toBeNull();
    });

    it('should return null for unbalanced braces', () => {
      expect(extractFirstJsonObject('{"incomplete')).toBeNull();
    });

    it('should handle JSON with newline escape sequences in text', () => {
      const input = '{"type":"add_comment","text":"line1\\nline2\\nline3"}trailing';
      const result = extractFirstJsonObject(input);
      expect(result).toBe('{"type":"add_comment","text":"line1\\nline2\\nline3"}');
    });
  });
});
