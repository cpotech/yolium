/**
 * @vitest-environment jsdom
 */
import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAgentSession } from '@renderer/hooks/useAgentSession'

const mockReadLog = vi.fn()
const mockGetActiveSession = vi.fn()
const mockRecover = vi.fn()
const mockClearLog = vi.fn()

let outputListener: ((sessionId: string, data: string) => void) | null = null
let progressListener: ((sessionId: string, progress: { step: string; detail: string; attempt?: number; maxAttempts?: number }) => void) | null = null
let completeListener: ((sessionId: string, summary: string) => void) | null = null
let errorListener: ((sessionId: string, message: string) => void) | null = null
let exitListener: ((sessionId: string, exitCode: number) => void) | null = null
let costListener: ((sessionId: string, projectPath: string, itemId: string, usage: { inputTokens: number; outputTokens: number; costUsd: number }) => void) | null = null

function HookHarness({
  itemId,
  itemAgentStatus = 'idle',
  onUpdated = vi.fn(),
}: {
  itemId?: string
  itemAgentStatus?: string
  onUpdated?: () => void
}) {
  const session = useAgentSession({
    itemId,
    itemAgentStatus,
    projectPath: '/test/project',
    onUpdated,
  })

  return (
    <div>
      <div data-testid="output">{session.agentOutputLines.join('|')}</div>
      <div data-testid="session-id">{session.currentSessionId ?? 'none'}</div>
      <div data-testid="current-detail">{session.currentDetail ?? 'none'}</div>
      <div data-testid="token-usage">
        {session.tokenUsage
          ? `${session.tokenUsage.inputTokens}/${session.tokenUsage.outputTokens}/${session.tokenUsage.costUsd}`
          : 'none'}
      </div>
      <button data-testid="associate-session" onClick={() => session.associateSession('session-1')}>
        Associate
      </button>
    </div>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  outputListener = null
  progressListener = null
  completeListener = null
  errorListener = null
  exitListener = null
  costListener = null

  mockReadLog.mockResolvedValue('')
  mockGetActiveSession.mockResolvedValue(null)
  mockRecover.mockResolvedValue([])
  mockClearLog.mockResolvedValue(undefined)

  Object.defineProperty(window, 'electronAPI', {
    value: {
      agent: {
        readLog: mockReadLog,
        getActiveSession: mockGetActiveSession,
        recover: mockRecover,
        clearLog: mockClearLog,
        onOutput: vi.fn((listener) => {
          outputListener = listener
          return () => {
            outputListener = null
          }
        }),
        onProgress: vi.fn((listener) => {
          progressListener = listener
          return () => {
            progressListener = null
          }
        }),
        onComplete: vi.fn((listener) => {
          completeListener = listener
          return () => {
            completeListener = null
          }
        }),
        onError: vi.fn((listener) => {
          errorListener = listener
          return () => {
            errorListener = null
          }
        }),
        onExit: vi.fn((listener) => {
          exitListener = listener
          return () => {
            exitListener = null
          }
        }),
        onCostUpdate: vi.fn((listener) => {
          costListener = listener
          return () => {
            costListener = null
          }
        }),
      },
    },
    writable: true,
  })
})

describe('useAgentSession', () => {
  it('should hydrate persistent log lines when itemId changes', async () => {
    mockReadLog
      .mockResolvedValueOnce('line one\nline two\n')
      .mockResolvedValueOnce('fresh log line\n')

    const { rerender } = render(<HookHarness itemId="item-1" />)

    expect(await screen.findByTestId('output')).toHaveTextContent('line one|line two')

    rerender(<HookHarness itemId="item-2" />)

    await waitFor(() => {
      expect(mockReadLog).toHaveBeenCalledWith('/test/project', 'item-2')
    })
    expect(screen.getByTestId('output')).toHaveTextContent('fresh log line')
  })

  it('should reconnect to an active running session and restore cumulative token usage', async () => {
    mockGetActiveSession.mockResolvedValue({
      sessionId: 'session-1',
      cumulativeUsage: { inputTokens: 120, outputTokens: 45, costUsd: 0.12 },
    })

    render(<HookHarness itemId="item-1" itemAgentStatus="running" />)

    await waitFor(() => {
      expect(mockGetActiveSession).toHaveBeenCalledWith('/test/project', 'item-1')
      expect(screen.getByTestId('session-id')).toHaveTextContent('session-1')
      expect(screen.getByTestId('token-usage')).toHaveTextContent('120/45/0.12')
    })
  })

  it('should call recover(projectPath) when a running item has no active session and refresh on successful recovery', async () => {
    const onUpdated = vi.fn()
    mockGetActiveSession.mockResolvedValue(null)
    mockRecover.mockResolvedValue([{ id: 'item-1' }])

    render(<HookHarness itemId="item-1" itemAgentStatus="running" onUpdated={onUpdated} />)

    await waitFor(() => {
      expect(mockRecover).toHaveBeenCalledWith('/test/project')
    })
    await waitFor(() => {
      expect(onUpdated).toHaveBeenCalledTimes(1)
    })
  })

  it('should buffer output received before associateSession(sessionId) and flush it after the session is associated', async () => {
    render(<HookHarness itemId="item-1" />)

    await waitFor(() => {
      expect(outputListener).not.toBeNull()
    })

    act(() => {
      outputListener?.('session-1', 'first line\nsecond line\n')
    })

    expect(screen.getByTestId('output')).toHaveTextContent('')

    fireEvent.click(screen.getByTestId('associate-session'))

    expect(screen.getByTestId('output')).toHaveTextContent('first line|second line')
  })

  it('should ignore output and cost updates from other sessions', async () => {
    render(<HookHarness itemId="item-1" />)

    fireEvent.click(screen.getByTestId('associate-session'))

    act(() => {
      outputListener?.('other-session', 'ignore me\n')
      outputListener?.('session-1', 'keep me\n')
      costListener?.('other-session', '/test/project', 'item-1', {
        inputTokens: 99,
        outputTokens: 88,
        costUsd: 7.77,
      })
      costListener?.('session-1', '/test/project', 'item-1', {
        inputTokens: 5,
        outputTokens: 6,
        costUsd: 0.07,
      })
    })

    expect(screen.getByTestId('output')).toHaveTextContent('keep me')
    expect(screen.getByTestId('output')).not.toHaveTextContent('ignore me')
    expect(screen.getByTestId('token-usage')).toHaveTextContent('5/6/0.07')
  })
})
