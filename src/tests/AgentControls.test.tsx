/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AgentControls } from '@renderer/components/agent/AgentControls'
import type { KanbanItem } from '@shared/types/kanban'

const createMockItem = (overrides: Partial<KanbanItem> = {}): KanbanItem => ({
  id: 'test-1',
  title: 'Test Task',
  description: 'Test description',
  column: 'in-progress',
  agentType: 'claude',
  agentStatus: 'idle',
  branch: undefined,
  order: 0,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  comments: [],
  ...overrides,
})

describe('AgentControls', () => {
  describe('completed state', () => {
    it('should show completed status text', () => {
      const item = createMockItem({ agentStatus: 'completed' })
      render(
        <AgentControls
          item={item}
          isStartingAgent={false}
          isAnswering={false}
          answerText=""
          currentSessionId={null}
          currentDetail={null}
          answerInputRef={{ current: null }}
          onStartAgent={vi.fn()}
          onResumeAgent={vi.fn()}
          onStopAgent={vi.fn()}
          onAnswerQuestion={vi.fn()}
          onSetAnswerText={vi.fn()}
          onUpdated={vi.fn()}
        />
      )

      expect(screen.getByText('Agent completed successfully')).toBeInTheDocument()
    })

    it('should show run-again button for completed status', () => {
      const item = createMockItem({ agentStatus: 'completed', branch: 'feature/test' })
      render(
        <AgentControls
          item={item}
          isStartingAgent={false}
          isAnswering={false}
          answerText=""
          currentSessionId={null}
          currentDetail={null}
          answerInputRef={{ current: null }}
          onStartAgent={vi.fn()}
          onResumeAgent={vi.fn()}
          onStopAgent={vi.fn()}
          onAnswerQuestion={vi.fn()}
          onSetAnswerText={vi.fn()}
          onUpdated={vi.fn()}
        />
      )

      expect(screen.getByTestId('run-again-button')).toBeInTheDocument()
      expect(screen.getByText('Run Again')).toBeInTheDocument()
    })

    it('should call onStartAgent with correct agent name when run-again button clicked', () => {
      const onStartAgent = vi.fn()
      const item = createMockItem({ agentStatus: 'completed', branch: 'feature/test' })
      render(
        <AgentControls
          item={item}
          isStartingAgent={false}
          isAnswering={false}
          answerText=""
          currentSessionId={null}
          currentDetail={null}
          answerInputRef={{ current: null }}
          onStartAgent={onStartAgent}
          onResumeAgent={vi.fn()}
          onStopAgent={vi.fn()}
          onAnswerQuestion={vi.fn()}
          onSetAnswerText={vi.fn()}
          onUpdated={vi.fn()}
        />
      )

      fireEvent.click(screen.getByTestId('run-again-button'))
      // Item has branch, so should default to code-agent
      expect(onStartAgent).toHaveBeenCalledWith('code-agent')
    })

    it('should call onStartAgent with plan-agent when item has no branch', () => {
      const onStartAgent = vi.fn()
      const item = createMockItem({ agentStatus: 'completed', branch: undefined })
      render(
        <AgentControls
          item={item}
          isStartingAgent={false}
          isAnswering={false}
          answerText=""
          currentSessionId={null}
          currentDetail={null}
          answerInputRef={{ current: null }}
          onStartAgent={onStartAgent}
          onResumeAgent={vi.fn()}
          onStopAgent={vi.fn()}
          onAnswerQuestion={vi.fn()}
          onSetAnswerText={vi.fn()}
          onUpdated={vi.fn()}
        />
      )

      fireEvent.click(screen.getByTestId('run-again-button'))
      // Item has no branch, so should default to plan-agent
      expect(onStartAgent).toHaveBeenCalledWith('plan-agent')
    })

    it('should disable run-again button when isStartingAgent is true', () => {
      const item = createMockItem({ agentStatus: 'completed', branch: 'feature/test' })
      render(
        <AgentControls
          item={item}
          isStartingAgent={true}
          isAnswering={false}
          answerText=""
          currentSessionId={null}
          currentDetail={null}
          answerInputRef={{ current: null }}
          onStartAgent={vi.fn()}
          onResumeAgent={vi.fn()}
          onStopAgent={vi.fn()}
          onAnswerQuestion={vi.fn()}
          onSetAnswerText={vi.fn()}
          onUpdated={vi.fn()}
        />
      )

      const button = screen.getByTestId('run-again-button')
      expect(button).toBeDisabled()
      expect(button).toHaveTextContent('Starting...')
    })

    it('should show Run Again text when not starting', () => {
      const item = createMockItem({ agentStatus: 'completed', branch: 'feature/test' })
      render(
        <AgentControls
          item={item}
          isStartingAgent={false}
          isAnswering={false}
          answerText=""
          currentSessionId={null}
          currentDetail={null}
          answerInputRef={{ current: null }}
          onStartAgent={vi.fn()}
          onResumeAgent={vi.fn()}
          onStopAgent={vi.fn()}
          onAnswerQuestion={vi.fn()}
          onSetAnswerText={vi.fn()}
          onUpdated={vi.fn()}
        />
      )

      const button = screen.getByTestId('run-again-button')
      expect(button).not.toBeDisabled()
      expect(button).toHaveTextContent('Run Again')
    })
  })

  describe('failed state', () => {
    it('should show failed status text', () => {
      const item = createMockItem({ agentStatus: 'failed' })
      render(
        <AgentControls
          item={item}
          isStartingAgent={false}
          isAnswering={false}
          answerText=""
          currentSessionId={null}
          currentDetail={null}
          answerInputRef={{ current: null }}
          onStartAgent={vi.fn()}
          onResumeAgent={vi.fn()}
          onStopAgent={vi.fn()}
          onAnswerQuestion={vi.fn()}
          onSetAnswerText={vi.fn()}
          onUpdated={vi.fn()}
        />
      )

      expect(screen.getByText('Agent failed')).toBeInTheDocument()
    })

    it('should show retry button for failed status', () => {
      const item = createMockItem({ agentStatus: 'failed' })
      render(
        <AgentControls
          item={item}
          isStartingAgent={false}
          isAnswering={false}
          answerText=""
          currentSessionId={null}
          currentDetail={null}
          answerInputRef={{ current: null }}
          onStartAgent={vi.fn()}
          onResumeAgent={vi.fn()}
          onStopAgent={vi.fn()}
          onAnswerQuestion={vi.fn()}
          onSetAnswerText={vi.fn()}
          onUpdated={vi.fn()}
        />
      )

      expect(screen.getByTestId('retry-agent-button')).toBeInTheDocument()
    })
  })

  describe('idle state', () => {
    it('should show run code agent button when item has branch', () => {
      const item = createMockItem({ agentStatus: 'idle', branch: 'feature/test' })
      render(
        <AgentControls
          item={item}
          isStartingAgent={false}
          isAnswering={false}
          answerText=""
          currentSessionId={null}
          currentDetail={null}
          answerInputRef={{ current: null }}
          onStartAgent={vi.fn()}
          onResumeAgent={vi.fn()}
          onStopAgent={vi.fn()}
          onAnswerQuestion={vi.fn()}
          onSetAnswerText={vi.fn()}
          onUpdated={vi.fn()}
        />
      )

      expect(screen.getByTestId('run-code-agent-button')).toBeInTheDocument()
    })

    it('should show run plan agent button when item has no branch', () => {
      const item = createMockItem({ agentStatus: 'idle', branch: undefined })
      render(
        <AgentControls
          item={item}
          isStartingAgent={false}
          isAnswering={false}
          answerText=""
          currentSessionId={null}
          currentDetail={null}
          answerInputRef={{ current: null }}
          onStartAgent={vi.fn()}
          onResumeAgent={vi.fn()}
          onStopAgent={vi.fn()}
          onAnswerQuestion={vi.fn()}
          onSetAnswerText={vi.fn()}
          onUpdated={vi.fn()}
        />
      )

      expect(screen.getByTestId('run-plan-agent-button')).toBeInTheDocument()
    })
  })
})
