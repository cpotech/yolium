# Agent Docker Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable Plan Agent to run in headless Docker containers, parsing `@@YOLIUM:` protocol messages from stdout and creating Kanban work items.

**Architecture:** Agent runner builds prompts and calls docker-manager's new `createAgentContainer()`. Container runs Claude with base64-encoded prompt, streams stdout. Protocol messages trigger Kanban operations. Each question/answer cycle spawns a fresh container with accumulated context.

**Tech Stack:** TypeScript, Electron IPC, Docker (dockerode), Node.js streams

---

## Task 1: Update Agent Loader for Dev/Prod Paths

**Files:**
- Modify: `src/lib/agent-loader.ts`
- Modify: `src/tests/agent-loader.test.ts`

**Step 1: Write the failing test**

Add to `src/tests/agent-loader.test.ts`:

```typescript
describe('getAgentsDir', () => {
  it('should return a valid path', () => {
    // This test verifies the function exists and returns a string
    // In test environment, it will use the dev path
    const { getAgentsDir } = require('../lib/agent-loader');
    const dir = getAgentsDir();
    expect(typeof dir).toBe('string');
    expect(dir.length).toBeGreaterThan(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/tests/agent-loader.test.ts`
Expected: FAIL with "getAgentsDir is not a function" or similar

**Step 3: Update agent-loader.ts**

Replace the current path resolution in `src/lib/agent-loader.ts`:

