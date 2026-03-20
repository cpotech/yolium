/**
 * @vitest-environment jsdom
 *
 * Tests that all dialogs call stopPropagation() on Ctrl+Q keydown events,
 * preventing parent handlers from cascade-closing nested dialogs.
 *
 * Pattern borrowed from GitDiffDialog.test.tsx:141-166.
 */
import React from 'react'
import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { KanbanItem } from '@shared/types/kanban'

// ── Mocks (must be before component imports) ────────────────────────────────

vi.mock('@renderer/context/VimModeContext', async () => {
  const actual = await vi.importActual<typeof import('@renderer/context/VimModeContext')>('@renderer/context/VimModeContext')
  return {
    ...actual,
    useSuspendVimNavigation: vi.fn(),
    useVimModeContext: () => ({
      mode: 'NORMAL' as const,
      activeZone: 'content' as const,
      setActiveZone: vi.fn(),
      enterInsertMode: vi.fn(),
      exitToNormal: vi.fn(),
      suspendNavigation: () => () => {},
    }),
  }
})

vi.mock('@renderer/components/agent/AgentControls', () => ({
  AgentControls: ({ item }: { item: KanbanItem }) => <div data-testid="status-badge">{item.agentStatus}</div>,
}))

vi.mock('@renderer/components/code-review/GitDiffDialog', () => ({
  GitDiffDialog: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
    isOpen ? <div data-testid="git-diff-dialog"><button onClick={onClose}>Close</button></div> : null,
}))

vi.mock('@renderer/components/StatusBar', () => ({
  StatusBar: () => <div data-testid="status-bar-mock" />,
}))

// ── Component imports ───────────────────────────────────────────────────────

import { ConfirmDialog } from '@renderer/components/shared/ConfirmDialog'
import { MockPreviewModal } from '@renderer/components/kanban/MockPreviewModal'
import { KeyboardShortcutsDialog } from '@renderer/components/settings/KeyboardShortcutsDialog'
import { NewItemDialog } from '@renderer/components/kanban/NewItemDialog'
import { AgentSelectDialog } from '@renderer/components/agent/AgentSelectDialog'
import { GitConfigDialog } from '@renderer/components/settings/GitConfigDialog'
import { WhisperModelDialog } from '@renderer/components/settings/WhisperModelDialog'
import { ProjectConfigDialog } from '@renderer/components/settings/ProjectConfigDialog'
import { ItemDetailDialog } from '@renderer/components/kanban/ItemDetailDialog'
import { AddSpecialistDialog } from '@renderer/components/schedule/AddSpecialistDialog'
import { useDirectoryNavigation } from '@renderer/hooks/useDirectoryNavigation'

// ── electronAPI mock ────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  Element.prototype.scrollIntoView = vi.fn()

  Object.defineProperty(window, 'electronAPI', {
    value: {
      fs: {
        readFile: vi.fn().mockResolvedValue({ success: true, content: '<html></html>' }),
        listDirectory: vi.fn().mockResolvedValue([]),
        createDirectory: vi.fn().mockResolvedValue(true),
      },
      kanban: {
        updateItem: vi.fn(),
        deleteItem: vi.fn(),
        addComment: vi.fn(),
      },
      dialog: {
        confirmOkCancel: vi.fn().mockResolvedValue(true),
      },
      git: {
        loadConfig: vi.fn().mockResolvedValue({ providerModels: { claude: ['sonnet'] } }),
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
        listDefinitions: vi.fn().mockResolvedValue([
          { name: 'code-agent', description: 'Code', model: 'sonnet', tools: ['Read'] },
        ]),
        start: vi.fn(),
        resume: vi.fn(),
        stop: vi.fn(),
        answer: vi.fn(),
      },
      app: {
        openExternal: vi.fn(),
      },
      schedule: {
        listSpecialists: vi.fn().mockResolvedValue([]),
        getSpecialists: vi.fn().mockResolvedValue({}),
        getSpecialist: vi.fn().mockResolvedValue(null),
        createSpecialist: vi.fn().mockResolvedValue({ id: 'test' }),
        updateSpecialist: vi.fn(),
      },
      whisper: {
        getModelStatus: vi.fn().mockResolvedValue({ downloaded: false }),
        getBinaryStatus: vi.fn().mockResolvedValue({ installed: false }),
        listModels: vi.fn().mockResolvedValue([]),
        isBinaryAvailable: vi.fn().mockResolvedValue(false),
        onInstallProgress: vi.fn().mockReturnValue(() => {}),
        onDownloadProgress: vi.fn().mockReturnValue(() => {}),
      },
      docker: {
        onBuildProgress: vi.fn().mockReturnValue(() => {}),
        getImageInfo: vi.fn().mockResolvedValue(null),
      },
      projectConfig: {
        load: vi.fn().mockResolvedValue({}),
        save: vi.fn().mockResolvedValue(undefined),
      },
    },
    writable: true,
  })
})

// ── Helper: dispatch Ctrl+Q and check stopPropagation ───────────────────────

