import { useCallback, useEffect, useMemo, useState } from 'react';
import { normalizePath } from '@shared/lib/path-utils';

type LastAgentMap = Record<string, string>;

function normalizeProjectPath(inputPath: string): string {
  if (!inputPath) return '';
  let normalized = normalizePath(inputPath);
  if (normalized.endsWith('/') && normalized.length > 1) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

export function useLastAgentTracker(projectPaths: string[]) {
  const [lastAgentByProject, setLastAgentByProject] = useState<LastAgentMap>({});

  const normalizedPaths = useMemo(
    () => projectPaths.map(normalizeProjectPath).filter(Boolean),
    [projectPaths]
  );

  const activePathSet = useMemo(() => new Set(normalizedPaths), [normalizedPaths]);

  const refreshProject = useCallback(async (projectPath: string) => {
    const board = await window.electronAPI.kanban.getBoard(projectPath);
    const key = normalizeProjectPath(projectPath);
    if (!key) return;

    setLastAgentByProject(prev => {
      const next = { ...prev };
      if (board?.lastAgentName) {
        next[key] = board.lastAgentName;
      } else {
        delete next[key];
      }
      return next;
    });
  }, []);

  const getLastAgentName = useCallback(
    (projectPath: string) => lastAgentByProject[normalizeProjectPath(projectPath)],
    [lastAgentByProject]
  );

  useEffect(() => {
    if (projectPaths.length === 0) {
      setLastAgentByProject({});
      return;
    }

    let cancelled = false;
    const loadBoards = async () => {
      const entries = await Promise.all(
        projectPaths.map(async (projectPath) => {
          const board = await window.electronAPI.kanban.getBoard(projectPath);
          return {
            key: normalizeProjectPath(projectPath),
            lastAgentName: board?.lastAgentName,
          };
        })
      );

      if (cancelled) return;

      const next: LastAgentMap = {};
      for (const entry of entries) {
        if (entry.key && entry.lastAgentName) {
          next[entry.key] = entry.lastAgentName;
        }
      }
      setLastAgentByProject(next);
    };

    loadBoards();

    return () => {
      cancelled = true;
    };
  }, [projectPaths]);

  useEffect(() => {
    const cleanup = window.electronAPI.kanban.onBoardUpdated((updatedPath) => {
      const normalized = normalizeProjectPath(updatedPath);
      if (!activePathSet.has(normalized)) return;
      refreshProject(updatedPath);
    });

    return cleanup;
  }, [activePathSet, refreshProject]);

  return { getLastAgentName };
}
