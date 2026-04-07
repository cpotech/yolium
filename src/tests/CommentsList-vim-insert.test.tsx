/**
 * @vitest-environment jsdom
 */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { CommentsList } from '@renderer/components/kanban/CommentsList'
import { useVimModeContext, VimModeProvider } from '@renderer/context/VimModeContext'

function VimProbe(): React.ReactElement {
  const vim = useVimModeContext()
  return <div data-testid="vim-mode">{vim.mode}</div>
}

function renderWithVim(ui: React.ReactElement) {
  return render(
    <VimModeProvider>
      <VimProbe />
      {ui}
    </VimModeProvider>,
  )
}

describe('CommentsList vim INSERT mode', () => {
  it('should call enterInsertMode when answer textarea receives focus', () => {
    const onSetAnswerText = vi.fn()
    const onAnswerQuestion = vi.fn()

    renderWithVim(
      <CommentsList
        comments={[]}
        agentStatus="waiting"
        answerText=""
        onSetAnswerText={onSetAnswerText}
        onAnswerQuestion={onAnswerQuestion}
      />,
    )

    expect(screen.getByTestId('vim-mode')).toHaveTextContent('NORMAL')

    fireEvent.focus(screen.getByTestId('answer-textarea'))

    expect(screen.getByTestId('vim-mode')).toHaveTextContent('INSERT')
  })

  it('should call enterInsertMode when comment search input receives focus', () => {
    const comments = [
      { id: '1', text: 'test comment', source: 'user' as const, timestamp: Date.now() },
      { id: '2', text: 'another comment', source: 'user' as const, timestamp: Date.now() },
      { id: '3', text: 'third comment', source: 'user' as const, timestamp: Date.now() },
      { id: '4', text: 'fourth comment', source: 'user' as const, timestamp: Date.now() },
      { id: '5', text: 'fifth comment', source: 'user' as const, timestamp: Date.now() },
      { id: '6', text: 'sixth comment', source: 'user' as const, timestamp: Date.now() },
    ]

    renderWithVim(<CommentsList comments={comments} />)

    expect(screen.getByTestId('vim-mode')).toHaveTextContent('NORMAL')

    fireEvent.focus(screen.getByTestId('comment-search-input'))

    expect(screen.getByTestId('vim-mode')).toHaveTextContent('INSERT')
  })

  it('should not interfere with existing Escape handling on search input', () => {
    const comments = [
      { id: '1', text: 'test comment', source: 'user' as const, timestamp: Date.now() },
      { id: '2', text: 'another comment', source: 'user' as const, timestamp: Date.now() },
      { id: '3', text: 'third comment', source: 'user' as const, timestamp: Date.now() },
      { id: '4', text: 'fourth comment', source: 'user' as const, timestamp: Date.now() },
      { id: '5', text: 'fifth comment', source: 'user' as const, timestamp: Date.now() },
      { id: '6', text: 'sixth comment', source: 'user' as const, timestamp: Date.now() },
    ]

    renderWithVim(<CommentsList comments={comments} />)

    const searchInput = screen.getByTestId('comment-search-input')
    fireEvent.focus(searchInput)
    fireEvent.change(searchInput, { target: { value: 'test' } })
    fireEvent.keyDown(searchInput, { key: 'Escape' })

    expect(searchInput).toHaveValue('')
  })

  it('should not interfere with Ctrl+Enter submit on answer textarea', () => {
    const onSetAnswerText = vi.fn()
    const onAnswerQuestion = vi.fn()

    renderWithVim(
      <CommentsList
        comments={[]}
        agentStatus="waiting"
        answerText="my answer"
        onSetAnswerText={onSetAnswerText}
        onAnswerQuestion={onAnswerQuestion}
      />,
    )

    const textarea = screen.getByTestId('answer-textarea')
    fireEvent.focus(textarea)
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true })

    expect(onAnswerQuestion).toHaveBeenCalledOnce()
  })
})
