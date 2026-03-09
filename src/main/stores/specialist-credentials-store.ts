/**
 * @module src/main/stores/specialist-credentials-store
 * Secure JSON file store for per-specialist service credentials.
 * Stored at ~/.yolium/specialist-credentials.json with 0o600 permissions.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { ServiceCredentials } from '@shared/types/schedule';

type CredentialsData = Record<string, ServiceCredentials>;

function getCredentialsPath(): string {
  return path.join(os.homedir(), '.yolium', 'specialist-credentials.json');
}

function readStore(): CredentialsData {
  const filePath = getCredentialsPath();
  if (!fs.existsSync(filePath)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return {};
  }
}

function writeStore(data: CredentialsData): void {
  const filePath = getCredentialsPath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), { mode: 0o600 });
}

export function saveCredentials(
  specialistId: string,
  serviceId: string,
  credentials: Record<string, string>
): void {
  const store = readStore();
  if (!store[specialistId]) {
    store[specialistId] = {};
  }
  store[specialistId][serviceId] = credentials;
  writeStore(store);
}

export function loadCredentials(specialistId: string): ServiceCredentials {
  const store = readStore();
  return store[specialistId] || {};
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
  const store = readStore();
  delete store[specialistId];
  writeStore(store);
}
