/**
 * @vitest-environment jsdom
 *
 * Integration test verifying the merge bar mounts above the editor zone
 * when an item has a mergeStatus, and that no merge controls leak into
 * the sidebar zone.
 */
import React from 'react'
import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ItemDetailDialog } from '@renderer/components/kanban/ItemDetailDialog'
import type { KanbanItem } from '@shared/types/kanban'

const mockVimMode = { current: 'NORMAL' as 'NORMAL' | 'INSERT' }

vi.mock('@renderer/context/VimModeContext', async () => {
  const actual = await vi.importActual<typeof import('@renderer/context/VimModeContext')>('@renderer/context/VimModeContext')
  return {
    ...actual,
    useVimModeContext: () => ({
      mode: mockVimMode.current,
      activeZone: 'content' as const,
      setActiveZone: vi.fn(),
      enterInsertMode: vi.fn(),
      exitToNormal: vi.fn(),
      suspendNavigation: () => () => {},
      enterVisualMode: vi.fn(),
    }),
  }
})

vi.mock('@renderer/components/agent/AgentControls', () => ({
  AgentControls: ({ item }: { item: KanbanItem }) => (
    <div data-testid="status-badge">{item.agentStatus}</div>
  ),
}))

vi.mock('@renderer/components/code-review/GitDiffDialog', () => ({
  GitDiffDialog: () => null,
}))

vi.mock('@renderer/components/StatusBar', () => ({
  StatusBar: () => <div data-testid="status-bar-mock" />,
}))

function createMockItem(overrides: Partial<KanbanItem> = {}): KanbanItem {
  return {
    id: 'item-1',
    title: 'Test Item',
    description: 'Test description',
    column: 'verify',
    branch: 'feature/test-item',
    worktreePath: '/tmp/wt',
    agentProvider: 'claude',
    order: 0,
    agentStatus: 'completed',
    mergeStatus: 'unmerged',
    comments: [],
    createdAt: '2024-01-15T10:00:00.000Z',
    updatedAt: '2024-01-15T12:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  Element.prototype.scrollIntoView = vi.fn()
  mockVimMode.current = 'NORMAL'

  Object.defineProperty(window, 'electronAPI', {
    value: {
      kanban: {
        updateItem: vi.fn(),
        deleteItem: vi.fn(),
        addComment: vi.fn(),
      },
      dialog: {
        confirmOkCancel: vi.fn().mockResolvedValue(true),
      },
      git: {
        loadConfig: vi.fn().mockResolvedValue({
          providerModels: {
            claude: ['sonnet'],
            codex: ['gpt-5-codex'],
            opencode: ['open-model'],
          },
        }),
        worktreeChangedFiles: vi.fn().mockResolvedValue({ files: [] }),
        worktreeFileDiff: vi.fn().mockResolvedValue({ diff: '' }),
        worktreeDiffStats: vi.fn(),
        mergeAndPushPR: vi.fn(),
        checkMergeConflicts: vi.fn(),
        rebaseOntoDefault: vi.fn(),
        approvePR: vi.fn(),
        mergePR: vi.fn(),
      },
      agent: {
        onOutput: vi.fn().mockReturnValue(() => {}),
        onProgress: vi.fn().mockReturnValue(() => {}),
        onComplete: vi.fn().mockReturnValue(() => {}),
        onError: vi.fn().mockReturnValue(() => {}),
        onExit: vi.fn().mockReturnValue(() => {}),
        onCostUpdate: vi.fn().mockReturnValue(() => {}),
        getActiveSession: vi.fn().mockResolvedValue(null),
        recover: vi.fn().mockResolvedValue([]),
        readLog: vi.fn().mockResolvedValue(''),
        clearLog: vi.fn().mockResolvedValue(undefined),
        listDefinitions: vi.fn().mockResolvedValue([]),
        start: vi.fn(),
        resume: vi.fn(),
        stop: vi.fn(),
        answer: vi.fn(),
      },
      app: {
        openExternal: vi.fn(),
      },
    },
    writable: true,
  })
})

const dialogProps = {
  isOpen: true,
  projectPath: '/test/project',
  onClose: vi.fn(),
  onUpdated: vi.fn(),
}

describe('ItemDetailDialog - merge bar mount', () => {
  it('renders merge-bar when mergeStatus is set', () => {
    render(<ItemDetailDialog {...dialogProps} item={createMockItem()} />)
    expect(screen.getByTestId('merge-bar')).toBeInTheDocument()
  })

  it('does not render merge-bar when mergeStatus is undefined', () => {
    render(<ItemDetailDialog {...dialogProps} item={createMockItem({ mergeStatus: undefined })} />)
    expect(screen.queryByTestId('merge-bar')).not.toBeInTheDocument()
  })

  it('does not render merge-bar when branch is undefined', () => {
    render(<ItemDetailDialog {...dialogProps} item={createMockItem({ branch: undefined })} />)
    expect(screen.queryByTestId('merge-bar')).not.toBeInTheDocument()
  })

  it('mounts merge-bar above editor-zone in DOM order', () => {
    render(<ItemDetailDialog {...dialogProps} item={createMockItem()} />)
    const bar = screen.getByTestId('merge-bar')
    const editor = screen.getByTestId('editor-zone')
    // Compare DOM order: bar should appear before editor zone
    const position = bar.compareDocumentPosition(editor)
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('places no merge buttons inside sidebar-zone', () => {
    render(<ItemDetailDialog {...dialogProps} item={createMockItem()} />)
    const sidebar = screen.getByTestId('sidebar-zone')
    expect(within(sidebar).queryByTestId('compare-changes-button')).not.toBeInTheDocument()
    expect(within(sidebar).queryByTestId('merge-locally-button')).not.toBeInTheDocument()
    expect(within(sidebar).queryByTestId('merge-button')).not.toBeInTheDocument()
    expect(within(sidebar).queryByTestId('check-conflicts-button')).not.toBeInTheDocument()
    expect(within(sidebar).queryByTestId('pull-latest-button')).not.toBeInTheDocument()
  })

  it('keeps non-merge sidebar sections (Configuration, Info, Footer) intact', () => {
    render(<ItemDetailDialog {...dialogProps} item={createMockItem()} />)
    const sidebar = screen.getByTestId('sidebar-zone')
    // Configuration: agent provider select still present
    expect(within(sidebar).getByTestId('agent-provider-select')).toBeInTheDocument()
    // Info: branch display still present
    expect(within(sidebar).getByTestId('branch-display')).toBeInTheDocument()
    // Footer: delete button still present
    expect(within(sidebar).getByTestId('delete-button')).toBeInTheDocument()
  })
})
