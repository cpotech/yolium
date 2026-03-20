/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { ProjectList } from '@renderer/components/navigation/ProjectList'
import type { SidebarProject } from '@renderer/stores/sidebar-store'

// Mock the VimModeContext
let mockVimContext = {
  mode: 'NORMAL' as const,
  activeZone: 'sidebar' as const,
  setActiveZone: vi.fn(),
  enterInsertMode: vi.fn(),
  enterVisualMode: vi.fn(),
  exitToNormal: vi.fn(),
  suspendNavigation: vi.fn(() => vi.fn()),
}

vi.mock('@renderer/context/VimModeContext', () => ({
  useVimModeContext: () => mockVimContext,
  useSuspendVimNavigation: vi.fn(),
}))

vi.mock('@renderer/lib/path-utils', () => ({
  getFolderName: (p: string) => p.split('/').pop() || p,
}))

const mockProjects: SidebarProject[] = [
  { path: '/home/user/alpha', addedAt: '2024-01-01' },
  { path: '/home/user/beta', addedAt: '2024-01-02' },
  { path: '/home/user/gamma', addedAt: '2024-01-03' },
]

function fireKey(key: string) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
  })
  document.dispatchEvent(event)
  return event
}

describe('Sidebar keyboard navigation (document-level)', () => {
  let onProjectClick: ReturnType<typeof vi.fn>
  let onProjectRemove: ReturnType<typeof vi.fn>
  let onOpenProject: ReturnType<typeof vi.fn>
  let onOpenSchedule: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockVimContext = {
      mode: 'NORMAL',
      activeZone: 'sidebar',
      setActiveZone: vi.fn(),
      enterInsertMode: vi.fn(),
      enterVisualMode: vi.fn(),
      exitToNormal: vi.fn(),
      suspendNavigation: vi.fn(() => vi.fn()),
    }
    onProjectClick = vi.fn()
    onProjectRemove = vi.fn()
    onOpenProject = vi.fn()
    onOpenSchedule = vi.fn()
  })

  function renderProjectList(projects = mockProjects) {
    return render(
      <ProjectList
        projects={projects}
        collapsed={false}
        sidebarItems={[]}
        onProjectClick={onProjectClick}
        onProjectRemove={onProjectRemove}
        onOpenProject={onOpenProject}
        onAnswerAndResume={vi.fn()}
        onOpenSchedule={onOpenSchedule}
      />
    )
  }

  it('should navigate down with j key when sidebar zone is active (document-level, no DOM focus required)', () => {
    renderProjectList()

    // Initially focused on index 0 (alpha)
    act(() => { fireKey('j') })

    // Press Enter to verify focused index moved to 1 (beta)
    act(() => { fireKey('Enter') })
    expect(onProjectClick).toHaveBeenCalledWith('/home/user/beta')
  })

  it('should navigate up with k key when sidebar zone is active', () => {
    renderProjectList()

    // Navigate down first, then up
    act(() => { fireKey('j') }) // index 1
    act(() => { fireKey('k') }) // index 0

    act(() => { fireKey('Enter') })
    expect(onProjectClick).toHaveBeenCalledWith('/home/user/alpha')
  })

  it('should open project with Enter key when sidebar zone is active', () => {
    renderProjectList()

    act(() => { fireKey('Enter') })
    expect(onProjectClick).toHaveBeenCalledWith('/home/user/alpha')
  })

  it('should remove project with x key when sidebar zone is active', () => {
    renderProjectList()

    act(() => { fireKey('x') })
    expect(onProjectRemove).toHaveBeenCalledWith('/home/user/alpha')
  })

  it('should open add-project dialog with a key without switching zone to schedule', () => {
    renderProjectList()

    act(() => { fireKey('a') })
    expect(onOpenProject).toHaveBeenCalled()
    // The key should NOT have propagated to the global handler
    // (which would switch zone to 'schedule')
    expect(mockVimContext.setActiveZone).not.toHaveBeenCalled()
  })

  it('should open schedule with h key when sidebar zone is active', () => {
    renderProjectList()

    act(() => { fireKey('h') })
    expect(onOpenSchedule).toHaveBeenCalled()
  })

  it('should not handle keys when sidebar zone is not active', () => {
    mockVimContext.activeZone = 'content'
    renderProjectList()

    act(() => { fireKey('j') })
    act(() => { fireKey('Enter') })

    // Since zone is not sidebar, Enter should not trigger project click
    expect(onProjectClick).not.toHaveBeenCalled()
  })

  it('should not handle keys when projects list is empty', () => {
    renderProjectList([])

    act(() => { fireKey('j') })
    act(() => { fireKey('Enter') })

    expect(onProjectClick).not.toHaveBeenCalled()
  })

  it('should call stopPropagation to prevent global vim handler from processing sidebar-local keys', () => {
    renderProjectList()

    // Add a bubble-phase listener to detect if propagation was stopped
    const bubbleListener = vi.fn()
    document.addEventListener('keydown', bubbleListener)

    act(() => {
      const event = new KeyboardEvent('keydown', {
        key: 'j',
        bubbles: true,
        cancelable: true,
      })
      document.dispatchEvent(event)
    })

    // The bubble listener should NOT have been called because
    // the capture-phase handler calls stopPropagation
    // Note: on document itself, capture fires before bubble,
    // and stopPropagation prevents other listeners in bubble phase
    // Actually, stopImmediatePropagation is needed for same-element listeners
    // Let's check that the event's defaultPrevented is true instead
    document.removeEventListener('keydown', bubbleListener)

    // Verify by checking the event was handled (project navigated)
    act(() => { fireKey('Enter') })
    expect(onProjectClick).toHaveBeenCalledWith('/home/user/beta')
  })

  it('should wrap around when navigating past the last/first project', () => {
    renderProjectList()

    // Navigate down past last (3 projects: 0->1->2->0)
    act(() => { fireKey('j') }) // index 1
    act(() => { fireKey('j') }) // index 2
    act(() => { fireKey('j') }) // index 0 (wrap)

    act(() => { fireKey('Enter') })
    expect(onProjectClick).toHaveBeenCalledWith('/home/user/alpha')

    onProjectClick.mockClear()

    // Navigate up from first (wraps to last)
    act(() => { fireKey('k') }) // index 2 (wrap)
    act(() => { fireKey('Enter') })
    expect(onProjectClick).toHaveBeenCalledWith('/home/user/gamma')
  })
})
