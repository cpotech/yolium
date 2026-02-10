import { useEffect, useMemo, useState } from 'react';
import type { AgentTokenUsage } from '@shared/types/agent';

type UsageMap = Record<string, AgentTokenUsage>;

const emptyUsage: AgentTokenUsage = { inputTokens: 0, outputTokens: 0, costUsd: 0 };

export function useAgentCostTracker(activeProjectPaths: string[]) {
  const [usageByProject, setUsageByProject] = useState<UsageMap>({});

  useEffect(() => {
    const cleanup = window.electronAPI.agent.onCostUpdate((_sessionId, projectPath, usage) => {
      if (!projectPath) return;
      setUsageByProject(prev => {
        const current = prev[projectPath] ?? emptyUsage;
        return {
          ...prev,
          [projectPath]: {
            inputTokens: current.inputTokens + usage.inputTokens,
            outputTokens: current.outputTokens + usage.outputTokens,
            costUsd: current.costUsd + usage.costUsd,
          },
        };
      });
    });

    return cleanup;
  }, []);

  useEffect(() => {
    const active = new Set(activeProjectPaths);
    setUsageByProject(prev => {
      if (active.size === 0 && Object.keys(prev).length === 0) {
        return prev;
      }
      const next: UsageMap = {};
      for (const [projectPath, usage] of Object.entries(prev)) {
        if (active.has(projectPath)) {
          next[projectPath] = usage;
        }
      }
      return next;
    });
  }, [activeProjectPaths]);

  const tokenUsageByProject = useMemo(() => usageByProject, [usageByProject]);

  return { tokenUsageByProject };
}
