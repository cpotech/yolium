import React, { useCallback, useRef, useEffect } from 'react';

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

const shortcutGroups: ShortcutGroup[] = [
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
      { keys: 'Ctrl+R', description: 'Reload' },
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
      { keys: 'Ctrl+Shift+G', description: 'Git settings' },
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onKeyDown={handleKeyDown}
      onClick={handleBackdropClick}
      tabIndex={-1}
    >
      <div className="bg-gray-800 rounded-lg shadow-xl border border-gray-700 p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto" data-testid="shortcuts-dialog">
        <h2 className="text-lg font-semibold text-white mb-4">Keyboard Shortcuts</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {shortcutGroups.map((group) => (
            <div key={group.title}>
              <h3 className="text-sm font-medium text-gray-400 mb-2">{group.title}</h3>
              <div className="space-y-1">
                {group.shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.keys}
                    className="flex items-center justify-between py-1"
                  >
                    <span className="text-gray-300 text-sm">{shortcut.description}</span>
                    <kbd className="px-2 py-0.5 rounded bg-gray-700 text-gray-200 text-xs font-mono border border-gray-600">
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
