/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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
    { path: '/home/user/project1', addedAt: Date.now() },
    { path: '/home/user/project2', addedAt: Date.now() },
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

  describe('waiting items', () => {
    const sidebarItems: SidebarWorkItem[] = [
      {
        projectPath: '/home/user/project1',
        itemId: 'item-1',
        itemTitle: 'Fix bug',
        question: 'Should I use approach A or B?',
        options: ['Approach A', 'Approach B'],
        agentName: 'code-agent',
        agentStatus: 'waiting',
      },
    ]

    it('should show waiting item badge count on project', () => {
      render(
        <Sidebar
          projects={mockProjects}
          collapsed={false}
          {...defaultProps}
          sidebarItems={sidebarItems}
        />
      )

      expect(screen.getByText('1')).toBeInTheDocument()
    })

    it('should display waiting item question and options', () => {
      render(
        <Sidebar
          projects={mockProjects}
          collapsed={false}
          {...defaultProps}
          sidebarItems={sidebarItems}
        />
      )

      expect(screen.getByText('Fix bug')).toBeInTheDocument()
      expect(screen.getByText('Should I use approach A or B?')).toBeInTheDocument()
      expect(screen.getByText('Approach A')).toBeInTheDocument()
      expect(screen.getByText('Approach B')).toBeInTheDocument()
    })

    it('should call onAnswerAndResume when option clicked', () => {
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

      fireEvent.click(screen.getByTestId('sidebar-option-item-1-0'))
      expect(onAnswerAndResume).toHaveBeenCalledWith(
        '/home/user/project1',
        'item-1',
        'Approach A',
        'code-agent'
      )
    })

    it('should not show waiting items when sidebar is collapsed', () => {
      render(
        <Sidebar
          projects={mockProjects}
          collapsed={true}
          {...defaultProps}
          sidebarItems={sidebarItems}
        />
      )

      expect(screen.queryByText('Fix bug')).not.toBeInTheDocument()
      expect(screen.queryByText('Should I use approach A or B?')).not.toBeInTheDocument()
    })
  })
})
