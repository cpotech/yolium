import React, { useCallback, useRef, useEffect, useState } from 'react';

export interface GitConfig {
  name: string;
  email: string;
  githubPat?: string;
}

export interface GitConfigWithPat extends GitConfig {
  hasPat?: boolean;  // Used by IPC to indicate PAT exists without exposing it
}

interface GitConfigDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: GitConfig) => void;
  initialConfig?: GitConfigWithPat | null;
}

export function GitConfigDialog({
  isOpen,
  onClose,
  onSave,
  initialConfig,
}: GitConfigDialogProps): React.ReactElement | null {
  const dialogRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(initialConfig?.name || '');
  const [email, setEmail] = useState(initialConfig?.email || '');
  const [nameError, setNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [githubPat, setGithubPat] = useState('');
  const [showPat, setShowPat] = useState(false);
  const [patError, setPatError] = useState<string | null>(null);
  const [authExpanded, setAuthExpanded] = useState(false);
  const [patCleared, setPatCleared] = useState(false);

  // Name validation: at least 2 chars, no problematic characters
  const validateName = (value: string): { valid: boolean; error?: string } => {
    const trimmed = value.trim();
    if (!trimmed) return { valid: true }; // Empty is handled by isValid check
    if (trimmed.length < 2) {
      return { valid: false, error: 'Name must be at least 2 characters' };
    }
    // Disallow characters that could break git config
    if (/[<>"'\n\r]/.test(trimmed)) {
      return { valid: false, error: 'Name contains invalid characters' };
    }
    return { valid: true };
  };

  // Basic email validation
  const validateEmail = (value: string): boolean => {
    if (!value.trim()) return true; // Empty is handled by isValid check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value.trim());
  };

  // PAT validation: must start with github_pat_ or ghp_
  const validatePat = (value: string): { valid: boolean; error?: string } => {
    if (!value.trim()) return { valid: true }; // Empty is valid (PAT is optional)
    if (!value.startsWith('github_pat_') && !value.startsWith('ghp_')) {
      return { valid: false, error: 'Token must start with "github_pat_" or "ghp_"' };
    }
    return { valid: true };
  };

  // Reset form when dialog opens with new initial values
  useEffect(() => {
    if (isOpen) {
      setName(initialConfig?.name || '');
      setEmail(initialConfig?.email || '');
      setNameError(null);
      setEmailError(null);
      setGithubPat('');
      setShowPat(false);
      setPatError(null);
      setPatCleared(false);
      if (initialConfig?.hasPat) {
        setAuthExpanded(true);
      }
      // Auto-focus name field when opened
      setTimeout(() => nameInputRef.current?.focus(), 50);
    }
  }, [isOpen, initialConfig]);

  const handleNameChange = (value: string) => {
    setName(value);
    const result = validateName(value);
    setNameError(result.error || null);
  };

  const handleEmailChange = (value: string) => {
    setEmail(value);
    if (value.trim() && !validateEmail(value)) {
      setEmailError('Please enter a valid email address');
    } else {
      setEmailError(null);
    }
  };

  const handlePatChange = (value: string) => {
    setGithubPat(value);
    const result = validatePat(value);
    setPatError(result.error || null);
    if (value) setPatCleared(false);
  };

  const handleClearPat = () => {
    setGithubPat('');
    setPatError(null);
    setPatCleared(true);
  };

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (name.trim() && email.trim()) {
        const config: GitConfig = { name: name.trim(), email: email.trim() };
        if (githubPat.trim()) {
          config.githubPat = githubPat.trim();
        } else if (patCleared) {
          config.githubPat = '';  // Explicitly signal to clear the PAT
        }
        onSave(config);
      }
    },
    [name, email, githubPat, patCleared, onSave]
  );

  if (!isOpen) return null;

  const isValid = name.trim().length > 0 && email.trim().length > 0 && validateName(name).valid && validateEmail(email) && validatePat(githubPat).valid;

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <form
        onSubmit={handleSubmit}
        className="bg-gray-800 rounded-lg shadow-xl border border-gray-700 p-6 max-w-md w-full mx-4"
        data-testid="git-config-dialog"
      >
        <h2 className="text-lg font-semibold text-white mb-2">Git Settings</h2>
        <p className="text-sm text-gray-400 mb-4">
          Configure your git identity for commits made in Yolium containers.
        </p>

        <div className="space-y-4">
          <div>
            <label htmlFor="git-name" className="block text-sm font-medium text-gray-300 mb-1">
              Name
            </label>
            <input
              ref={nameInputRef}
              id="git-name"
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Your Name"
              data-testid="git-name-input"
              className={`w-full px-3 py-2 bg-gray-700 border rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                nameError ? 'border-red-500' : 'border-gray-600'
              }`}
            />
            {nameError && (
              <p className="mt-1 text-xs text-red-400">{nameError}</p>
            )}
          </div>

          <div>
            <label htmlFor="git-email" className="block text-sm font-medium text-gray-300 mb-1">
              Email
            </label>
            <input
              id="git-email"
              type="email"
              value={email}
              onChange={(e) => handleEmailChange(e.target.value)}
              placeholder="your@email.com"
              data-testid="git-email-input"
              className={`w-full px-3 py-2 bg-gray-700 border rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                emailError ? 'border-red-500' : 'border-gray-600'
              }`}
            />
            {emailError && (
              <p className="mt-1 text-xs text-red-400">{emailError}</p>
            )}
          </div>

          {/* Collapsible GitHub Authentication Section */}
          <div className="border-t border-gray-700 pt-4">
            <button
              type="button"
              onClick={() => setAuthExpanded(!authExpanded)}
              className="flex items-center gap-2 text-sm font-medium text-gray-300 hover:text-white transition-colors w-full"
            >
              <svg
                className={`w-4 h-4 transition-transform ${authExpanded ? 'rotate-90' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              GitHub Authentication
              {initialConfig?.hasPat && !githubPat && !patCleared && (
                <span className="ml-2 text-xs text-green-400">(configured)</span>
              )}
            </button>

            {authExpanded && (
              <div className="mt-3 space-y-3">
                <div>
                  <label htmlFor="github-pat" className="block text-sm font-medium text-gray-300 mb-1">
                    Personal Access Token (PAT)
                  </label>
                  <div className="relative">
                    <input
                      id="github-pat"
                      type={showPat ? 'text' : 'password'}
                      value={githubPat}
                      onChange={(e) => handlePatChange(e.target.value)}
                      placeholder={initialConfig?.hasPat ? '(keep existing token)' : 'github_pat_XXXXX or ghp_XXXXX'}
                      data-testid="git-pat-input"
                      className={`w-full px-3 py-2 pr-20 bg-gray-700 border rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm ${
                        patError ? 'border-red-500' : 'border-gray-600'
                      }`}
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                      <button
                        type="button"
                        onClick={() => setShowPat(!showPat)}
                        className="p-1 text-gray-400 hover:text-white transition-colors"
                        title={showPat ? 'Hide token' : 'Show token'}
                      >
                        {showPat ? (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        )}
                      </button>
                      {(githubPat || (initialConfig?.hasPat && !patCleared)) && (
                        <button
                          type="button"
                          onClick={handleClearPat}
                          className="p-1 text-gray-400 hover:text-red-400 transition-colors"
                          title="Clear token"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                  {patError && (
                    <p className="mt-1 text-xs text-red-400">{patError}</p>
                  )}
                </div>
                <p className="text-xs text-gray-500">
                  Enables HTTPS git operations with private repos.{' '}
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      window.electronAPI?.openExternal('https://github.com/settings/tokens?type=beta');
                    }}
                    className="text-blue-400 hover:text-blue-300"
                  >
                    Create a Fine-grained PAT
                  </a>
                  {' '}with "Contents" read/write access.
                </p>
              </div>
            )}
          </div>
        </div>

        <p className="mt-4 text-xs text-gray-500">
          Changes apply to new terminals only. Restart existing terminals to use the new settings.
        </p>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            data-testid="git-config-cancel"
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!isValid}
            data-testid="git-config-save"
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
