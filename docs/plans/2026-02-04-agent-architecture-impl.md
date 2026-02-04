# Agent Architecture Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the agent orchestration system where Plan Agent runs in Docker containers, communicates via `@@YOLIUM:` protocol, and creates Kanban work items.

**Architecture:** Agents are markdown files with frontmatter (name, model, tools). The agent-runner spawns Claude Code in containers with `--dangerously-skip-permissions`. Protocol messages in stdout are parsed and converted to Kanban operations. Comments on work items serve as conversation history for resume/recovery.

**Tech Stack:** TypeScript, Electron IPC, Docker, gray-matter (frontmatter parsing)

---

## Task 1: Add Kanban Types

**Files:**
- Create: `src/types/kanban.ts`
- Modify: `src/types/index.ts`

**Step 1: Create kanban types file**

```typescript
// src/types/kanban.ts

export type AgentStatus =
  | 'idle'
  | 'running'
  | 'waiting'
  | 'interrupted'
  | 'completed'
  | 'failed';

export type KanbanColumn = 'backlog' | 'ready' | 'in-progress' | 'done';

export type CommentSource = 'user' | 'agent' | 'system';

export interface KanbanComment {
  id: string;
  source: CommentSource;
  text: string;
  timestamp: string;
}

export interface KanbanItem {
  id: string;
  title: string;
  description: string;
  column: KanbanColumn;
  branch?: string;
  agentType: 'claude' | 'codex' | 'opencode' | 'shell';
  order: number;
  agentStatus: AgentStatus;
  agentQuestion?: string;
  agentQuestionOptions?: string[];
  comments: KanbanComment[];
  createdAt: string;
  updatedAt: string;
}

export interface KanbanBoard {
  id: string;
  projectPath: string;
  items: KanbanItem[];
  createdAt: string;
  updatedAt: string;
}
```

**Step 2: Export from index**

Add to `src/types/index.ts`:
```typescript
export * from './kanban';
```

**Step 3: Commit**

```bash
git add src/types/kanban.ts src/types/index.ts
git commit -m "feat(types): add Kanban and agent status types"
```

---

## Task 2: Add Agent Definition Types

**Files:**
- Modify: `src/types/agent.ts`

**Step 1: Add agent definition types**

Add to `src/types/agent.ts`:
```typescript
// Agent definition from markdown frontmatter
export interface AgentDefinition {
  name: string;
  description: string;
  model: 'opus' | 'sonnet' | 'haiku';
  tools: string[];
}

// Protocol message types from agent stdout
export type ProtocolMessageType = 'ask_question' | 'create_item' | 'complete' | 'error';

export interface ProtocolMessage {
  type: ProtocolMessageType;
}

export interface AskQuestionMessage extends ProtocolMessage {
  type: 'ask_question';
  text: string;
  options?: string[];
}

export interface CreateItemMessage extends ProtocolMessage {
  type: 'create_item';
  title: string;
  description: string;
  branch?: string;
  agentType: 'claude' | 'codex' | 'opencode' | 'shell';
  order: number;
}

export interface CompleteMessage extends ProtocolMessage {
  type: 'complete';
  summary: string;
}

export interface ErrorMessage extends ProtocolMessage {
  type: 'error';
  message: string;
}
```

**Step 2: Commit**

```bash
git add src/types/agent.ts
git commit -m "feat(types): add agent definition and protocol message types"
```

---

## Task 3: Create Agent Loader

**Files:**
- Create: `src/lib/agent-loader.ts`
- Create: `src/tests/agent-loader.test.ts`

**Step 1: Write the failing test**

```typescript
// src/tests/agent-loader.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseAgentDefinition, loadAgentDefinition } from '../lib/agent-loader';

describe('agent-loader', () => {
  describe('parseAgentDefinition', () => {
    it('should parse valid agent markdown with frontmatter', () => {
      const markdown = `---
name: plan-agent
description: Decomposes goals into work items
model: opus
tools:
  - Read
  - Glob
  - Grep
---

# Plan Agent

You are the Plan Agent...`;

      const result = parseAgentDefinition(markdown);

      expect(result).toEqual({
        name: 'plan-agent',
        description: 'Decomposes goals into work items',
        model: 'opus',
        tools: ['Read', 'Glob', 'Grep'],
        systemPrompt: '# Plan Agent\n\nYou are the Plan Agent...',
      });
    });

    it('should throw on missing required fields', () => {
      const markdown = `---
name: test-agent
---

Content`;

      expect(() => parseAgentDefinition(markdown)).toThrow('missing required fields');
    });

    it('should throw on invalid model', () => {
      const markdown = `---
name: test-agent
description: Test
model: gpt-4
tools: []
---

Content`;

      expect(() => parseAgentDefinition(markdown)).toThrow('Invalid model');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/tests/agent-loader.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```typescript
// src/lib/agent-loader.ts
import matter from 'gray-matter';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AgentDefinition } from '../types/agent';

