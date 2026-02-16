/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ProjectConfigDialog } from '@renderer/components/settings/ProjectConfigDialog'

const mockLoad = vi.fn()
const mockSave = vi.fn()
const mockCheckDirs = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  mockLoad.mockResolvedValue(null)
  mockSave.mockResolvedValue(undefined)
  mockCheckDirs.mockResolvedValue({})

  Object.defineProperty(window, 'electronAPI', {
    value: {
      projectConfig: {
        load: mockLoad,
        save: mockSave,
        checkDirs: mockCheckDirs,
      },
    },
    writable: true,
  })
})

describe('ProjectConfigDialog', () => {
  it('returns null when not open', () => {
    const { container } = render(
      <ProjectConfigDialog
        isOpen={false}
        projectPath="/home/user/project"
        onClose={vi.fn()}
      />
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders dialog when open', async () => {
    render(
      <ProjectConfigDialog
        isOpen={true}
        projectPath="/home/user/project"
        onClose={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByTestId('project-config-dialog')).toBeInTheDocument()
    })
    expect(screen.getByText('Project Settings')).toBeInTheDocument()
  })

  it('renders shared dirs list from loaded config', async () => {
    mockLoad.mockResolvedValue({ sharedDirs: ['samples', 'test-data'] })
    mockCheckDirs.mockResolvedValue({ samples: true, 'test-data': false })

    render(
      <ProjectConfigDialog
        isOpen={true}
        projectPath="/home/user/project"
        onClose={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByTestId('shared-dir-samples')).toBeInTheDocument()
      expect(screen.getByTestId('shared-dir-test-data')).toBeInTheDocument()
    })
  })

  it('shows existence badges correctly', async () => {
    mockLoad.mockResolvedValue({ sharedDirs: ['exists-dir', 'missing-dir'] })
    mockCheckDirs.mockResolvedValue({ 'exists-dir': true, 'missing-dir': false })

    render(
      <ProjectConfigDialog
        isOpen={true}
        projectPath="/home/user/project"
        onClose={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByTestId('dir-status-exists-dir')).toHaveTextContent('exists')
      expect(screen.getByTestId('dir-status-missing-dir')).toHaveTextContent('not found')
    })
  })

  it('validates input — rejects empty path', async () => {
    mockLoad.mockResolvedValue({ sharedDirs: [] })

    render(
      <ProjectConfigDialog
        isOpen={true}
        projectPath="/home/user/project"
        onClose={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByTestId('add-dir-button')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('add-dir-button'))
    expect(screen.getByTestId('validation-error')).toHaveTextContent('Path cannot be empty')
  })

  it('validates input — rejects absolute paths', async () => {
    mockLoad.mockResolvedValue({ sharedDirs: [] })

    render(
      <ProjectConfigDialog
        isOpen={true}
        projectPath="/home/user/project"
        onClose={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByTestId('add-dir-input')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByTestId('add-dir-input'), { target: { value: '/etc/passwd' } })
    fireEvent.click(screen.getByTestId('add-dir-button'))
    expect(screen.getByTestId('validation-error')).toHaveTextContent('Invalid path')
  })

  it('validates input — rejects path traversal', async () => {
    mockLoad.mockResolvedValue({ sharedDirs: [] })

    render(
      <ProjectConfigDialog
        isOpen={true}
        projectPath="/home/user/project"
        onClose={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByTestId('add-dir-input')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByTestId('add-dir-input'), { target: { value: '../secret' } })
    fireEvent.click(screen.getByTestId('add-dir-button'))
    expect(screen.getByTestId('validation-error')).toHaveTextContent('Invalid path')
  })

  it('validates input — rejects duplicates', async () => {
    mockLoad.mockResolvedValue({ sharedDirs: ['samples'] })
    mockCheckDirs.mockResolvedValue({ samples: true })

    render(
      <ProjectConfigDialog
        isOpen={true}
        projectPath="/home/user/project"
        onClose={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByTestId('shared-dir-samples')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByTestId('add-dir-input'), { target: { value: 'samples' } })
    fireEvent.click(screen.getByTestId('add-dir-button'))
    expect(screen.getByTestId('validation-error')).toHaveTextContent('already in the list')
  })

  it('adds a valid directory entry', async () => {
    mockLoad.mockResolvedValue({ sharedDirs: [] })
    mockCheckDirs.mockResolvedValue({ fixtures: true })

    render(
      <ProjectConfigDialog
        isOpen={true}
        projectPath="/home/user/project"
        onClose={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByTestId('add-dir-input')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByTestId('add-dir-input'), { target: { value: 'fixtures' } })
    fireEvent.click(screen.getByTestId('add-dir-button'))

    expect(screen.getByTestId('shared-dir-fixtures')).toBeInTheDocument()
    expect(screen.queryByTestId('validation-error')).not.toBeInTheDocument()
  })

  it('remove button removes entry from list', async () => {
    mockLoad.mockResolvedValue({ sharedDirs: ['samples', 'test-data'] })
    mockCheckDirs.mockResolvedValue({ samples: true, 'test-data': true })

    render(
      <ProjectConfigDialog
        isOpen={true}
        projectPath="/home/user/project"
        onClose={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByTestId('shared-dir-samples')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('remove-dir-samples'))

    expect(screen.queryByTestId('shared-dir-samples')).not.toBeInTheDocument()
    expect(screen.getByTestId('shared-dir-test-data')).toBeInTheDocument()
  })

  it('save calls IPC save with updated config', async () => {
    mockLoad.mockResolvedValue({ sharedDirs: ['samples'] })
    mockCheckDirs.mockResolvedValue({ samples: true })
    const onClose = vi.fn()

    render(
      <ProjectConfigDialog
        isOpen={true}
        projectPath="/home/user/project"
        onClose={onClose}
      />
    )

    await waitFor(() => {
      expect(screen.getByTestId('shared-dir-samples')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('project-config-save'))

    await waitFor(() => {
      expect(mockSave).toHaveBeenCalledWith('/home/user/project', { sharedDirs: ['samples'] })
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('cancel closes without saving', async () => {
    mockLoad.mockResolvedValue({ sharedDirs: ['samples'] })
    mockCheckDirs.mockResolvedValue({ samples: true })
    const onClose = vi.fn()

    render(
      <ProjectConfigDialog
        isOpen={true}
        projectPath="/home/user/project"
        onClose={onClose}
      />
    )

    await waitFor(() => {
      expect(screen.getByTestId('project-config-cancel')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('project-config-cancel'))

    expect(onClose).toHaveBeenCalled()
    expect(mockSave).not.toHaveBeenCalled()
  })

  it('empty state renders when no dirs configured', async () => {
    mockLoad.mockResolvedValue({ sharedDirs: [] })

    render(
      <ProjectConfigDialog
        isOpen={true}
        projectPath="/home/user/project"
        onClose={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    })
    expect(screen.getByTestId('empty-state')).toHaveTextContent('No shared directories configured')
  })

  it('escape key closes without saving', async () => {
    mockLoad.mockResolvedValue({ sharedDirs: [] })
    const onClose = vi.fn()

    render(
      <ProjectConfigDialog
        isOpen={true}
        projectPath="/home/user/project"
        onClose={onClose}
      />
    )

    await waitFor(() => {
      expect(screen.getByTestId('project-config-dialog')).toBeInTheDocument()
    })

    fireEvent.keyDown(screen.getByTestId('project-config-dialog'), { key: 'Escape' })

    expect(onClose).toHaveBeenCalled()
    expect(mockSave).not.toHaveBeenCalled()
  })

  it('shows JSON preview with current config', async () => {
    mockLoad.mockResolvedValue({ sharedDirs: ['samples'] })
    mockCheckDirs.mockResolvedValue({ samples: true })

    render(
      <ProjectConfigDialog
        isOpen={true}
        projectPath="/home/user/project"
        onClose={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByTestId('json-preview')).toBeInTheDocument()
    })

    const preview = screen.getByTestId('json-preview')
    expect(preview.textContent).toContain('"sharedDirs"')
    expect(preview.textContent).toContain('"samples"')
  })

  it('adds entry via Enter key in input', async () => {
    mockLoad.mockResolvedValue({ sharedDirs: [] })
    mockCheckDirs.mockResolvedValue({ fixtures: true })

    render(
      <ProjectConfigDialog
        isOpen={true}
        projectPath="/home/user/project"
        onClose={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByTestId('add-dir-input')).toBeInTheDocument()
    })

    const input = screen.getByTestId('add-dir-input')
    fireEvent.change(input, { target: { value: 'fixtures' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(screen.getByTestId('shared-dir-fixtures')).toBeInTheDocument()
  })
})