```typescript
// src/lib/agent-loader.ts
// eslint-disable-next-line @typescript-eslint/no-var-requires
const matter = require('gray-matter');
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AgentDefinition } from '../types/agent';

export interface ParsedAgent extends AgentDefinition {
  systemPrompt: string;
}

const VALID_MODELS = ['opus', 'sonnet', 'haiku'] as const;

/**
 * Get the agents directory path.
 * In development: src/agents (relative to project root)
 * In production: resources/agents (bundled with app)
 */
export function getAgentsDir(): string {
  // Try to use Electron's app paths if available (production)
  try {
    // Dynamic require to avoid issues in test environment
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { app } = require('electron');

    // Development: src/agents relative to app path
    const devPath = path.join(app.getAppPath(), 'src', 'agents');
    if (fs.existsSync(devPath)) {
      return devPath;
    }

    // Production: resources/agents
    const prodPath = path.join(process.resourcesPath, 'agents');
    if (fs.existsSync(prodPath)) {
      return prodPath;
    }
  } catch {
    // Electron not available (test environment or direct Node.js)
  }

  // Fallback for tests and development without Electron
  // Use __dirname to find agents relative to compiled location
  const fallbackPath = path.join(__dirname, '..', 'agents');
  if (fs.existsSync(fallbackPath)) {
    return fallbackPath;
  }

  // Last resort: try from current working directory
  const cwdPath = path.join(process.cwd(), 'src', 'agents');
  if (fs.existsSync(cwdPath)) {
    return cwdPath;
  }

  throw new Error('Agents directory not found');
}

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
  const agentsDir = getAgentsDir();
  const agentPath = path.join(agentsDir, `${agentName}.md`);

  if (!fs.existsSync(agentPath)) {
    throw new Error(`Agent definition not found: ${agentName}`);
  }

  const content = fs.readFileSync(agentPath, 'utf-8');
  return parseAgentDefinition(content);
}

export function listAgents(): string[] {
  const agentsDir = getAgentsDir();

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

**Step 5: Commit**

```bash
git add src/lib/agent-loader.ts src/tests/agent-loader.test.ts
git commit -m "feat(agent-loader): support dev and production paths for agents"
```

---

## Task 2: Add Agents to Build Config

**Files:**
- Modify: `config/forge.config.ts`

**Step 1: Update extraResource**

In `config/forge.config.ts`, update the `extraResource` array in `packagerConfig`:

```typescript
packagerConfig: {
  asar: {
    // Unpack all node_modules so external modules and their deps can load
    unpack: '**/node_modules/**',
  },
  name: 'Yolium Desktop',
  executableName: 'yolium-desktop',
  // App icon (without extension - Electron picks .ico/.icns/.png based on platform)
  icon: 'assets/icon/favicon',
  // Copy docker, agents, and icon directories to resources folder for production builds
  extraResource: ['src/docker', 'src/agents', 'assets/icon'],
},
```

**Step 2: Verify build works**

Run: `npm run build`
Expected: Build completes without errors

**Step 3: Commit**

```bash
git add config/forge.config.ts
git commit -m "build: include agents directory in production bundle"
```

---

## Task 3: Add Agent Mode to Entrypoint

**Files:**
- Modify: `src/docker/entrypoint.sh`
- Modify: `src/tests/entrypoint.test.ts`

**Step 1: Write the failing test**

Add to `src/tests/entrypoint.test.ts` in the describe block:

```typescript
describe('agent tool mode', () => {
  it('should decode base64 prompt and build claude command', () => {
    const testPrompt = 'You are a test agent.\n\nDo something.';
    const base64Prompt = Buffer.from(testPrompt).toString('base64');

    // Test that base64 decoding works correctly
    const decoded = Buffer.from(base64Prompt, 'base64').toString('utf-8');
    expect(decoded).toBe(testPrompt);
  });

  it('should handle multi-line prompts with special characters', () => {
    const complexPrompt = `# Agent

Use these tools:
- Read
- Glob

Output: @@YOLIUM:{"type":"complete","summary":"done"}`;

    const base64Prompt = Buffer.from(complexPrompt).toString('base64');
    const decoded = Buffer.from(base64Prompt, 'base64').toString('utf-8');
    expect(decoded).toBe(complexPrompt);
  });
});
```

**Step 2: Run test to verify it passes**

Run: `npm test -- --run src/tests/entrypoint.test.ts`
Expected: PASS (this tests the encoding logic we'll use)

**Step 3: Add agent mode to entrypoint.sh**

Add the following block in `src/docker/entrypoint.sh` after the `code-review` elif block (around line 495) and before the `opencode` elif:

```bash
elif [ "$TOOL" = "agent" ]; then
    log "Starting agent mode"
    log "AGENT_MODEL=$AGENT_MODEL"
    log "AGENT_TOOLS=$AGENT_TOOLS"

    # Validate required environment variables
    if [ -z "$AGENT_PROMPT" ]; then
        echo "ERROR: AGENT_PROMPT environment variable is required"
        exit 1
    fi

    if [ -z "$AGENT_MODEL" ]; then
        echo "ERROR: AGENT_MODEL environment variable is required"
        exit 1
    fi

    # Decode base64 prompt
    PROMPT=$(echo "$AGENT_PROMPT" | base64 -d)
    if [ $? -ne 0 ]; then
        echo "ERROR: Failed to decode AGENT_PROMPT (invalid base64)"
        exit 1
    fi

    log "Prompt decoded successfully (length: ${#PROMPT})"

    # Map model name to full model ID
    case "$AGENT_MODEL" in
        opus)   MODEL_ID="claude-opus-4-5-20251101" ;;
        sonnet) MODEL_ID="claude-sonnet-4-20250514" ;;
        haiku)  MODEL_ID="claude-haiku-3-5-20241022" ;;
        *)      MODEL_ID="$AGENT_MODEL" ;;  # Allow full model ID passthrough
    esac

    # Build allowed tools argument
    TOOLS_ARG=""
    if [ -n "$AGENT_TOOLS" ]; then
        TOOLS_ARG="--allowedTools $AGENT_TOOLS"
    fi

    log "Running Claude: model=$MODEL_ID tools=$AGENT_TOOLS"

    # Run Claude with the decoded prompt
    # Note: No TTY, no "press key to start" - this is headless
    exec claude --model "$MODEL_ID" -p "$PROMPT" $TOOLS_ARG --dangerously-skip-permissions
