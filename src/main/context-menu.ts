/**
 * @module src/main/context-menu
 * Builds native right-click context menu items for the renderer webContents.
 */

import type { MenuItemConstructorOptions } from 'electron';

interface ContextMenuParams {
  selectionText: string;
  isEditable: boolean;
}

/**
 * Build an array of menu item templates based on the context-menu event params.
 * - Editable fields get Cut / Paste
 * - Selected text gets Copy
 * - Select All is always present
 */
export function buildContextMenuItems(
  params: ContextMenuParams,
): MenuItemConstructorOptions[] {
  const items: MenuItemConstructorOptions[] = [];

  if (params.isEditable) {
    items.push({ role: 'cut' });
  }

  if (params.selectionText) {
    items.push({ role: 'copy' });
  }

  if (params.isEditable) {
    items.push({ role: 'paste' });
  }

  if (items.length > 0) {
    items.push({ type: 'separator' });
  }

  items.push({ role: 'selectAll' });

  return items;
}
