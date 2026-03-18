/**
 * Checks if a keyboard event represents the dialog close shortcut (Ctrl+Q or Cmd+Q).
 */
export function isCloseShortcut(e: React.KeyboardEvent | KeyboardEvent): boolean {
  return (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'q'
}
