/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Sidebar } from '@renderer/components/navigation/Sidebar'
import type { SidebarProject } from '@renderer/stores/sidebar-store'

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
        onToggleCollapse={vi.fn()}
        onProjectClick={vi.fn()}
        onProjectRemove={vi.fn()}
        onAddProject={vi.fn()}
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
        onToggleCollapse={vi.fn()}
        onProjectClick={vi.fn()}
        onProjectRemove={vi.fn()}
        onAddProject={vi.fn()}
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
        onToggleCollapse={vi.fn()}
        onProjectClick={vi.fn()}
        onProjectRemove={vi.fn()}
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
        onToggleCollapse={vi.fn()}
        onProjectClick={onProjectClick}
        onProjectRemove={vi.fn()}
        onAddProject={vi.fn()}
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
        onToggleCollapse={vi.fn()}
        onProjectClick={vi.fn()}
        onProjectRemove={vi.fn()}
        onAddProject={vi.fn()}
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
        onToggleCollapse={onToggleCollapse}
        onProjectClick={vi.fn()}
        onProjectRemove={vi.fn()}
        onAddProject={vi.fn()}
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
        onToggleCollapse={vi.fn()}
        onProjectClick={vi.fn()}
        onProjectRemove={vi.fn()}
        onAddProject={vi.fn()}
      />
    )

    expect(container.firstChild).toHaveClass('w-10')
  })

  it('should have correct width when expanded', () => {
    const { container } = render(
      <Sidebar
        projects={[]}
        collapsed={false}
        onToggleCollapse={vi.fn()}
        onProjectClick={vi.fn()}
        onProjectRemove={vi.fn()}
        onAddProject={vi.fn()}
      />
    )

    expect(container.firstChild).toHaveClass('w-48')
  })
})
