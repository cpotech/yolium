/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CommentsList } from '@renderer/components/kanban/CommentsList'
import type { KanbanComment } from '@shared/types/kanban'

// Mock electronAPI for MockPreviewModal and openExternal
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
})
