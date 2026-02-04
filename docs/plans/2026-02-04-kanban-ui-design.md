# Kanban UI Design

**Date:** 2026-02-04
**Status:** Approved

## Overview

Add a sidebar-based navigation to switch between Terminal and Kanban views. The Kanban board displays work items for the active tab's project, with columns for workflow stages.

## Component Architecture

### New Components

| Component | Purpose |
|-----------|---------|
| `Sidebar.tsx` | Collapsible sidebar with Terminal/Kanban navigation |
| `KanbanView.tsx` | Full kanban board with columns and toolbar |
| `KanbanColumn.tsx` | Single column (Backlog, Ready, In Progress, Done) |
| `KanbanCard.tsx` | Individual work item card |
| `NewItemDialog.tsx` | Dialog to create new kanban items |
| `ItemDetailDialog.tsx` | Dialog to view/edit item details |

### Modified Components

| Component | Changes |
|-----------|---------|
| `App.tsx` | Add sidebar, manage active view, track current project path |

### State Management

- Board data fetched via `window.electronAPI.kanbanGetBoard(projectPath)`
- Board updates trigger refresh via `onKanbanBoardUpdated` listener
- Active view stored in component state

## Sidebar & View Switching

### Layout

```
┌─────────────────────────────────────┐
│ Tab Bar (unchanged)                 │
├────────┬────────────────────────────┤
│        │                            │
│ Side-  │  Content Area              │
│ bar    │  - Terminal view (existing)│
│        │  - Kanban view (new)       │
│        │                            │
├────────┴────────────────────────────┤
│ Status Bar (unchanged)              │
└─────────────────────────────────────┘
```

### Sidebar Behavior

- Default state: collapsed (40px wide, icons only)
- Expanded state: 160px wide with labels
- Toggle via chevron button at bottom
- Two navigation items: Terminal (default), Kanban
- Active item highlighted with left border accent

### View Switching Logic

- Terminal view: shows current tab's terminal (existing behavior)
- Kanban view: shows board for the active tab's project path
- Switching tabs while in Kanban view loads that tab's project board
- If no tab is active, Kanban shows empty state

## Kanban Board

### Board Layout

- Toolbar at top: project path display, "Refresh" button, "New Item" button
- Four columns: Backlog → Ready → In Progress → Done
- Columns have colored top borders (gray, blue, yellow, green)
- Horizontal scroll if columns overflow

### Card Display

Each card shows:
- Title (bold, 13px)
- Agent type badge: Claude | Codex | OpenCode | Shell
- Branch name (if set) with git branch icon
- Description preview (2 lines, truncated)
- Status indicator when running

### Agent Status Visual Mapping

| Status | Display |
|--------|---------|
| `idle` | No indicator |
| `running` | Yellow spinner + "Agent working..." |
| `waiting` | Orange badge + "Needs input" |
| `interrupted` | Orange badge + "Interrupted" |
| `completed` | Green checkmark |
| `failed` | Red badge + error icon |

### Card Interactions

- Click card → opens ItemDetailDialog
- No drag-and-drop in v1

## Dialogs

### NewItemDialog

**Fields:**
- Title (required) - text input
- Description (required) - textarea
- Branch (optional) - text input
- Agent Type - select: Claude, Codex, OpenCode, Shell

**Behavior:**
- Opens from "New Item" button in toolbar
- Creates item in Backlog column with `idle` status
- Escape or Cancel closes without saving
- Validation: title and description required

### ItemDetailDialog

**Two-pane layout:**
- Left pane: Title, description (editable), comments list
- Right pane: Status, agent type, branch, timestamps, action buttons

**Actions:**
- Move to column (dropdown or buttons)
- Delete item (with confirmation)
- Save changes

**Comments section (read-only for v1):**
- Shows conversation history from `item.comments`
- Format: `[source]: text` with timestamp

## File Estimates

| File | Lines (est.) |
|------|--------------|
| `src/components/Sidebar.tsx` | ~80 |
| `src/components/KanbanView.tsx` | ~120 |
| `src/components/KanbanColumn.tsx` | ~60 |
| `src/components/KanbanCard.tsx` | ~100 |
| `src/components/NewItemDialog.tsx` | ~150 |
| `src/components/ItemDetailDialog.tsx` | ~200 |

## Not Included (Future Work)

- Drag-and-drop between columns
- Plan Agent "Decompose Goal" dialog with live output
- Question/answer UI for agent interactions
- Running agents from the UI (just viewing status)

## Dependencies

- `lucide-react` (already installed) for icons