function dispatchCtrlQ(element: HTMLElement): boolean {
  let propagationStopped = false
  const event = new KeyboardEvent('keydown', {
    key: 'q',
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  })
  Object.defineProperty(event, 'stopPropagation', {
    value: () => { propagationStopped = true },
    writable: false,
  })
  element.dispatchEvent(event)
  return propagationStopped
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Ctrl+Q stopPropagation across all dialogs', () => {
  it('ConfirmDialog should stop Ctrl+Q propagation', async () => {
    const onCancel = vi.fn()
    render(<ConfirmDialog isOpen={true} title="Test" message="msg" onConfirm={vi.fn()} onCancel={onCancel} />)

    const overlay = screen.getByTestId('confirm-dialog-overlay')
    let stopped = false
    await act(async () => { stopped = dispatchCtrlQ(overlay) })

    expect(stopped).toBe(true)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('MockPreviewModal should stop Ctrl+Q propagation', async () => {
    const onClose = vi.fn()
    render(<MockPreviewModal filePath="/test.html" isOpen={true} onClose={onClose} />)

    const overlay = screen.getByTestId('mock-preview-overlay')
    let stopped = false
    await act(async () => { stopped = dispatchCtrlQ(overlay) })

    expect(stopped).toBe(true)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('KeyboardShortcutsDialog should stop Ctrl+Q propagation', async () => {
    const onClose = vi.fn()
    const { container } = render(<KeyboardShortcutsDialog isOpen={true} onClose={onClose} />)

    const outerDiv = container.firstElementChild as HTMLElement
    let stopped = false
    await act(async () => { stopped = dispatchCtrlQ(outerDiv) })

    expect(stopped).toBe(true)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('NewItemDialog should stop Ctrl+Q propagation', async () => {
    const onClose = vi.fn()
    const { container } = render(
      <NewItemDialog isOpen={true} projectPath="/test" onClose={onClose} onCreated={vi.fn()} />,
    )

    const outerDiv = container.firstElementChild as HTMLElement
    let stopped = false
    await act(async () => { stopped = dispatchCtrlQ(outerDiv) })

    expect(stopped).toBe(true)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('AgentSelectDialog should stop Ctrl+Q propagation', async () => {
    const onBack = vi.fn()
    const { container } = render(
      <AgentSelectDialog
        isOpen={true}
        folderPath="/test"
        gitStatus={{ isRepo: true, hasCommits: true }}
        onSelect={vi.fn()}
        onBack={onBack}
        onCancel={vi.fn()}
      />,
    )

    const outerDiv = container.firstElementChild as HTMLElement
    let stopped = false
    await act(async () => { stopped = dispatchCtrlQ(outerDiv) })

    expect(stopped).toBe(true)
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('GitConfigDialog should stop Ctrl+Q propagation', async () => {
    const onClose = vi.fn()
    render(
      <GitConfigDialog isOpen={true} onClose={onClose} onSave={vi.fn()} />,
    )
    await act(async () => {})

    const dialog = screen.getByTestId('git-config-dialog')
    let stopped = false
    await act(async () => { stopped = dispatchCtrlQ(dialog) })

    expect(stopped).toBe(true)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('WhisperModelDialog should stop Ctrl+Q propagation', async () => {
    const onClose = vi.fn()
    render(
      <WhisperModelDialog
        isOpen={true}
        selectedModel="base"
        downloadProgress={null}
        downloadingModel={null}
        onSelectModel={vi.fn()}
        onDownloadModel={vi.fn()}
        onDeleteModel={vi.fn()}
        onClose={onClose}
      />,
    )

    const dialog = screen.getByTestId('whisper-model-dialog')
    const overlay = dialog.parentElement as HTMLElement
    let stopped = false
    await act(async () => { stopped = dispatchCtrlQ(overlay) })

    expect(stopped).toBe(true)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('ProjectConfigDialog should stop Ctrl+Q propagation', async () => {
    const onClose = vi.fn()
    render(
      <ProjectConfigDialog isOpen={true} projectPath="/test" onClose={onClose} />,
    )
    await act(async () => {})

    const dialog = screen.getByTestId('project-config-dialog')
    let stopped = false
    await act(async () => { stopped = dispatchCtrlQ(dialog) })

    expect(stopped).toBe(true)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('ItemDetailDialog should stop Ctrl+Q propagation so parent handlers are not triggered', async () => {
    const onClose = vi.fn()
    const item: KanbanItem = {
      id: 'item-1',
      title: 'Test Item',
      description: 'Test description',
      column: 'backlog',
      branch: 'feature/test-item',
      agentProvider: 'claude',
      order: 0,
      agentStatus: 'idle',
      comments: [],
      createdAt: '2024-01-15T10:00:00.000Z',
      updatedAt: '2024-01-15T12:00:00.000Z',
    }

    render(<ItemDetailDialog isOpen={true} item={item} projectPath="/test" onClose={onClose} onUpdated={vi.fn()} />)
    await act(async () => {})

    const dialog = screen.getByTestId('item-detail-dialog').parentElement as HTMLElement
    let stopped = false
    await act(async () => { stopped = dispatchCtrlQ(dialog) })

    expect(stopped).toBe(true)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('AddSpecialistDialog should stop Ctrl+Q propagation', async () => {
    const onClose = vi.fn()
    render(<AddSpecialistDialog isOpen={true} onClose={onClose} onCreated={vi.fn()} />)
    await act(async () => {})

    const dialog = screen.getByTestId('add-specialist-dialog')
    let stopped = false
    await act(async () => { stopped = dispatchCtrlQ(dialog) })

    expect(stopped).toBe(true)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('useDirectoryNavigation should stop Ctrl+Q propagation', async () => {
    const onCancel = vi.fn()
    const onConfirm = vi.fn()

    function TestComponent() {
      const nav = useDirectoryNavigation({ onConfirm, onCancel, favorites: [] })
      return <input data-testid="nav-input" value={nav.inputValue} onChange={() => {}} onKeyDown={nav.handleKeyDown} />
    }

    render(<TestComponent />)
    await act(async () => {})

    const input = screen.getByTestId('nav-input')
    let stopped = false
    await act(async () => { stopped = dispatchCtrlQ(input) })

    expect(stopped).toBe(true)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
