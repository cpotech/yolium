import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PassThrough } from 'node:stream'

const mockGetContainer = vi.fn()
const mockDemuxStream = vi.fn()

const mocks = vi.hoisted(() => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('@main/lib/logger', () => ({
  createLogger: () => mocks.logger,
}))

vi.mock('@main/docker/shared', () => ({
  docker: {
    getContainer: (...args: unknown[]) => mockGetContainer(...args),
    modem: {
      demuxStream: (...args: unknown[]) => mockDemuxStream(...args),
    },
  },
}))

import { execInContainer, detectDevCommand, startDevServer } from '@main/docker/container-exec'

beforeEach(() => {
  vi.clearAllMocks()
})

/**
 * Helper: create a mock exec that returns a stream with given output.
 * Uses setTimeout(0) to ensure the stream ends after listeners are attached.
 */
function createStreamExec(output: string, exitCode: number) {
  return {
    start: vi.fn().mockImplementation(() => {
      const stream = new PassThrough()
      // demuxStream is called by execInContainer to attach listeners.
      // We need it to write output and then end the stream AFTER listeners are set up.
      mockDemuxStream.mockImplementationOnce(
        (_s: unknown, stdout: { write: (c: Buffer) => void }) => {
          if (output) stdout.write(Buffer.from(output))
          // Emit 'end' directly to signal stream completion to listener
          setTimeout(() => stream.emit('end'), 0)
        },
      )
      return Promise.resolve(stream)
    }),
    inspect: vi.fn().mockResolvedValue({ ExitCode: exitCode }),
  }
}

describe('execInContainer', () => {
  it('should execute a command in the container and return output', async () => {
    const exec = createStreamExec('hello world', 0)
    mockGetContainer.mockReturnValue({ exec: vi.fn().mockResolvedValue(exec) })

    const result = await execInContainer('container-123', ['echo', 'hello world'])

    expect(result.output).toBe('hello world')
    expect(mockGetContainer).toHaveBeenCalledWith('container-123')
  })

  it('should return exit code from container exec', async () => {
    const exec = createStreamExec('', 1)
    mockGetContainer.mockReturnValue({ exec: vi.fn().mockResolvedValue(exec) })

    const result = await execInContainer('container-123', ['false'])

    expect(result.exitCode).toBe(1)
  })

  it('should handle container not found error', async () => {
    mockGetContainer.mockReturnValue({
      exec: vi.fn().mockRejectedValue(new Error('No such container')),
    })

    await expect(execInContainer('nonexistent', ['ls'])).rejects.toThrow('No such container')
  })
})

describe('detectDevCommand', () => {
  function setupDetect(
    scripts: Record<string, string> | null,
    lockfiles: Record<string, boolean> = {},
  ) {
    const packageJsonOutput = scripts === null ? '' : JSON.stringify({ scripts })
    const packageJsonExitCode = scripts === null ? 1 : 0

    mockGetContainer.mockReturnValue({
      exec: vi.fn().mockImplementation((opts: { Cmd: string[] }) => {
        const cmd = opts.Cmd

        if (cmd[0] === 'cat') {
          return Promise.resolve(createStreamExec(packageJsonOutput, packageJsonExitCode))
        }

        if (cmd[0] === 'test' && cmd[1] === '-f') {
          const exists = lockfiles[cmd[2]] ?? false
          return Promise.resolve(createStreamExec('', exists ? 0 : 1))
        }

        return Promise.resolve(createStreamExec('', 0))
      }),
    })
  }

  it('should detect dev script from package.json as first priority', async () => {
    setupDetect({ dev: 'vite', start: 'node server.js', serve: 'serve' })
    expect(await detectDevCommand('container-123')).toBe('npm run dev')
  })

  it('should detect start script when no dev script exists', async () => {
    setupDetect({ start: 'node server.js', serve: 'serve' })
    expect(await detectDevCommand('container-123')).toBe('npm run start')
  })

  it('should detect serve script as last resort', async () => {
    setupDetect({ serve: 'serve dist' })
    expect(await detectDevCommand('container-123')).toBe('npm run serve')
  })

  it('should return null when package.json has no matching scripts', async () => {
    setupDetect({ build: 'tsc', lint: 'eslint .' })
    expect(await detectDevCommand('container-123')).toBeNull()
  })

  it('should return null when package.json does not exist in container', async () => {
    setupDetect(null)
    expect(await detectDevCommand('container-123')).toBeNull()
  })

  it('should handle malformed package.json gracefully', async () => {
    mockGetContainer.mockReturnValue({
      exec: vi.fn().mockImplementation(() => {
        return Promise.resolve(createStreamExec('not valid json {{{', 0))
      }),
    })

    expect(await detectDevCommand('container-123')).toBeNull()
    expect(mocks.logger.warn).toHaveBeenCalled()
  })

  it('should use correct package manager (yarn) based on lockfile', async () => {
    setupDetect({ dev: 'vite' }, { '/workspace/yarn.lock': true })
    expect(await detectDevCommand('container-123')).toBe('yarn run dev')
  })

  it('should use correct package manager (pnpm) based on lockfile', async () => {
    setupDetect({ dev: 'vite' }, { '/workspace/pnpm-lock.yaml': true })
    expect(await detectDevCommand('container-123')).toBe('pnpm run dev')
  })
})

describe('startDevServer', () => {
  it('should start dev server as detached exec process', async () => {
    const mockContainerExec = vi.fn().mockResolvedValue({
      start: vi.fn().mockResolvedValue(undefined),
    })
    mockGetContainer.mockReturnValue({ exec: mockContainerExec })

    await startDevServer('container-123', 'npm run dev')

    expect(mockContainerExec).toHaveBeenCalledWith({
      Cmd: ['npm', 'run', 'dev'],
      AttachStdout: false,
      AttachStderr: false,
      Tty: false,
      Detach: true,
    })
    expect(mocks.logger.info).toHaveBeenCalledWith('Started dev server in container', {
      containerId: 'container-123',
      command: 'npm run dev',
    })
  })

  it('should handle container not found error', async () => {
    mockGetContainer.mockReturnValue({
      exec: vi.fn().mockRejectedValue(new Error('No such container')),
    })

    await expect(startDevServer('nonexistent', 'npm run dev')).rejects.toThrow('No such container')
  })
})