```

**Step 4: Verify entrypoint syntax**

Run: `bash -n src/docker/entrypoint.sh`
Expected: No output (syntax OK)

**Step 5: Commit**

```bash
git add src/docker/entrypoint.sh src/tests/entrypoint.test.ts
git commit -m "feat(entrypoint): add headless agent mode with base64 prompt"
```

---

## Task 4: Add createAgentContainer to Docker Manager

**Files:**
- Modify: `src/docker-manager.ts`
- Modify: `src/tests/docker-manager.test.ts`

**Step 1: Write the failing test**

Add to `src/tests/docker-manager.test.ts`:

```typescript
describe('createAgentContainer', () => {
  it('should encode prompt as base64 in environment', async () => {
    const testPrompt = 'You are a test agent.\n\n## Goal\n\nDo something.';
    const expectedBase64 = Buffer.from(testPrompt).toString('base64');

    // Verify our encoding matches what the container will decode
    const decoded = Buffer.from(expectedBase64, 'base64').toString('utf-8');
    expect(decoded).toBe(testPrompt);
  });

  it('should format tools as comma-separated string', () => {
    const tools = ['Read', 'Glob', 'Grep', 'WebSearch'];
    const toolsArg = tools.join(',');
    expect(toolsArg).toBe('Read,Glob,Grep,WebSearch');
  });
});
```

**Step 2: Run test to verify it passes**

Run: `npm test -- --run src/tests/docker-manager.test.ts`
Expected: PASS

**Step 3: Add AgentContainerParams interface and createAgentContainer function**

Add the following to `src/docker-manager.ts` after the imports (around line 17):

```typescript
// Agent container session tracking (separate from interactive sessions)
interface AgentContainerSession {
  id: string;
  containerId: string;
  webContentsId: number;
  projectPath: string;
  itemId: string;
  agentName: string;
  state: 'running' | 'stopped' | 'crashed';
  timeoutId?: NodeJS.Timeout;
}

const agentSessions = new Map<string, AgentContainerSession>();
```

Add the interface and function before the cache management section (around line 930):

```typescript
// ============================================================================
// Agent Container Functions
// ============================================================================

export interface AgentContainerParams {
  webContentsId: number;
  projectPath: string;
  agentName: string;
  prompt: string;
  model: string;
  tools: string[];
  itemId: string;
}

export interface AgentContainerCallbacks {
  onOutput?: (data: string) => void;
  onProtocolMessage?: (message: unknown) => void;
  onExit?: (code: number) => void;
}

/**
 * Create a headless container for running an agent.
 * The agent runs Claude with the given prompt and streams output.
 * Protocol messages (@@YOLIUM:) are parsed and forwarded via callbacks.
 */
export async function createAgentContainer(
  params: AgentContainerParams,
  callbacks: AgentContainerCallbacks = {}
): Promise<string> {
  const {
    webContentsId,
    projectPath,
    agentName,
    prompt,
    model,
    tools,
    itemId,
  } = params;

  const sessionId = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const resolvedPath = path.resolve(projectPath);

  logger.info('Creating agent container', {
    sessionId,
    agentName,
    projectPath: resolvedPath,
    model,
    tools,
    itemId,
  });

  // Encode prompt as base64 for safe environment variable transport
  const base64Prompt = Buffer.from(prompt).toString('base64');

  // Build bind mounts (project + Claude auth)
  const containerProjectPath = getContainerProjectPath(resolvedPath);
  const paths = getPersistentPaths(resolvedPath);
  ensurePersistentDirs(paths, resolvedPath);

  const binds = [
    `${toDockerPath(resolvedPath)}:${containerProjectPath}:rw`,
    `${toDockerPath(paths.claude)}:/home/agent/.claude:rw`,
  ];

  // Add git credentials if available
  const gitCredBind = getGitCredentialsBind();
  if (gitCredBind) {
    binds.push(gitCredBind);
  }

  logger.debug('Agent container bind mounts', { sessionId, binds });

  const container = await docker.createContainer({
    Image: DEFAULT_IMAGE,
    Tty: false,
    OpenStdin: false,
    AttachStdin: false,
    AttachStdout: true,
    AttachStderr: true,
    WorkingDir: containerProjectPath,
    Env: [
      `PROJECT_DIR=${containerProjectPath}`,
      'TOOL=agent',
      `AGENT_PROMPT=${base64Prompt}`,
      `AGENT_MODEL=${model}`,
      `AGENT_TOOLS=${tools.join(',')}`,
      `HOST_HOME=${toContainerHomePath(os.homedir())}`,
      'CLAUDE_CONFIG_DIR=/home/agent/.claude',
      ...(process.env.YOLIUM_NETWORK_FULL === 'true' ? ['YOLIUM_NETWORK_FULL=true'] : []),
    ],
    HostConfig: {
      CapAdd: ['NET_ADMIN'],
      Binds: binds,
    },
  });

  // Attach before start to avoid race condition
  const stream = await container.attach({
    stream: true,
    stdout: true,
    stderr: true,
  });

  // Demux the multiplexed stream (Tty: false uses 8-byte header framing)
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  docker.modem.demuxStream(stream, stdout, stderr);

  await container.start();
  logger.info('Agent container started', { sessionId, containerId: container.id });

  // Store session
  const session: AgentContainerSession = {
    id: sessionId,
    containerId: container.id,
    webContentsId,
    projectPath: resolvedPath,
    itemId,
    agentName,
    state: 'running',
  };
  agentSessions.set(sessionId, session);

  // Set up timeout (10 minutes of no output)
  let lastOutput = Date.now();
  const TIMEOUT_MS = 10 * 60 * 1000;

  const timeoutCheck = setInterval(() => {
    if (Date.now() - lastOutput > TIMEOUT_MS) {
      logger.warn('Agent container timeout', { sessionId });
      clearInterval(timeoutCheck);
      container.kill().catch(() => {});
    }
  }, 30000);
  session.timeoutId = timeoutCheck;

  // Handle output
  const handleOutput = (data: Buffer) => {
    const dataStr = data.toString();
    lastOutput = Date.now();

    // Forward raw output
    callbacks.onOutput?.(dataStr);

    // Parse and forward protocol messages
    const messages = extractProtocolMessages(dataStr);
    for (const msg of messages) {
      callbacks.onProtocolMessage?.(msg);
    }
  };

  stdout.on('data', handleOutput);
  stderr.on('data', handleOutput);

  // Handle completion
  stream.on('end', async () => {
    clearInterval(timeoutCheck);
    const sess = agentSessions.get(sessionId);
    if (sess) {
      sess.state = 'stopped';
    }

    let exitCode = 0;
    try {
      const info = await container.inspect();
      exitCode = info.State.ExitCode;
    } catch {
      // Container may already be removed
    }

    logger.info('Agent container exited', { sessionId, exitCode });
    callbacks.onExit?.(exitCode);

    // Cleanup
    try {
      await container.remove({ force: true });
    } catch {
      // Container may already be removed
    }

    agentSessions.delete(sessionId);
  });

  stream.on('error', (err: Error) => {
    clearInterval(timeoutCheck);
    logger.error('Agent container stream error', { sessionId, error: err.message });
    const sess = agentSessions.get(sessionId);
    if (sess) {
      sess.state = 'crashed';
    }
    callbacks.onExit?.(1);
    agentSessions.delete(sessionId);
  });

  return sessionId;
}

