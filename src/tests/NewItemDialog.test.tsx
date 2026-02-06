/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NewItemDialog } from '@renderer/components/kanban/NewItemDialog'

// Mock the electronAPI
const mockKanbanAddItem = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  // Setup the mock on window.electronAPI
  Object.defineProperty(window, 'electronAPI', {
    value: {
      kanban: {
        addItem: mockKanbanAddItem,
      },
    },
    writable: true,
  })
})

describe('NewItemDialog', () => {
  it('should not render when isOpen is false', () => {
    render(
      <NewItemDialog
        isOpen={false}
        projectPath="/test/project"
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />
    )

    expect(screen.queryByTestId('new-item-dialog')).not.toBeInTheDocument()
  })

  it('should render form fields when open', () => {
    render(
      <NewItemDialog
        isOpen={true}
        projectPath="/test/project"
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />
    )

    expect(screen.getByTestId('new-item-dialog')).toBeInTheDocument()
    expect(screen.getByTestId('title-input')).toBeInTheDocument()
    expect(screen.getByTestId('description-input')).toBeInTheDocument()
    expect(screen.getByTestId('branch-input')).toBeInTheDocument()
    expect(screen.getByTestId('agent-type-select')).toBeInTheDocument()
  })

  it('should have create button disabled when title is empty', () => {
    render(
      <NewItemDialog
        isOpen={true}
        projectPath="/test/project"
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />
    )

    const createButton = screen.getByTestId('create-button')
    expect(createButton).toBeDisabled()
  })

  it('should have create button disabled when description is empty', () => {
    render(
      <NewItemDialog
        isOpen={true}
        projectPath="/test/project"
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />
    )

    // Fill title but not description
    fireEvent.change(screen.getByTestId('title-input'), {
      target: { value: 'Test Title' },
    })

    const createButton = screen.getByTestId('create-button')
    expect(createButton).toBeDisabled()
  })

  it('should enable create button when title and description are provided', () => {
    render(
      <NewItemDialog
        isOpen={true}
        projectPath="/test/project"
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />
    )

    fireEvent.change(screen.getByTestId('title-input'), {
      target: { value: 'Test Title' },
    })
    fireEvent.change(screen.getByTestId('description-input'), {
      target: { value: 'Test Description' },
    })

    const createButton = screen.getByTestId('create-button')
    expect(createButton).not.toBeDisabled()
  })

  it('should call kanbanAddItem on submit with correct params', async () => {
    mockKanbanAddItem.mockResolvedValueOnce({ id: 'new-item-1' })
    const onCreated = vi.fn()

    render(
      <NewItemDialog
        isOpen={true}
        projectPath="/test/project"
        onClose={vi.fn()}
        onCreated={onCreated}
      />
    )

    fireEvent.change(screen.getByTestId('title-input'), {
      target: { value: 'My New Task' },
    })
    fireEvent.change(screen.getByTestId('description-input'), {
      target: { value: 'Task description here' },
    })
    fireEvent.change(screen.getByTestId('branch-input'), {
      target: { value: 'feature/my-branch' },
    })
    fireEvent.change(screen.getByTestId('agent-type-select'), {
      target: { value: 'codex' },
    })

    fireEvent.click(screen.getByTestId('create-button'))

    await waitFor(() => {
      expect(mockKanbanAddItem).toHaveBeenCalledWith('/test/project', {
        title: 'My New Task',
        description: 'Task description here',
        branch: 'feature/my-branch',
        agentType: 'codex',
        order: 0,
      })
    })

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalled()
    })
  })

  it('should call kanbanAddItem without branch when branch is empty', async () => {
    mockKanbanAddItem.mockResolvedValueOnce({ id: 'new-item-1' })
    const onCreated = vi.fn()

    render(
      <NewItemDialog
        isOpen={true}
        projectPath="/test/project"
        onClose={vi.fn()}
        onCreated={onCreated}
      />
    )

    fireEvent.change(screen.getByTestId('title-input'), {
      target: { value: 'My Task' },
    })
    fireEvent.change(screen.getByTestId('description-input'), {
      target: { value: 'Description' },
    })

    fireEvent.click(screen.getByTestId('create-button'))

    await waitFor(() => {
      expect(mockKanbanAddItem).toHaveBeenCalledWith('/test/project', {
        title: 'My Task',
        description: 'Description',
        branch: undefined,
        agentType: 'claude',
        order: 0,
      })
    })
  })

  it('should close dialog on cancel click', () => {
    const onClose = vi.fn()

    render(
      <NewItemDialog
        isOpen={true}
        projectPath="/test/project"
        onClose={onClose}
        onCreated={vi.fn()}
      />
    )

    fireEvent.click(screen.getByTestId('cancel-button'))
    expect(onClose).toHaveBeenCalled()
  })

  it('should close dialog on X button click', () => {
    const onClose = vi.fn()

    render(
      <NewItemDialog
        isOpen={true}
        projectPath="/test/project"
        onClose={onClose}
        onCreated={vi.fn()}
      />
    )

    fireEvent.click(screen.getByTestId('close-button'))
    expect(onClose).toHaveBeenCalled()
  })

  it('should reset form after successful creation', async () => {
    mockKanbanAddItem.mockResolvedValueOnce({ id: 'new-item-1' })

    const { rerender } = render(
      <NewItemDialog
        isOpen={true}
        projectPath="/test/project"
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />
    )

    // Fill form
    fireEvent.change(screen.getByTestId('title-input'), {
      target: { value: 'My Task' },
    })
    fireEvent.change(screen.getByTestId('description-input'), {
      target: { value: 'Description' },
    })

    fireEvent.click(screen.getByTestId('create-button'))

    await waitFor(() => {
      expect(mockKanbanAddItem).toHaveBeenCalled()
    })

    // Re-render to simulate dialog being opened again
    rerender(
      <NewItemDialog
        isOpen={true}
        projectPath="/test/project"
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />
    )

    // Form should be reset
    expect(screen.getByTestId('title-input')).toHaveValue('')
    expect(screen.getByTestId('description-input')).toHaveValue('')
  })

  it('should have claude as default agent type', () => {
    render(
      <NewItemDialog
        isOpen={true}
        projectPath="/test/project"
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />
    )

    expect(screen.getByTestId('agent-type-select')).toHaveValue('claude')
  })

  it('should render all agent type options', () => {
    render(
      <NewItemDialog
        isOpen={true}
        projectPath="/test/project"
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />
    )

    const select = screen.getByTestId('agent-type-select')
    const options = select.querySelectorAll('option')

    expect(options).toHaveLength(3)
    expect(options[0]).toHaveValue('claude')
    expect(options[1]).toHaveValue('codex')
    expect(options[2]).toHaveValue('opencode')
  })

  it('should submit form on Ctrl+Enter when valid', async () => {
    mockKanbanAddItem.mockResolvedValueOnce({ id: 'new-item-1' })
    const onCreated = vi.fn()

    render(
      <NewItemDialog
        isOpen={true}
        projectPath="/test/project"
        onClose={vi.fn()}
        onCreated={onCreated}
      />
    )

    fireEvent.change(screen.getByTestId('title-input'), {
      target: { value: 'Shortcut Task' },
    })
    fireEvent.change(screen.getByTestId('description-input'), {
      target: { value: 'Created via shortcut' },
    })

    // Press Ctrl+Enter on the dialog overlay
    fireEvent.keyDown(screen.getByTestId('new-item-dialog').parentElement!, {
      key: 'Enter',
      ctrlKey: true,
    })

    await waitFor(() => {
      expect(mockKanbanAddItem).toHaveBeenCalledWith('/test/project', {
        title: 'Shortcut Task',
        description: 'Created via shortcut',
        branch: undefined,
        agentType: 'claude',
        order: 0,
      })
    })
  })

  it('should not submit form on Ctrl+Enter when invalid', () => {
    render(
      <NewItemDialog
        isOpen={true}
        projectPath="/test/project"
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />
    )

    // Press Ctrl+Enter with empty form
    fireEvent.keyDown(screen.getByTestId('new-item-dialog').parentElement!, {
      key: 'Enter',
      ctrlKey: true,
    })

    expect(mockKanbanAddItem).not.toHaveBeenCalled()
  })

  it('should have aria-modal and role=dialog attributes', () => {
    render(
      <NewItemDialog
        isOpen={true}
        projectPath="/test/project"
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />
    )

    const dialog = screen.getByTestId('new-item-dialog')
    expect(dialog).toHaveAttribute('role', 'dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('should trap focus within dialog on Tab', () => {
    render(
      <NewItemDialog
        isOpen={true}
        projectPath="/test/project"
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />
    )

    const dialog = screen.getByTestId('new-item-dialog')
    const focusableElements = dialog.querySelectorAll<HTMLElement>(
      'input:not(:disabled), textarea:not(:disabled), select:not(:disabled), button:not(:disabled), [tabindex]:not([tabindex="-1"]):not(:disabled)'
    )
    expect(focusableElements.length).toBeGreaterThan(0)

    // Focus last element
    const lastElement = focusableElements[focusableElements.length - 1]
    lastElement.focus()
    expect(document.activeElement).toBe(lastElement)

    // Tab should wrap to first element
    fireEvent.keyDown(dialog.parentElement!, { key: 'Tab' })
    expect(document.activeElement).toBe(focusableElements[0])
  })

  it('should trap focus within dialog on Shift+Tab', () => {
    render(
      <NewItemDialog
        isOpen={true}
        projectPath="/test/project"
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />
    )

    const dialog = screen.getByTestId('new-item-dialog')
    const focusableElements = dialog.querySelectorAll<HTMLElement>(
      'input:not(:disabled), textarea:not(:disabled), select:not(:disabled), button:not(:disabled), [tabindex]:not([tabindex="-1"]):not(:disabled)'
    )

    // Focus first element
    const firstElement = focusableElements[0]
    firstElement.focus()
    expect(document.activeElement).toBe(firstElement)

    // Shift+Tab should wrap to last element
    fireEvent.keyDown(dialog.parentElement!, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(focusableElements[focusableElements.length - 1])
  })

  it('should close dialog when clicking overlay background', () => {
    const onClose = vi.fn()

    render(
      <NewItemDialog
        isOpen={true}
        projectPath="/test/project"
        onClose={onClose}
        onCreated={vi.fn()}
      />
    )

    // Click directly on the overlay (parent of dialog)
    const overlay = screen.getByTestId('new-item-dialog').parentElement!
    fireEvent.click(overlay, { target: overlay, currentTarget: overlay })

    expect(onClose).toHaveBeenCalled()
  })

  it('should render model selector with default empty option', () => {
    render(
      <NewItemDialog
        isOpen={true}
        projectPath="/test/project"
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />
    )

    const modelSelect = screen.getByTestId('model-select')
    expect(modelSelect).toBeInTheDocument()
    expect(modelSelect).toHaveValue('') // Default is "Agent default"
  })

  it('should include model in kanbanAddItem when selected', async () => {
    mockKanbanAddItem.mockResolvedValueOnce({ id: 'new-item-1' })
    const onCreated = vi.fn()

    render(
      <NewItemDialog
        isOpen={true}
        projectPath="/test/project"
        onClose={vi.fn()}
        onCreated={onCreated}
      />
    )

    fireEvent.change(screen.getByTestId('title-input'), {
      target: { value: 'Model Task' },
    })
    fireEvent.change(screen.getByTestId('description-input'), {
      target: { value: 'Testing model selection' },
    })
    fireEvent.change(screen.getByTestId('model-select'), {
      target: { value: 'opus' },
    })

    fireEvent.click(screen.getByTestId('create-button'))

    await waitFor(() => {
      expect(mockKanbanAddItem).toHaveBeenCalledWith('/test/project', {
        title: 'Model Task',
        description: 'Testing model selection',
        branch: undefined,
        agentType: 'claude',
        order: 0,
        model: 'opus',
      })
    })
  })

  it('should not include model when default option is selected', async () => {
    mockKanbanAddItem.mockResolvedValueOnce({ id: 'new-item-1' })

    render(
      <NewItemDialog
        isOpen={true}
        projectPath="/test/project"
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />
    )

    fireEvent.change(screen.getByTestId('title-input'), {
      target: { value: 'No Model' },
    })
    fireEvent.change(screen.getByTestId('description-input'), {
      target: { value: 'Uses agent default' },
    })

    fireEvent.click(screen.getByTestId('create-button'))

    await waitFor(() => {
      expect(mockKanbanAddItem).toHaveBeenCalledWith('/test/project', {
        title: 'No Model',
        description: 'Uses agent default',
        branch: undefined,
        agentType: 'claude',
        order: 0,
      })
    })
  })
})
