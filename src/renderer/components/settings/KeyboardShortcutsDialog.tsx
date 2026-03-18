import React, { useCallback, useRef, useEffect } from 'react';
import { getActionsForZone, type VimActionZone } from '@shared/vim-actions';

interface KeyboardShortcutsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutItem {
  keys: string;
  description: string;
}

interface ShortcutGroup {
  title: string;
  shortcuts: ShortcutItem[];
}

function buildManifestGroup(title: string, zone: VimActionZone): ShortcutGroup {
  return {
    title,
    shortcuts: getActionsForZone(zone).map(a => ({ keys: a.key, description: a.description })),
  };
}

const shortcutGroups: ShortcutGroup[] = [
  {
    title: 'Vim Modes',
    shortcuts: [
      { keys: 'i', description: 'Enter INSERT mode' },
      { keys: 'Escape', description: 'Return to NORMAL mode' },
      { keys: 'Ctrl+[', description: 'Return to NORMAL mode (alt)' },
    ],
  },
  buildManifestGroup('Zone Switching', 'global'),
  buildManifestGroup('Content (Kanban)', 'content'),
  buildManifestGroup('Tab Bar', 'tabs'),
  buildManifestGroup('Sidebar', 'sidebar'),
  buildManifestGroup('Status Bar', 'status-bar'),
  buildManifestGroup('Dialog (Work Item)', 'dialog'),
  {
    title: 'Kanban Selection',
    shortcuts: [
      { keys: 'Ctrl+Click', description: 'Multi-select items' },
      { keys: 'Shift+Click', description: 'Range select items' },
    ],
  },
  {
    title: 'Tab Management',
    shortcuts: [
      { keys: 'Ctrl+Shift+T', description: 'New tab' },
      { keys: 'Ctrl+Shift+W', description: 'Close tab' },
      { keys: 'Ctrl+Shift+]', description: 'Next tab' },
      { keys: 'Ctrl+Shift+[', description: 'Previous tab' },
      { keys: 'Ctrl+PageDown', description: 'Next tab (alt)' },
      { keys: 'Ctrl+PageUp', description: 'Previous tab (alt)' },
    ],
  },
  {
    title: 'Terminal',
    shortcuts: [
      { keys: 'Ctrl+C', description: 'Copy (with selection) / SIGINT' },
      { keys: 'Ctrl+V', description: 'Paste' },
    ],
  },
  {
    title: 'View',
    shortcuts: [
      { keys: 'Ctrl+Shift+I', description: 'Developer tools' },
      { keys: 'Ctrl++', description: 'Zoom in' },
      { keys: 'Ctrl+-', description: 'Zoom out' },
      { keys: 'Ctrl+0', description: 'Reset zoom' },
      { keys: 'F11', description: 'Toggle fullscreen' },
    ],
  },
  {
    title: 'Application',
    shortcuts: [
      { keys: 'Ctrl+?', description: 'Keyboard shortcuts' },
      { keys: 'Ctrl+Shift+,', description: 'Settings' },
      { keys: 'Ctrl+Shift+N', description: 'New project' },
      { keys: 'Ctrl+Shift+H', description: 'Scheduled agents' },
      { keys: 'Ctrl+Shift+R', description: 'Toggle recording' },
    ],
  },
  {
    title: 'Agent Controls (Work Item)',
    shortcuts: [
      { keys: 'Ctrl+Shift+P', description: 'Plan Agent' },
      { keys: 'Ctrl+Shift+C', description: 'Code Agent' },
      { keys: 'Ctrl+Shift+V', description: 'Verify Agent' },
      { keys: 'Ctrl+Shift+S', description: 'Scout Agent' },
      { keys: 'Ctrl+Shift+D', description: 'Design Agent' },
      { keys: 'Ctrl+Shift+M', description: 'Marketing Agent' },
    ],
  },
];

export function KeyboardShortcutsDialog({
  isOpen,
  onClose,
}: KeyboardShortcutsDialogProps): React.ReactElement | null {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Auto-focus dialog when opened
  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.focus();
    }
  }, [isOpen]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  if (!isOpen) return null;

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60"
      onKeyDown={handleKeyDown}
      onClick={handleBackdropClick}
      tabIndex={-1}
    >
      <div className="bg-[var(--color-bg-secondary)] rounded-lg shadow-xl border border-[var(--color-border-primary)] p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto" data-testid="shortcuts-dialog">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">Keyboard Shortcuts</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {shortcutGroups.map((group) => (
            <div key={group.title}>
              <h3 className="text-sm font-medium text-[var(--color-text-secondary)] mb-2">{group.title}</h3>
              <div className="space-y-1">
                {group.shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.keys}
                    className="flex items-center justify-between py-1"
                  >
                    <span className="text-[var(--color-text-primary)] text-sm">{shortcut.description}</span>
                    <kbd className="px-2 py-0.5 rounded bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] text-xs font-mono border border-[var(--color-border-secondary)]">
                      {shortcut.keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            data-testid="shortcuts-close"
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-md transition-colors"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
