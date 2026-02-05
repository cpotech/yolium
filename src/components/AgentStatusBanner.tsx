/**
 * @module src/components/AgentStatusBanner
 * Live agent status banner showing current progress.
 */

import React from 'react'
import { Loader2, CheckCircle, XCircle } from 'lucide-react'
import type { LiveAgentStatus } from '../hooks/useAgentSession'

interface AgentStatusBannerProps {
  status: LiveAgentStatus
  detail: string | null
  message: string | null
}

/**
 * Display live agent status with appropriate styling and icons.
 * @param props - Component props
 */
export function AgentStatusBanner({
  status,
  detail,
  message,
}: AgentStatusBannerProps): React.ReactElement | null {
  if (!status) return null

  const bannerClass =
    status === 'completed' ? 'bg-green-900/30 border border-green-700/50 text-green-300' :
    status === 'failed' ? 'bg-red-900/30 border border-red-700/50 text-red-300' :
    'bg-blue-900/30 border border-blue-700/50 text-blue-300'

  return (
    <div
      data-testid="agent-status-banner"
      className={`mt-4 p-3 rounded-md text-sm ${bannerClass}`}
    >
      {status === 'starting' && (
        <span className="flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" />
          Starting agent container...
        </span>
      )}
      {status === 'running' && (
        <span className="flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" />
          {detail || 'Agent is running...'}
        </span>
      )}
      {status === 'completed' && (
        <span className="flex items-center gap-2">
          <CheckCircle size={14} />
          {message || 'Agent completed successfully'}
        </span>
      )}
      {status === 'failed' && (
        <span className="flex items-center gap-2">
          <XCircle size={14} />
          {message ? `Failed: ${message}` : 'Agent failed'}
        </span>
      )}
    </div>
  )
}
