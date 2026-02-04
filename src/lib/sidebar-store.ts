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
