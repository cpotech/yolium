import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockExposeInMainWorld,
  mockInvoke,
  mockSend,
  mockOn,
  mockRemoveListener,
  registeredListeners,
} = vi.hoisted(() => ({
  mockExposeInMainWorld: vi.fn(),
  mockInvoke: vi.fn(),
  mockSend: vi.fn(),
  mockOn: vi.fn((channel: string, listener: (...args: unknown[]) => void) => {
    registeredListeners.set(channel, listener);
  }),
  mockRemoveListener: vi.fn(),
  registeredListeners: new Map<string, (...args: unknown[]) => void>(),
}));

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: mockExposeInMainWorld,
  },
  ipcRenderer: {
    invoke: mockInvoke,
    send: mockSend,
    on: mockOn,
    removeListener: mockRemoveListener,
  },
}));

type ExposedElectronAPI = {
  app: {
    getVersion: () => Promise<unknown>;
  };
  git: {
    clone: (url: string, targetDir: string) => Promise<unknown>;
  };
  terminal: {
    write: (sessionId: string, data: string) => void;
  };
  container: {
    resize: (sessionId: string, cols: number, rows: number) => void;
  };
  tabs: {
    onCloseSpecific: (callback: (tabId: string) => void) => () => void;
  };
  agent: {
    onProgress: (
      callback: (
        sessionId: string,
        progress: { step: string; detail: string; attempt?: number; maxAttempts?: number },
      ) => void,
    ) => () => void;
  };
  whisper: {
    onDownloadProgress: (
      callback: (
        progress: {
          modelSize: string;
          downloadedBytes: number;
          totalBytes: number;
          percent: number;
        },
      ) => void,
    ) => () => void;
  };
  schedule: {
    onStateChanged: (callback: (state: unknown) => void) => () => void;
  };
};

async function loadPreload(): Promise<ExposedElectronAPI> {
  vi.resetModules();
  await import('../preload');

  const [, api] = mockExposeInMainWorld.mock.calls.at(-1) ?? [];
  return api as ExposedElectronAPI;
}

function getRegisteredListener(channel: string): (...args: unknown[]) => void {
  const listener = registeredListeners.get(channel);
  if (!listener) {
    throw new Error(`No listener registered for ${channel}`);
  }
  return listener;
}

beforeEach(() => {
  vi.clearAllMocks();
  registeredListeners.clear();
});

describe('preload electronAPI bridge', () => {
  it('registers the electronAPI object with contextBridge.exposeInMainWorld', async () => {
    const api = await loadPreload();

    expect(mockExposeInMainWorld).toHaveBeenCalledWith('electronAPI', api);
    expect(api).toEqual(
      expect.objectContaining({
        app: expect.any(Object),
        terminal: expect.any(Object),
        tabs: expect.any(Object),
        agent: expect.any(Object),
        whisper: expect.any(Object),
        schedule: expect.any(Object),
      }),
    );
  });

  it('forwards invoke-based calls such as app.getVersion() and git.clone(url, targetDir) to ipcRenderer.invoke with the original channels and arguments', async () => {
    const api = await loadPreload();

    await api.app.getVersion();
    await api.git.clone('https://github.com/yolium/app.git', '/tmp/worktree');

    expect(mockInvoke).toHaveBeenNthCalledWith(1, 'app:get-version');
    expect(mockInvoke).toHaveBeenNthCalledWith(
      2,
      'git:clone',
      'https://github.com/yolium/app.git',
      '/tmp/worktree',
    );
  });

  it('forwards send-based calls such as terminal.write(sessionId, data) and container.resize(sessionId, cols, rows) to ipcRenderer.send', async () => {
    const api = await loadPreload();

    api.terminal.write('terminal-1', 'pwd\n');
    api.container.resize('container-1', 120, 40);

    expect(mockSend).toHaveBeenNthCalledWith(1, 'terminal:write', 'terminal-1', 'pwd\n');
    expect(mockSend).toHaveBeenNthCalledWith(2, 'yolium:resize', 'container-1', 120, 40);
  });

  it('returns a cleanup function from tabs.onCloseSpecific(callback) that removes the exact listener registered with ipcRenderer.on', async () => {
    const api = await loadPreload();
    const callback = vi.fn();

    const cleanup = api.tabs.onCloseSpecific(callback);
    const listener = getRegisteredListener('tab:close-specific');

    cleanup();

    expect(mockOn).toHaveBeenCalledWith('tab:close-specific', listener);
    expect(mockRemoveListener).toHaveBeenCalledWith('tab:close-specific', listener);
  });

  it('forwards agent.onProgress(sessionId, progress) callbacks without exposing the Electron event object and preserves optional attempt fields', async () => {
    const api = await loadPreload();
    const callback = vi.fn();
    const progress = { step: 'build', detail: 'running', attempt: 2, maxAttempts: 4 };

    api.agent.onProgress(callback);
    getRegisteredListener('agent:progress')({ sender: 'ignored' }, 'session-1', progress);

    expect(callback).toHaveBeenCalledWith('session-1', progress);
    expect(callback.mock.calls[0]).toHaveLength(2);
  });

  it('forwards whisper.onDownloadProgress(progress) and schedule.onStateChanged(state) payload objects unchanged', async () => {
    const api = await loadPreload();
    const whisperCallback = vi.fn();
    const scheduleCallback = vi.fn();
    const downloadProgress = {
      modelSize: 'medium',
      downloadedBytes: 512,
      totalBytes: 1024,
      percent: 50,
    };
    const state = {
      specialists: {
        planner: {
          id: 'planner',
          enabled: true,
          consecutiveNoAction: 0,
          consecutiveFailures: 0,
          totalRuns: 3,
          successRate: 1,
          weeklyCost: 2.5,
        },
      },
      globalEnabled: true,
    };

    api.whisper.onDownloadProgress(whisperCallback);
    api.schedule.onStateChanged(scheduleCallback);

    getRegisteredListener('whisper:download-progress')({ sender: 'ignored' }, downloadProgress);
    getRegisteredListener('schedule:state-changed')({ sender: 'ignored' }, state);

    expect(whisperCallback).toHaveBeenCalledWith(downloadProgress);
    expect(whisperCallback.mock.calls[0][0]).toBe(downloadProgress);
    expect(scheduleCallback).toHaveBeenCalledWith(state);
    expect(scheduleCallback.mock.calls[0][0]).toBe(state);
  });
});
