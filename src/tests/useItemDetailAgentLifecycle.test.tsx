/**
 * @vitest-environment jsdom
 */
import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useItemDetailAgentLifecycle } from '@renderer/components/kanban/item-detail/useItemDetailAgentLifecycle'
import type { KanbanItem } from '@shared/types/kanban'

const mockAgentStart = vi.fn()
const mockAgentResume = vi.fn()
const mockAgentAnswer = vi.fn()
const mockAgentStop = vi.fn()
const mockAddComment = vi.fn()
const mockFlushDraft = vi.fn()
const mockPrepareForRun = vi.fn()
const mockAssociateSession = vi.fn()
const mockAppendOutputLine = vi.fn()
const mockSetRunStatus = vi.fn()
const mockSetErrorMessage = vi.fn()
const mockOnUpdated = vi.fn()

function createMockItem(overrides: Partial<KanbanItem> = {}): KanbanItem {
  return {
    id: 'item-1',
    title: 'Test Item',
    description: 'Solve the problem',
    column: 'backlog',
    branch: 'feature/test-item',
    agentProvider: 'claude',
    order: 0,
    agentStatus: 'idle',
    comments: [],
    createdAt: '2024-01-15T10:00:00.000Z',
    updatedAt: '2024-01-15T12:00:00.000Z',
    ...overrides,
  }
}

function LifecycleHarness({
  item = createMockItem(),
  draftProvider = 'codex',
  hasUnsavedChanges = true,
  currentSessionId = 'session-1',
}: {
  item?: KanbanItem
  draftProvider?: KanbanItem['agentProvider']
  hasUnsavedChanges?: boolean
  currentSessionId?: string | null
}) {
  const lifecycle = useItemDetailAgentLifecycle({
    item,
    projectPath: '/test/project',
    onUpdated: mockOnUpdated,
    setErrorMessage: mockSetErrorMessage,
    draft: {
      agentProvider: draftProvider,
      hasUnsavedChanges,
      flushDraft: mockFlushDraft,
    },
    agentSession: {
      currentSessionId,
      currentDetail: null,
      prepareForRun: mockPrepareForRun,
      associateSession: mockAssociateSession,
      appendOutputLine: mockAppendOutputLine,
      setRunStatus: mockSetRunStatus,
    },
  })

  return (
    <div>
      <textarea
        data-testid="answer-input"
        value={lifecycle.answerText}
        onChange={event => lifecycle.setAnswerText(event.target.value)}
      />
      <textarea
        data-testid="comment-input"
        value={lifecycle.commentText}
        onChange={event => lifecycle.setCommentText(event.target.value)}
      />
      <div data-testid="answer-value">{lifecycle.answerText}</div>
      <button data-testid="start-agent" onClick={() => void lifecycle.startAgent('code-agent')}>
        Start
      </button>
      <button data-testid="resume-agent" onClick={() => void lifecycle.resumeAgent('code-agent')}>
        Resume
      </button>
      <button data-testid="submit-answer" onClick={() => void lifecycle.answerQuestion()}>
        Answer
      </button>
      <button data-testid="stop-agent" onClick={() => void lifecycle.stopAgent()}>
        Stop
      </button>
      <div data-testid="flush-count">{mockFlushDraft.mock.calls.length}</div>
      <div data-testid="prepare-count">{mockPrepareForRun.mock.calls.length}</div>
      <div data-testid="associate-count">{mockAssociateSession.mock.calls.length}</div>
      <div data-testid="output-count">{mockAppendOutputLine.mock.calls.length}</div>
      <div data-testid="status-count">{mockSetRunStatus.mock.calls.length}</div>
    </div>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAgentStart.mockResolvedValue({ sessionId: 'session-99' })
  mockAgentResume.mockResolvedValue({ sessionId: 'session-88' })
  mockAgentAnswer.mockResolvedValue(undefined)
  mockAgentStop.mockResolvedValue(undefined)
  mockAddComment.mockResolvedValue(undefined)
  mockFlushDraft.mockResolvedValue(true)
  mockPrepareForRun.mockReset()
  mockAssociateSession.mockReset()
  mockAppendOutputLine.mockReset()
  mockSetRunStatus.mockReset()
  mockSetErrorMessage.mockReset()
  mockOnUpdated.mockReset()

  Object.defineProperty(window, 'electronAPI', {
    value: {
      agent: {
        start: mockAgentStart,
        resume: mockAgentResume,
        answer: mockAgentAnswer,
        stop: mockAgentStop,
      },
      kanban: {
        addComment: mockAddComment,
      },
    },
    writable: true,
  })
})

describe('useItemDetailAgentLifecycle', () => {
  it('should flush pending draft changes before starting an agent', async () => {
    render(<LifecycleHarness />)

    fireEvent.click(screen.getByTestId('start-agent'))

    await waitFor(() => {
      expect(mockAgentStart).toHaveBeenCalled()
    })
    expect(mockFlushDraft).toHaveBeenCalledWith('manual')
  })

  it('should flush pending draft changes before resuming an agent', async () => {
    render(<LifecycleHarness item={createMockItem({ agentStatus: 'interrupted' })} />)

    fireEvent.click(screen.getByTestId('resume-agent'))

    await waitFor(() => {
      expect(mockAgentResume).toHaveBeenCalled()
    })
    expect(mockFlushDraft).toHaveBeenCalledWith('manual')
  })

  it('should clear previous agent output, show the log, and associate the returned session id after a successful start', async () => {
    render(<LifecycleHarness />)

    fireEvent.click(screen.getByTestId('start-agent'))

    await waitFor(() => {
      expect(mockAgentStart).toHaveBeenCalledWith({
        agentName: 'code-agent',
        projectPath: '/test/project',
        itemId: 'item-1',
        goal: 'Solve the problem',
        agentProvider: 'codex',
      })
    })
    expect(mockPrepareForRun).toHaveBeenCalledTimes(1)
    expect(mockAssociateSession).toHaveBeenCalledWith('session-99')
  })

  it('should append an error line and mark the run failed when agent.start returns an error', async () => {
    mockAgentStart.mockResolvedValueOnce({ error: 'boom' })

    render(<LifecycleHarness />)

    fireEvent.click(screen.getByTestId('start-agent'))

    await waitFor(() => {
      expect(mockAppendOutputLine).toHaveBeenCalledWith('[Error] boom')
    })
    expect(mockSetRunStatus).toHaveBeenNthCalledWith(1, 'starting', null)
    expect(mockSetRunStatus).toHaveBeenNthCalledWith(2, 'failed', 'boom')
  })

  it('should submit answerText through electronAPI.agent.answer and clear the answer on success', async () => {
    render(<LifecycleHarness item={createMockItem({ agentStatus: 'waiting' })} />)

    fireEvent.change(screen.getByTestId('answer-input'), {
      target: { value: 'Use the feature branch' },
    })
    fireEvent.click(screen.getByTestId('submit-answer'))

    await waitFor(() => {
      expect(mockAgentAnswer).toHaveBeenCalledWith('/test/project', 'item-1', 'Use the feature branch')
    })
    expect(screen.getByTestId('answer-value')).toHaveTextContent('')
  })

  it('should call electronAPI.agent.stop with the current session id', async () => {
    render(<LifecycleHarness currentSessionId="session-stop-me" />)

    fireEvent.click(screen.getByTestId('stop-agent'))

    await waitFor(() => {
      expect(mockAgentStop).toHaveBeenCalledWith('session-stop-me')
    })
  })
})
