// src/tests/yolium-db-decomposition.test.ts
// Verifies that the barrel re-export is complete and domain modules share a DB instance.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const { homedirMock } = vi.hoisted(() => ({
  homedirMock: vi.fn(),
}));

vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return { ...actual, homedir: homedirMock };
});

vi.mock('node:path', async () => {
  const actual = await vi.importActual<typeof import('node:path')>('node:path');
  return {
    ...actual,
    resolve: vi.fn((...args: string[]) => args[args.length - 1]),
  };
});

vi.mock('@main/lib/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

let barrel: typeof import('@main/stores/yolium-db');
let dbConnection: typeof import('@main/stores/db-connection');
let kanbanDb: typeof import('@main/stores/kanban-db');
let registryDb: typeof import('@main/stores/registry-db');
let scheduleDb: typeof import('@main/stores/schedule-db');
let actionsDb: typeof import('@main/stores/actions-db');
let credentialsDb: typeof import('@main/stores/credentials-db');

describe('yolium-db decomposition', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yolium-decomp-'));
    fs.mkdirSync(path.join(tempDir, '.yolium'), { recursive: true });
    homedirMock.mockReturnValue(tempDir);

    vi.resetModules();
    barrel = await import('@main/stores/yolium-db');
    dbConnection = await import('@main/stores/db-connection');
    kanbanDb = await import('@main/stores/kanban-db');
    registryDb = await import('@main/stores/registry-db');
    scheduleDb = await import('@main/stores/schedule-db');
    actionsDb = await import('@main/stores/actions-db');
    credentialsDb = await import('@main/stores/credentials-db');
  });

  afterEach(() => {
    barrel.closeDb();
    vi.clearAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // ─── Barrel Re-export Completeness ─────────────────────────────────────

  it('should re-export all kanban functions from kanban-db', () => {
    expect(barrel.createBoard).toBe(kanbanDb.createBoard);
    expect(barrel.getBoard).toBe(kanbanDb.getBoard);
    expect(barrel.getOrCreateBoard).toBe(kanbanDb.getOrCreateBoard);
    expect(barrel.updateBoard).toBe(kanbanDb.updateBoard);
    expect(barrel.addItem).toBe(kanbanDb.addItem);
    expect(barrel.updateItem).toBe(kanbanDb.updateItem);
    expect(barrel.addComment).toBe(kanbanDb.addComment);
    expect(barrel.buildConversationHistory).toBe(kanbanDb.buildConversationHistory);
    expect(barrel.deleteItem).toBe(kanbanDb.deleteItem);
    expect(barrel.deleteItems).toBe(kanbanDb.deleteItems);
    expect(barrel.deleteBoard).toBe(kanbanDb.deleteBoard);
  });

  it('should re-export NewItemParams type from kanban-db', () => {
    // Type-level check: verify that a NewItemParams-shaped object is accepted by addItem
    const board = barrel.createBoard('/type-check');
    const params: import('@main/stores/kanban-db').NewItemParams = {
      title: 'Test',
      description: 'Desc',
      agentProvider: 'claude',
      order: 0,
    };
    const item = barrel.addItem(board, params);
    expect(item.title).toBe('Test');
  });

  it('should re-export normalizeForHash from db-connection', () => {
    expect(barrel.normalizeForHash).toBe(dbConnection.normalizeForHash);
  });

  it('should re-export getDb and closeDb from db-connection', () => {
    expect(barrel.getDb).toBe(dbConnection.getDb);
    expect(barrel.closeDb).toBe(dbConnection.closeDb);
  });

  it('should re-export all registry functions from registry-db', () => {
    expect(barrel.loadProjectRegistry).toBe(registryDb.loadProjectRegistry);
    expect(barrel.saveProjectRegistry).toBe(registryDb.saveProjectRegistry);
    expect(barrel.registerProject).toBe(registryDb.registerProject);
  });

  it('should re-export all schedule state functions from schedule-db', () => {
    expect(barrel.getScheduleState).toBe(scheduleDb.getScheduleState);
    expect(barrel.saveScheduleState).toBe(scheduleDb.saveScheduleState);
    expect(barrel.updateSpecialistStatus).toBe(scheduleDb.updateSpecialistStatus);
    expect(barrel.toggleSpecialist).toBe(scheduleDb.toggleSpecialist);
    expect(barrel.toggleGlobal).toBe(scheduleDb.toggleGlobal);
    expect(barrel.resetSpecialist).toBe(scheduleDb.resetSpecialist);
  });

  it('should re-export all run functions from schedule-db', () => {
    expect(barrel.appendRun).toBe(scheduleDb.appendRun);
    expect(barrel.getRecentRuns).toBe(scheduleDb.getRecentRuns);
    expect(barrel.getRunsSince).toBe(scheduleDb.getRunsSince);
    expect(barrel.getRunStats).toBe(scheduleDb.getRunStats);
    expect(barrel.trimHistory).toBe(scheduleDb.trimHistory);
    expect(barrel.appendRunLog).toBe(scheduleDb.appendRunLog);
    expect(barrel.getRunLog).toBe(scheduleDb.getRunLog);
  });

  it('should re-export all action functions from actions-db', () => {
    expect(barrel.appendAction).toBe(actionsDb.appendAction);
    expect(barrel.getRecentActions).toBe(actionsDb.getRecentActions);
    expect(barrel.getActionsByRun).toBe(actionsDb.getActionsByRun);
    expect(barrel.getAllRecentActions).toBe(actionsDb.getAllRecentActions);
    expect(barrel.getActionStats).toBe(actionsDb.getActionStats);
  });

  it('should re-export all credential functions from credentials-db', () => {
    expect(barrel.saveCredentials).toBe(credentialsDb.saveCredentials);
    expect(barrel.loadCredentials).toBe(credentialsDb.loadCredentials);
    expect(barrel.loadRedactedCredentials).toBe(credentialsDb.loadRedactedCredentials);
    expect(barrel.deleteCredentials).toBe(credentialsDb.deleteCredentials);
    expect(barrel.pruneCredentials).toBe(credentialsDb.pruneCredentials);
  });

  // ─── Domain Module Direct Usage ────────────────────────────────────────

  it('should create and query a board through kanban-db module directly', () => {
    const board = kanbanDb.createBoard('/direct/kanban');
    expect(board.id).toBeDefined();
    expect(board.projectPath).toBe('/direct/kanban');

    const fetched = kanbanDb.getBoard('/direct/kanban');
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(board.id);
  });

  it('should create and query project registry through registry-db module directly', () => {
    registryDb.registerProject('/direct/registry');
    const registry = registryDb.loadProjectRegistry();
    const entries = Object.values(registry.projects);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0].path).toBe('/direct/registry');
  });

  it('should save and load schedule state through schedule-db module directly', () => {
    const state = scheduleDb.getScheduleState();
    expect(state.globalEnabled).toBe(false);

    const updated = scheduleDb.toggleGlobal(state, true);
    scheduleDb.saveScheduleState(updated);

    const reloaded = scheduleDb.getScheduleState();
    expect(reloaded.globalEnabled).toBe(true);
  });

  it('should append and query runs through schedule-db module directly', () => {
    const run = {
      id: 'run-direct-1',
      specialistId: 'spec-1',
      scheduleType: 'daily',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      status: 'completed',
      tokensUsed: 500,
      costUsd: 0.005,
      summary: 'Direct test',
      outcome: 'completed',
    };
    scheduleDb.appendRun('spec-1', run);
    const runs = scheduleDb.getRecentRuns('spec-1', 10);
    expect(runs).toHaveLength(1);
    expect(runs[0].id).toBe('run-direct-1');
  });

  it('should append and query actions through actions-db module directly', () => {
    const action = {
      id: 'action-direct-1',
      runId: 'run-1',
      specialistId: 'spec-1',
      action: 'test_action',
      data: { key: 'value' },
      timestamp: new Date().toISOString(),
    };
    actionsDb.appendAction('spec-1', action);
    const actions = actionsDb.getRecentActions('spec-1', 10);
    expect(actions).toHaveLength(1);
    expect(actions[0].id).toBe('action-direct-1');
  });

  it('should save and load credentials through credentials-db module directly', () => {
    credentialsDb.saveCredentials('spec-1', 'twitter', { apiKey: 'key123' });
    const creds = credentialsDb.loadCredentials('spec-1');
    expect(creds.twitter).toBeDefined();
    expect(creds.twitter.apiKey).toBe('key123');
  });

  it('should share the same database instance across all domain modules via getDb', () => {
    // All modules should get the same singleton DB instance
    const db1 = dbConnection.getDb();
    const db2 = dbConnection.getDb();
    expect(db1).toBe(db2);

    // Cross-module: write via kanban-db, verify DB has the row via raw query
    kanbanDb.createBoard('/cross-module-test');
    const row = db1.prepare('SELECT * FROM kanban_boards WHERE project_path = ?').get('/cross-module-test');
    expect(row).toBeDefined();
  });
});