export interface ParsedAgent extends AgentDefinition {
  systemPrompt: string;
}

const VALID_MODELS = ['opus', 'sonnet', 'haiku'] as const;

export function parseAgentDefinition(markdown: string): ParsedAgent {
  const { data, content } = matter(markdown);

  // Validate required fields
  if (!data.name || !data.description || !data.model || !data.tools) {
    throw new Error('Agent definition missing required fields: name, description, model, tools');
  }

  // Validate model
  if (!VALID_MODELS.includes(data.model)) {
    throw new Error(`Invalid model "${data.model}". Must be one of: ${VALID_MODELS.join(', ')}`);
  }

  // Validate tools is array
  if (!Array.isArray(data.tools)) {
    throw new Error('tools must be an array');
  }

  return {
    name: data.name,
    description: data.description,
    model: data.model,
    tools: data.tools,
    systemPrompt: content.trim(),
  };
}

export function loadAgentDefinition(agentName: string): ParsedAgent {
  // Agents are in src/agents/ relative to project root
  // In production, they're bundled with the app
  const agentPath = path.join(__dirname, '..', 'agents', `${agentName}.md`);

  if (!fs.existsSync(agentPath)) {
    throw new Error(`Agent definition not found: ${agentName}`);
  }

  const content = fs.readFileSync(agentPath, 'utf-8');
  return parseAgentDefinition(content);
}

