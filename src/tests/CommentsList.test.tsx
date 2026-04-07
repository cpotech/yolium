/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CommentsList } from '@renderer/components/kanban/CommentsList'
import type { KanbanComment } from '@shared/types/kanban'
import React from 'react'

// Mock electronAPI for MockPreviewModal, openExternal, and report
beforeEach(() => {
  window.electronAPI = {
    ...window.electronAPI,
    app: {
      ...(window.electronAPI?.app || {}),
      openExternal: vi.fn().mockResolvedValue(undefined),
    },
    fs: {
      ...(window.electronAPI?.fs || {}),
      readFile: vi.fn().mockResolvedValue({ success: true, content: '<html><body>Mock</body></html>', error: null }),
      listDirectory: vi.fn().mockResolvedValue({ success: true, basePath: '', entries: [], error: null }),
      createDirectory: vi.fn().mockResolvedValue({ success: true, path: null, error: null }),
    },
    report: {
      openFile: vi.fn().mockResolvedValue({ success: true }),
    },
  } as typeof window.electronAPI
})

describe('CommentsList', () => {
  it('should render comments', () => {
    const comments: KanbanComment[] = [
      { id: 'c1', source: 'user', text: 'Hello', timestamp: new Date().toISOString() },
      { id: 'c2', source: 'agent', text: 'Hi there', timestamp: new Date().toISOString() },
    ]

    render(<CommentsList comments={comments} />)

    expect(screen.getByText('Hello')).toBeInTheDocument()
    expect(screen.getByText('Hi there')).toBeInTheDocument()
  })

  it('should render JSON comments as formatted code blocks', () => {
    const comments: KanbanComment[] = [
      {
        id: 'c1',
        source: 'agent',
        text: '{"result":"ok","count":2}',
        timestamp: new Date().toISOString(),
      },
    ]

    render(<CommentsList comments={comments} />)

    const jsonBlock = screen.getByTestId('comment-json-c1')
    expect(jsonBlock).toBeInTheDocument()
    expect(jsonBlock.textContent).toBe('{\n  "result": "ok",\n  "count": 2\n}')
  })

  it('should keep invalid JSON as plain text', () => {
    const comments: KanbanComment[] = [
      {
        id: 'c1',
        source: 'agent',
        text: "{'result': 'ok'}",
        timestamp: new Date().toISOString(),
      },
    ]

    render(<CommentsList comments={comments} />)

    expect(screen.queryByTestId('comment-json-c1')).not.toBeInTheDocument()
    expect(screen.getByText("{'result': 'ok'}").tagName).toBe('P')
  })

  it('should show empty state when no comments', () => {
    render(<CommentsList comments={[]} />)

    expect(screen.getByTestId('no-comments')).toBeInTheDocument()
  })

  it('should render option buttons on comments with options', () => {
    const comments: KanbanComment[] = [
      {
        id: 'c1',
        source: 'agent',
        text: 'Which approach?',
        timestamp: new Date().toISOString(),
        options: ['Option A', 'Option B', 'Option C'],
      },
    ]

    render(<CommentsList comments={comments} />)

    expect(screen.getByText('Option A')).toBeInTheDocument()
    expect(screen.getByText('Option B')).toBeInTheDocument()
    expect(screen.getByText('Option C')).toBeInTheDocument()
  })

  it('should call onSelectOption when option button clicked', () => {
    const onSelectOption = vi.fn()
    const comments: KanbanComment[] = [
      {
        id: 'c1',
        source: 'agent',
        text: 'Which approach?',
        timestamp: new Date().toISOString(),
        options: ['Option A', 'Option B'],
      },
    ]

    render(<CommentsList comments={comments} onSelectOption={onSelectOption} />)

    fireEvent.click(screen.getByTestId('comment-option-c1-0'))
    expect(onSelectOption).toHaveBeenCalledWith('Option A')

    fireEvent.click(screen.getByTestId('comment-option-c1-1'))
    expect(onSelectOption).toHaveBeenCalledWith('Option B')
  })

  it('should not render option buttons when options is empty', () => {
    const comments: KanbanComment[] = [
      {
        id: 'c1',
        source: 'agent',
        text: 'Just a comment',
        timestamp: new Date().toISOString(),
        options: [],
      },
    ]

    render(<CommentsList comments={comments} />)

    expect(screen.queryByTestId('comment-option-c1-0')).not.toBeInTheDocument()
  })

  it('should not render option buttons when options is undefined', () => {
    const comments: KanbanComment[] = [
      {
        id: 'c1',
        source: 'agent',
        text: 'Just a comment',
        timestamp: new Date().toISOString(),
      },
    ]

    render(<CommentsList comments={comments} />)

    expect(screen.queryByTestId('comment-option-c1-0')).not.toBeInTheDocument()
  })

  it('should render SVG data URI images in markdown', () => {
    const svgDataUri = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0icmVkIi8+PC9zdmc+'
    const comments: KanbanComment[] = [
      {
        id: 'c1',
        source: 'agent',
        text: `Here is a wireframe:\n\n![Layout](${svgDataUri})`,
        timestamp: new Date().toISOString(),
      },
    ]

    render(<CommentsList comments={comments} />)

    const img = screen.getByTestId('svg-image')
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('src', svgDataUri)
  })

  it('should block non-data-URI images', () => {
    const comments: KanbanComment[] = [
      {
        id: 'c1',
        source: 'agent',
        text: '![external](https://example.com/image.png)',
        timestamp: new Date().toISOString(),
      },
    ]

    render(<CommentsList comments={comments} />)

    expect(screen.queryByTestId('svg-image')).not.toBeInTheDocument()
    expect(screen.getByTestId('blocked-image')).toBeInTheDocument()
  })

  it('should block file:// protocol images', () => {
    const comments: KanbanComment[] = [
      {
        id: 'c1',
        source: 'agent',
        text: '![local](file:///etc/passwd)',
        timestamp: new Date().toISOString(),
      },
    ]

    render(<CommentsList comments={comments} />)

    expect(screen.queryByTestId('svg-image')).not.toBeInTheDocument()
    expect(screen.getByTestId('blocked-image')).toBeInTheDocument()
  })

  it('should render yolium-mock:// links as View Mock buttons', () => {
    const comments: KanbanComment[] = [
      {
        id: 'c1',
        source: 'agent',
        text: '[View Mock: dialog.html](yolium-mock:///home/user/project/.yolium/mocks/dialog.html)',
        timestamp: new Date().toISOString(),
      },
    ]

    render(<CommentsList comments={comments} />)

    const button = screen.getByTestId('mock-preview-button')
    expect(button).toBeInTheDocument()
    expect(button.tagName).toBe('BUTTON')
    expect(button).toHaveTextContent('View Mock: dialog.html')
  })

  it('should open mock preview modal when View Mock button is clicked', async () => {
    const comments: KanbanComment[] = [
      {
        id: 'c1',
        source: 'agent',
        text: '[View Mock: dialog.html](yolium-mock:///home/user/project/.yolium/mocks/dialog.html)',
        timestamp: new Date().toISOString(),
      },
    ]

    render(<CommentsList comments={comments} />)

    fireEvent.click(screen.getByTestId('mock-preview-button'))

    // The modal overlay should appear
    expect(screen.getByTestId('mock-preview-overlay')).toBeInTheDocument()
    expect(screen.getByTestId('mock-preview-modal')).toBeInTheDocument()
  })

  it('should render regular https links as copyable paths, not navigable links', () => {
    const comments: KanbanComment[] = [
      {
        id: 'c1',
        source: 'agent',
        text: 'Check [this link](https://example.com) for details',
        timestamp: new Date().toISOString(),
      },
    ]

    render(<CommentsList comments={comments} />)

    // Should NOT render as a navigable <a> tag
    expect(screen.queryByRole('link')).not.toBeInTheDocument()

    // Should render as a copyable link span
    const copyableLink = screen.getByTestId('copyable-link')
    expect(copyableLink).toBeInTheDocument()

    // Should display the URL in a code element
    expect(copyableLink.querySelector('code')?.textContent).toBe('https://example.com')

    // Should show the link text label when it differs from the URL
    expect(screen.getByText(/this link/)).toBeInTheDocument()

    // Should have a copy button
    expect(screen.getByTestId('copy-link-button')).toBeInTheDocument()

    // Should NOT render as a mock button
    expect(screen.queryByTestId('mock-preview-button')).not.toBeInTheDocument()
  })

  it('should render link with same text and URL without duplicate label', () => {
    const url = 'https://example.com/report'
    const comments: KanbanComment[] = [
      {
        id: 'c1',
        source: 'agent',
        text: `Visit [${url}](${url}) for the report`,
        timestamp: new Date().toISOString(),
      },
    ]

    render(<CommentsList comments={comments} />)

    const copyableLink = screen.getByTestId('copyable-link')
    expect(copyableLink).toBeInTheDocument()
    expect(copyableLink.querySelector('code')?.textContent).toBe(url)

    // When link text equals the URL, no separate label should appear
    const spans = copyableLink.querySelectorAll('span')
    // The outer span is the copyable-link itself; no inner span should have the label
    const labelSpans = Array.from(spans).filter(s => s.textContent?.includes(' — '))
    expect(labelSpans).toHaveLength(0)
  })

  it('should copy URL to clipboard when copy button is clicked', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    const comments: KanbanComment[] = [
      {
        id: 'c1',
        source: 'agent',
        text: 'Report: [E2E Results](https://example.com/playwright-report/index.html)',
        timestamp: new Date().toISOString(),
      },
    ]

    render(<CommentsList comments={comments} />)

    fireEvent.click(screen.getByTestId('copy-link-button'))
    expect(writeText).toHaveBeenCalledWith('https://example.com/playwright-report/index.html')
  })

  it('should have an open button for external links', () => {
    const comments: KanbanComment[] = [
      {
        id: 'c1',
        source: 'agent',
        text: 'Check [this link](https://example.com) for details',
        timestamp: new Date().toISOString(),
      },
    ]

    render(<CommentsList comments={comments} />)

    // Should have an open button
    const openButton = screen.getByTestId('open-link-button')
    expect(openButton).toBeInTheDocument()
    expect(openButton).toHaveAttribute('title', 'Open in browser')
  })

  it('should open URL in browser when open button is clicked', () => {
    const openExternal = vi.fn().mockResolvedValue(undefined)
    window.electronAPI = {
      ...window.electronAPI,
      app: {
        ...(window.electronAPI?.app || {}),
        openExternal,
      },
    } as typeof window.electronAPI

    const comments: KanbanComment[] = [
      {
        id: 'c1',
        source: 'agent',
        text: 'Report: [E2E Results](https://example.com/playwright-report/index.html)',
        timestamp: new Date().toISOString(),
      },
    ]

    render(<CommentsList comments={comments} />)

    fireEvent.click(screen.getByTestId('open-link-button'))
    expect(openExternal).toHaveBeenCalledWith('https://example.com/playwright-report/index.html')
  })

  it('should copy code block content when code block copy button is clicked', () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    const comments: KanbanComment[] = [
      {
        id: 'c1',
        source: 'agent',
        text: '```typescript\nconst value = 42\nconsole.log(value)\n```',
        timestamp: new Date().toISOString(),
      },
    ]

    render(<CommentsList comments={comments} />)

    fireEvent.click(screen.getByTestId('copy-code-block-button'))

    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText.mock.calls[0][0]).toContain('const value = 42')
    expect(writeText.mock.calls[0][0]).toContain('console.log(value)')
    expect(writeText.mock.calls[0][0]).not.toContain('typescript')
  })

  it('should copy JSON content when JSON block copy button is clicked', () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    const comments: KanbanComment[] = [
      {
        id: 'c1',
        source: 'agent',
        text: '{"result":"ok","count":2}',
        timestamp: new Date().toISOString(),
      },
    ]

    render(<CommentsList comments={comments} />)

    fireEvent.click(screen.getByTestId('copy-json-c1'))

    expect(writeText).toHaveBeenCalledWith('{\n  "result": "ok",\n  "count": 2\n}')
  })

  it('should copy raw comment text when comment copy button is clicked', () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    const commentText = '## Plan\n\n- One\n- Two'
    const comments: KanbanComment[] = [
      {
        id: 'c1',
        source: 'agent',
        text: commentText,
        timestamp: new Date().toISOString(),
      },
    ]

    render(<CommentsList comments={comments} />)

    fireEvent.click(screen.getByTestId('copy-comment-c1'))

    expect(writeText).toHaveBeenCalledWith(commentText)
  })

  it('should show language label on fenced code blocks', () => {
    const comments: KanbanComment[] = [
      {
        id: 'c1',
        source: 'agent',
        text: '```typescript\nconst value = 42\n```',
        timestamp: new Date().toISOString(),
      },
    ]

    render(<CommentsList comments={comments} />)

    expect(screen.getByTestId('code-language-label')).toHaveTextContent('typescript')
  })

  it('should show checkmark after successful copy', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    const comments: KanbanComment[] = [
      {
        id: 'c1',
        source: 'agent',
        text: 'Simple comment',
        timestamp: new Date().toISOString(),
      },
    ]

    render(<CommentsList comments={comments} />)

    const button = screen.getByTestId('copy-comment-c1')
    fireEvent.click(button)

    await waitFor(() => {
      expect(button.querySelector('polyline')).toBeInTheDocument()
    })
  })

  it('should render yolium-report:// links as View Report buttons', () => {
    const comments: KanbanComment[] = [
      {
        id: 'c1',
        source: 'agent',
        text: '[View Report: vitest-report](yolium-report:///home/user/project/vitest-report/index.html)',
        timestamp: new Date().toISOString(),
      },
    ]

    render(<CommentsList comments={comments} />)

    const button = screen.getByTestId('report-preview-button')
    expect(button).toBeInTheDocument()
    expect(button.tagName).toBe('BUTTON')
    expect(button).toHaveTextContent('View Report: vitest-report')
  })

  it('should call report.openFile when report button is clicked', () => {
    const openFile = vi.fn().mockResolvedValue({ success: true })
    window.electronAPI = {
      ...window.electronAPI,
      report: { openFile },
    } as typeof window.electronAPI

    const comments: KanbanComment[] = [
      {
        id: 'c1',
        source: 'agent',
        text: '[View Report](yolium-report:///home/user/project/vitest-report/index.html)',
        timestamp: new Date().toISOString(),
      },
    ]

    render(<CommentsList comments={comments} />)

    fireEvent.click(screen.getByTestId('report-preview-button'))
    expect(openFile).toHaveBeenCalledWith('/home/user/project/vitest-report/index.html')
  })

  it('should not render report button for regular links', () => {
    const comments: KanbanComment[] = [
      {
        id: 'c1',
        source: 'agent',
        text: '[Check results](https://example.com/report)',
        timestamp: new Date().toISOString(),
      },
    ]

    render(<CommentsList comments={comments} />)

    expect(screen.queryByTestId('report-preview-button')).not.toBeInTheDocument()
  })

  it('should render inline SVG that was pre-converted to base64 data URI format', () => {
    // Simulate what normalizeSvgToDataUri produces from raw <svg> input
    const rawSvg = '<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" fill="red"/></svg>'
    const b64 = Buffer.from(rawSvg).toString('base64')
    const dataUri = `data:image/svg+xml;base64,${b64}`
    const comments: KanbanComment[] = [
      {
        id: 'c1',
        source: 'agent',
        text: `Here is a diagram:\n\n![SVG](${dataUri})`,
        timestamp: new Date().toISOString(),
      },
    ]

    render(<CommentsList comments={comments} />)

    const img = screen.getByTestId('svg-image')
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('src', dataUri)
  })

  it('should not render report button for mock links', () => {
    const comments: KanbanComment[] = [
      {
        id: 'c1',
        source: 'agent',
        text: '[View Mock](yolium-mock:///home/user/project/.yolium/mocks/dialog.html)',
        timestamp: new Date().toISOString(),
      },
    ]

    render(<CommentsList comments={comments} />)

    expect(screen.queryByTestId('report-preview-button')).not.toBeInTheDocument()
    expect(screen.getByTestId('mock-preview-button')).toBeInTheDocument()
  })

  describe('answer form', () => {
    it('should render answer form when agentStatus is waiting', () => {
      render(<CommentsList comments={[]} agentStatus="waiting" answerText="" isAnswering={false} onSetAnswerText={vi.fn()} onAnswerQuestion={vi.fn()} />)
      expect(screen.getByTestId('answer-textarea')).toBeInTheDocument()
      expect(screen.getByTestId('submit-answer-button')).toBeInTheDocument()
    })

    it('should not render answer form when agentStatus is not waiting', () => {
      render(<CommentsList comments={[]} agentStatus="running" answerText="" isAnswering={false} onSetAnswerText={vi.fn()} onAnswerQuestion={vi.fn()} />)
      expect(screen.queryByTestId('answer-textarea')).not.toBeInTheDocument()
      expect(screen.queryByTestId('submit-answer-button')).not.toBeInTheDocument()
    })

    it('should call onSetAnswerText when option button clicked in waiting state', () => {
      const onSetAnswerText = vi.fn()
      const comments: KanbanComment[] = [
        { id: 'c1', source: 'agent', text: 'Which approach?', timestamp: new Date().toISOString(), options: ['Option A', 'Option B'] },
      ]
      render(<CommentsList comments={comments} agentStatus="waiting" answerText="" isAnswering={false} onSetAnswerText={onSetAnswerText} onAnswerQuestion={vi.fn()} />)

      fireEvent.click(screen.getByTestId('comment-option-c1-0'))
      expect(onSetAnswerText).toHaveBeenCalledWith('Option A')
    })

    it('should call onAnswerQuestion when submit answer button clicked', () => {
      const onAnswerQuestion = vi.fn()
      render(<CommentsList comments={[]} agentStatus="waiting" answerText="my answer" isAnswering={false} onSetAnswerText={vi.fn()} onAnswerQuestion={onAnswerQuestion} />)

      fireEvent.click(screen.getByTestId('submit-answer-button'))
      expect(onAnswerQuestion).toHaveBeenCalled()
    })

    it('should disable submit when answer text is empty', () => {
      render(<CommentsList comments={[]} agentStatus="waiting" answerText="" isAnswering={false} onSetAnswerText={vi.fn()} onAnswerQuestion={vi.fn()} />)
      expect(screen.getByTestId('submit-answer-button')).toBeDisabled()
    })

    it('should disable submit when isAnswering is true', () => {
      render(<CommentsList comments={[]} agentStatus="waiting" answerText="something" isAnswering={true} onSetAnswerText={vi.fn()} onAnswerQuestion={vi.fn()} />)
      expect(screen.getByTestId('submit-answer-button')).toBeDisabled()
    })
  })

  describe('reverse chronological order', () => {
    const orderedComments: KanbanComment[] = [
      { id: 'c1', source: 'user', text: 'First comment', timestamp: '2024-01-01T00:00:00Z' },
      { id: 'c2', source: 'agent', text: 'Second comment', timestamp: '2024-01-02T00:00:00Z' },
      { id: 'c3', source: 'system', text: 'Third comment', timestamp: '2024-01-03T00:00:00Z' },
    ]

    it('should render comments in reverse chronological order (newest first)', () => {
      render(<CommentsList comments={orderedComments} />)

      const commentCards = document.querySelectorAll('[data-comment-id]')
      expect(commentCards).toHaveLength(3)
      expect(commentCards[0].getAttribute('data-comment-id')).toBe('c3')
      expect(commentCards[1].getAttribute('data-comment-id')).toBe('c2')
      expect(commentCards[2].getAttribute('data-comment-id')).toBe('c1')
    })

    it('should maintain reverse order when filtering with search query', () => {
      const comments: KanbanComment[] = [
        { id: 'c1', source: 'user', text: 'First alpha report', timestamp: '2024-01-01T00:00:00Z' },
        { id: 'c2', source: 'agent', text: 'Unrelated note', timestamp: '2024-01-02T00:00:00Z' },
        { id: 'c3', source: 'system', text: 'Second alpha fix', timestamp: '2024-01-03T00:00:00Z' },
      ]

      render(<CommentsList comments={comments} />)

      fireEvent.change(screen.getByTestId('comment-search-input'), { target: { value: 'alpha' } })

      const commentCards = document.querySelectorAll('[data-comment-id]')
      expect(commentCards).toHaveLength(2)
      expect(commentCards[0].getAttribute('data-comment-id')).toBe('c3')
      expect(commentCards[1].getAttribute('data-comment-id')).toBe('c1')
    })

    it('should preserve correct focus highlighting on reversed comments', () => {
      render(<CommentsList comments={orderedComments} focusedCommentId="c3" />)

      const focusedEl = document.querySelector('[data-comment-id="c3"]')
      expect(focusedEl).not.toBeNull()
      expect(focusedEl!.className).toContain('ring-2')
    })

    it('should preserve correct selected state on reversed comments', () => {
      const selectedIds = new Set(['c1', 'c3'])
      render(<CommentsList comments={orderedComments} selectedCommentIds={selectedIds} />)

      const c1El = document.querySelector('[data-comment-id="c1"]')
      const c2El = document.querySelector('[data-comment-id="c2"]')
      const c3El = document.querySelector('[data-comment-id="c3"]')

      expect(c1El!.className).toContain('bg-[var(--color-accent-primary)]/10')
      expect(c2El!.className).not.toContain('bg-[var(--color-accent-primary)]/10')
      expect(c3El!.className).toContain('bg-[var(--color-accent-primary)]/10')
    })
  })

  describe('comment search', () => {
    const searchComments: KanbanComment[] = [
      { id: 'c1', source: 'user', text: 'Hello world', timestamp: new Date().toISOString() },
      { id: 'c2', source: 'agent', text: 'Found 5 relevant files', timestamp: new Date().toISOString() },
      { id: 'c3', source: 'system', text: 'Agent started', timestamp: new Date().toISOString() },
    ]

    it('should render search input when comments exist', () => {
      render(<CommentsList comments={searchComments} />)
      expect(screen.getByTestId('comment-search-input')).toBeInTheDocument()
    })

    it('should not render search input when no comments exist', () => {
      render(<CommentsList comments={[]} />)
      expect(screen.queryByTestId('comment-search-input')).not.toBeInTheDocument()
    })

    it('should filter comments by search query (case-insensitive)', () => {
      render(<CommentsList comments={searchComments} />)

      fireEvent.change(screen.getByTestId('comment-search-input'), { target: { value: 'hello' } })

      expect(screen.getByText('Hello world')).toBeInTheDocument()
      expect(screen.queryByText('Found 5 relevant files')).not.toBeInTheDocument()
      expect(screen.queryByText('Agent started')).not.toBeInTheDocument()
    })

    it('should show match count when search query is active', () => {
      render(<CommentsList comments={searchComments} />)

      fireEvent.change(screen.getByTestId('comment-search-input'), { target: { value: 'hello' } })

      const matchCount = screen.getByTestId('comment-search-count')
      expect(matchCount).toBeInTheDocument()
      expect(matchCount).toHaveTextContent('1 of 3')
    })

    it('should show no matches message when search matches nothing', () => {
      render(<CommentsList comments={searchComments} />)

      fireEvent.change(screen.getByTestId('comment-search-input'), { target: { value: 'zzzznotfound' } })

      expect(screen.getByText('No matching comments')).toBeInTheDocument()
    })

    it('should clear search query when clear button is clicked', () => {
      render(<CommentsList comments={searchComments} />)

      const input = screen.getByTestId('comment-search-input')
      fireEvent.change(input, { target: { value: 'hello' } })

      // Only one comment visible
      expect(screen.queryByText('Found 5 relevant files')).not.toBeInTheDocument()

      // Click clear button
      fireEvent.click(screen.getByTestId('comment-search-clear'))

      // All comments visible again
      expect(screen.getByText('Hello world')).toBeInTheDocument()
      expect(screen.getByText('Found 5 relevant files')).toBeInTheDocument()
      expect(screen.getByText('Agent started')).toBeInTheDocument()
    })

    it('should clear search query when Escape is pressed in search input', () => {
      render(<CommentsList comments={searchComments} />)

      const input = screen.getByTestId('comment-search-input')
      fireEvent.change(input, { target: { value: 'hello' } })

      expect(screen.queryByText('Found 5 relevant files')).not.toBeInTheDocument()

      fireEvent.keyDown(input, { key: 'Escape' })

      expect(screen.getByText('Hello world')).toBeInTheDocument()
      expect(screen.getByText('Found 5 relevant files')).toBeInTheDocument()
      expect(screen.getByText('Agent started')).toBeInTheDocument()
    })

    it('should show all comments when search query is empty', () => {
      render(<CommentsList comments={searchComments} />)

      // With empty query, all comments should be visible
      expect(screen.getByText('Hello world')).toBeInTheDocument()
      expect(screen.getByText('Found 5 relevant files')).toBeInTheDocument()
      expect(screen.getByText('Agent started')).toBeInTheDocument()
    })

    it('should still render option buttons on filtered comments', () => {
      const commentsWithOptions: KanbanComment[] = [
        { id: 'c1', source: 'agent', text: 'Which approach?', timestamp: new Date().toISOString(), options: ['Option A', 'Option B'] },
        { id: 'c2', source: 'user', text: 'Something else', timestamp: new Date().toISOString() },
      ]

      render(<CommentsList comments={commentsWithOptions} />)

      fireEvent.change(screen.getByTestId('comment-search-input'), { target: { value: 'approach' } })

      expect(screen.getByText('Which approach?')).toBeInTheDocument()
      expect(screen.getByText('Option A')).toBeInTheDocument()
      expect(screen.getByText('Option B')).toBeInTheDocument()
      expect(screen.queryByText('Something else')).not.toBeInTheDocument()
    })

    it('should preserve search state across re-renders with same comments', () => {
      const { rerender } = render(<CommentsList comments={searchComments} />)

      fireEvent.change(screen.getByTestId('comment-search-input'), { target: { value: 'hello' } })

      expect(screen.queryByText('Found 5 relevant files')).not.toBeInTheDocument()

      // Re-render with same comments
      rerender(<CommentsList comments={searchComments} />)

      // Search state should persist
      expect((screen.getByTestId('comment-search-input') as HTMLInputElement).value).toBe('hello')
      expect(screen.getByText('Hello world')).toBeInTheDocument()
      expect(screen.queryByText('Found 5 relevant files')).not.toBeInTheDocument()
    })

    it('should focus search input when focusSearchInput is called via ref', () => {
      const ref = { current: null as { focusSearchInput: () => void } | null }
      render(<CommentsList comments={searchComments} ref={ref} />)

      expect(document.activeElement).not.toBe(screen.getByTestId('comment-search-input'))

      ref.current?.focusSearchInput()

      expect(document.activeElement).toBe(screen.getByTestId('comment-search-input'))
    })
  })
})
