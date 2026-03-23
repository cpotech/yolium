/**
 * @module src/tests/e2e/helpers/vim-audit
 * Helpers for the bidirectional vim single-key audit.
 *
 * - captureFingerprint / diffFingerprint — DOM state diffing
 * - parseSingleKeyActions — reads vim-actions.ts manifest at test time
 * - pressVimKey — handles special keys (gg, G, /, ?, +, etc.)
 * - FULL_KEY_SET / getUndeclaredKeys — reverse-audit key space
 * - resetZoneState — restore zone after ghost key press
 */

import type { Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DOMFingerprint {
  /** Serialised data-vim-focused attribute values and their testids */
  vimFocused: string[];
  /** Visible dialog/overlay testids */
  visibleDialogs: string[];
  /** Vim mode indicator text */
  modeIndicator: string;
  /** data-vim-zone value of the element with ring-1 class */
  activeZone: string;
  /** Scroll positions of key containers */
  scrollPositions: Record<string, number>;
  /** Text content of status elements */
  statusTexts: Record<string, string>;
  /** All data-testid elements that are visible (limited set for perf) */
  visibleTestIds: string[];
  /** Checked state of checkboxes with data-testid */
  checkedStates: Record<string, boolean>;
  /** Select element values */
  selectValues: Record<string, string>;
}

export interface FingerprintDiff {
  field: string;
  before: string;
  after: string;
}

export interface ManifestAction {
  id: string;
  key: string;
  zone: string;
  mode: string;
  category: string;
}

// ---------------------------------------------------------------------------
// Fingerprint
// ---------------------------------------------------------------------------

export async function captureFingerprint(page: Page): Promise<DOMFingerprint> {
  return page.evaluate(() => {
    const result: {
      vimFocused: string[];
      visibleDialogs: string[];
      modeIndicator: string;
      activeZone: string;
      scrollPositions: Record<string, number>;
      statusTexts: Record<string, string>;
      visibleTestIds: string[];
      checkedStates: Record<string, boolean>;
      selectValues: Record<string, string>;
    } = {
      vimFocused: [],
      visibleDialogs: [],
      modeIndicator: '',
      activeZone: '',
      scrollPositions: {},
      statusTexts: {},
      visibleTestIds: [],
      checkedStates: {},
      selectValues: {},
    };

    // vim-focused elements
    document.querySelectorAll('[data-vim-focused="true"]').forEach((el) => {
      const id = el.getAttribute('data-testid') || el.textContent?.slice(0, 40) || '';
      result.vimFocused.push(id);
    });

    // Visible dialogs
    const dialogSelectors = [
      'new-item-dialog', 'item-detail-dialog', 'shortcuts-dialog',
      'git-config-dialog', 'agent-dialog', 'path-dialog', 'docker-setup-dialog',
      'whisper-model-dialog', 'git-diff-dialog', 'schedule-configure-dialog',
    ];
    for (const ds of dialogSelectors) {
      const el = document.querySelector(`[data-testid="${ds}"]`);
      if (el && (el as HTMLElement).offsetParent !== null) {
        result.visibleDialogs.push(ds);
      }
    }

    // Mode indicator
    const modeEl = document.querySelector('[data-testid="vim-mode-indicator"]');
    result.modeIndicator = modeEl?.textContent?.trim() ?? '';

    // Active zone (ring-1)
    document.querySelectorAll('[data-vim-zone]').forEach((el) => {
      if ((el as HTMLElement).className.includes('ring-1')) {
        result.activeZone = el.getAttribute('data-vim-zone') || '';
      }
    });

    // Scroll positions
    const scrollContainers = [
      'kanban-columns-container', 'schedule-panel', 'agent-log-section',
    ];
    for (const sc of scrollContainers) {
      const el = document.querySelector(`[data-testid="${sc}"]`);
      if (el) {
        result.scrollPositions[sc] = (el as HTMLElement).scrollTop;
      }
    }

    // Status texts
    const statusEls = ['status-path', 'status-branch', 'status-label', 'vim-mode-indicator'];
    for (const se of statusEls) {
      const el = document.querySelector(`[data-testid="${se}"]`);
      if (el) {
        result.statusTexts[se] = el.textContent?.trim() ?? '';
      }
    }

    // Visible test-id elements (limited set for performance)
    const auditIds = [
      'search-input', 'new-item-dialog', 'item-detail-dialog', 'shortcuts-dialog',
      'kanban-card', 'build-progress-overlay', 'schedule-shortcuts-overlay',
      'comment-search-input',
    ];
    for (const aid of auditIds) {
      const el = document.querySelector(`[data-testid="${aid}"]`);
      if (el && (el as HTMLElement).offsetParent !== null) {
        result.visibleTestIds.push(aid);
      }
    }

    // Checkbox states
    document.querySelectorAll('input[type="checkbox"][data-testid]').forEach((el) => {
      result.checkedStates[el.getAttribute('data-testid')!] = (el as HTMLInputElement).checked;
    });

    // Select values
    document.querySelectorAll('select[data-testid]').forEach((el) => {
      result.selectValues[el.getAttribute('data-testid')!] = (el as HTMLSelectElement).value;
    });

    return result;
  });
}

export function diffFingerprint(before: DOMFingerprint, after: DOMFingerprint): FingerprintDiff[] {
  const diffs: FingerprintDiff[] = [];

  const simpleFields: (keyof DOMFingerprint)[] = ['modeIndicator', 'activeZone'];
  for (const f of simpleFields) {
    const b = String(before[f]);
    const a = String(after[f]);
    if (b !== a) diffs.push({ field: f, before: b, after: a });
  }

  const arrayFields: (keyof DOMFingerprint)[] = ['vimFocused', 'visibleDialogs', 'visibleTestIds'];
  for (const f of arrayFields) {
    const b = JSON.stringify(before[f]);
    const a = JSON.stringify(after[f]);
    if (b !== a) diffs.push({ field: f, before: b, after: a });
  }

  const objectFields: (keyof DOMFingerprint)[] = ['scrollPositions', 'statusTexts', 'checkedStates', 'selectValues'];
  for (const f of objectFields) {
    const b = JSON.stringify(before[f]);
    const a = JSON.stringify(after[f]);
    if (b !== a) diffs.push({ field: f, before: b, after: a });
  }

  return diffs;
}

// ---------------------------------------------------------------------------
// Manifest Parser
// ---------------------------------------------------------------------------

/**
 * Parse vim-actions.ts source to extract single-key vim-category actions.
 * Single-key = no modifier (Ctrl/Shift prefix), except uppercase letters
 * (which need Shift but are declared as e.g. "G", "V", "D", "R", "K", "L").
 * Also includes special keys: Enter, Escape, Tab, Home, End, Backspace, Delete, gg.
 */
export function parseSingleKeyActions(filePath?: string): ManifestAction[] {
  const resolvedPath = filePath ?? path.resolve(__dirname, '../../../../src/shared/vim-actions.ts');
  const source = fs.readFileSync(resolvedPath, 'utf-8');

  const actions: ManifestAction[] = [];
  // Match each object literal in the VIM_ACTIONS array
  const entryRegex = /\{\s*id:\s*'([^']+)',\s*key:\s*'([^']+)',\s*zone:\s*'([^']+)',\s*mode:\s*'([^']+)',\s*category:\s*'([^']+)'/g;
  let match: RegExpExecArray | null;

  while ((match = entryRegex.exec(source)) !== null) {
    const [, id, key, zone, mode, category] = match;
    actions.push({ id, key, zone, mode, category });
  }

  // Filter to single-key vim-category actions
  const SINGLE_CHARS = new Set('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/?,.-=;+[]'.split(''));
  const SPECIAL = new Set(['Enter', 'Escape', 'Tab', 'Home', 'End', 'Backspace', 'Delete', 'Space', 'gg']);
  return actions.filter(a =>
    a.category === 'vim' && (SINGLE_CHARS.has(a.key) || SPECIAL.has(a.key))
  );
}

