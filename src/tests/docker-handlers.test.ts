import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  logger: { info: vi.fn(), debug: vi.fn() },
  isDockerAvailable: vi.fn(),
  ensureImage: vi.fn(),
  removeAllYoliumContainers: vi.fn(),
  removeYoliumImage: vi.fn(),
  getYoliumImageInfo: vi.fn(),
  detectDockerState: vi.fn(),
  startDockerDesktop: vi.fn(),
  startDockerEngine: vi.fn(),
}))

vi.mock('@main/lib/logger', () => ({
  createLogger: () => mocks.logger,
}))

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => [],
  },
}))

vi.mock('@main/docker', () => ({
  isDockerAvailable: mocks.isDockerAvailable,
  ensureImage: mocks.ensureImage,
  removeAllYoliumContainers: mocks.removeAllYoliumContainers,
  removeYoliumImage: mocks.removeYoliumImage,
  getYoliumImageInfo: mocks.getYoliumImageInfo,
}))

vi.mock('@main/services/docker-setup', () => ({
  detectDockerState: mocks.detectDockerState,
  startDockerDesktop: mocks.startDockerDesktop,
  startDockerEngine: mocks.startDockerEngine,
}))

type HandlerMap = Record<string, (...args: unknown[]) => unknown>

async function registerHandlers(mockDocker: boolean): Promise<HandlerMap> {
  if (mockDocker) {
    process.env.YOLIUM_E2E_MOCK_DOCKER = '1'
  } else {
    delete process.env.YOLIUM_E2E_MOCK_DOCKER
  }

  vi.resetModules()
  const { registerDockerHandlers } = await import('@main/ipc/docker-handlers')
  const handlers: HandlerMap = {}
  registerDockerHandlers({
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers[channel] = handler
    },
  } as any)
  return handlers
}

describe('docker-handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.YOLIUM_E2E_MOCK_DOCKER
  })

  it('uses mock responses in E2E mock mode', async () => {
    const handlers = await registerHandlers(true)

    expect(await handlers['docker:available']()).toBe(true)
    expect(await handlers['docker:detect-state']()).toEqual({
      installed: true,
      running: true,
      desktopPath: null,
    })
    expect(await handlers['docker:ensure-image']({}, 'yolium:latest')).toBeUndefined()
    expect(await handlers['docker:start-desktop']()).toBe(true)
    expect(await handlers['docker:start-engine']()).toBe(true)
    expect(await handlers['docker:remove-all-containers']()).toBeUndefined()
    expect(await handlers['docker:remove-image']()).toBeUndefined()
    expect(await handlers['docker:get-image-info']()).toBeNull()

    expect(mocks.isDockerAvailable).not.toHaveBeenCalled()
    expect(mocks.ensureImage).not.toHaveBeenCalled()
    expect(mocks.detectDockerState).not.toHaveBeenCalled()
  })

  it('delegates to docker services when mock mode is disabled', async () => {
    mocks.isDockerAvailable.mockResolvedValue(true)
    mocks.detectDockerState.mockResolvedValue({ installed: true, running: false, desktopPath: '/opt/docker' })
    mocks.ensureImage.mockResolvedValue(undefined)

    const handlers = await registerHandlers(false)

    expect(await handlers['docker:available']()).toBe(true)
    expect(await handlers['docker:detect-state']()).toEqual({
      installed: true,
      running: false,
      desktopPath: '/opt/docker',
    })
    expect(await handlers['docker:ensure-image']({}, 'yolium:latest')).toBeUndefined()

    expect(mocks.isDockerAvailable).toHaveBeenCalledTimes(1)
    expect(mocks.detectDockerState).toHaveBeenCalledTimes(1)
    expect(mocks.ensureImage).toHaveBeenCalledTimes(1)
  })
})
