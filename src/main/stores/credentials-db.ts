/**
 * @module src/main/stores/credentials-db
 * Service credential CRUD operations.
 */

import type { ServiceCredentials } from '@shared/types/schedule';
import { getDb } from './db-connection';

function loadServiceCredentials(
  database: ReturnType<typeof getDb>,
  specialistId: string,
  serviceId: string
): Record<string, string> {
  const rows = database.prepare(
    'SELECT key, value FROM credentials WHERE specialist_id = ? AND service_id = ?'
  ).all(specialistId, serviceId) as any[];

  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

export function saveCredentials(
  specialistId: string,
  serviceId: string,
  credentials: Record<string, string>
): void {
  if (Object.keys(credentials).length === 0) return;

  const database = getDb();
  const existing = loadServiceCredentials(database, specialistId, serviceId);

  const upsert = database.prepare(
    'INSERT OR REPLACE INTO credentials (specialist_id, service_id, key, value) VALUES (?, ?, ?, ?)'
  );

  for (const [key, value] of Object.entries(credentials)) {
    if (value.length > 0 || !(key in existing)) {
      upsert.run(specialistId, serviceId, key, value);
    }
  }
}

export function loadCredentials(specialistId: string): ServiceCredentials {
  const database = getDb();
  const rows = database.prepare(
    'SELECT service_id, key, value FROM credentials WHERE specialist_id = ?'
  ).all(specialistId) as any[];

  const result: ServiceCredentials = {};
  for (const row of rows) {
    if (!result[row.service_id]) result[row.service_id] = {};
    result[row.service_id][row.key] = row.value;
  }
  return result;
}

export function loadRedactedCredentials(
  specialistId: string
): Record<string, Record<string, boolean>> {
  const credentials = loadCredentials(specialistId);
  const redacted: Record<string, Record<string, boolean>> = {};
  for (const [serviceId, creds] of Object.entries(credentials)) {
    redacted[serviceId] = {};
    for (const [key, value] of Object.entries(creds)) {
      redacted[serviceId][key] = value.length > 0;
    }
  }
  return redacted;
}

export function deleteCredentials(specialistId: string): void {
  const database = getDb();
  database.prepare('DELETE FROM credentials WHERE specialist_id = ?').run(specialistId);
}

export function pruneCredentials(
  specialistId: string,
  integrations: Array<{ service: string; env: Record<string, string> }>
): number {
  const database = getDb();

  const validKeys = new Set<string>();
  for (const integration of integrations) {
    for (const key of Object.keys(integration.env)) {
      validKeys.add(`${integration.service}\0${key}`);
    }
  }

  const rows = database.prepare(
    'SELECT service_id, key FROM credentials WHERE specialist_id = ?'
  ).all(specialistId) as Array<{ service_id: string; key: string }>;

  const del = database.prepare(
    'DELETE FROM credentials WHERE specialist_id = ? AND service_id = ? AND key = ?'
  );

  let deleted = 0;
  for (const row of rows) {
    if (!validKeys.has(`${row.service_id}\0${row.key}`)) {
      del.run(specialistId, row.service_id, row.key);
      deleted++;
    }
  }

  return deleted;
}