/**
 * Stop an agent container.
 */
export async function stopAgentContainer(sessionId: string): Promise<void> {
  const session = agentSessions.get(sessionId);
  if (!session) return;

  if (session.timeoutId) {
    clearInterval(session.timeoutId);
  }

  try {
    const container = docker.getContainer(session.containerId);
    await container.stop({ t: 5 });
    await container.remove({ force: true });
  } catch (err) {
    logger.error('Error stopping agent container', {
      sessionId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  agentSessions.delete(sessionId);
}

/**
 * Get agent session info.
 */
export function getAgentSession(sessionId: string): AgentContainerSession | undefined {
  return agentSessions.get(sessionId);
}
```

**Step 4: Add import for extractProtocolMessages**

At the top of `src/docker-manager.ts`, add:

```typescript
import { extractProtocolMessages } from './lib/agent-protocol';
```

**Step 5: Run tests**

Run: `npm test -- --run src/tests/docker-manager.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/docker-manager.ts src/tests/docker-manager.test.ts
git commit -m "feat(docker-manager): add createAgentContainer for headless agent execution"
```

---

## Task 5: Connect Agent Runner to Docker

**Files:**
- Modify: `src/lib/agent-runner.ts`
- Modify: `src/tests/agent-runner.test.ts`

**Step 1: Write the failing test**

Add to `src/tests/agent-runner.test.ts`:

```typescript
describe('resumeAgent', () => {
  it('should rebuild prompt with conversation history', () => {
    const systemPrompt = 'You are the Plan Agent.';
    const goal = 'Add authentication';
    const history = '[agent]: Which method?\n\n[user]: OAuth';

    const prompt = buildAgentPrompt({
      systemPrompt,
      goal,
      conversationHistory: history,
    });

    expect(prompt).toContain('Previous conversation:');
    expect(prompt).toContain('[agent]: Which method?');
    expect(prompt).toContain('[user]: OAuth');
    expect(prompt).toContain('Continue from where you left off');
  });
});
```

**Step 2: Run test to verify it passes**

Run: `npm test -- --run src/tests/agent-runner.test.ts`
Expected: PASS (this tests existing functionality we'll build on)

**Step 3: Update agent-runner.ts**

Replace `src/lib/agent-runner.ts` with the Docker-integrated version:

```typescript
// src/lib/agent-runner.ts
import { EventEmitter } from 'node:events';
import { createLogger } from './logger';
import { loadAgentDefinition } from './agent-loader';
import { extractProtocolMessages } from './agent-protocol';
import {
  getOrCreateBoard,
  addItem,
  updateItem,
  addComment,
  buildConversationHistory,
} from './kanban-store';
import {
  createAgentContainer,
  stopAgentContainer,
  checkAgentAuth,
} from '../docker-manager';
import type { KanbanItem } from '../types/kanban';
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

// Track active agent sessions
interface ActiveAgentSession {
  sessionId: string;
  agentName: string;
  itemId: string;
  projectPath: string;
  goal: string;
  events: EventEmitter;
}

const activeSessions = new Map<string, ActiveAgentSession>();

export interface StartAgentParams {
  webContentsId: number;
  agentName: string;
  projectPath: string;
  itemId: string;
  goal: string;
}

export interface StartAgentResult {
  sessionId: string;
  error?: string;
}

/**
 * Start an agent for a Kanban item.
 * Creates a headless Docker container that runs Claude with the agent's system prompt.
 */
export async function startAgent(params: StartAgentParams): Promise<StartAgentResult> {
  const {
    webContentsId,
    agentName,
    projectPath,
    itemId,
    goal,
  } = params;

  logger.info('Starting agent', { agentName, projectPath, itemId });

  // Check Claude auth before starting
  const authCheck = checkAgentAuth('claude');
  if (!authCheck.authenticated) {
    logger.warn('Claude not authenticated', { agentName });
    return {
      sessionId: '',
      error: 'Claude is not authenticated. Please run Claude in a terminal tab first to authenticate.',
    };
  }

  // Load agent definition
  const agent = loadAgentDefinition(agentName);

  // Get or create board and find item
  const board = getOrCreateBoard(projectPath);
  const item = board.items.find(i => i.id === itemId);

  if (!item) {
    return { sessionId: '', error: `Item not found: ${itemId}` };
  }

  // Build prompt with conversation history
  const conversationHistory = buildConversationHistory(item);
  const prompt = buildAgentPrompt({
    systemPrompt: agent.systemPrompt,
    goal,
    conversationHistory,
  });

  // Update item status
  updateItem(board, itemId, { agentStatus: 'running' });
  addComment(board, itemId, 'system', `${agentName} started`);

  const events = new EventEmitter();

  try {
    // Create the agent container
    const sessionId = await createAgentContainer(
      {
        webContentsId,
        projectPath,
        agentName,
        prompt,
        model: agent.model,
        tools: agent.tools,
        itemId,
      },
      {
        onOutput: (data) => {
          events.emit('output', data);
        },
        onProtocolMessage: (message) => {
          handleProtocolMessage(sessionId, message as AskQuestionMessage | CreateItemMessage | CompleteMessage | ErrorMessage);
        },
        onExit: (code) => {
          handleAgentExit(sessionId, code);
        },
      }
    );

    // Store session
    activeSessions.set(sessionId, {
      sessionId,
      agentName,
      itemId,
      projectPath,
      goal,
      events,
    });

    logger.info('Agent started', { sessionId, agentName });
    return { sessionId };

  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('Failed to start agent', { agentName, error: errorMsg });

    updateItem(board, itemId, { agentStatus: 'failed' });
    addComment(board, itemId, 'system', `Failed to start: ${errorMsg}`);

    return { sessionId: '', error: errorMsg };
  }
}

/**
 * Handle protocol messages from the agent.
 */
function handleProtocolMessage(
  sessionId: string,
  message: AskQuestionMessage | CreateItemMessage | CompleteMessage | ErrorMessage
): void {
  const session = activeSessions.get(sessionId);
  if (!session) {
    logger.warn('Protocol message for unknown session', { sessionId });
    return;
  }

  const board = getOrCreateBoard(session.projectPath);

  switch (message.type) {
    case 'ask_question': {
      const q = message as AskQuestionMessage;
      logger.info('Agent asked question', { sessionId, question: q.text });

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
      logger.info('Agent created item', { sessionId, title: c.title });

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
      logger.info('Agent completed', { sessionId, summary: comp.summary });

      updateItem(board, session.itemId, { agentStatus: 'completed' });
      addComment(board, session.itemId, 'system', `Completed: ${comp.summary}`);
      session.events.emit('complete', comp.summary);
      break;
    }

    case 'error': {
      const err = message as ErrorMessage;
      logger.error('Agent error', { sessionId, message: err.message });

      updateItem(board, session.itemId, { agentStatus: 'failed' });
      addComment(board, session.itemId, 'system', `Error: ${err.message}`);
      session.events.emit('error', err.message);
      break;
    }
  }
}

/**
 * Handle agent container exit.
 */
function handleAgentExit(sessionId: string, exitCode: number): void {
  const session = activeSessions.get(sessionId);
  if (!session) return;

  const board = getOrCreateBoard(session.projectPath);
  const item = board.items.find(i => i.id === session.itemId);

  // If item is still 'running', it means agent exited without sending complete/error
  if (item && item.agentStatus === 'running') {
    if (exitCode === 0) {
      // Clean exit but no complete message - mark as completed
      updateItem(board, session.itemId, { agentStatus: 'completed' });
      addComment(board, session.itemId, 'system', 'Agent exited normally');
    } else {
      // Non-zero exit - mark as failed
      updateItem(board, session.itemId, { agentStatus: 'failed' });
      addComment(board, session.itemId, 'system', `Agent crashed (exit code ${exitCode})`);
    }
  }

  session.events.emit('exit', exitCode);
  activeSessions.delete(sessionId);
}

/**
 * Answer a question posed by an agent.
 * Stores the answer as a comment. User must call resumeAgent to continue.
 */
export function answerAgentQuestion(
  projectPath: string,
  itemId: string,
  answer: string
): void {
  const board = getOrCreateBoard(projectPath);
  addComment(board, itemId, 'user', answer);
  updateItem(board, itemId, {
    agentQuestion: undefined,
    agentQuestionOptions: undefined,
  });
  logger.info('Agent question answered', { itemId, answer: answer.slice(0, 50) });
}

/**
 * Resume an agent after user answers a question.
 * Creates a new container with the full conversation history.
 */
export async function resumeAgent(params: StartAgentParams): Promise<StartAgentResult> {
  const { projectPath, itemId } = params;

  // Verify item is in waiting state
  const board = getOrCreateBoard(projectPath);
  const item = board.items.find(i => i.id === itemId);

  if (!item) {
    return { sessionId: '', error: `Item not found: ${itemId}` };
  }

  if (item.agentStatus !== 'waiting' && item.agentStatus !== 'interrupted') {
    return { sessionId: '', error: `Item is not waiting for input (status: ${item.agentStatus})` };
  }

  // Start the agent - it will pick up conversation history from comments
  return startAgent(params);
}

/**
 * Stop a running agent.
 */
export async function stopAgent(sessionId: string): Promise<void> {
  const session = activeSessions.get(sessionId);
  if (!session) return;

  logger.info('Stopping agent', { sessionId });

  const board = getOrCreateBoard(session.projectPath);
  updateItem(board, session.itemId, { agentStatus: 'interrupted' });
  addComment(board, session.itemId, 'system', 'Agent was stopped by user');

  await stopAgentContainer(sessionId);
  activeSessions.delete(sessionId);
}

/**
 * Get session events emitter for subscribing to agent events.
 */
export function getAgentEvents(sessionId: string): EventEmitter | undefined {
  return activeSessions.get(sessionId)?.events;
}

/**
 * Recover interrupted agents on app startup.
 * Sets running agents to interrupted status.
 */
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

**Step 4: Run tests**

Run: `npm test -- --run src/tests/agent-runner.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/agent-runner.ts src/tests/agent-runner.test.ts
git commit -m "feat(agent-runner): integrate with Docker for headless agent execution"
```

---

## Task 6: Update IPC Handlers

**Files:**
- Modify: `src/main.ts`
- Modify: `src/preload.ts`

**Step 1: Update main.ts IPC handlers**

Find the existing agent IPC handlers in `src/main.ts` and update them:

```typescript
// Agent operations
ipcMain.handle('agent:start', async (_event, params: {
  agentName: string;
  projectPath: string;
  itemId: string;
  goal: string;
}) => {
  const webContentsId = _event.sender.id;
  const result = await startAgent({
    webContentsId,
    ...params,
  });

  if (result.error) {
    return { error: result.error };
  }

  // Set up event forwarding to renderer
  const events = getAgentEvents(result.sessionId);
  if (events) {
    const win = BrowserWindow.getAllWindows().find(
      w => w.webContents.id === webContentsId
    );

    events.on('output', (data: string) => {
      win?.webContents.send('agent:output', result.sessionId, data);
    });

    events.on('question', (question: { text: string; options?: string[] }) => {
      win?.webContents.send('agent:question', result.sessionId, question);
      win?.webContents.send('kanban:board-updated', params.projectPath);
    });

    events.on('itemCreated', (item: unknown) => {
      win?.webContents.send('agent:item-created', result.sessionId, item);
      win?.webContents.send('kanban:board-updated', params.projectPath);
    });

    events.on('complete', (summary: string) => {
      win?.webContents.send('agent:complete', result.sessionId, summary);
      win?.webContents.send('kanban:board-updated', params.projectPath);
    });

    events.on('error', (message: string) => {
      win?.webContents.send('agent:error', result.sessionId, message);
      win?.webContents.send('kanban:board-updated', params.projectPath);
    });

    events.on('exit', (code: number) => {
      win?.webContents.send('agent:exit', result.sessionId, code);
      win?.webContents.send('kanban:board-updated', params.projectPath);
    });
  }

  return { sessionId: result.sessionId };
});

ipcMain.handle('agent:answer', (_event, projectPath: string, itemId: string, answer: string) => {
  answerAgentQuestion(projectPath, itemId, answer);
});

ipcMain.handle('agent:resume', async (_event, params: {
  agentName: string;
  projectPath: string;
  itemId: string;
  goal: string;
}) => {
  const webContentsId = _event.sender.id;
  return resumeAgent({
    webContentsId,
    ...params,
  });
});

ipcMain.handle('agent:stop', async (_event, sessionId: string) => {
  await stopAgent(sessionId);
});
```

**Step 2: Update imports in main.ts**

Update the import from agent-runner:

```typescript
import {
  startAgent,
  resumeAgent,
  stopAgent,
  answerAgentQuestion,
  getAgentEvents,
  recoverInterruptedAgents,
} from './lib/agent-runner';
```

**Step 3: Update preload.ts**

Update the agent API in `src/preload.ts`:

```typescript
// Agent operations
agentStart: (params: {
  agentName: string;
  projectPath: string;
  itemId: string;
  goal: string;
}) => ipcRenderer.invoke('agent:start', params),

agentAnswer: (projectPath: string, itemId: string, answer: string) =>
  ipcRenderer.invoke('agent:answer', projectPath, itemId, answer),

agentResume: (params: {
  agentName: string;
  projectPath: string;
  itemId: string;
  goal: string;
}) => ipcRenderer.invoke('agent:resume', params),

agentStop: (sessionId: string) =>
  ipcRenderer.invoke('agent:stop', sessionId),

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

onAgentExit: (callback: (sessionId: string, code: number) => void): CleanupFn => {
  const handler = (_event: Electron.IpcRendererEvent, sessionId: string, code: number) =>
    callback(sessionId, code);
  ipcRenderer.on('agent:exit', handler);
  return () => ipcRenderer.removeListener('agent:exit', handler);
},
```

**Step 4: Build to verify no TypeScript errors**

Run: `npm run build`
Expected: Build completes without errors

**Step 5: Commit**

```bash
git add src/main.ts src/preload.ts
git commit -m "feat(ipc): update agent IPC handlers for Docker integration"
```

---

## Task 7: Run Full Test Suite and Build

**Step 1: Run all unit tests**

Run: `npm test`
Expected: All tests pass

**Step 2: Build the app**

Run: `npm run build`
Expected: Build completes without errors

**Step 3: Fix any issues**

If tests fail or build errors occur, fix them and re-run.

**Step 4: Final commit if any fixes**

```bash
git add -A
git commit -m "fix: address test and build issues"
```

---

## Summary

This plan implements Docker integration for the Plan Agent:

| Task | Component | Purpose |
|------|-----------|---------|
| 1 | agent-loader.ts | Dev/prod path resolution for agent files |
| 2 | forge.config.ts | Bundle agents in production build |
| 3 | entrypoint.sh | Headless agent mode with base64 prompt |
| 4 | docker-manager.ts | createAgentContainer function |
| 5 | agent-runner.ts | Connect to Docker, handle protocol messages |
| 6 | main.ts, preload.ts | IPC handlers for renderer communication |
| 7 | Tests & Build | Verify everything works |

**After implementation:**
- Plan Agent can run in headless containers
- Protocol messages parsed in real-time
- Questions pause execution, answers resume with new container
- Conversation history preserved across sessions
