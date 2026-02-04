import React from 'react'
import { Terminal, LayoutGrid, ChevronLeft, ChevronRight } from 'lucide-react'

export type ViewType = 'terminal' | 'kanban'

interface SidebarProps {
  activeView: ViewType
  onViewChange: (view: ViewType) => void
  collapsed: boolean
  onToggleCollapse: () => void
}

export function Sidebar({
  activeView,
  onViewChange,
  collapsed,
  onToggleCollapse,
}: SidebarProps): React.ReactElement {
  const navItems: { id: ViewType; icon: React.ReactNode; label: string }[] = [
    { id: 'terminal', icon: <Terminal size={18} />, label: 'Terminal' },
    { id: 'kanban', icon: <LayoutGrid size={18} />, label: 'Kanban' },
  ]

  return (
    <div
      className={`flex flex-col bg-[var(--color-bg-secondary)] border-r border-[var(--color-border-primary)] transition-all ${
        collapsed ? 'w-10' : 'w-40'
      }`}
    >
      {/* Navigation items */}
      <nav className="flex-1 py-2">
        {navItems.map((item) => (
          <button
            key={item.id}
            data-testid={`nav-${item.id}`}
            onClick={() => onViewChange(item.id)}
            className={`w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors ${
              activeView === item.id
                ? 'border-l-2 border-[var(--color-accent-primary)] text-white bg-[var(--color-bg-tertiary)]'
                : 'border-l-2 border-transparent text-[var(--color-text-secondary)] hover:text-white hover:bg-[var(--color-bg-tertiary)]'
            }`}
          >
            {item.icon}
            {!collapsed && <span>{item.label}</span>}
          </button>
        ))}
      </nav>

      {/* Collapse toggle */}
      <button
        data-testid="collapse-toggle"
        onClick={onToggleCollapse}
        className="flex items-center justify-center p-2 text-[var(--color-text-secondary)] hover:text-white border-t border-[var(--color-border-primary)]"
      >
        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>
    </div>
  )
}
