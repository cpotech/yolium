/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Sidebar } from '@renderer/components/navigation/Sidebar'
import type { SidebarProject } from '@renderer/stores/sidebar-store'
import type { SidebarWorkItem } from '@renderer/components/navigation/ProjectList'

const defaultProps = {
  sidebarItems: [] as SidebarWorkItem[],
  onToggleCollapse: vi.fn(),
  onProjectClick: vi.fn(),
  onProjectRemove: vi.fn(),
  onAddProject: vi.fn(),
  onAnswerAndResume: vi.fn(),
}

describe('Sidebar', () => {
  const mockProjects: SidebarProject[] = [
    { path: '/home/user/project1', addedAt: new Date().toISOString() },
    { path: '/home/user/project2', addedAt: new Date().toISOString() },
  ]

  it('should render project list when expanded', () => {
    render(
      <Sidebar
        projects={mockProjects}
        collapsed={false}
        {...defaultProps}
      />
    )

    expect(screen.getByText('project1')).toBeInTheDocument()
    expect(screen.getByText('project2')).toBeInTheDocument()
  })

  it('should show add project button', () => {
    render(
      <Sidebar
        projects={[]}
        collapsed={false}
        {...defaultProps}
      />
    )

    expect(screen.getByTestId('add-project-button')).toBeInTheDocument()
  })

  it('should call onAddProject when add button clicked', () => {
    const onAddProject = vi.fn()
    render(
      <Sidebar
        projects={[]}
        collapsed={false}
        {...defaultProps}
        onAddProject={onAddProject}
      />
    )

    fireEvent.click(screen.getByTestId('add-project-button'))
    expect(onAddProject).toHaveBeenCalled()
  })

  it('should call onProjectClick when project clicked', () => {
    const onProjectClick = vi.fn()
    render(
      <Sidebar
        projects={mockProjects}
        collapsed={false}
        {...defaultProps}
        onProjectClick={onProjectClick}
      />
    )

    fireEvent.click(screen.getByText('project1'))
    expect(onProjectClick).toHaveBeenCalledWith('/home/user/project1')
  })

  it('should show empty state when no projects', () => {
    render(
      <Sidebar
        projects={[]}
        collapsed={false}
        {...defaultProps}
      />
    )

    expect(screen.getByText(/No projects yet/)).toBeInTheDocument()
  })

  it('should toggle collapse when chevron clicked', () => {
    const onToggleCollapse = vi.fn()
    render(
      <Sidebar
        projects={[]}
        collapsed={true}
        {...defaultProps}
        onToggleCollapse={onToggleCollapse}
      />
    )

    fireEvent.click(screen.getByTestId('collapse-toggle'))
    expect(onToggleCollapse).toHaveBeenCalled()
  })

  it('should have correct width when collapsed', () => {
    const { container } = render(
      <Sidebar
        projects={[]}
        collapsed={true}
        {...defaultProps}
      />
    )

    expect(container.firstChild).toHaveClass('w-10')
  })

  it('should have correct width when expanded', () => {
    const { container } = render(
      <Sidebar
        projects={[]}
        collapsed={false}
        {...defaultProps}
      />
    )

    expect(container.firstChild).toHaveClass('w-48')
  })

  describe('status dots', () => {
    it('should render a yellow dot for running agents in the in-progress column', () => {
      render(
        <Sidebar
          projects={mockProjects}
          collapsed={false}
          {...defaultProps}
          sidebarItems={[
            {
              projectPath: '/home/user/project1',
              itemId: 'running-item',
              itemTitle: 'Running item',
              agentName: 'code-agent',
              agentStatus: 'running',
              column: 'in-progress',
            },
          ]}
        />
      )

      expect(screen.getByTestId('status-dot-running-item')).toHaveClass('bg-[var(--color-status-warning)]')
    })

    it('should render a yellow dot for waiting agents in the in-progress column', () => {
      render(
        <Sidebar
          projects={mockProjects}
          collapsed={false}
          {...defaultProps}
          sidebarItems={[
            {
              projectPath: '/home/user/project1',
              itemId: 'waiting-item',
              itemTitle: 'Waiting item',
              question: 'Choose an option',
              options: ['Option A', 'Option B'],
              agentName: 'code-agent',
              agentStatus: 'waiting',
              column: 'in-progress',
            },
          ]}
        />
      )

      expect(screen.getByTestId('status-dot-waiting-item')).toHaveClass('bg-[var(--color-status-warning)]')
    })

    it('should render a red dot for failed agents regardless of column', () => {
      render(
        <Sidebar
          projects={mockProjects}
          collapsed={false}
          {...defaultProps}
          sidebarItems={[
            {
              projectPath: '/home/user/project1',
              itemId: 'failed-item',
              itemTitle: 'Failed item',
              agentName: 'code-agent',
              agentStatus: 'failed',
              column: 'in-progress',
            },
          ]}
        />
      )

      expect(screen.getByTestId('status-dot-failed-item')).toHaveClass('bg-[var(--color-status-error)]')
    })

    it('should focus the project when a running dot is clicked', () => {
      const onProjectClick = vi.fn()

      render(
        <Sidebar
          projects={mockProjects}
          collapsed={false}
          {...defaultProps}
          onProjectClick={onProjectClick}
          sidebarItems={[
            {
              projectPath: '/home/user/project1',
              itemId: 'running-item',
              itemTitle: 'Running item',
              agentName: 'code-agent',
              agentStatus: 'running',
              column: 'in-progress',
            },
          ]}
        />
      )

      fireEvent.click(screen.getByTestId('status-dot-running-item'))

      expect(onProjectClick).toHaveBeenCalledWith('/home/user/project1')
    })

    it('should focus the project when a failed dot is clicked', () => {
      const onProjectClick = vi.fn()

      render(
        <Sidebar
          projects={mockProjects}
          collapsed={false}
          {...defaultProps}
          onProjectClick={onProjectClick}
          sidebarItems={[
            {
              projectPath: '/home/user/project1',
              itemId: 'failed-item',
              itemTitle: 'Failed item',
              agentName: 'code-agent',
              agentStatus: 'failed',
              column: 'in-progress',
            },
          ]}
        />
      )

      fireEvent.click(screen.getByTestId('status-dot-failed-item'))

      expect(onProjectClick).toHaveBeenCalledWith('/home/user/project1')
    })

    it('should not display status dot for items in the done column', () => {
      render(
        <Sidebar
          projects={mockProjects}
          collapsed={false}
          {...defaultProps}
          sidebarItems={[
            {
              projectPath: '/home/user/project1',
              itemId: 'done-item',
              itemTitle: 'Done item',
              agentName: 'code-agent',
              agentStatus: 'running',
              column: 'done',
            },
          ]}
        />
      )

      expect(screen.queryByTestId('status-dot-done-item')).not.toBeInTheDocument()
    })

    it('should not render dots when no active items', () => {
      render(
        <Sidebar
          projects={mockProjects}
          collapsed={false}
          {...defaultProps}
          sidebarItems={[]}
        />
      )

      expect(screen.queryByTestId('status-dot-running-item')).not.toBeInTheDocument()
      expect(screen.queryByTestId('status-dot-waiting-item')).not.toBeInTheDocument()
      expect(screen.queryByTestId('status-dot-failed-item')).not.toBeInTheDocument()
    })

    it('should not render dots when sidebar is collapsed', () => {
      render(
        <Sidebar
          projects={mockProjects}
          collapsed={true}
          {...defaultProps}
          sidebarItems={[
            {
              projectPath: '/home/user/project1',
              itemId: 'waiting-item',
              itemTitle: 'Waiting item',
              question: 'Choose an option',
              options: ['Option A', 'Option B'],
              agentName: 'code-agent',
              agentStatus: 'waiting',
              column: 'in-progress',
            },
          ]}
        />
      )

      expect(screen.queryByTestId('status-dot-waiting-item')).not.toBeInTheDocument()
    })

    it('should not render legacy inline status cards when active items exist', () => {
      render(
        <Sidebar
          projects={mockProjects}
          collapsed={false}
          {...defaultProps}
          sidebarItems={[
            {
              projectPath: '/home/user/project1',
              itemId: 'running-item',
              itemTitle: 'Running item',
              agentName: 'code-agent',
              agentStatus: 'running',
              column: 'in-progress',
            },
            {
              projectPath: '/home/user/project1',
              itemId: 'waiting-item',
              itemTitle: 'Waiting item',
              question: 'Choose an option',
              options: ['Option A', 'Option B'],
              agentName: 'code-agent',
              agentStatus: 'waiting',
              column: 'in-progress',
            },
          ]}
        />
      )

      expect(screen.queryByTestId('active-item-running-item')).not.toBeInTheDocument()
      expect(screen.queryByTestId('waiting-item-waiting-item')).not.toBeInTheDocument()
    })
  })

  describe('shortcut hints', () => {
    it('should display E shortcut hint on the collapse toggle button when collapsed', () => {
      render(
        <Sidebar
          projects={[]}
          collapsed={true}
          {...defaultProps}
        />
      )

      const hint = screen.getByTestId('sidebar-shortcut-hint')
      expect(hint).toBeInTheDocument()
      expect(hint).toHaveTextContent('E')
    })

    it('should display E shortcut hint label when expanded', () => {
      render(
        <Sidebar
          projects={[]}
          collapsed={false}
          {...defaultProps}
        />
      )

      const hint = screen.getByTestId('sidebar-shortcut-hint')
      expect(hint).toBeInTheDocument()
      expect(hint).toHaveTextContent('E')
    })
  })

  describe('kbd badges', () => {
    it('should display a <kbd>H</kbd> badge on the scheduled agents button', () => {
      render(
        <Sidebar
          projects={[]}
          collapsed={false}
          {...defaultProps}
          onOpenSchedule={vi.fn()}
        />
      )

      const scheduleButton = screen.getByTestId('sidebar-schedule')
      const kbd = scheduleButton.querySelector('kbd')
      expect(kbd).not.toBeNull()
      expect(kbd?.textContent).toBe('H')
    })

    it('should display a <kbd>A</kbd> badge on the add project button', () => {
      render(
        <Sidebar
          projects={[]}
          collapsed={false}
          {...defaultProps}
        />
      )

      const addButton = screen.getByTestId('add-project-button')
      const kbd = addButton.querySelector('kbd')
      expect(kbd).not.toBeNull()
      expect(kbd?.textContent).toBe('A')
    })
  })

  describe('waiting popover', () => {
    const sidebarItems: SidebarWorkItem[] = [
      {
        projectPath: '/home/user/project1',
        itemId: 'item-1',
        itemTitle: 'Fix bug',
        question: 'Should I use approach A or B?',
        options: ['Approach A', 'Approach B'],
        agentName: 'code-agent',
        agentStatus: 'waiting',
        column: 'in-progress',
      },
    ]

    it('should show popover with question when waiting dot is clicked', () => {
      render(
        <Sidebar
          projects={mockProjects}
          collapsed={false}
          {...defaultProps}
          sidebarItems={sidebarItems}
        />
      )

      fireEvent.click(screen.getByTestId('status-dot-item-1'))

      expect(screen.getByTestId('status-popover-question-item-1')).toHaveTextContent('Should I use approach A or B?')
    })

    it('should show option buttons in popover', () => {
      render(
        <Sidebar
          projects={mockProjects}
          collapsed={false}
          {...defaultProps}
          sidebarItems={sidebarItems}
        />
      )

      fireEvent.click(screen.getByTestId('status-dot-item-1'))

      expect(screen.getByRole('button', { name: 'Approach A' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Approach B' })).toBeInTheDocument()
    })

    it('should call onAnswerAndResume when popover option is clicked', async () => {
      const onAnswerAndResume = vi.fn().mockResolvedValue(undefined)
      render(
        <Sidebar
          projects={mockProjects}
          collapsed={false}
          {...defaultProps}
          sidebarItems={sidebarItems}
          onAnswerAndResume={onAnswerAndResume}
        />
      )

      fireEvent.click(screen.getByTestId('status-dot-item-1'))
      fireEvent.click(screen.getByRole('button', { name: 'Approach A' }))

      await waitFor(() => {
        expect(onAnswerAndResume).toHaveBeenCalledWith(
          '/home/user/project1',
          'item-1',
          'Approach A',
          'code-agent'
        )
      })
    })

    it('should close popover when clicking outside', () => {
      render(
        <Sidebar
          projects={mockProjects}
          collapsed={false}
          {...defaultProps}
          sidebarItems={sidebarItems}
        />
      )

      fireEvent.click(screen.getByTestId('status-dot-item-1'))
      fireEvent.mouseDown(document.body)

      expect(screen.queryByTestId('status-popover-item-1')).not.toBeInTheDocument()
    })

    it('should close popover on Escape key', () => {
      render(
        <Sidebar
          projects={mockProjects}
          collapsed={false}
          {...defaultProps}
          sidebarItems={sidebarItems}
        />
      )

      fireEvent.click(screen.getByTestId('status-dot-item-1'))
      fireEvent.keyDown(document, { key: 'Escape' })

      expect(screen.queryByTestId('status-popover-item-1')).not.toBeInTheDocument()
    })
  })
})
