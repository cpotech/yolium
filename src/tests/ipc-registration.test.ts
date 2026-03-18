import { describe, it, expect, vi, beforeEach } from 'vitest'

const registerAppHandlers = vi.fn()
const registerTerminalHandlers = vi.fn()
const registerTabHandlers = vi.fn()
const registerDialogHandlers = vi.fn()
const registerFilesystemHandlers = vi.fn()
const registerGitHandlers = vi.fn()
const registerDockerHandlers = vi.fn()
const registerContainerHandlers = vi.fn()
const registerKanbanHandlers = vi.fn()
const registerAgentHandlers = vi.fn()
const registerCacheHandlers = vi.fn()
const registerWhisperHandlers = vi.fn()
const registerOnboardingHandlers = vi.fn()
const registerProjectConfigHandlers = vi.fn()
const registerReportHandlers = vi.fn()
const registerScheduleHandlers = vi.fn()
const registerUsageHandlers = vi.fn()
const performCleanup = vi.fn()
const isCleanupDone = vi.fn(() => true)

const logger = {
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}

const ipcMain = {}
const dialog = {}
const shell = {}

vi.mock('electron', () => ({
  ipcMain,
  dialog,
  shell,
}))

vi.mock('@main/lib/logger', () => ({
  createLogger: vi.fn(() => logger),
}))

vi.mock('@main/ipc/app-handlers', () => ({
  registerAppHandlers,
  performCleanup,
  isCleanupDone,
}))

vi.mock('@main/ipc/terminal-handlers', () => ({ registerTerminalHandlers }))
vi.mock('@main/ipc/tab-handlers', () => ({ registerTabHandlers }))
vi.mock('@main/ipc/dialog-handlers', () => ({ registerDialogHandlers }))
vi.mock('@main/ipc/filesystem-handlers', () => ({ registerFilesystemHandlers }))
vi.mock('@main/ipc/git-handlers', () => ({
  registerGitHandlers,
  GIT_IPC_CHANNELS: ['git-config:load', 'git:init', 'git:clone'],
}))
vi.mock('@main/ipc/docker-handlers', () => ({ registerDockerHandlers }))
vi.mock('@main/ipc/container-handlers', () => ({ registerContainerHandlers }))
vi.mock('@main/ipc/kanban-handlers', () => ({ registerKanbanHandlers }))
vi.mock('@main/ipc/agent-handlers', () => ({ registerAgentHandlers }))
vi.mock('@main/ipc/cache-handlers', () => ({ registerCacheHandlers }))
vi.mock('@main/ipc/whisper-handlers', () => ({ registerWhisperHandlers }))
vi.mock('@main/ipc/onboarding-handlers', () => ({ registerOnboardingHandlers }))
vi.mock('@main/ipc/project-config-handlers', () => ({ registerProjectConfigHandlers }))
vi.mock('@main/ipc/report-handlers', () => ({ registerReportHandlers }))
vi.mock('@main/ipc/schedule-handlers', () => ({ registerScheduleHandlers }))
vi.mock('@main/ipc/usage-handlers', () => ({ registerUsageHandlers }))

async function loadIpcModule() {
  vi.resetModules()
  return import('@main/ipc')
}

const registrars = [
  registerAppHandlers,
  registerTerminalHandlers,
  registerTabHandlers,
  registerDialogHandlers,
  registerFilesystemHandlers,
  registerGitHandlers,
  registerDockerHandlers,
  registerContainerHandlers,
  registerKanbanHandlers,
  registerAgentHandlers,
  registerCacheHandlers,
  registerWhisperHandlers,
  registerUsageHandlers,
  registerOnboardingHandlers,
  registerProjectConfigHandlers,
  registerReportHandlers,
  registerScheduleHandlers,
]

describe('registerAllHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers all handler groups including git clone channels', async () => {
    const ipc = await loadIpcModule()

    expect(ipc.areIpcHandlersRegistered()).toBe(false)
    expect(ipc.registerAllHandlers()).toBe(true)
    expect(ipc.areIpcHandlersRegistered()).toBe(true)

    expect(registerAppHandlers).toHaveBeenCalledWith(ipcMain, shell)
    expect(registerDialogHandlers).toHaveBeenCalledWith(ipcMain, dialog)
    expect(registerGitHandlers).toHaveBeenCalledWith(ipcMain)
    expect(logger.info).toHaveBeenCalledWith(
      'IPC handlers ready',
      expect.objectContaining({ includesGitClone: true }),
    )
  })

  it('is idempotent across repeated initialization', async () => {
    const ipc = await loadIpcModule()

    expect(ipc.registerAllHandlers()).toBe(true)
    expect(ipc.registerAllHandlers()).toBe(false)

    for (const registrar of registrars) {
      expect(registrar).toHaveBeenCalledTimes(1)
    }
  })
})
