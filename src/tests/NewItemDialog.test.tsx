/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NewItemDialog } from '../components/NewItemDialog'

// Mock the electronAPI
const mockKanbanAddItem = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  // Setup the mock on window.electronAPI
  Object.defineProperty(window, 'electronAPI', {
    value: {
      kanbanAddItem: mockKanbanAddItem,
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
})
