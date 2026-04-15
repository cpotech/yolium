/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AgentControls } from '@renderer/components/agent/AgentControls'
import type { KanbanItem } from '@shared/types/kanban'

const mockDefinitions = [
  { name: 'code-agent', description: 'Code execution agent', model: 'sonnet' as const, tools: ['Read', 'Write'] },
  { name: 'plan-agent', description: 'Planning agent', model: 'sonnet' as const, tools: ['Read'] },
  { name: 'verify-agent', description: 'Verification agent', model: 'sonnet' as const, tools: ['Read', 'Bash'] },
]

beforeEach(() => {
  // Mock the electronAPI.agent.listDefinitions
  window.electronAPI = {
    ...window.electronAPI,
    agent: {
      ...(window.electronAPI?.agent || {}),
      listDefinitions: vi.fn().mockResolvedValue(mockDefinitions),
    },
  } as typeof window.electronAPI
})

const createMockItem = (overrides: Partial<KanbanItem> = {}): KanbanItem => ({
  id: 'test-1',
  title: 'Test Task',
  description: 'Test description',
  column: 'in-progress',
  agentProvider: 'claude',
  agentStatus: 'idle',
  branch: undefined,
  order: 0,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  comments: [],
  ...overrides,
})

const defaultProps = {
  isStartingAgent: false,
  currentSessionId: null as string | null,
  currentDetail: null as string | null,
  onStartAgent: vi.fn(),
  onResumeAgent: vi.fn(),
  onStopAgent: vi.fn(),
  onUpdated: vi.fn(),
}

