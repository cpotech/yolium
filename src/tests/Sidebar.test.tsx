/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Sidebar } from '../components/Sidebar'

describe('Sidebar', () => {
  it('should render terminal and kanban nav items', () => {
    render(
      <Sidebar
        activeView="terminal"
        onViewChange={vi.fn()}
        collapsed={true}
        onToggleCollapse={vi.fn()}
      />
    )

    expect(screen.getByTestId('nav-terminal')).toBeInTheDocument()
    expect(screen.getByTestId('nav-kanban')).toBeInTheDocument()
  })

  it('should highlight active view with accent border', () => {
    render(
      <Sidebar
        activeView="kanban"
        onViewChange={vi.fn()}
        collapsed={true}
        onToggleCollapse={vi.fn()}
      />
    )

    const kanbanNav = screen.getByTestId('nav-kanban')
    expect(kanbanNav).toHaveClass('border-l-2')
  })

  it('should call onViewChange when nav item clicked', () => {
    const onViewChange = vi.fn()
    render(
      <Sidebar
        activeView="terminal"
        onViewChange={onViewChange}
        collapsed={true}
        onToggleCollapse={vi.fn()}
      />
    )

    fireEvent.click(screen.getByTestId('nav-kanban'))
    expect(onViewChange).toHaveBeenCalledWith('kanban')
  })

  it('should show labels when expanded', () => {
    render(
      <Sidebar
        activeView="terminal"
        onViewChange={vi.fn()}
        collapsed={false}
        onToggleCollapse={vi.fn()}
      />
    )

    expect(screen.getByText('Terminal')).toBeInTheDocument()
    expect(screen.getByText('Kanban')).toBeInTheDocument()
  })

  it('should hide labels when collapsed', () => {
    render(
      <Sidebar
        activeView="terminal"
        onViewChange={vi.fn()}
        collapsed={true}
        onToggleCollapse={vi.fn()}
      />
    )

    expect(screen.queryByText('Terminal')).not.toBeInTheDocument()
    expect(screen.queryByText('Kanban')).not.toBeInTheDocument()
  })

  it('should toggle collapse when chevron clicked', () => {
    const onToggleCollapse = vi.fn()
    render(
      <Sidebar
        activeView="terminal"
        onViewChange={vi.fn()}
        collapsed={true}
        onToggleCollapse={onToggleCollapse}
      />
    )

    fireEvent.click(screen.getByTestId('collapse-toggle'))
    expect(onToggleCollapse).toHaveBeenCalled()
  })

  it('should have correct width when collapsed', () => {
    const { container } = render(
      <Sidebar
        activeView="terminal"
        onViewChange={vi.fn()}
        collapsed={true}
        onToggleCollapse={vi.fn()}
      />
    )

    expect(container.firstChild).toHaveClass('w-10')
  })

  it('should have correct width when expanded', () => {
    const { container } = render(
      <Sidebar
        activeView="terminal"
        onViewChange={vi.fn()}
        collapsed={false}
        onToggleCollapse={vi.fn()}
      />
    )

    expect(container.firstChild).toHaveClass('w-40')
  })
})
