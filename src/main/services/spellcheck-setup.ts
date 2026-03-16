/**
 * @module src/main/services/spellcheck-setup
 * Initializes the Electron built-in spell checker for the session.
 */

interface SpellCheckerSession {
  setSpellCheckerLanguages(languages: string[]): void;
  availableSpellCheckerLanguages: string[];
}

interface SpellCheckerResult {
  availableLanguages: string[];
}

/**
 * Enable the built-in Chromium spell checker for the given session.
 * @param session - Electron session (or mock) with spell checker API
 */
export function initSpellChecker(session: SpellCheckerSession): SpellCheckerResult {
  session.setSpellCheckerLanguages(['en-US']);

  return {
    availableLanguages: session.availableSpellCheckerLanguages,
  };
}