// ---------------------------------------------------------------------------
// Key Press Helper
// ---------------------------------------------------------------------------

/**
 * Press a vim key in Playwright, handling special cases.
 */
export async function pressVimKey(page: Page, key: string): Promise<void> {
  switch (key) {
    case 'gg':
      await page.keyboard.press('g');
      await page.keyboard.press('g');
      break;
    case 'G':
      await page.keyboard.press('Shift+g');
      break;
    case 'V':
      await page.keyboard.press('Shift+v');
      break;
    case 'D':
      await page.keyboard.press('Shift+d');
      break;
    case 'R':
      await page.keyboard.press('Shift+r');
      break;
    case 'K':
      await page.keyboard.press('Shift+k');
      break;
    case 'L':
      await page.keyboard.press('Shift+l');
      break;
    case '/':
      await page.keyboard.press('/');
      break;
    case '?':
      await page.keyboard.press('Shift+/');
      break;
    case '+':
      await page.keyboard.press('Shift+=');
      break;
    case 'Enter':
    case 'Escape':
    case 'Tab':
    case 'Home':
    case 'End':
    case 'Backspace':
    case 'Delete':
    case 'Space':
      await page.keyboard.press(key);
      break;
    default:
      // Single character — uppercase needs Shift
      if (key.length === 1 && key >= 'A' && key <= 'Z') {
        await page.keyboard.press(`Shift+${key.toLowerCase()}`);
      } else {
        await page.keyboard.press(key);
      }
      break;
  }
}

