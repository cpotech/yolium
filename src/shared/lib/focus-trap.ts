const FOCUSABLE_SELECTOR = 'input:not(:disabled), textarea:not(:disabled), select:not(:disabled), button:not(:disabled), [tabindex]:not([tabindex="-1"]):not(:disabled)'

/**
 * Checks whether an element is a form field (input, textarea, select, or contentEditable).
 */
function isFormField(el: HTMLElement): boolean {
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (el.isContentEditable || el.getAttribute('contenteditable') === 'true') return true
  return false
}

/**
 * Restores focus after a sub-dialog closes without accidentally triggering
 * form-field onFocus handlers (which can switch vim mode to INSERT).
 *
 * If the target element is a form field, focuses the nearest ancestor with
 * role="dialog" or tabindex="-1" instead. Otherwise focuses the element directly.
 */
export function restoreFocusSafely(element: HTMLElement | null): void {
  if (!element) return

  if (isFormField(element)) {
    const ancestor = element.closest<HTMLElement>('[role="dialog"], [tabindex="-1"]')
    if (ancestor) {
      ancestor.focus()
      return
    }
  }

  element.focus()
}

/**
 * Handles Tab key to trap focus within a container element.
 * Call this from the dialog's onKeyDown handler.
 * Returns true if the event was handled (Tab was trapped).
 */
export function trapFocus(e: KeyboardEvent | React.KeyboardEvent, container: HTMLElement): boolean {
  if (e.key !== 'Tab') return false

  const focusable = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
  if (focusable.length === 0) return false

  const first = focusable[0]
  const last = focusable[focusable.length - 1]

  if (e.shiftKey) {
    // Shift+Tab: if on first element, wrap to last
    if (document.activeElement === first || !container.contains(document.activeElement as Node)) {
      e.preventDefault()
      last.focus()
      return true
    }
  } else {
    // Tab: if on last element, wrap to first
    if (document.activeElement === last || !container.contains(document.activeElement as Node)) {
      e.preventDefault()
      first.focus()
      return true
    }
  }

  return false
}
