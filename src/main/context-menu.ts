/**
 * @module src/main/context-menu
 * Builds native right-click context menu items for the renderer webContents.
 */

import type { MenuItemConstructorOptions, WebContents } from 'electron';

interface ContextMenuParams {
  selectionText: string;
  isEditable: boolean;
  misspelledWord?: string;
  dictionarySuggestions?: string[];
}

const MAX_SPELL_SUGGESTIONS = 5;

/**
 * Build an array of menu item templates based on the context-menu event params.
 * - Misspelled word gets spelling suggestions + "Add to Dictionary"
 * - Editable fields get Cut / Paste
 * - Selected text gets Copy
 * - Select All is always present
 */
export function buildContextMenuItems(
  params: ContextMenuParams,
  webContents?: WebContents,
): MenuItemConstructorOptions[] {
  const items: MenuItemConstructorOptions[] = [];

  // Spell check suggestions
  if (params.misspelledWord && webContents) {
    const suggestions = (params.dictionarySuggestions || []).slice(0, MAX_SPELL_SUGGESTIONS);

    if (suggestions.length > 0) {
      for (const suggestion of suggestions) {
        items.push({
          label: suggestion,
          click: () => webContents.replaceMisspelling(suggestion),
        });
      }
    } else {
      items.push({
        label: 'No suggestions',
        enabled: false,
      });
    }

    items.push({
      label: 'Add to Dictionary',
      click: () => webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord!),
    });

    items.push({ type: 'separator' });
  }

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
