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
      agent: {
        listDefinitions: vi.fn().mockResolvedValue([]),
      },
      git: {
        loadConfig: vi.fn().mockResolvedValue(null),
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
    expect(screen.getByTestId('agent-provider-select')).toBeInTheDocument()
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

  it('should enable create button when title is provided but description is empty', () => {
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
    expect(createButton).not.toBeDisabled()
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
    mockKanbanAddItem.mockResolvedValueOnce({ id: 'new-item-1', description: 'Task description here', agentProvider: 'codex' })
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
    fireEvent.change(screen.getByTestId('agent-provider-select'), {
      target: { value: 'codex' },
    })

    fireEvent.click(screen.getByTestId('create-button'))

    await waitFor(() => {
      expect(mockKanbanAddItem).toHaveBeenCalledWith('/test/project', {
        title: 'My New Task',
        description: 'Task description here',
        branch: 'feature/my-branch',
        agentProvider: 'codex',
        agentType: 'plan-agent',
        order: 0,
      })
    })

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith({
        id: 'new-item-1',
        description: 'Task description here',
        agentProvider: 'codex',
        agentType: undefined,
      })
    })
  })

  it('should pass agentType in onCreated when agent type is selected', async () => {
    // Mock agent definitions so the agent type dropdown appears
    Object.defineProperty(window, 'electronAPI', {
      value: {
        ...window.electronAPI,
        agent: {
          listDefinitions: vi.fn().mockResolvedValue([
            { name: 'code-agent', description: 'Code agent', model: 'sonnet', tools: [], timeout: 30 },
          ]),
        },
        git: {
          loadConfig: vi.fn().mockResolvedValue(null),
        },
      },
      writable: true,
    })

    mockKanbanAddItem.mockResolvedValueOnce({
      id: 'new-item-2',
      description: 'Task with agent',
      agentProvider: 'claude',
      agentType: 'code-agent',
    })
    const onCreated = vi.fn()

    render(
      <NewItemDialog
        isOpen={true}
        projectPath="/test/project"
        onClose={vi.fn()}
        onCreated={onCreated}
      />
    )

    // Wait for agent definitions to load
    await waitFor(() => {
      expect(screen.getByTestId('agent-type-select')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByTestId('title-input'), {
      target: { value: 'Task with agent' },
    })
    fireEvent.change(screen.getByTestId('description-input'), {
      target: { value: 'Task with agent' },
    })
    fireEvent.change(screen.getByTestId('agent-type-select'), {
      target: { value: 'code-agent' },
    })

    fireEvent.click(screen.getByTestId('create-button'))

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith({
        id: 'new-item-2',
        description: 'Task with agent',
        agentProvider: 'claude',
        agentType: 'code-agent',
      })
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
        agentProvider: 'claude',
        agentType: 'plan-agent',
        order: 0,
      })
    })
  })

  it('should call kanbanAddItem with empty description when description is not provided', async () => {
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
      target: { value: 'Title Only Task' },
    })

    fireEvent.click(screen.getByTestId('create-button'))

    await waitFor(() => {
      expect(mockKanbanAddItem).toHaveBeenCalledWith('/test/project', {
        title: 'Title Only Task',
        description: '',
        branch: undefined,
        agentProvider: 'claude',
        agentType: 'plan-agent',
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

  it('should have claude as default agent provider', () => {
    render(
      <NewItemDialog
        isOpen={true}
        projectPath="/test/project"
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />
    )

    expect(screen.getByTestId('agent-provider-select')).toHaveValue('claude')
  })

  it('should render all agent provider options', () => {
    render(
      <NewItemDialog
        isOpen={true}
        projectPath="/test/project"
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />
    )

    const select = screen.getByTestId('agent-provider-select')
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
        agentProvider: 'claude',
        agentType: 'plan-agent',
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

  it('should render model selector with default empty option', () => {
    render(
      <NewItemDialog
        isOpen={true}
        projectPath="/test/project"
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />
    )

    const modelInput = screen.getByTestId('model-select')
    expect(modelInput).toBeInTheDocument()
    expect(modelInput).toHaveValue('') // Default is empty (uses agent default)
  })

  it('should include model in kanbanAddItem when selected', async () => {
    // Set up provider models so the dropdown has options
    Object.defineProperty(window, 'electronAPI', {
      value: {
        ...window.electronAPI,
        git: {
          loadConfig: vi.fn().mockResolvedValue({
            providerModels: { claude: ['opus', 'sonnet', 'haiku'] },
          }),
        },
      },
      writable: true,
    })

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

    // Wait for provider models to load
    await waitFor(() => {
      const options = screen.getByTestId('model-select').querySelectorAll('option')
      expect(options.length).toBeGreaterThan(1) // "Provider default" + models
    })

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
        agentProvider: 'claude',
        agentType: 'plan-agent',
        order: 0,
        model: 'opus',
      })
    })
  })

  it('should not close dialog when clicking the backdrop overlay', () => {
    const onClose = vi.fn()

    render(
      <NewItemDialog
        isOpen={true}
        projectPath="/test/project"
        onClose={onClose}
        onCreated={vi.fn()}
      />
    )

    const dialog = screen.getByTestId('new-item-dialog')
    const backdrop = dialog.parentElement!
    fireEvent.click(backdrop)
    expect(onClose).not.toHaveBeenCalled()
  })

  // Spell check attribute tests
  it('should have spellCheck enabled on title input', () => {
    render(
      <NewItemDialog
        isOpen={true}
        projectPath="/test/project"
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />
    )

    const titleInput = screen.getByTestId('title-input')
    expect(titleInput.getAttribute('spellcheck')).not.toBe('false')
  })

  it('should have spellCheck enabled on description textarea', () => {
    render(
      <NewItemDialog
        isOpen={true}
        projectPath="/test/project"
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />
    )

    const descriptionInput = screen.getByTestId('description-input')
    expect(descriptionInput.getAttribute('spellcheck')).not.toBe('false')
  })

  it('should have spellCheck disabled on branch input', () => {
    render(
      <NewItemDialog
        isOpen={true}
        projectPath="/test/project"
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />
    )

    const branchInput = screen.getByTestId('branch-input')
    expect(branchInput.getAttribute('spellcheck')).toBe('false')
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
        agentProvider: 'claude',
        agentType: 'plan-agent',
        order: 0,
      })
    })
  })
})
