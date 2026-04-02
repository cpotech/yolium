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

  it('should render GitHub PAT input as type text', async () => {
    render(
      <GitConfigDialog
        isOpen={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
        initialConfig={{ name: '', email: '' }}
      />
    )

    const patInput = screen.getByTestId('git-pat-input')
    expect(patInput).toHaveAttribute('type', 'text')

    await waitFor(() => {
      expect(mockGetImageInfo).toHaveBeenCalled()
    })
  })

  it('should render Anthropic API Key input as type text', async () => {
    render(
      <GitConfigDialog
        isOpen={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
        initialConfig={{ name: '', email: '' }}
      />
    )

    const anthropicInput = screen.getByTestId('anthropic-key-input')
    expect(anthropicInput).toHaveAttribute('type', 'text')

    await waitFor(() => {
      expect(mockGetImageInfo).toHaveBeenCalled()
    })
  })

  it('should render OpenAI API Key input as type text', async () => {
    render(
      <GitConfigDialog
        isOpen={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
        initialConfig={{ name: '', email: '' }}
      />
    )

    const openaiInput = screen.getByTestId('openai-key-input')
    expect(openaiInput).toHaveAttribute('type', 'text')

    await waitFor(() => {
      expect(mockGetImageInfo).toHaveBeenCalled()
    })
  })

  it('should not render visibility toggle buttons for key inputs', async () => {
    render(
      <GitConfigDialog
        isOpen={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
        initialConfig={{ name: '', email: '', hasPat: true, hasAnthropicKey: true, hasOpenaiKey: true }}
      />
    )

    // No eye-icon toggle buttons should exist — look for SVG eye paths
    const allButtons = screen.getAllByRole('button')
    const eyeToggleButtons = allButtons.filter((btn) => {
      const svgs = btn.querySelectorAll('svg path')
      return Array.from(svgs).some((path) =>
        path.getAttribute('d')?.includes('M15 12a3 3 0 11-6 0')
      )
    })
    expect(eyeToggleButtons).toHaveLength(0)

    await waitFor(() => {
      expect(mockGetImageInfo).toHaveBeenCalled()
    })
  })

  it('closes on Ctrl+Q and preserves OAuth save semantics', async () => {
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
    fireEvent.keyDown(dialog, { key: 'q', ctrlKey: true })
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

  it('should render default provider select with claude as default', async () => {
    render(
      <GitConfigDialog
        isOpen={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
        initialConfig={{ name: '', email: '' }}
      />
    )

    const select = screen.getByTestId('default-provider-select')
    expect(select).toBeInTheDocument()
    expect(select).toHaveValue('claude')

    await waitFor(() => {
      expect(mockGetImageInfo).toHaveBeenCalled()
    })
  })

  it('should display saved default provider from initialConfig', async () => {
    render(
      <GitConfigDialog
        isOpen={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
        initialConfig={{ name: '', email: '', defaultProvider: 'opencode' }}
      />
    )

    const select = screen.getByTestId('default-provider-select')
    expect(select).toHaveValue('opencode')

    await waitFor(() => {
      expect(mockGetImageInfo).toHaveBeenCalled()
    })
  })

  it('should include defaultProvider in save payload', async () => {
    const onSave = vi.fn()
    render(
      <GitConfigDialog
        isOpen={true}
        onClose={vi.fn()}
        onSave={onSave}
        initialConfig={{ name: '', email: '', defaultProvider: 'codex' }}
      />
    )

    fireEvent.click(screen.getByTestId('git-config-save'))

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultProvider: 'codex',
        })
      )
    })
  })

  it('should persist default provider change when selecting opencode', async () => {
    const onSave = vi.fn()
    const { container } = render(
      <GitConfigDialog
        isOpen={true}
        onClose={vi.fn()}
        onSave={onSave}
        initialConfig={{ name: '', email: '' }}
      />
    )

    const select = screen.getByTestId('default-provider-select') as HTMLSelectElement
    expect(select.value).toBe('claude')

    // Use native select change
    select.value = 'opencode'
    fireEvent.change(select)

    expect(select.value).toBe('opencode')

    fireEvent.click(screen.getByTestId('git-config-save'))

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultProvider: 'opencode',
        })
      )
    })
  })
})