// ---------------------------------------------------------------------------
// Full Key Set for Reverse Audit
// ---------------------------------------------------------------------------

const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz'.split('');
const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const DIGITS = '0123456789'.split('');
const SYMBOLS = ['/', '?', '+', ',', '.', ';', '[', ']', '-', '='];
const SPECIAL_KEYS = ['Backspace', 'Delete', 'Home', 'End', 'Enter', 'Escape', 'Tab', 'Space'];
const MULTI_KEYS = ['gg'];

export const FULL_KEY_SET: string[] = [
  ...LOWERCASE,
  ...UPPERCASE,
  ...DIGITS,
  ...SYMBOLS,
  ...SPECIAL_KEYS,
  ...MULTI_KEYS,
];

/**
 * Global keys that are handled by useVimMode globally and should be excluded
 * from per-zone reverse tests.
 */
export const GLOBAL_KEYS = new Set([
  'i', 'v', 'Escape', 'e', 't', 'c', 's', 'a', 'b', 'Tab',
]);

/**
 * Get keys from FULL_KEY_SET that are NOT declared in the manifest for a given zone,
 * excluding global keys.
 */
export function getUndeclaredKeys(zone: string, manifestActions: ManifestAction[]): string[] {
  const declaredForZone = new Set(
    manifestActions.filter(a => a.zone === zone).map(a => a.key)
  );
  return FULL_KEY_SET.filter(k => !declaredForZone.has(k) && !GLOBAL_KEYS.has(k));
}

// ---------------------------------------------------------------------------
// Zone Reset
// ---------------------------------------------------------------------------

/** Zone key map for re-activating a zone after a ghost key press */
const ZONE_ACTIVATE_KEY: Record<string, string> = {
  sidebar: 'e',
  tabs: 't',
  content: 'c',
  'status-bar': 's',
  schedule: 'a',
};

/**
 * Reset to a known zone state after a potentially-disruptive ghost key press.
 * Presses the zone activation key and waits briefly for DOM to settle.
 */
export async function resetZoneState(page: Page, zone: string): Promise<void> {
  // Close any dialogs that might have opened
  const dialogVisible = await page.evaluate(() => {
    const dialogs = [
      'new-item-dialog', 'item-detail-dialog', 'shortcuts-dialog',
      'schedule-configure-dialog',
    ];
    for (const d of dialogs) {
      const el = document.querySelector(`[data-testid="${d}"]`);
      if (el && (el as HTMLElement).offsetParent !== null) return true;
    }
    return false;
  });

  if (dialogVisible) {
    // Try Escape first, then Ctrl+Q to close
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    // Check again
    const stillVisible = await page.evaluate(() => {
      const dialogs = [
        'new-item-dialog', 'item-detail-dialog', 'shortcuts-dialog',
        'schedule-configure-dialog',
      ];
      for (const d of dialogs) {
        const el = document.querySelector(`[data-testid="${d}"]`);
        if (el && (el as HTMLElement).offsetParent !== null) return true;
      }
      return false;
    });
    if (stillVisible) {
      await page.keyboard.press('Control+q');
      await page.waitForTimeout(100);
    }
  }

  // Re-activate the zone
  const activateKey = ZONE_ACTIVATE_KEY[zone];
  if (activateKey) {
    await pressVimKey(page, activateKey);
    await page.waitForTimeout(50);
  }
}

/**
 * Reset dialog zone state — close search, re-focus editor zone.
 */
export async function resetDialogZoneState(page: Page, subZone: 'editor' | 'sidebar' | 'log'): Promise<void> {
  // Ensure search input is not focused
  await page.evaluate(() => {
    const searchInput = document.querySelector('[data-testid="comment-search-input"]') as HTMLElement | null;
    if (searchInput && document.activeElement === searchInput) {
      searchInput.blur();
    }
  });

  if (subZone === 'editor') {
    // Make sure we're in the editor zone of the dialog
    // Focus the dialog container
    await page.evaluate(() => {
      const dialog = document.querySelector('[data-testid="item-detail-dialog"]') as HTMLElement | null;
      dialog?.focus();
    });
    await page.waitForTimeout(50);
  } else if (subZone === 'sidebar') {
    // Press Tab to toggle to sidebar if not already there
    const inSidebar = await page.evaluate(() => {
      const sz = document.querySelector('[data-testid="sidebar-zone"]');
      return sz?.className.includes('ring-1') ?? false;
    });
    if (!inSidebar) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(50);
    }
  }
}

/**
 * Get actions for a specific zone from the manifest.
 */
export function getActionsForZone(zone: string, manifestActions: ManifestAction[]): ManifestAction[] {
  return manifestActions.filter(a => a.zone === zone);
}
