/**
 * @module src/main/stores/registry-db
 * Project registry CRUD operations.
 */

import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { getDb } from './db-connection';

interface ProjectEntry {
  path: string;
  folderName: string;
  lastAccessed: string;
  createdAt: string;
}

interface ProjectRegistry {
  version: 1;
  projects: Record<string, ProjectEntry>;
}

export function loadProjectRegistry(): ProjectRegistry {
  const database = getDb();
  const rows = database.prepare('SELECT * FROM project_registry').all() as any[];

  const projects: Record<string, ProjectEntry> = {};
  for (const row of rows) {
    projects[row.dir_name] = {
      path: row.path,
      folderName: row.folder_name,
      lastAccessed: row.last_accessed,
      createdAt: row.created_at,
    };
  }

  return { version: 1, projects };
}

export function getAllRegisteredPaths(): string[] {
  const database = getDb();
  const rows = database.prepare('SELECT path FROM project_registry').all() as { path: string }[];
  return rows.map((row) => row.path);
}

export function saveProjectRegistry(registry: ProjectRegistry): void {
  const database = getDb();

  const save = database.transaction(() => {
    database.prepare('DELETE FROM project_registry').run();

    const insert = database.prepare(`
      INSERT INTO project_registry (dir_name, path, folder_name, last_accessed, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    for (const [dirName, entry] of Object.entries(registry.projects)) {
      insert.run(dirName, entry.path, entry.folderName, entry.lastAccessed, entry.createdAt);
    }
  });

  save();
}

export function registerProject(projectPath: string): void {
  const database = getDb();
  const absolutePath = path.resolve(projectPath);
  const folderName = path.basename(absolutePath);
  // Generate a simple dir name from the path
  const safeName = folderName.replace(/[^a-zA-Z0-9-_]/g, '_');
  const hash = crypto.createHash('sha256').update(absolutePath).digest('hex').slice(0, 8);
  const dirName = `${safeName}-${hash}`;
  const now = new Date().toISOString();

  // Check for existing entry
  const existing = database.prepare(
    'SELECT created_at FROM project_registry WHERE dir_name = ?'
  ).get(dirName) as { created_at: string } | undefined;

  database.prepare(`
    INSERT OR REPLACE INTO project_registry (dir_name, path, folder_name, last_accessed, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(dirName, absolutePath, folderName, now, existing?.created_at || now);
}
