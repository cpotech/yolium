# Sidebar Projects Design

## Overview

Transform the sidebar from a view toggle into a project list, where each project can open its own kanban tab in the main tab bar alongside terminal tabs.

## Current State

- Sidebar has two navigation items: Terminal and Kanban
- `activeView` state toggles between `'terminal'` and `'kanban'`
- Kanban view shows the board for the active terminal tab's project (or standalone `kanbanProjectPath`)
- "Create Project" button opens a standalone kanban without a terminal

## New Design

### Sidebar: Project List

The sidebar becomes a list of projects:

```
┌─────────────────┐
│ PROJECTS    [+] │  ← "Add Project" button
├─────────────────┤
│ 📁 my-app     ✕ │  ← Click to open kanban tab, hover for remove
│ 📁 api-server ✕ │
│ 📁 website    ✕ │
└─────────────────┘
```

**Adding projects:**
- Manual: Click [+] button → path dialog → project added to sidebar
- Automatic: Creating a Yolium terminal for a path adds that project to sidebar

**Removing projects:**
- Hover to show ✕ button, or right-click context menu
- Removing a project also closes its kanban tab (if open)
- Terminal tabs for that project remain open (independent)

**Persistence:**
- Project list saved to localStorage
- Restored on app restart

### Tab Bar: Two Tab Types

```
┌──────────────────────────────────────────────────────┐
│ [📁 my-app] [📁 api-server] [▦ my-app] [+]          │
│  ↑ terminal   ↑ terminal     ↑ kanban                │
└──────────────────────────────────────────────────────┘
```

**Terminal tabs (📁 folder icon):**
- Created via "New Yolium" button or Ctrl+Shift+T
- Shows Docker container with agent (unchanged from current)
- Status dot indicates container state

**Kanban tabs (▦ board icon):**
- Created by clicking a project in the sidebar
- Shows that project's kanban board in the main area
- Single instance per project (clicking again focuses existing tab)
- No container, no status dot

### Relationships

| Action | Effect |
|--------|--------|
| Click project in sidebar | Opens/focuses kanban tab for that project |
| Create terminal for path | Adds project to sidebar (if not present) |
| Close terminal tab | Container stops, project stays in sidebar |
| Close kanban tab | Tab closes, project stays in sidebar |
| Remove project from sidebar | Closes kanban tab (if open), terminals unaffected |

## What Gets Removed

- Sidebar view toggle (Terminal/Kanban navigation items)
- `activeView` state in App.tsx
- `kanbanProjectPath` state in App.tsx
- "Create Project" button in EmptyState
- The concept of "standalone kanban project"

## Data Structures

### New: Sidebar Project List

```typescript
// Stored in localStorage key: 'yolium-sidebar-projects'
interface SidebarProject {
  path: string;        // Absolute path to project folder
  addedAt: string;     // ISO timestamp
}

type SidebarProjects = SidebarProject[];
```

### Updated: Tab Types

```typescript
// In src/types/tabs.ts
type TabType = 'terminal' | 'kanban';

interface Tab {
  id: string;
  type: TabType;

  // For terminal tabs
  sessionId?: string;
  containerState?: ContainerState;
  gitBranch?: string;
  worktreeName?: string;

  // For both types
  cwd: string;         // Project path
  label: string;       // Display name (folder name)
}
```

## User Flows

### Flow 1: Start fresh, create a project
1. App opens with empty state (no tabs, no projects)
2. User clicks [+] in sidebar → path dialog opens
3. User selects `/home/user/my-app` → confirms
4. Project added to sidebar
5. Kanban tab opens automatically

### Flow 2: Create terminal, project auto-added
1. User clicks "New Yolium" → path dialog → agent select
2. Terminal tab opens with container
3. Project auto-added to sidebar (if not already present)

### Flow 3: Switch between terminal and kanban
1. Terminal tab open for `my-app`
2. Click `my-app` in sidebar → kanban tab opens/focuses
3. User can click between tabs in tab bar

### Flow 4: Remove a project
1. User hovers over project in sidebar, clicks ✕
2. Project removed from sidebar
3. If kanban tab was open, it closes
4. Any terminal tabs for that project remain open

## Implementation Plan

### Phase 1: Data Layer
- Create `sidebar-store.ts` for project list persistence
- Update `Tab` interface with `type` field
- Add kanban tab support to `useTabState` reducer

### Phase 2: Sidebar Transformation
- Replace view toggle with project list component
- Add project item component with click/remove handlers
- Add "Add Project" button with path dialog integration

### Phase 3: Tab Bar Updates
- Update Tab component to show different icons by type
- Add kanban tab rendering in main content area
- Implement single-instance logic for kanban tabs

### Phase 4: Cleanup
- Remove `activeView` state and related logic
- Remove `kanbanProjectPath` state
- Remove view toggle from Sidebar component
- Update EmptyState to remove "Create Project" button

### Phase 5: Polish
- Add keyboard shortcut for "Add Project" (Ctrl+Shift+P)
- Update session persistence to include sidebar projects
- Test all user flows