export function listAgents(): string[] {
  const agentsDir = path.join(__dirname, '..', 'agents');

  if (!fs.existsSync(agentsDir)) {
    return [];
  }

  return fs.readdirSync(agentsDir)
    .filter(f => f.endsWith('.md') && !f.startsWith('_') && f !== 'README.md')
    .map(f => f.replace('.md', ''));
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/tests/agent-loader.test.ts`
Expected: PASS

**Step 5: Install gray-matter dependency**

```bash
npm install gray-matter
npm install --save-dev @types/gray-matter
```

**Step 6: Commit**

```bash
git add src/lib/agent-loader.ts src/tests/agent-loader.test.ts package.json package-lock.json
git commit -m "feat(agent-loader): parse agent markdown definitions"
```

---

## Task 4: Create Agent Protocol Parser

**Files:**
- Create: `src/lib/agent-protocol.ts`
- Create: `src/tests/agent-protocol.test.ts`

**Step 1: Write the failing test**

```typescript
// src/tests/agent-protocol.test.ts
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
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/tests/agent-protocol.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```typescript
// src/lib/agent-protocol.ts
import type {
  ProtocolMessage,
  AskQuestionMessage,
  CreateItemMessage,
  CompleteMessage,
  ErrorMessage,
} from '../types/agent';

const PROTOCOL_PREFIX = '@@YOLIUM:';
const VALID_TYPES = ['ask_question', 'create_item', 'complete', 'error'] as const;

type AnyProtocolMessage = AskQuestionMessage | CreateItemMessage | CompleteMessage | ErrorMessage;

export function parseProtocolMessage(json: string): AnyProtocolMessage | null {
  try {
    const parsed = JSON.parse(json);

    if (!parsed.type || !VALID_TYPES.includes(parsed.type)) {
      return null;
    }

    // Validate required fields per message type
    switch (parsed.type) {
      case 'ask_question':
        if (typeof parsed.text !== 'string') return null;
        return {
          type: 'ask_question',
          text: parsed.text,
          options: Array.isArray(parsed.options) ? parsed.options : undefined,
        };

      case 'create_item':
        if (typeof parsed.title !== 'string' || typeof parsed.description !== 'string') {
          return null;
        }
        return {
          type: 'create_item',
          title: parsed.title,
          description: parsed.description,
          branch: parsed.branch,
          agentType: parsed.agentType || 'claude',
          order: typeof parsed.order === 'number' ? parsed.order : 0,
        };

      case 'complete':
        if (typeof parsed.summary !== 'string') return null;
        return {
          type: 'complete',
          summary: parsed.summary,
        };

      case 'error':
        if (typeof parsed.message !== 'string') return null;
        return {
          type: 'error',
          message: parsed.message,
        };

      default:
        return null;
    }
  } catch {
    return null;
  }
}

export function extractProtocolMessages(output: string): AnyProtocolMessage[] {
  const messages: AnyProtocolMessage[] = [];
  const lines = output.split('\n');

  for (const line of lines) {
    const prefixIndex = line.indexOf(PROTOCOL_PREFIX);
    if (prefixIndex === -1) continue;

    const json = line.slice(prefixIndex + PROTOCOL_PREFIX.length).trim();
    const message = parseProtocolMessage(json);
    if (message) {
      messages.push(message);
    }
  }

  return messages;
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/tests/agent-protocol.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/agent-protocol.ts src/tests/agent-protocol.test.ts
git commit -m "feat(agent-protocol): parse @@YOLIUM: protocol messages"
```

---

## Task 5: Create Plan Agent Definition

**Files:**
- Create: `src/agents/plan-agent.md`
- Create: `src/agents/README.md`
- Create: `src/agents/_protocol.md`

**Step 1: Create plan-agent.md**

```markdown
---
name: plan-agent
description: Decomposes high-level goals into structured work items
model: opus
tools:
  - Read
  - Glob
  - Grep
  - WebSearch
---

# Plan Agent

You are the Plan Agent for Yolium. Your job is to decompose a high-level goal into structured, atomic work items that can be executed by coding agents.

## Your Process

1. **Analyze the codebase** - Use Glob, Grep, and Read to understand the project structure, tech stack, and existing patterns
2. **Ask clarifying questions** - If the goal is ambiguous, ask ONE question at a time using the protocol below
3. **Create work items** - Break the goal into independent, atomic tasks with clear acceptance criteria

## Protocol

Communicate with Yolium by outputting JSON messages prefixed with `@@YOLIUM:`:

### Ask a Question (pauses for user input)

```
@@YOLIUM:{"type":"ask_question","text":"Your question here","options":["Option A","Option B","Option C"]}
```

- `text`: The question to ask (required)
- `options`: Optional array of choices. Omit for free-text answers.

**Important:** Only ask ONE question at a time. After asking, STOP and wait. The user's answer will appear in the conversation when you resume.

### Create a Work Item

```
@@YOLIUM:{"type":"create_item","title":"Short title","description":"Detailed instructions...","branch":"feature/branch-name","agentType":"claude","order":1}
```

- `title`: Short, descriptive title (required)
- `description`: Detailed instructions with acceptance criteria (required)
- `branch`: Suggested git branch name (optional)
- `agentType`: `claude` | `codex` | `opencode` | `shell` (required)
- `order`: Suggested execution sequence, 1 = first (required)

### Signal Completion

```
@@YOLIUM:{"type":"complete","summary":"Created N work items for X"}
```

### Signal Error

```
@@YOLIUM:{"type":"error","message":"Could not analyze - reason"}
```

## Guidelines for Work Items

1. **Atomic** - Each item should be completable independently
2. **Clear acceptance criteria** - Include what "done" looks like
3. **Right agent for the job**:
   - `claude`: Complex reasoning, architecture, refactoring
   - `codex`: Straightforward coding tasks, boilerplate
   - `opencode`: Alternative to claude/codex
   - `shell`: Simple scripts, file operations
4. **Logical ordering** - Dependencies should have lower order numbers
5. **Include context** - Reference relevant files, patterns, and conventions discovered

## Example Work Item Description

```
Implement JWT token validation middleware.

**Context:**
- Existing middleware pattern in src/middleware/auth.ts
- Using jsonwebtoken library (already in package.json)
- Tokens should be in Authorization header as "Bearer <token>"

**Acceptance Criteria:**
- [ ] Middleware extracts and validates JWT from header
- [ ] Invalid/expired tokens return 401
- [ ] Valid tokens attach decoded user to request
- [ ] Unit tests cover valid, invalid, and missing token cases
```
```

**Step 2: Create README.md**

```markdown
# Yolium Agents

This directory contains agent definitions for Yolium's AI orchestration system.

## File Format

Each agent is a Markdown file with YAML frontmatter:

```markdown
---
name: agent-name
description: What this agent does
model: opus | sonnet | haiku
tools:
  - Read
  - Glob
  - Grep
  - WebSearch
---

# Agent Name

System prompt content here...
```

## Available Agents

| Agent | Model | Purpose |
|-------|-------|---------|
| plan-agent | opus | Decomposes goals into work items |

## Adding New Agents

1. Create `your-agent.md` in this directory
2. Add required frontmatter fields
3. Write the system prompt
4. The agent will be automatically discovered

## Files

- `plan-agent.md` - Plan Agent definition
- `_protocol.md` - Protocol reference (not loaded as agent)
- `README.md` - This file
```

**Step 3: Create _protocol.md**

```markdown
# Yolium Agent Protocol Reference

Agents communicate with Yolium via JSON messages prefixed with `@@YOLIUM:` in stdout.

## Message Types

### ask_question

Pauses agent execution and waits for user input.

```json
{"type":"ask_question","text":"Question?","options":["A","B"]}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| text | string | yes | The question to display |
| options | string[] | no | Multiple choice options |

### create_item

Creates a Kanban work item in the Backlog.

```json
{"type":"create_item","title":"Title","description":"Details","branch":"feature/x","agentType":"claude","order":1}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| title | string | yes | Short title for the card |
| description | string | yes | Full instructions |
| branch | string | no | Suggested branch name |
| agentType | enum | yes | claude, codex, opencode, shell |
| order | number | yes | Execution order (1 = first) |

### complete

Signals successful completion.

```json
{"type":"complete","summary":"Created 4 work items"}
```

### error

Signals failure.

```json
{"type":"error","message":"Reason for failure"}
```
```

**Step 4: Commit**

```bash
git add src/agents/
git commit -m "feat(agents): add Plan Agent definition and protocol docs"
```

---

## Task 6: Create Kanban Store

**Files:**
- Create: `src/lib/kanban-store.ts`
- Create: `src/tests/kanban-store.test.ts`

**Step 1: Write the failing test**

```typescript
// src/tests/kanban-store.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createBoard,
  getBoard,
  addItem,
  updateItem,
  addComment,
  buildConversationHistory,
} from '../lib/kanban-store';

// Mock fs
vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(() => '{}'),
}));

vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/home/test'),
}));

describe('kanban-store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createBoard', () => {
    it('should create a new board for a project', () => {
      const board = createBoard('/path/to/project');

      expect(board.projectPath).toBe('/path/to/project');
      expect(board.items).toEqual([]);
      expect(board.id).toBeDefined();
    });
  });

  describe('addItem', () => {
    it('should add item to board', () => {
      const board = createBoard('/path/to/project');
      const item = addItem(board, {
        title: 'Test Item',
        description: 'Do the thing',
        agentType: 'claude',
        order: 1,
      });

      expect(item.title).toBe('Test Item');
      expect(item.column).toBe('backlog');
      expect(item.agentStatus).toBe('idle');
      expect(board.items).toContain(item);
    });
  });

  describe('addComment', () => {
    it('should add comment to item', () => {
      const board = createBoard('/path/to/project');
      const item = addItem(board, {
        title: 'Test',
        description: 'Test',
        agentType: 'claude',
        order: 1,
      });

      addComment(board, item.id, 'user', 'This is my answer');

      const updated = board.items.find(i => i.id === item.id)!;
      expect(updated.comments).toHaveLength(1);
      expect(updated.comments[0].source).toBe('user');
      expect(updated.comments[0].text).toBe('This is my answer');
    });
  });

  describe('buildConversationHistory', () => {
    it('should build history from comments', () => {
      const board = createBoard('/path/to/project');
      const item = addItem(board, {
        title: 'Test',
        description: 'Test',
        agentType: 'claude',
        order: 1,
      });

      addComment(board, item.id, 'system', 'Agent started');
      addComment(board, item.id, 'agent', 'Which framework?');
      addComment(board, item.id, 'user', 'Use React');

      const history = buildConversationHistory(item);

      expect(history).toContain('[system]: Agent started');
      expect(history).toContain('[agent]: Which framework?');
      expect(history).toContain('[user]: Use React');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/tests/kanban-store.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```typescript
// src/lib/kanban-store.ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import type {
  KanbanBoard,
  KanbanItem,
  KanbanComment,
  CommentSource,
  AgentStatus,
} from '../types/kanban';

