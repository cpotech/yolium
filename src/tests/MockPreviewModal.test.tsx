/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MockPreviewModal } from '@renderer/components/kanban/MockPreviewModal'

// Mock VimModeContext
vi.mock('@renderer/context/VimModeContext', () => ({
  useSuspendVimNavigation: vi.fn(),
}))

import { useSuspendVimNavigation } from '@renderer/context/VimModeContext'

// Mock electronAPI
beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(window, 'electronAPI', {
    value: {
      fs: {
        readFile: vi.fn().mockResolvedValue({ success: true, content: '<html></html>' }),
      },
    },
    writable: true,
  })
})

describe('MockPreviewModal', () => {
  const defaultProps = {
    filePath: '/test/mock.html',
    isOpen: true,
    onClose: vi.fn(),
  }

  it('should close on Ctrl+Q', () => {
    render(<MockPreviewModal {...defaultProps} />)
    fireEvent.keyDown(screen.getByTestId('mock-preview-overlay'), { key: 'q', ctrlKey: true })
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
  })

  it('should not close on Escape', () => {
    render(<MockPreviewModal {...defaultProps} />)
    fireEvent.keyDown(screen.getByTestId('mock-preview-overlay'), { key: 'Escape' })
    expect(defaultProps.onClose).not.toHaveBeenCalled()
  })

  it('should suspend vim navigation while open', () => {
    render(<MockPreviewModal {...defaultProps} />)
    expect(useSuspendVimNavigation).toHaveBeenCalledWith(true)
  })

  it('should have keyboard shortcut hint visible', () => {
    render(<MockPreviewModal {...defaultProps} />)
    const modal = screen.getByTestId('mock-preview-modal')
    expect(modal.textContent).toContain('Ctrl+Q')
  })
})
