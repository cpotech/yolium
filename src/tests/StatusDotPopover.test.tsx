/**
 * @vitest-environment jsdom
 */
import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { StatusDotPopover } from '@renderer/components/navigation/StatusDotPopover'
import type { SidebarWorkItem } from '@renderer/components/navigation/ProjectList'

function createItem(overrides: Partial<SidebarWorkItem> = {}): SidebarWorkItem {
  return {
    projectPath: '/home/user/project1',
    itemId: 'item-1',
    itemTitle: 'Fix bug',
    question: 'Should I use approach A or B?',
    options: ['Approach A', 'Approach B'],
    agentName: 'code-agent',
    agentStatus: 'waiting',
    column: 'in-progress',
    ...overrides,
  }
}

describe('StatusDotPopover', () => {
  it('should render a yellow dot for items in the in-progress column', () => {
    render(<StatusDotPopover item={createItem({ agentStatus: 'running', column: 'in-progress' })} onAnswer={vi.fn()} />)

    expect(screen.getByTestId('status-dot-item-1')).toHaveClass('bg-yellow-500')
  })

  it('should render a blue dot for items in the ready column', () => {
    render(<StatusDotPopover item={createItem({ agentStatus: 'running', column: 'ready' })} onAnswer={vi.fn()} />)

    expect(screen.getByTestId('status-dot-item-1')).toHaveClass('bg-blue-500')
  })

  it('should render a gray dot for items in the backlog column', () => {
    render(<StatusDotPopover item={createItem({ agentStatus: 'running', column: 'backlog' })} onAnswer={vi.fn()} />)

    expect(screen.getByTestId('status-dot-item-1')).toHaveClass('bg-gray-500')
  })

  it('should render a purple dot for items in the verify column', () => {
    render(<StatusDotPopover item={createItem({ agentStatus: 'running', column: 'verify' })} onAnswer={vi.fn()} />)

    expect(screen.getByTestId('status-dot-item-1')).toHaveClass('bg-purple-500')
  })

  it('should render a green dot for items in the done column', () => {
    render(<StatusDotPopover item={createItem({ agentStatus: 'running', column: 'done' })} onAnswer={vi.fn()} />)

    expect(screen.getByTestId('status-dot-item-1')).toHaveClass('bg-green-500')
  })

  it('should render a red dot for failed status regardless of column', () => {
    render(<StatusDotPopover item={createItem({ agentStatus: 'failed', column: 'in-progress' })} onAnswer={vi.fn()} />)

    expect(screen.getByTestId('status-dot-item-1')).toHaveClass('bg-red-500')
  })

  it('should apply pulse animation for running status with column color', () => {
    render(<StatusDotPopover item={createItem({ agentStatus: 'running', column: 'in-progress' })} onAnswer={vi.fn()} />)

    const dot = screen.getByTestId('status-dot-item-1')
    expect(dot).toHaveClass('animate-pulse')
    expect(dot).toHaveClass('bg-yellow-500')
  })

  it('should default to gray when column is not provided', () => {
    render(<StatusDotPopover item={createItem({ agentStatus: 'running', column: undefined })} onAnswer={vi.fn()} />)

    expect(screen.getByTestId('status-dot-item-1')).toHaveClass('bg-gray-500')
  })

  it('should show title attribute with item name', () => {
    render(<StatusDotPopover item={createItem()} onAnswer={vi.fn()} />)

    expect(screen.getByTestId('status-dot-item-1')).toHaveAttribute('title', 'Fix bug')
  })

  it('should open popover on click for waiting items', () => {
    render(<StatusDotPopover item={createItem()} onAnswer={vi.fn()} />)

    fireEvent.click(screen.getByTestId('status-dot-item-1'))

    expect(screen.getByTestId('status-popover-item-1')).toBeInTheDocument()
  })

  it('should not open popover on click for running items', () => {
    render(<StatusDotPopover item={createItem({ agentStatus: 'running' })} onAnswer={vi.fn()} />)

    fireEvent.click(screen.getByTestId('status-dot-item-1'))

    expect(screen.queryByTestId('status-popover-item-1')).not.toBeInTheDocument()
  })

  it('should not open popover on click for failed items', () => {
    render(<StatusDotPopover item={createItem({ agentStatus: 'failed' })} onAnswer={vi.fn()} />)

    fireEvent.click(screen.getByTestId('status-dot-item-1'))

    expect(screen.queryByTestId('status-popover-item-1')).not.toBeInTheDocument()
  })

  it('should display question text in popover', () => {
    render(<StatusDotPopover item={createItem()} onAnswer={vi.fn()} />)

    fireEvent.click(screen.getByTestId('status-dot-item-1'))

    expect(screen.getByText('Should I use approach A or B?')).toBeInTheDocument()
  })

  it('should display option buttons in popover', () => {
    render(<StatusDotPopover item={createItem()} onAnswer={vi.fn()} />)

    fireEvent.click(screen.getByTestId('status-dot-item-1'))

    expect(screen.getByRole('button', { name: 'Approach A' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approach B' })).toBeInTheDocument()
  })

  it('should call onAnswer when option button clicked', async () => {
    const onAnswer = vi.fn().mockResolvedValue(undefined)
    render(<StatusDotPopover item={createItem()} onAnswer={onAnswer} />)

    fireEvent.click(screen.getByTestId('status-dot-item-1'))
    fireEvent.click(screen.getByRole('button', { name: 'Approach A' }))

    await waitFor(() => {
      expect(onAnswer).toHaveBeenCalledWith(expect.objectContaining({ itemId: 'item-1' }), 'Approach A')
    })
  })

  it('should show resuming state when answer is in flight', async () => {
    let resolveAnswer: (() => void) | undefined
    const onAnswer = vi.fn(() => new Promise<void>((resolve) => {
      resolveAnswer = resolve
    }))

    render(<StatusDotPopover item={createItem()} onAnswer={onAnswer} />)

    fireEvent.click(screen.getByTestId('status-dot-item-1'))
    fireEvent.click(screen.getByRole('button', { name: 'Approach A' }))

    expect(screen.getByText('Resuming...')).toBeInTheDocument()

    resolveAnswer?.()

    await waitFor(() => {
      expect(screen.queryByText('Resuming...')).not.toBeInTheDocument()
    })
  })

  it('should close popover on outside click', () => {
    render(<StatusDotPopover item={createItem()} onAnswer={vi.fn()} />)

    fireEvent.click(screen.getByTestId('status-dot-item-1'))
    fireEvent.mouseDown(document.body)

    expect(screen.queryByTestId('status-popover-item-1')).not.toBeInTheDocument()
  })

  it('should close popover on Escape key press', () => {
    render(<StatusDotPopover item={createItem()} onAnswer={vi.fn()} />)

    fireEvent.click(screen.getByTestId('status-dot-item-1'))
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByTestId('status-popover-item-1')).not.toBeInTheDocument()
  })
})