const YOLIUM_DIR = path.join(os.homedir(), '.yolium');
const BOARDS_DIR = path.join(YOLIUM_DIR, 'boards');

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function generateId(): string {
  return crypto.randomBytes(8).toString('hex');
}

function getBoardPath(projectPath: string): string {
  const hash = crypto.createHash('sha256').update(projectPath).digest('hex').slice(0, 12);
  const safeName = path.basename(projectPath).replace(/[^a-zA-Z0-9-_]/g, '_');
  return path.join(BOARDS_DIR, `${safeName}-${hash}.json`);
}

function saveBoard(board: KanbanBoard): void {
  ensureDir(BOARDS_DIR);
  board.updatedAt = new Date().toISOString();
  fs.writeFileSync(getBoardPath(board.projectPath), JSON.stringify(board, null, 2));
}

export function createBoard(projectPath: string): KanbanBoard {
  const board: KanbanBoard = {
    id: generateId(),
    projectPath,
    items: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  saveBoard(board);
  return board;
}

export function getBoard(projectPath: string): KanbanBoard | null {
  const boardPath = getBoardPath(projectPath);
  if (!fs.existsSync(boardPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(boardPath, 'utf-8'));
}

export function getOrCreateBoard(projectPath: string): KanbanBoard {
  return getBoard(projectPath) || createBoard(projectPath);
}

export interface NewItemParams {
  title: string;
  description: string;
  branch?: string;
  agentType: 'claude' | 'codex' | 'opencode' | 'shell';
  order: number;
}

export function addItem(board: KanbanBoard, params: NewItemParams): KanbanItem {
  const item: KanbanItem = {
    id: generateId(),
    title: params.title,
    description: params.description,
    column: 'backlog',
    branch: params.branch,
    agentType: params.agentType,
    order: params.order,
    agentStatus: 'idle',
    comments: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  board.items.push(item);
  saveBoard(board);
  return item;
}

export function updateItem(
  board: KanbanBoard,
  itemId: string,
  updates: Partial<Pick<KanbanItem, 'title' | 'description' | 'column' | 'agentStatus' | 'agentQuestion' | 'agentQuestionOptions'>>
): KanbanItem | null {
  const item = board.items.find(i => i.id === itemId);
  if (!item) return null;

  Object.assign(item, updates, { updatedAt: new Date().toISOString() });
  saveBoard(board);
  return item;
}

export function addComment(
  board: KanbanBoard,
  itemId: string,
  source: CommentSource,
  text: string
): KanbanComment | null {
  const item = board.items.find(i => i.id === itemId);
  if (!item) return null;

  const comment: KanbanComment = {
    id: generateId(),
    source,
    text,
    timestamp: new Date().toISOString(),
  };
  item.comments.push(comment);
  item.updatedAt = new Date().toISOString();
  saveBoard(board);
  return comment;
}

export function buildConversationHistory(item: KanbanItem): string {
  return item.comments
    .map(c => `[${c.source}]: ${c.text}`)
    .join('\n\n');
}

export function deleteBoard(projectPath: string): boolean {
  const boardPath = getBoardPath(projectPath);
  if (fs.existsSync(boardPath)) {
    fs.unlinkSync(boardPath);
    return true;
  }
  return false;
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/tests/kanban-store.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/kanban-store.ts src/tests/kanban-store.test.ts
git commit -m "feat(kanban-store): persistent board storage with comments"
```

---

## Task 7: Create Agent Runner

**Files:**
- Create: `src/lib/agent-runner.ts`
- Create: `src/tests/agent-runner.test.ts`

**Step 1: Write the failing test for prompt builder**

```typescript
// src/tests/agent-runner.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildAgentPrompt } from '../lib/agent-runner';

describe('agent-runner', () => {
  describe('buildAgentPrompt', () => {
    it('should build prompt with goal only', () => {
      const prompt = buildAgentPrompt({
        systemPrompt: 'You are the Plan Agent.',
        goal: 'Add user authentication',
        conversationHistory: '',
      });

      expect(prompt).toContain('You are the Plan Agent.');
      expect(prompt).toContain('Add user authentication');
      expect(prompt).not.toContain('Previous conversation:');
    });

    it('should include conversation history when provided', () => {
      const prompt = buildAgentPrompt({
        systemPrompt: 'You are the Plan Agent.',
        goal: 'Add auth',
        conversationHistory: '[agent]: Which method?\n\n[user]: OAuth',
      });

      expect(prompt).toContain('Previous conversation:');
      expect(prompt).toContain('[agent]: Which method?');
      expect(prompt).toContain('[user]: OAuth');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/tests/agent-runner.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write implementation**

```typescript
// src/lib/agent-runner.ts
import { spawn, ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { createLogger } from './logger';
import { loadAgentDefinition, ParsedAgent } from './agent-loader';
import { extractProtocolMessages } from './agent-protocol';
import {
  getOrCreateBoard,
  addItem,
  updateItem,
  addComment,
  buildConversationHistory,
} from './kanban-store';
import type { KanbanBoard, KanbanItem } from '../types/kanban';
import type {
  AskQuestionMessage,
  CreateItemMessage,
  CompleteMessage,
  ErrorMessage,
} from '../types/agent';

const logger = createLogger('agent-runner');

export interface BuildPromptParams {
  systemPrompt: string;
  goal: string;
  conversationHistory: string;
}

export function buildAgentPrompt(params: BuildPromptParams): string {
  const { systemPrompt, goal, conversationHistory } = params;

  let prompt = `${systemPrompt}\n\n## Current Goal\n\n${goal}`;

  if (conversationHistory.trim()) {
    prompt += `\n\n## Previous conversation:\n\n${conversationHistory}\n\nContinue from where you left off.`;
  }

  return prompt;
}

export interface AgentSession {
  id: string;
  agentName: string;
  itemId: string;
  projectPath: string;
  process: ChildProcess | null;
  events: EventEmitter;
}

const sessions = new Map<string, AgentSession>();

export interface StartAgentParams {
  agentName: string;
  projectPath: string;
  itemId: string;
  goal: string;
  onOutput?: (data: string) => void;
  onQuestion?: (question: AskQuestionMessage) => void;
  onItemCreated?: (item: KanbanItem) => void;
  onComplete?: (summary: string) => void;
  onError?: (message: string) => void;
}

export async function startAgent(params: StartAgentParams): Promise<string> {
  const {
    agentName,
    projectPath,
    itemId,
    goal,
    onOutput,
    onQuestion,
    onItemCreated,
    onComplete,
    onError,
  } = params;

  const agent = loadAgentDefinition(agentName);
  const board = getOrCreateBoard(projectPath);
  const item = board.items.find(i => i.id === itemId);

  if (!item) {
    throw new Error(`Item not found: ${itemId}`);
  }

  const conversationHistory = buildConversationHistory(item);
  const prompt = buildAgentPrompt({
    systemPrompt: agent.systemPrompt,
    goal,
    conversationHistory,
  });

  // Update item status to running
  updateItem(board, itemId, { agentStatus: 'running' });
  addComment(board, itemId, 'system', `${agentName} started`);

  const sessionId = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const events = new EventEmitter();

  const session: AgentSession = {
    id: sessionId,
    agentName,
    itemId,
    projectPath,
    process: null,
    events,
  };
  sessions.set(sessionId, session);

  // Build claude command
  // In production, this runs in a Docker container via docker-manager
  // For now, we'll prepare the command that docker-manager will execute
  const claudeArgs = [
    '--model', agent.model === 'opus' ? 'claude-opus-4-5-20251101' : agent.model,
    '-p', prompt,
    '--allowedTools', agent.tools.join(','),
    '--dangerously-skip-permissions',
  ];

  logger.info('Starting agent', { sessionId, agentName, claudeArgs: claudeArgs.slice(0, 4) });

  // The actual process spawning will be done by docker-manager
  // This function returns the session ID for tracking
  // The docker-manager will call handleAgentOutput with stdout data

  return sessionId;
}

export function handleAgentOutput(sessionId: string, data: string): void {
  const session = sessions.get(sessionId);
  if (!session) {
    logger.warn('Output for unknown session', { sessionId });
    return;
  }

  session.events.emit('output', data);

  // Parse protocol messages
  const messages = extractProtocolMessages(data);
  const board = getOrCreateBoard(session.projectPath);

  for (const message of messages) {
    switch (message.type) {
      case 'ask_question': {
        const q = message as AskQuestionMessage;
        updateItem(board, session.itemId, {
          agentStatus: 'waiting',
          agentQuestion: q.text,
          agentQuestionOptions: q.options,
        });
        addComment(board, session.itemId, 'agent', q.text);
        session.events.emit('question', q);
        break;
      }

      case 'create_item': {
        const c = message as CreateItemMessage;
        const newItem = addItem(board, {
          title: c.title,
          description: c.description,
          branch: c.branch,
          agentType: c.agentType,
          order: c.order,
        });
        session.events.emit('itemCreated', newItem);
        break;
      }

      case 'complete': {
        const comp = message as CompleteMessage;
        updateItem(board, session.itemId, { agentStatus: 'completed' });
        addComment(board, session.itemId, 'system', `Completed: ${comp.summary}`);
        session.events.emit('complete', comp.summary);
        break;
      }

      case 'error': {
        const err = message as ErrorMessage;
        updateItem(board, session.itemId, { agentStatus: 'failed' });
        addComment(board, session.itemId, 'system', `Error: ${err.message}`);
        session.events.emit('error', err.message);
        break;
      }
    }
  }
}

export function answerQuestion(sessionId: string, answer: string): void {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  const board = getOrCreateBoard(session.projectPath);
  addComment(board, session.itemId, 'user', answer);
  updateItem(board, session.itemId, {
    agentStatus: 'idle', // Will be set to 'running' when resumed
    agentQuestion: undefined,
    agentQuestionOptions: undefined,
  });
}

export function getSession(sessionId: string): AgentSession | undefined {
  return sessions.get(sessionId);
}

export function stopAgent(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (!session) return;

  if (session.process) {
    session.process.kill();
  }

  const board = getOrCreateBoard(session.projectPath);
  const item = board.items.find(i => i.id === session.itemId);
  if (item && item.agentStatus === 'running') {
    updateItem(board, session.itemId, { agentStatus: 'interrupted' });
    addComment(board, session.itemId, 'system', 'Agent was interrupted');
  }

  sessions.delete(sessionId);
}

export function recoverInterruptedAgents(projectPath: string): KanbanItem[] {
  const board = getOrCreateBoard(projectPath);
  const interrupted: KanbanItem[] = [];

  for (const item of board.items) {
    if (item.agentStatus === 'running') {
      updateItem(board, item.id, { agentStatus: 'interrupted' });
      addComment(board, item.id, 'system', 'Agent was interrupted (app closed)');
      interrupted.push(item);
    }
  }

  return interrupted;
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/tests/agent-runner.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/agent-runner.ts src/tests/agent-runner.test.ts
git commit -m "feat(agent-runner): orchestrate agent lifecycle and protocol handling"
```

---

## Task 8: Add IPC Handlers for Agent/Kanban

**Files:**
- Modify: `src/main.ts`
- Modify: `src/preload.ts`

**Step 1: Add IPC handlers to main.ts**

Add imports at top of `src/main.ts`:
```typescript
import {
  getOrCreateBoard,
  addItem,
  updateItem,
  addComment,
} from './lib/kanban-store';
import {
  startAgent,
  handleAgentOutput,
  answerQuestion,
  stopAgent,
  getSession,
  recoverInterruptedAgents,
} from './lib/agent-runner';
import type { KanbanBoard, KanbanItem } from './types/kanban';
```

Add handlers after existing IPC handlers (search for `// Code review` section):
```typescript
  // Kanban board operations
  ipcMain.handle('kanban:get-board', (_event, projectPath: string) => {
    return getOrCreateBoard(projectPath);
  });

  ipcMain.handle('kanban:add-item', (_event, projectPath: string, params: {
    title: string;
    description: string;
    branch?: string;
    agentType: 'claude' | 'codex' | 'opencode' | 'shell';
    order: number;
  }) => {
    const board = getOrCreateBoard(projectPath);
    return addItem(board, params);
  });

  ipcMain.handle('kanban:update-item', (_event, projectPath: string, itemId: string, updates: Partial<KanbanItem>) => {
    const board = getOrCreateBoard(projectPath);
    return updateItem(board, itemId, updates);
  });

  ipcMain.handle('kanban:add-comment', (_event, projectPath: string, itemId: string, source: 'user' | 'agent' | 'system', text: string) => {
    const board = getOrCreateBoard(projectPath);
    return addComment(board, itemId, source, text);
  });

  // Agent operations
  ipcMain.handle('agent:start', async (_event, params: {
    agentName: string;
    projectPath: string;
    itemId: string;
    goal: string;
  }) => {
    const webContentsId = _event.sender.id;
    const sessionId = await startAgent({
      ...params,
      onOutput: (data) => {
        BrowserWindow.fromId(webContentsId)?.webContents.send('agent:output', sessionId, data);
      },
      onQuestion: (question) => {
        BrowserWindow.fromId(webContentsId)?.webContents.send('agent:question', sessionId, question);
        BrowserWindow.fromId(webContentsId)?.webContents.send('kanban:board-updated', params.projectPath);
      },
      onItemCreated: (item) => {
        BrowserWindow.fromId(webContentsId)?.webContents.send('agent:item-created', sessionId, item);
        BrowserWindow.fromId(webContentsId)?.webContents.send('kanban:board-updated', params.projectPath);
      },
      onComplete: (summary) => {
        BrowserWindow.fromId(webContentsId)?.webContents.send('agent:complete', sessionId, summary);
        BrowserWindow.fromId(webContentsId)?.webContents.send('kanban:board-updated', params.projectPath);
      },
      onError: (message) => {
        BrowserWindow.fromId(webContentsId)?.webContents.send('agent:error', sessionId, message);
        BrowserWindow.fromId(webContentsId)?.webContents.send('kanban:board-updated', params.projectPath);
      },
    });
    return sessionId;
  });

  ipcMain.handle('agent:answer', (_event, sessionId: string, answer: string) => {
    answerQuestion(sessionId, answer);
  });

  ipcMain.handle('agent:stop', (_event, sessionId: string) => {
    stopAgent(sessionId);
  });

  ipcMain.handle('agent:recover', (_event, projectPath: string) => {
    return recoverInterruptedAgents(projectPath);
  });
```

**Step 2: Add preload API**

Add to `src/preload.ts` in the `contextBridge.exposeInMainWorld` section:
```typescript
  // Kanban board operations
  kanbanGetBoard: (projectPath: string) =>
    ipcRenderer.invoke('kanban:get-board', projectPath),
  kanbanAddItem: (projectPath: string, params: {
    title: string;
    description: string;
    branch?: string;
    agentType: 'claude' | 'codex' | 'opencode' | 'shell';
    order: number;
  }) => ipcRenderer.invoke('kanban:add-item', projectPath, params),
  kanbanUpdateItem: (projectPath: string, itemId: string, updates: object) =>
    ipcRenderer.invoke('kanban:update-item', projectPath, itemId, updates),
  kanbanAddComment: (projectPath: string, itemId: string, source: string, text: string) =>
    ipcRenderer.invoke('kanban:add-comment', projectPath, itemId, source, text),
  onKanbanBoardUpdated: (callback: (projectPath: string) => void): CleanupFn => {
    const handler = (_event: Electron.IpcRendererEvent, projectPath: string) =>
      callback(projectPath);
    ipcRenderer.on('kanban:board-updated', handler);
    return () => ipcRenderer.removeListener('kanban:board-updated', handler);
  },

  // Agent operations
  agentStart: (params: {
    agentName: string;
    projectPath: string;
    itemId: string;
    goal: string;
  }) => ipcRenderer.invoke('agent:start', params),
  agentAnswer: (sessionId: string, answer: string) =>
    ipcRenderer.invoke('agent:answer', sessionId, answer),
  agentStop: (sessionId: string) =>
    ipcRenderer.invoke('agent:stop', sessionId),
  agentRecover: (projectPath: string) =>
    ipcRenderer.invoke('agent:recover', projectPath),
  onAgentOutput: (callback: (sessionId: string, data: string) => void): CleanupFn => {
    const handler = (_event: Electron.IpcRendererEvent, sessionId: string, data: string) =>
      callback(sessionId, data);
    ipcRenderer.on('agent:output', handler);
    return () => ipcRenderer.removeListener('agent:output', handler);
  },
  onAgentQuestion: (callback: (sessionId: string, question: { text: string; options?: string[] }) => void): CleanupFn => {
    const handler = (_event: Electron.IpcRendererEvent, sessionId: string, question: { text: string; options?: string[] }) =>
      callback(sessionId, question);
    ipcRenderer.on('agent:question', handler);
    return () => ipcRenderer.removeListener('agent:question', handler);
  },
  onAgentItemCreated: (callback: (sessionId: string, item: object) => void): CleanupFn => {
    const handler = (_event: Electron.IpcRendererEvent, sessionId: string, item: object) =>
      callback(sessionId, item);
    ipcRenderer.on('agent:item-created', handler);
    return () => ipcRenderer.removeListener('agent:item-created', handler);
  },
  onAgentComplete: (callback: (sessionId: string, summary: string) => void): CleanupFn => {
    const handler = (_event: Electron.IpcRendererEvent, sessionId: string, summary: string) =>
      callback(sessionId, summary);
    ipcRenderer.on('agent:complete', handler);
    return () => ipcRenderer.removeListener('agent:complete', handler);
  },
  onAgentError: (callback: (sessionId: string, message: string) => void): CleanupFn => {
    const handler = (_event: Electron.IpcRendererEvent, sessionId: string, message: string) =>
      callback(sessionId, message);
    ipcRenderer.on('agent:error', handler);
    return () => ipcRenderer.removeListener('agent:error', handler);
  },
```

**Step 3: Add TypeScript declarations to preload.ts**

Add to the `Window.electronAPI` interface:
```typescript
      // Kanban board operations
      kanbanGetBoard: (projectPath: string) => Promise<{
        id: string;
        projectPath: string;
        items: Array<{
          id: string;
          title: string;
          description: string;
          column: 'backlog' | 'ready' | 'in-progress' | 'done';
          branch?: string;
          agentType: 'claude' | 'codex' | 'opencode' | 'shell';
          order: number;
          agentStatus: 'idle' | 'running' | 'waiting' | 'interrupted' | 'completed' | 'failed';
          agentQuestion?: string;
          agentQuestionOptions?: string[];
          comments: Array<{ id: string; source: 'user' | 'agent' | 'system'; text: string; timestamp: string }>;
          createdAt: string;
          updatedAt: string;
        }>;
        createdAt: string;
        updatedAt: string;
      }>;
      kanbanAddItem: (projectPath: string, params: {
        title: string;
        description: string;
        branch?: string;
        agentType: 'claude' | 'codex' | 'opencode' | 'shell';
        order: number;
      }) => Promise<object>;
      kanbanUpdateItem: (projectPath: string, itemId: string, updates: object) => Promise<object | null>;
      kanbanAddComment: (projectPath: string, itemId: string, source: string, text: string) => Promise<object | null>;
      onKanbanBoardUpdated: (callback: (projectPath: string) => void) => CleanupFn;
      // Agent operations
      agentStart: (params: {
        agentName: string;
        projectPath: string;
        itemId: string;
        goal: string;
      }) => Promise<string>;
      agentAnswer: (sessionId: string, answer: string) => Promise<void>;
      agentStop: (sessionId: string) => Promise<void>;
      agentRecover: (projectPath: string) => Promise<Array<object>>;
      onAgentOutput: (callback: (sessionId: string, data: string) => void) => CleanupFn;
      onAgentQuestion: (callback: (sessionId: string, question: { text: string; options?: string[] }) => void) => CleanupFn;
      onAgentItemCreated: (callback: (sessionId: string, item: object) => void) => CleanupFn;
      onAgentComplete: (callback: (sessionId: string, summary: string) => void) => CleanupFn;
      onAgentError: (callback: (sessionId: string, message: string) => void) => CleanupFn;
```

**Step 4: Commit**

```bash
git add src/main.ts src/preload.ts
git commit -m "feat(ipc): add Kanban and agent IPC handlers"
```

---

## Task 9: Run Full Test Suite

**Step 1: Run all tests**

```bash
npm test
```

Expected: All tests pass

**Step 2: Build and verify startup**

```bash
npm start
```

Expected: App launches without errors (Ctrl+C to stop after verifying)

**Step 3: Commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address test/build issues"
```

---

## Summary

This plan implements the core agent architecture:

| Component | Purpose |
|-----------|---------|
| `src/types/kanban.ts` | Kanban board and item types |
| `src/types/agent.ts` | Agent definition and protocol types |
| `src/lib/agent-loader.ts` | Parse agent markdown files |
| `src/lib/agent-protocol.ts` | Parse `@@YOLIUM:` protocol messages |
| `src/lib/kanban-store.ts` | Persistent board storage |
| `src/lib/agent-runner.ts` | Agent lifecycle orchestration |
| `src/agents/plan-agent.md` | Plan Agent definition |
| `src/main.ts` + `src/preload.ts` | IPC handlers |

**Not included (future work):**
- UI components (Kanban board, dialogs)
- Docker integration for running agents in containers
- E2E tests for full flow