describe('AgentControls', () => {
  describe('idle state', () => {
    it('should show all agent buttons regardless of branch', async () => {
      const item = createMockItem({ agentStatus: 'idle', branch: undefined })
      render(<AgentControls item={item} {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByTestId('run-code-agent-button')).toBeInTheDocument()
      })
      expect(screen.getByTestId('run-plan-agent-button')).toBeInTheDocument()
    })

    it('should show all agent buttons when item has branch', async () => {
      const item = createMockItem({ agentStatus: 'idle', branch: 'feature/test' })
      render(<AgentControls item={item} {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByTestId('run-code-agent-button')).toBeInTheDocument()
      })
      expect(screen.getByTestId('run-plan-agent-button')).toBeInTheDocument()
    })

    it('should call onStartAgent with the correct agent name', async () => {
      const onStartAgent = vi.fn()
      const item = createMockItem({ agentStatus: 'idle' })
      render(<AgentControls item={item} {...defaultProps} onStartAgent={onStartAgent} />)

      await waitFor(() => {
        expect(screen.getByTestId('run-code-agent-button')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId('run-plan-agent-button'))
      expect(onStartAgent).toHaveBeenCalledWith('plan-agent')
    })

    it('should render agent buttons with uniform secondary styling', async () => {
      const item = createMockItem({ agentStatus: 'idle' })
      render(<AgentControls item={item} {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByTestId('run-code-agent-button')).toBeInTheDocument()
      })

      // All buttons should have uniform secondary background styling
      const firstButton = screen.getByTestId('run-code-agent-button')
      expect(firstButton.className).toContain('bg-[var(--color-bg-secondary)]')
    })

    it('should render distinct icons for each agent type', async () => {
      const item = createMockItem({ agentStatus: 'idle' })
      render(<AgentControls item={item} {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByTestId('run-code-agent-button')).toBeInTheDocument()
      })

      // Each button should have an icon (SVG element)
      const codeButton = screen.getByTestId('run-code-agent-button')
      const planButton = screen.getByTestId('run-plan-agent-button')
      
      expect(codeButton.querySelector('svg')).toBeInTheDocument()
      expect(planButton.querySelector('svg')).toBeInTheDocument()
    })
  })

  describe('completed state', () => {
    it('should show per-agent buttons for completed status', async () => {
      const item = createMockItem({ agentStatus: 'completed', branch: 'feature/test' })
      render(<AgentControls item={item} {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByTestId('run-code-agent-button')).toBeInTheDocument()
      })
      expect(screen.getByTestId('run-plan-agent-button')).toBeInTheDocument()
    })

    it('should call onStartAgent with correct agent name when button clicked', async () => {
      const onStartAgent = vi.fn()
      const item = createMockItem({ agentStatus: 'completed', branch: 'feature/test' })
      render(<AgentControls item={item} {...defaultProps} onStartAgent={onStartAgent} />)

      await waitFor(() => {
        expect(screen.getByTestId('run-code-agent-button')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId('run-code-agent-button'))
      expect(onStartAgent).toHaveBeenCalledWith('code-agent')
    })

    it('should disable buttons when isStartingAgent is true', async () => {
      const item = createMockItem({ agentStatus: 'completed', branch: 'feature/test' })
      render(<AgentControls item={item} {...defaultProps} isStartingAgent={true} />)

      await waitFor(() => {
        expect(screen.getByTestId('run-code-agent-button')).toBeInTheDocument()
      })

      expect(screen.getByTestId('run-code-agent-button')).toBeDisabled()
      expect(screen.getByTestId('run-plan-agent-button')).toBeDisabled()
    })
  })

  describe('failed state', () => {
    it('should show failed status text', async () => {
      const item = createMockItem({ agentStatus: 'failed' })
      render(<AgentControls item={item} {...defaultProps} />)

      expect(screen.getByText('Agent failed')).toBeInTheDocument()
    })

    it('should show per-agent buttons for failed status', async () => {
      const item = createMockItem({ agentStatus: 'failed' })
      render(<AgentControls item={item} {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByTestId('run-code-agent-button')).toBeInTheDocument()
      })
      expect(screen.getByTestId('run-plan-agent-button')).toBeInTheDocument()
    })

    it('should call onStartAgent with correct agent name when retry clicked', async () => {
      const onStartAgent = vi.fn()
      const item = createMockItem({ agentStatus: 'failed' })
      render(<AgentControls item={item} {...defaultProps} onStartAgent={onStartAgent} />)

      await waitFor(() => {
        expect(screen.getByTestId('run-code-agent-button')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId('run-code-agent-button'))
      expect(onStartAgent).toHaveBeenCalledWith('code-agent')
    })
  })

  describe('running state', () => {
    it('should show running indicator', () => {
      const item = createMockItem({ agentStatus: 'running' })
      render(<AgentControls item={item} {...defaultProps} />)

      expect(screen.getByText('Agent is running...')).toBeInTheDocument()
    })

    it('should show stop button when session exists', () => {
      const item = createMockItem({ agentStatus: 'running' })
      render(<AgentControls item={item} {...defaultProps} currentSessionId="sess-1" />)

      expect(screen.getByTestId('stop-agent-button')).toBeInTheDocument()
    })

    it('should show progress detail', () => {
      const item = createMockItem({ agentStatus: 'running' })
      render(<AgentControls item={item} {...defaultProps} currentDetail="Installing deps..." />)

      expect(screen.getByTestId('agent-progress-detail')).toHaveTextContent('Installing deps...')
    })
  })

  describe('waiting state', () => {
    it('should show waiting indicator text instead of question UI when status is waiting', () => {
      const item = createMockItem({
        agentStatus: 'waiting',
        agentQuestion: 'Proceed?',
      })
      render(<AgentControls item={item} {...defaultProps} />)

      expect(screen.getByText(/waiting for answer/i)).toBeInTheDocument()
    })

    it('should not render answer textarea when status is waiting', () => {
      const item = createMockItem({
        agentStatus: 'waiting',
        agentQuestion: 'Proceed?',
      })
      render(<AgentControls item={item} {...defaultProps} />)

      expect(screen.queryByTestId('answer-input')).not.toBeInTheDocument()
    })

    it('should not render resume button when status is waiting', () => {
      const item = createMockItem({
        agentStatus: 'waiting',
        agentQuestion: 'Proceed?',
      })
      render(<AgentControls item={item} {...defaultProps} />)

      expect(screen.queryByTestId('resume-agent-button')).not.toBeInTheDocument()
    })
  })

  describe('idle after stop', () => {
    it('should show agent run buttons (not Resume) after user stops an agent (idle status)', async () => {
      const item = createMockItem({ agentStatus: 'idle' })
      render(<AgentControls item={item} {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByTestId('run-code-agent-button')).toBeInTheDocument()
      })
      expect(screen.getByTestId('run-plan-agent-button')).toBeInTheDocument()
      // Resume button should NOT be present for idle status
      expect(screen.queryByTestId('resume-interrupted-button')).not.toBeInTheDocument()
    })
  })

  describe('interrupted state', () => {
    it('should use activeAgentName for resume', () => {
      const onResumeAgent = vi.fn()
      const item = createMockItem({
        agentStatus: 'interrupted',
        activeAgentName: 'code-agent',
      })
      render(<AgentControls item={item} {...defaultProps} onResumeAgent={onResumeAgent} />)

      fireEvent.click(screen.getByTestId('resume-interrupted-button'))
      expect(onResumeAgent).toHaveBeenCalledWith('code-agent')
    })

    it('should use lastAgentName over agentType for resume fallback', () => {
      const onResumeAgent = vi.fn()
      const item = createMockItem({
        agentStatus: 'interrupted',
        activeAgentName: undefined,
        lastAgentName: 'plan-agent',
        agentType: 'code-agent',
      })
      render(<AgentControls item={item} {...defaultProps} onResumeAgent={onResumeAgent} />)

      fireEvent.click(screen.getByTestId('resume-interrupted-button'))
      expect(onResumeAgent).toHaveBeenCalledWith('plan-agent')
    })
  })

  describe('active agent label', () => {
    it('should format agent name as label', () => {
      const item = createMockItem({
        agentStatus: 'running',
        activeAgentName: 'code-agent',
      })
      render(<AgentControls item={item} {...defaultProps} />)

      expect(screen.getByTestId('active-agent-name')).toHaveTextContent('Code Agent')
    })
  })

  describe('canonical button ordering', () => {
    it('should display buttons in Plan, Code, Verify order', async () => {
      const item = createMockItem({ agentStatus: 'idle' })
      const { container } = render(<AgentControls item={item} {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByTestId('run-plan-agent-button')).toBeInTheDocument()
      })

      const buttons = container.querySelectorAll('[data-testid^="run-"]')
      expect(buttons[0]).toHaveAttribute('data-testid', 'run-plan-agent-button')
      expect(buttons[1]).toHaveAttribute('data-testid', 'run-code-agent-button')
      expect(buttons[2]).toHaveAttribute('data-testid', 'run-verify-agent-button')
    })

    it('should maintain Plan, Code, Verify order regardless of agentType', async () => {
      const item = createMockItem({ agentStatus: 'idle', agentType: 'code-agent' })
      const { container } = render(<AgentControls item={item} {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByTestId('run-plan-agent-button')).toBeInTheDocument()
      })

      const buttons = container.querySelectorAll('[data-testid^="run-"]')
      expect(buttons[0]).toHaveAttribute('data-testid', 'run-plan-agent-button')
      expect(buttons[1]).toHaveAttribute('data-testid', 'run-code-agent-button')
      expect(buttons[2]).toHaveAttribute('data-testid', 'run-verify-agent-button')
    })

    it('should use agentType as resume fallback when activeAgentName is not set', () => {
      const onResumeAgent = vi.fn()
      const item = createMockItem({
        agentStatus: 'interrupted',
        activeAgentName: undefined,
        lastAgentName: undefined,
        agentType: 'plan-agent',
      })
      render(<AgentControls item={item} {...defaultProps} onResumeAgent={onResumeAgent} />)

      fireEvent.click(screen.getByTestId('resume-interrupted-button'))
      expect(onResumeAgent).toHaveBeenCalledWith('plan-agent')
    })

    it('should fall back to code-agent when no resume metadata exists', () => {
      const onResumeAgent = vi.fn()
      const item = createMockItem({
        agentStatus: 'interrupted',
        activeAgentName: undefined,
        lastAgentName: undefined,
        agentType: undefined,
      })
      render(<AgentControls item={item} {...defaultProps} onResumeAgent={onResumeAgent} />)

      fireEvent.click(screen.getByTestId('resume-interrupted-button'))
      expect(onResumeAgent).toHaveBeenCalledWith('code-agent')
    })
  })

  describe('agent accent colors', () => {
    it('should apply purple accent color to verify-agent button', async () => {
      const item = createMockItem({ agentStatus: 'idle' })
      render(<AgentControls item={item} {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByTestId('run-verify-agent-button')).toBeInTheDocument()
      })

      const verifyButton = screen.getByTestId('run-verify-agent-button')
      expect(verifyButton.className).toContain('border-l-purple-500')
    })

    it('should apply yellow accent to plan and blue accent to code', async () => {
      const item = createMockItem({ agentStatus: 'idle' })
      render(<AgentControls item={item} {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByTestId('run-plan-agent-button')).toBeInTheDocument()
      })

      expect(screen.getByTestId('run-plan-agent-button').className).toContain('border-l-yellow-500')
      expect(screen.getByTestId('run-code-agent-button').className).toContain('border-l-blue-500')
    })
  })

  describe('last agent label', () => {
    it('should show last agent name when activeAgentName is not set', () => {
      const item = createMockItem({
        agentStatus: 'completed',
        activeAgentName: undefined,
        lastAgentName: 'code-agent',
      })
      render(<AgentControls item={item} {...defaultProps} />)

      const lastAgent = screen.getByTestId('last-agent-name')
      expect(lastAgent).toHaveTextContent('Last Agent: Code Agent')
    })

    it('should hide last agent name when activeAgentName is set', () => {
      const item = createMockItem({
        agentStatus: 'running',
        activeAgentName: 'code-agent',
        lastAgentName: 'code-agent',
      })
      render(<AgentControls item={item} {...defaultProps} />)

      expect(screen.queryByTestId('last-agent-name')).not.toBeInTheDocument()
    })

    it('should not show last agent name when lastAgentName is not set', () => {
      const item = createMockItem({
        agentStatus: 'idle',
        activeAgentName: undefined,
        lastAgentName: undefined,
      })
      render(<AgentControls item={item} {...defaultProps} />)

      expect(screen.queryByTestId('last-agent-name')).not.toBeInTheDocument()
    })
  })

  describe('kbd badges', () => {
    it('should display a <kbd>X</kbd> badge on the stop agent button when agent is running', () => {
      const item = createMockItem({ agentStatus: 'running' })
      render(<AgentControls item={item} {...defaultProps} currentSessionId="sess-1" />)

      const stopButton = screen.getByTestId('stop-agent-button')
      const kbd = stopButton.querySelector('kbd')
      expect(kbd).not.toBeNull()
      expect(kbd?.textContent).toBe('X')
    })
  })

  describe('agent button tooltips', () => {
    it('should not show agent descriptions on hover', async () => {
      const item = createMockItem({ agentStatus: 'idle' })
      render(<AgentControls item={item} {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByTestId('run-plan-agent-button')).toBeInTheDocument()
      })

      fireEvent.mouseEnter(screen.getByTestId('run-plan-agent-button'))
      expect(screen.queryByText('Planning agent')).not.toBeInTheDocument()
    })
  })
})
