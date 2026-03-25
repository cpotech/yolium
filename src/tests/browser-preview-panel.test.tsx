/**
 * @vitest-environment jsdom
 */
import React from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BrowserPreviewPanel } from '@renderer/components/kanban/item-detail/BrowserPreviewPanel'

// Mock webview element — jsdom doesn't support it natively
// We simulate webview as a div with data attributes
beforeEach(() => {
  vi.clearAllMocks()
})

const defaultProps = {
  isOpen: true,
  url: 'http://localhost:54321',
  portMappings: { 3000: 54321 } as Record<number, number>,
  isLoading: false,
  error: null as string | null,
  onBack: vi.fn(),
  onForward: vi.fn(),
  onReload: vi.fn(),
  onUrlChange: vi.fn(),
  webviewRef: { current: null } as React.RefObject<HTMLElement | null>,
  urlBarRef: { current: null } as React.RefObject<HTMLInputElement | null>,
}

describe('BrowserPreviewPanel', () => {
  it('should render nothing when isOpen is false', () => {
    const { container } = render(
      <BrowserPreviewPanel {...defaultProps} isOpen={false} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('should render webview with correct src URL when isOpen and url provided', () => {
    render(<BrowserPreviewPanel {...defaultProps} />)
    const panel = screen.getByTestId('browser-preview-panel')
    expect(panel).toBeTruthy()

    // Webview is rendered (as custom element in jsdom, we check data-testid)
    const webview = screen.getByTestId('browser-webview')
    expect(webview).toBeTruthy()
    expect(webview.getAttribute('src')).toBe('http://localhost:54321')
  })

  it('should render empty state when isOpen but no url provided', () => {
    render(<BrowserPreviewPanel {...defaultProps} url="" portMappings={{}} />)
    const emptyState = screen.getByTestId('browser-empty-state')
    expect(emptyState).toBeTruthy()
  })

  it('should display port mapping badge showing container:host port pair', () => {
    render(<BrowserPreviewPanel {...defaultProps} />)
    const badge = screen.getByTestId('browser-port-badge')
    expect(badge).toBeTruthy()
    expect(badge.textContent).toContain('3000')
    expect(badge.textContent).toContain('54321')
  })

  it('should call onBack when back button clicked', () => {
    render(<BrowserPreviewPanel {...defaultProps} />)
    const backBtn = screen.getByTestId('browser-back-btn')
    fireEvent.click(backBtn)
    expect(defaultProps.onBack).toHaveBeenCalledTimes(1)
  })

  it('should call onForward when forward button clicked', () => {
    render(<BrowserPreviewPanel {...defaultProps} />)
    const forwardBtn = screen.getByTestId('browser-forward-btn')
    fireEvent.click(forwardBtn)
    expect(defaultProps.onForward).toHaveBeenCalledTimes(1)
  })

  it('should call onReload when reload button clicked', () => {
    render(<BrowserPreviewPanel {...defaultProps} />)
    const reloadBtn = screen.getByTestId('browser-reload-btn')
    fireEvent.click(reloadBtn)
    expect(defaultProps.onReload).toHaveBeenCalledTimes(1)
  })

  it('should call onUrlChange when user submits URL in the URL bar', () => {
    render(<BrowserPreviewPanel {...defaultProps} />)
    const urlBar = screen.getByTestId('browser-url-bar') as HTMLInputElement
    fireEvent.change(urlBar, { target: { value: 'http://localhost:9999' } })
    fireEvent.keyDown(urlBar, { key: 'Enter' })
    expect(defaultProps.onUrlChange).toHaveBeenCalledWith('http://localhost:9999')
  })

  it('should show loading spinner while webview is loading', () => {
    render(<BrowserPreviewPanel {...defaultProps} isLoading={true} />)
    const spinner = screen.getByTestId('browser-loading-spinner')
    expect(spinner).toBeTruthy()
  })

  it('should not show loading spinner when not loading', () => {
    render(<BrowserPreviewPanel {...defaultProps} isLoading={false} />)
    expect(screen.queryByTestId('browser-loading-spinner')).toBeNull()
  })

  it('should display error state when webview fails to load', () => {
    render(<BrowserPreviewPanel {...defaultProps} error="Connection refused" />)
    const errorState = screen.getByTestId('browser-error-state')
    expect(errorState).toBeTruthy()
    expect(errorState.textContent).toContain('Connection refused')
  })

  it('should show retry button in error state', () => {
    render(<BrowserPreviewPanel {...defaultProps} error="Connection refused" />)
    const retryBtn = screen.getByTestId('browser-retry-btn')
    fireEvent.click(retryBtn)
    expect(defaultProps.onReload).toHaveBeenCalledTimes(1)
  })

  it('should not show webview when in error state', () => {
    render(<BrowserPreviewPanel {...defaultProps} error="Connection refused" />)
    expect(screen.queryByTestId('browser-webview')).toBeNull()
  })

  it('should set data-testid=browser-preview-panel on root element', () => {
    render(<BrowserPreviewPanel {...defaultProps} />)
    expect(screen.getByTestId('browser-preview-panel')).toBeTruthy()
  })

  it('should set data-testid=browser-url-bar on URL input', () => {
    render(<BrowserPreviewPanel {...defaultProps} />)
    expect(screen.getByTestId('browser-url-bar')).toBeTruthy()
  })

  it('should set data-testid on nav buttons', () => {
    render(<BrowserPreviewPanel {...defaultProps} />)
    expect(screen.getByTestId('browser-back-btn')).toBeTruthy()
    expect(screen.getByTestId('browser-forward-btn')).toBeTruthy()
    expect(screen.getByTestId('browser-reload-btn')).toBeTruthy()
  })

  it('should connect urlBarRef to the URL input element', () => {
    const urlBarRef = { current: null } as React.MutableRefObject<HTMLInputElement | null>
    render(<BrowserPreviewPanel {...defaultProps} urlBarRef={urlBarRef} />)
    expect(urlBarRef.current).toBeTruthy()
    expect(urlBarRef.current?.tagName).toBe('INPUT')
  })

  it('should connect webviewRef to the webview element', () => {
    const webviewRef = { current: null } as React.MutableRefObject<HTMLElement | null>
    render(<BrowserPreviewPanel {...defaultProps} webviewRef={webviewRef} />)
    expect(webviewRef.current).toBeTruthy()
    expect(webviewRef.current?.getAttribute('data-testid')).toBe('browser-webview')
  })
})
