export interface SidebarProject {
  path: string;
  addedAt: string;
}

const STORAGE_KEY = 'yolium-sidebar-projects';

export function getSidebarProjects(): SidebarProject[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const projects = JSON.parse(stored) as SidebarProject[];
    if (!Array.isArray(projects)) return [];
    return projects;
  } catch {
    return [];
  }
}

export function addSidebarProject(path: string): void {
  const projects = getSidebarProjects();
  if (projects.some(p => p.path === path)) return;

  projects.push({
    path,
    addedAt: new Date().toISOString(),
  });

  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

export function removeSidebarProject(path: string): void {
  const projects = getSidebarProjects();
  const filtered = projects.filter(p => p.path !== path);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}

export function clearSidebarProjects(): void {
  localStorage.removeItem(STORAGE_KEY);
}

// Kanban tab persistence: remember which kanban tabs were open across restarts

const KANBAN_TABS_KEY = 'yolium-open-kanban-tabs';

export function getOpenKanbanPaths(): string[] {
  try {
    const stored = localStorage.getItem(KANBAN_TABS_KEY);
    if (!stored) return [];
    const paths = JSON.parse(stored);
    return Array.isArray(paths) ? paths : [];
  } catch {
    return [];
  }
}

export function saveOpenKanbanPaths(paths: string[]): void {
  localStorage.setItem(KANBAN_TABS_KEY, JSON.stringify(paths));
}
