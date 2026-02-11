/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { GitConfigDialog } from '@renderer/components/settings/GitConfigDialog'

const mockGetImageInfo = vi.fn()
const mockOpenExternal = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  mockGetImageInfo.mockResolvedValue(null)

  Object.defineProperty(window, 'electronAPI', {
    value: {
      docker: {
        getImageInfo: mockGetImageInfo,
        onBuildProgress: vi.fn(() => vi.fn()),
      },
      app: {
        openExternal: mockOpenExternal,
      },
    },
    writable: true,
  })
})

describe('GitConfigDialog', () => {
  it('renders fullscreen dialog semantics with sticky structure', async () => {
    render(
      <GitConfigDialog
        isOpen={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
        initialConfig={{ name: '', email: '' }}
      />
    )

    const dialog = screen.getByTestId('git-config-dialog')
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute('role', 'dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog.className).toContain('h-full')

    expect(screen.getByTestId('git-config-header')).toBeInTheDocument()
    expect(screen.getByTestId('git-config-body')).toBeInTheDocument()
    expect(screen.getByTestId('git-config-footer')).toBeInTheDocument()

    await waitFor(() => {
      expect(mockGetImageInfo).toHaveBeenCalled()
    })
  })

  it('keeps focus trapped inside the dialog when tabbing', async () => {
    render(
      <GitConfigDialog
        isOpen={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
        initialConfig={{ name: '', email: '', hasCodexOAuth: true }}
      />
    )

    const dialog = screen.getByTestId('git-config-dialog')
    const patInput = screen.getByTestId('git-pat-input')
    const saveButton = screen.getByTestId('git-config-save')

    saveButton.focus()
    fireEvent.keyDown(dialog, { key: 'Tab' })
    expect(document.activeElement).toBe(patInput)

    patInput.focus()
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(saveButton)

    await waitFor(() => {
      expect(mockGetImageInfo).toHaveBeenCalled()
    })
  })

  it('closes on Escape and preserves OAuth save semantics', async () => {
    const onClose = vi.fn()
    const onSave = vi.fn()

    render(
      <GitConfigDialog
        isOpen={true}
        onClose={onClose}
        onSave={onSave}
        initialConfig={{ name: '', email: '', hasCodexOAuth: true, hasOpenaiKey: true }}
      />
    )

    const dialog = screen.getByTestId('git-config-dialog')
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)

    const openaiInput = screen.getByTestId('openai-key-input')
    fireEvent.change(openaiInput, { target: { value: 'sk-test-key-12345' } })

    const codexToggle = screen.getByTestId('codex-oauth-toggle')
    fireEvent.click(codexToggle)

    fireEvent.click(screen.getByTestId('git-config-save'))

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          useCodexOAuth: true,
          openaiApiKey: '',
          useClaudeOAuth: false,
        })
      )
    })
  })
})
