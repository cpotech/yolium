/**
 * @module src/main/services/specialist-readiness
 * Pre-flight readiness check for specialist agents.
 * Validates that all required credentials and tool directories are available
 * before starting a scheduled run, preventing wasted API tokens.
 */

import { resolveToolDir } from './tools-resolver';
import type { SpecialistDefinition, ServiceCredentials } from '@shared/types/schedule';

export interface ReadinessResult {
  ready: boolean;
  reasons: string[];
}

/**
 * Check whether a specialist's dependencies (credentials + tools) are satisfied.
 * Returns { ready: true } if everything is configured, or { ready: false, reasons: [...] }
 * with human-readable reasons for each missing dependency.
 */
export function checkSpecialistReadiness(
  specialist: SpecialistDefinition,
  credentials: ServiceCredentials
): ReadinessResult {
  const reasons: string[] = [];

  if (!specialist.integrations?.length) {
    return { ready: true, reasons: [] };
  }

  for (const integration of specialist.integrations) {
    const serviceId = integration.service;
    const serviceCreds = credentials[serviceId] ?? {};

    // Check each declared env key has a non-empty credential value
    for (const envKey of Object.keys(integration.env)) {
      const value = serviceCreds[envKey];
      if (!value || value.trim() === '') {
        reasons.push(`Missing credentials for ${serviceId}: ${envKey}`);
      }
    }

    // Check each declared tool directory exists on disk
    if (integration.tools) {
      for (const toolName of integration.tools) {
        const toolPath = resolveToolDir(toolName);
        if (!toolPath) {
          reasons.push(`Tool directory not found: ${toolName}`);
        }
      }
    }
  }

  return {
    ready: reasons.length === 0,
    reasons,
  };
}
