import React, { useCallback, useRef, useEffect, useState } from 'react';
import type { GitConfigWithPat } from '@shared/types/git';
import { trapFocus } from '@shared/lib/focus-trap';
import { isCloseShortcut } from '@renderer/lib/dialog-shortcuts';
import { useDialogScroll } from '@renderer/hooks/useDialogScroll';
import { useSuspendVimNavigation } from '@renderer/context/VimModeContext';

export type { GitConfigWithPat } from '@shared/types/git';

interface GitConfigDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: { githubPat?: string; openaiApiKey?: string; anthropicApiKey?: string; useClaudeOAuth?: boolean; useCodexOAuth?: boolean; providerModelDefaults?: Record<string, string>; providerModels?: Record<string, string[]> }) => void;
  initialConfig?: GitConfigWithPat | null;
  onDeleteImage?: () => void;
  onBuildImage?: () => void;
  imageRemoved?: boolean;
  isRebuilding?: boolean;
}

/**
 * Get source display text and color for a field
 */
function getSourceDisplay(source?: 'system' | 'environment' | 'yolium'): { text: string; color: string } {
  if (!source) return { text: '', color: '' };

  switch (source) {
    case 'system':
      return { text: ' (from Git)', color: 'text-blue-400' };
    case 'environment':
      return { text: ' (from env)', color: 'text-green-400' };
    case 'yolium':
      return { text: ' (saved)', color: 'text-yellow-400' };
    default:
      return { text: '', color: '' };
  }
}

export function GitConfigDialog({
  isOpen,
  onClose,
  onSave,
  initialConfig,
  onDeleteImage,
  onBuildImage,
  imageRemoved = false,
  isRebuilding = false,
}: GitConfigDialogProps): React.ReactElement | null {
  useSuspendVimNavigation(isOpen);

  const dialogRef = useRef<HTMLFormElement>(null);
  const patInputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const { handleKeyDown: scrollKeyDown } = useDialogScroll(bodyRef);

  const [githubPat, setGithubPat] = useState('');
  const [showPat, setShowPat] = useState(false);
  const [patError, setPatError] = useState<string | null>(null);
  const [patCleared, setPatCleared] = useState(false);
  const [anthropicApiKey, setAnthropicApiKey] = useState('');
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [anthropicKeyError, setAnthropicKeyError] = useState<string | null>(null);
  const [anthropicKeyCleared, setAnthropicKeyCleared] = useState(false);
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [openaiKeyError, setOpenaiKeyError] = useState<string | null>(null);
  const [openaiKeyCleared, setOpenaiKeyCleared] = useState(false);
  const [useClaudeOAuth, setUseClaudeOAuth] = useState(false);
  const [useCodexOAuth, setUseCodexOAuth] = useState(false);
  const [providerModelDefaults, setProviderModelDefaults] = useState<Record<string, string>>({});
  const [providerModels, setProviderModels] = useState<Record<string, string[]>>({});
  const [newModelInputs, setNewModelInputs] = useState<Record<string, string>>({});
  const [dockerImageInfo, setDockerImageInfo] = useState<{ name: string; size: number; created: string; stale: boolean } | null>(null);
  const [dockerImageLoading, setDockerImageLoading] = useState(false);
  const [dockerImageError, setDockerImageError] = useState(false);

  // PAT validation: must be a valid github_pat_ or ghp_ token (alphanumeric + underscores only)
  const validatePat = (value: string): { valid: boolean; error?: string } => {
    if (!value.trim()) return { valid: true }; // Empty is valid (PAT is optional)
    const trimmed = value.trim();
    if (!trimmed.startsWith('github_pat_') && !trimmed.startsWith('ghp_')) {
      return { valid: false, error: 'Token must start with "github_pat_" or "ghp_"' };
    }
    if (/[@:\/]/.test(trimmed)) {
      return { valid: false, error: 'Paste only the token, not a URL (remove @github.com or similar)' };
    }
    if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) {
      return { valid: false, error: 'Token should only contain letters, numbers, underscores, and hyphens' };
    }
    return { valid: true };
  };

  // Anthropic API key validation: must start with sk-ant-
  const validateAnthropicKey = (value: string): { valid: boolean; error?: string } => {
    if (!value.trim()) return { valid: true }; // Empty is valid (key is optional)
    if (!value.startsWith('sk-ant-')) {
      return { valid: false, error: 'Key must start with "sk-ant-"' };
    }
    return { valid: true };
  };

  // OpenAI API key validation: must start with sk-
  const validateOpenaiKey = (value: string): { valid: boolean; error?: string } => {
    if (!value.trim()) return { valid: true }; // Empty is valid (key is optional)
    if (!value.startsWith('sk-')) {
      return { valid: false, error: 'Key must start with "sk-"' };
    }
    return { valid: true };
  };

  // Fetch Docker image info with a single retry on failure
  const fetchDockerImageInfo = useCallback(async () => {
    setDockerImageLoading(true);
    setDockerImageError(false);

    const MAX_ATTEMPTS = 2;
    const RETRY_DELAY_MS = 1000;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const info = await window.electronAPI.docker.getImageInfo();
        setDockerImageInfo(info);
        setDockerImageLoading(false);
        return;
      } catch {
        if (attempt < MAX_ATTEMPTS) {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        }
      }
    }

    // All attempts failed
    setDockerImageLoading(false);
    setDockerImageError(true);
  }, []);

  // Re-fetch image info when a build completes while dialog is open
  useEffect(() => {
    if (!isOpen) return;
    const cleanup = window.electronAPI.docker.onBuildProgress((message) => {
      if (message === 'Image built successfully!' || message === 'Image is up to date.') {
        fetchDockerImageInfo();
      }
    });
    return cleanup;
  }, [isOpen, fetchDockerImageInfo]);

  // Reset form when dialog opens with new initial values
  useEffect(() => {
    if (isOpen) {
      setGithubPat('');
      setShowPat(false);
      setPatError(null);
      setPatCleared(false);
      setAnthropicApiKey('');
      setShowAnthropicKey(false);
      setAnthropicKeyError(null);
      setAnthropicKeyCleared(false);
      setOpenaiApiKey('');
      setShowOpenaiKey(false);
      setOpenaiKeyError(null);
      setOpenaiKeyCleared(false);
      setUseClaudeOAuth(initialConfig?.useClaudeOAuth ?? false);
      setUseCodexOAuth(initialConfig?.useCodexOAuth ?? false);
      setProviderModelDefaults(initialConfig?.providerModelDefaults ?? {});
      // Initialize providerModels from config, with migration from providerModelDefaults
      if (initialConfig?.providerModels) {
        setProviderModels(initialConfig.providerModels);
      } else if (initialConfig?.providerModelDefaults) {
        const migrated: Record<string, string[]> = {};
        for (const [provider, model] of Object.entries(initialConfig.providerModelDefaults)) {
          if (model) migrated[provider] = [model];
        }
        setProviderModels(migrated);
      } else {
        setProviderModels({});
      }
      setNewModelInputs({});
      // Fetch Docker image info with retry
      setDockerImageLoading(true);
      setDockerImageError(false);
      setDockerImageInfo(null);
      fetchDockerImageInfo();
      // Focus dialog wrapper immediately for keyboard events (e.g. Escape)
      dialogRef.current?.focus();
      // Then move focus to PAT field for better UX
      setTimeout(() => patInputRef.current?.focus(), 50);
    }
  }, [isOpen, initialConfig, fetchDockerImageInfo]);

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

  const handleAnthropicKeyChange = (value: string) => {
    setAnthropicApiKey(value);
    const result = validateAnthropicKey(value);
    setAnthropicKeyError(result.error || null);
    if (value) {
      setAnthropicKeyCleared(false);
      setUseClaudeOAuth(false);  // Mutual exclusion: typing API key disables OAuth
    }
  };

  const handleClearAnthropicKey = () => {
    setAnthropicApiKey('');
    setAnthropicKeyError(null);
    setAnthropicKeyCleared(true);
  };

  const handleOpenaiKeyChange = (value: string) => {
    setOpenaiApiKey(value);
    const result = validateOpenaiKey(value);
    setOpenaiKeyError(result.error || null);
    if (value) {
      setOpenaiKeyCleared(false);
      setUseCodexOAuth(false);  // Mutual exclusion: typing API key disables OAuth
    }
  };

  const handleClearOpenaiKey = () => {
    setOpenaiApiKey('');
    setOpenaiKeyError(null);
    setOpenaiKeyCleared(true);
  };

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      scrollKeyDown(e);
      if (isCloseShortcut(e)) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (dialogRef.current) {
        trapFocus(e, dialogRef.current);
      }
    },
    [onClose, scrollKeyDown]
  );

    const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const config: { githubPat?: string; openaiApiKey?: string; anthropicApiKey?: string; useClaudeOAuth?: boolean; useCodexOAuth?: boolean; providerModelDefaults?: Record<string, string>; providerModels?: Record<string, string[]> } = {};
      if (githubPat.trim()) {
        config.githubPat = githubPat.trim();
      } else if (patCleared) {
        config.githubPat = '';  // Explicitly signal to clear the PAT
      }
      if (useClaudeOAuth) {
        config.useClaudeOAuth = true;
        config.anthropicApiKey = '';  // Clear API key when OAuth is enabled
      } else {
        config.useClaudeOAuth = false;
        if (anthropicApiKey.trim()) {
          config.anthropicApiKey = anthropicApiKey.trim();
        } else if (anthropicKeyCleared) {
          config.anthropicApiKey = '';  // Explicitly signal to clear the key
        }
      }
      if (useCodexOAuth) {
        config.useCodexOAuth = true;
        config.openaiApiKey = '';  // Clear API key when OAuth is enabled
      } else {
        config.useCodexOAuth = false;
        if (openaiApiKey.trim()) {
          config.openaiApiKey = openaiApiKey.trim();
        } else if (openaiKeyCleared) {
          config.openaiApiKey = '';  // Explicitly signal to clear the key
        }
      }
      // Sync providerModelDefaults from providerModels (first model = default)
      const syncedDefaults: Record<string, string> = {};
      for (const [provider, models] of Object.entries(providerModels)) {
        if (models.length > 0) {
          syncedDefaults[provider] = models[0];
        }
      }
      config.providerModelDefaults = syncedDefaults;
      config.providerModels = providerModels;
      onSave(config);
    },
    [githubPat, patCleared, useClaudeOAuth, anthropicApiKey, anthropicKeyCleared, useCodexOAuth, openaiApiKey, openaiKeyCleared, providerModels, onSave]
  );

  if (!isOpen) return null;

  const isValid = validatePat(githubPat).valid && (useClaudeOAuth || validateAnthropicKey(anthropicApiKey).valid) && (useCodexOAuth || validateOpenaiKey(openaiApiKey).valid);

  // Show derived identity when PAT is configured and not being cleared
  const showIdentity = initialConfig?.githubLogin && !patCleared;

  return (
    <div className="fixed inset-0 z-[60] bg-black/60" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form
        ref={dialogRef}
        onSubmit={handleSubmit}
        onKeyDown={handleKeyDown}
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="git-config-title"
        aria-describedby="git-config-description"
        className="flex h-full flex-col bg-[var(--color-bg-secondary)]"
        data-testid="git-config-dialog"
      >
        <div
          className="sticky top-0 z-10 border-b border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]/95 backdrop-blur"
          data-testid="git-config-header"
        >
          <div className="mx-auto flex w-full max-w-6xl items-start justify-between gap-4 px-4 py-4 sm:px-6">
            <div>
              <h2 id="git-config-title" className="text-lg font-semibold text-[var(--color-text-primary)]">Settings</h2>
              <p id="git-config-description" className="text-sm text-[var(--color-text-secondary)] mt-1">
                Configure credentials for Yolium containers.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="text-xs bg-[var(--color-bg-tertiary)] px-1.5 py-0.5 rounded text-[var(--color-text-muted)]">Ctrl+Q</kbd>
              <button
                type="button"
                onClick={onClose}
                data-testid="git-config-close"
                className="mt-0.5 rounded-md p-2 text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)]"
                aria-label="Close settings"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto" ref={bodyRef} data-testid="git-config-body">
          <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <section className="rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)]/50 p-4 sm:p-5 lg:col-span-2">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">GitHub Access</h3>
                  <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                    Personal access token for HTTPS git operations and git identity derivation.
                  </p>
                </div>
                <label htmlFor="github-pat" className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
                  GitHub PAT
                  {initialConfig?.hasPat && !githubPat && !patCleared && (
                    <span className="ml-2 text-xs text-green-400">
                      {initialConfig?.sources?.githubPat
                        ? getSourceDisplay(initialConfig.sources.githubPat).text
                        : '(configured)'}
                    </span>
                  )}
                </label>
                <div className="relative">
                  <input
                    ref={patInputRef}
                    id="github-pat"
                    type={showPat ? 'text' : 'password'}
                    value={githubPat}
                    onChange={(e) => handlePatChange(e.target.value)}
                    placeholder={initialConfig?.hasPat ? '(keep existing token)' : 'github_pat_XXXXX or ghp_XXXXX'}
                    data-testid="git-pat-input"
                    spellCheck={false}
                    className={`w-full px-3 py-2 pr-20 bg-[var(--color-bg-tertiary)] border rounded-md text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm ${
                      patError ? 'border-red-500' : 'border-[var(--color-border-secondary)]'
                    }`}
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                    <button
                      type="button"
                      onClick={() => setShowPat(!showPat)}
                      className="p-1 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
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
                        className="p-1 text-[var(--color-text-secondary)] hover:text-red-400 transition-colors"
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
                <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                  Enables HTTPS git operations and derives your git identity.{' '}
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      window.electronAPI?.app.openExternal('https://github.com/settings/tokens?type=beta');
                    }}
                    className="text-blue-400 hover:text-blue-300"
                  >
                    Create a Fine-grained PAT
                  </a>
                  {' '}with "Contents" read/write access.
                </p>
                {showIdentity && (
                  <div className="mt-4 px-3 py-2 bg-[var(--color-bg-tertiary)]/70 rounded-md" data-testid="github-identity">
                    <p className="text-sm text-green-400">
                      Authenticated as <span className="font-mono font-semibold">{initialConfig?.githubLogin}</span>
                    </p>
                    {initialConfig?.name && (
                      <p className="text-xs text-[var(--color-text-secondary)] mt-1">{initialConfig.name} &lt;{initialConfig.email}&gt;</p>
                    )}
                  </div>
                )}
              </section>

              <section className="rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)]/50 p-4 sm:p-5">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Claude Authentication</h3>
                  <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                    Use Claude Max OAuth or an Anthropic API key.
                  </p>
                </div>
                <div className="rounded-md border border-[var(--color-border-primary)] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <label htmlFor="claude-oauth-toggle" className="text-sm font-medium text-[var(--color-text-primary)]">
                        Claude Max (OAuth)
                      </label>
                      <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                        Use your Claude Max subscription instead of an API key
                      </p>
                    </div>
                    <button
                      id="claude-oauth-toggle"
                      type="button"
                      role="switch"
                      aria-checked={useClaudeOAuth}
                      disabled={!initialConfig?.hasClaudeOAuth && !useClaudeOAuth}
                      onClick={() => {
                        const newValue = !useClaudeOAuth;
                        setUseClaudeOAuth(newValue);
                        if (newValue) {
                          // Mutual exclusion: enabling OAuth clears Anthropic key
                          setAnthropicApiKey('');
                          setAnthropicKeyError(null);
                          setAnthropicKeyCleared(true);
                        }
                      }}
                      data-testid="claude-oauth-toggle"
                      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-[var(--color-bg-secondary)] ${
                        useClaudeOAuth ? 'bg-blue-600' : 'bg-[var(--color-bg-hover)]'
                      } ${!initialConfig?.hasClaudeOAuth && !useClaudeOAuth ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform ring-0 transition duration-200 ease-in-out ${
                          useClaudeOAuth ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                  {!initialConfig?.hasClaudeOAuth && !useClaudeOAuth && (
                    <p className="mt-2 text-xs text-yellow-400">
                      No OAuth credentials found. Run <span className="font-mono">claude</span> on your host to authenticate first.
                    </p>
                  )}
                </div>
                <div className="mt-4">
                  <label htmlFor="anthropic-key" className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
                    Anthropic API Key
                    {useClaudeOAuth && (
                      <span className="ml-2 text-xs text-blue-400">(using OAuth)</span>
                    )}
                    {!useClaudeOAuth && initialConfig?.hasAnthropicKey && !anthropicApiKey && !anthropicKeyCleared && (
                      <span className="ml-2 text-xs text-green-400">
                        {initialConfig?.sources?.anthropicApiKey
                          ? getSourceDisplay(initialConfig.sources.anthropicApiKey).text
                          : '(configured)'}
                      </span>
                    )}
                  </label>
                  <div className="relative">
                    <input
                      id="anthropic-key"
                      type={showAnthropicKey ? 'text' : 'password'}
                      value={anthropicApiKey}
                      onChange={(e) => handleAnthropicKeyChange(e.target.value)}
                      placeholder={useClaudeOAuth ? '(disabled — using OAuth)' : initialConfig?.hasAnthropicKey ? '(keep existing key)' : 'sk-ant-...'}
                      disabled={useClaudeOAuth}
                      data-testid="anthropic-key-input"
                      spellCheck={false}
                      className={`w-full px-3 py-2 pr-20 bg-[var(--color-bg-tertiary)] border rounded-md text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm ${
                        anthropicKeyError ? 'border-red-500' : 'border-[var(--color-border-secondary)]'
                      } ${useClaudeOAuth ? 'opacity-50 cursor-not-allowed' : ''}`}
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                      {!useClaudeOAuth && (
                        <button
                          type="button"
                          onClick={() => setShowAnthropicKey(!showAnthropicKey)}
                          className="p-1 text-[var(--color-text-secondary)] hover:text-white transition-colors"
                        >
                          {showAnthropicKey ? (
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
                      )}
                      {!useClaudeOAuth && (anthropicApiKey || (initialConfig?.hasAnthropicKey && !anthropicKeyCleared)) && (
                        <button
                          type="button"
                          onClick={handleClearAnthropicKey}
                          className="p-1 text-[var(--color-text-secondary)] hover:text-red-400 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                  {!useClaudeOAuth && anthropicKeyError && (
                    <p className="mt-1 text-xs text-red-400">{anthropicKeyError}</p>
                  )}
                  <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                    {useClaudeOAuth
                      ? 'Claude Code will use your Claude Max OAuth session.'
                      : 'Required for Claude Code and OpenCode agents.'}
                  </p>
                </div>
              </section>

              <section className="rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)]/50 p-4 sm:p-5">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Codex Authentication</h3>
                  <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                    Use ChatGPT OAuth or an OpenAI API key.
                  </p>
                </div>
                <div className="rounded-md border border-[var(--color-border-primary)] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <label htmlFor="codex-oauth-toggle" className="text-sm font-medium text-[var(--color-text-primary)]">
                        Codex OAuth (ChatGPT)
                      </label>
                      <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                        Use your ChatGPT login instead of an OpenAI API key
                      </p>
                    </div>
                    <button
                      id="codex-oauth-toggle"
                      type="button"
                      role="switch"
                      aria-checked={useCodexOAuth}
                      disabled={!initialConfig?.hasCodexOAuth && !useCodexOAuth}
                      onClick={() => {
                        const newValue = !useCodexOAuth;
                        setUseCodexOAuth(newValue);
                        if (newValue) {
                          // Mutual exclusion: enabling OAuth clears OpenAI key
                          setOpenaiApiKey('');
                          setOpenaiKeyError(null);
                          setOpenaiKeyCleared(true);
                        }
                      }}
                      data-testid="codex-oauth-toggle"
                      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-[var(--color-bg-secondary)] ${
                        useCodexOAuth ? 'bg-blue-600' : 'bg-[var(--color-bg-hover)]'
                      } ${!initialConfig?.hasCodexOAuth && !useCodexOAuth ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform ring-0 transition duration-200 ease-in-out ${
                          useCodexOAuth ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                  {!initialConfig?.hasCodexOAuth && !useCodexOAuth && (
                    <p className="mt-2 text-xs text-yellow-400">
                      No OAuth credentials found. Run <span className="font-mono">codex login</span> on your host to authenticate first.
                    </p>
                  )}
                </div>
                <div className="mt-4">
                  <label htmlFor="openai-key" className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
                    OpenAI API Key
                    {useCodexOAuth && (
                      <span className="ml-2 text-xs text-blue-400">(using OAuth)</span>
                    )}
                    {!useCodexOAuth && initialConfig?.hasOpenaiKey && !openaiApiKey && !openaiKeyCleared && (
                      <span className="ml-2 text-xs text-green-400">
                        {initialConfig?.sources?.openaiApiKey
                          ? getSourceDisplay(initialConfig.sources.openaiApiKey).text
                          : '(configured)'}
                      </span>
                    )}
                  </label>
                  <div className="relative">
                    <input
                      id="openai-key"
                      type={showOpenaiKey ? 'text' : 'password'}
                      value={openaiApiKey}
                      onChange={(e) => handleOpenaiKeyChange(e.target.value)}
                      placeholder={useCodexOAuth ? '(disabled — using OAuth)' : initialConfig?.hasOpenaiKey ? '(keep existing key)' : 'sk-...'}
                      disabled={useCodexOAuth}
                      data-testid="openai-key-input"
                      spellCheck={false}
                      className={`w-full px-3 py-2 pr-20 bg-[var(--color-bg-tertiary)] border rounded-md text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm ${
                        openaiKeyError ? 'border-red-500' : 'border-[var(--color-border-secondary)]'
                      } ${useCodexOAuth ? 'opacity-50 cursor-not-allowed' : ''}`}
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                      {!useCodexOAuth && (
                        <button
                          type="button"
                          onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                          className="p-1 text-[var(--color-text-secondary)] hover:text-white transition-colors"
                        >
                          {showOpenaiKey ? (
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
                      )}
                      {!useCodexOAuth && (openaiApiKey || (initialConfig?.hasOpenaiKey && !openaiKeyCleared)) && (
                        <button
                          type="button"
                          onClick={handleClearOpenaiKey}
                          className="p-1 text-[var(--color-text-secondary)] hover:text-red-400 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                  {!useCodexOAuth && openaiKeyError && (
                    <p className="mt-1 text-xs text-red-400">{openaiKeyError}</p>
                  )}
                  <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                    {useCodexOAuth
                      ? 'Codex will use your ChatGPT OAuth session.'
                      : 'Required for the Codex agent. Passed only to Codex containers.'}
                  </p>
                </div>
              </section>

              <section className="rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)]/50 p-4 sm:p-5 lg:col-span-2">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Models per Provider</h3>
                  <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                    Add models for each provider. The first model is used as the default. Per-item model overrides still take priority. OpenCode models use provider/model format (e.g., opencode/big-pickle).
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  {[
                    { key: 'claude', label: 'Claude', placeholder: 'e.g., claude-opus-4-6' },
                    { key: 'codex', label: 'Codex', placeholder: 'e.g., o3-mini, gpt-4o' },
                    { key: 'opencode', label: 'OpenCode', placeholder: 'e.g., opencode/big-pickle' },
                  ].map(({ key, label, placeholder }) => (
                    <div key={key}>
                      <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
                        {label} Models
                      </label>
                      {/* Model list */}
                      <div className="space-y-1 mb-2">
                        {(providerModels[key] || []).map((model, index) => (
                          <div
                            key={`${key}-${index}`}
                            className="flex items-center gap-1.5 px-2 py-1 bg-[var(--color-bg-tertiary)] border border-[var(--color-border-secondary)] rounded-md text-sm"
                          >
                            <span className="flex-1 text-[var(--color-text-primary)] font-mono text-xs truncate">
                              {model}
                            </span>
                            {index === 0 && (
                              <span className="text-[10px] text-blue-400 shrink-0">(default)</span>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setProviderModels(prev => {
                                  const next = { ...prev };
                                  const models = [...(next[key] || [])];
                                  models.splice(index, 1);
                                  if (models.length === 0) {
                                    delete next[key];
                                  } else {
                                    next[key] = models;
                                  }
                                  return next;
                                });
                              }}
                              className="p-0.5 text-[var(--color-text-secondary)] hover:text-red-400 transition-colors shrink-0"
                              aria-label={`Remove ${model}`}
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                      {/* Add model input */}
                      <div className="flex gap-1">
                        <input
                          type="text"
                          value={newModelInputs[key] || ''}
                          onChange={(e) => {
                            setNewModelInputs(prev => ({ ...prev, [key]: e.target.value }));
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const value = (newModelInputs[key] || '').trim();
                              if (value && !(providerModels[key] || []).includes(value)) {
                                setProviderModels(prev => ({
                                  ...prev,
                                  [key]: [...(prev[key] || []), value],
                                }));
                                setNewModelInputs(prev => ({ ...prev, [key]: '' }));
                              }
                            }
                          }}
                          spellCheck={false}
                          placeholder={placeholder}
                          data-testid={`model-input-${key}`}
                          className="flex-1 min-w-0 px-2 py-1.5 bg-[var(--color-bg-tertiary)] border border-[var(--color-border-secondary)] rounded-md text-[var(--color-text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const value = (newModelInputs[key] || '').trim();
                            if (value && !(providerModels[key] || []).includes(value)) {
                              setProviderModels(prev => ({
                                ...prev,
                                [key]: [...(prev[key] || []), value],
                              }));
                              setNewModelInputs(prev => ({ ...prev, [key]: '' }));
                            }
                          }}
                          data-testid={`model-add-${key}`}
                          className="px-2 py-1.5 text-sm bg-[var(--color-bg-tertiary)] border border-[var(--color-border-secondary)] rounded-md text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition-colors"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {(onDeleteImage || onBuildImage) && (
                <section className="rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)]/50 p-4 sm:p-5 lg:col-span-2">
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Docker Image Management</h3>
                    <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                      Check current image status and trigger image maintenance actions.
                    </p>
                  </div>
                  {dockerImageLoading ? (
                    <div className="flex items-center gap-2 mb-3 px-3 py-2 text-sm text-[var(--color-text-secondary)]" data-testid="docker-image-loading">
                      <svg className="animate-spin h-4 w-4 text-[var(--color-text-secondary)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Checking Docker image...
                    </div>
                  ) : dockerImageError ? (
                    <div className="flex items-center gap-2 mb-3" data-testid="docker-image-error">
                      <p className="text-sm text-[var(--color-text-muted)]">Failed to check image status.</p>
                      <button
                        type="button"
                        onClick={fetchDockerImageInfo}
                        className="text-sm text-blue-400 hover:text-blue-300 underline"
                        data-testid="docker-image-retry"
                      >
                        Retry
                      </button>
                    </div>
                  ) : dockerImageInfo && !imageRemoved ? (
                    <>
                      <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-[var(--color-bg-tertiary)]/50 rounded-md">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-text-secondary)] shrink-0">
                          <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
                          <path d="m3.3 7 8.7 5 8.7-5" />
                          <path d="M12 22V12" />
                        </svg>
                        <span className="text-sm text-[var(--color-text-primary)] font-mono">{dockerImageInfo.name}</span>
                        <span className="text-xs text-[var(--color-text-muted)] ml-auto">
                          {(dockerImageInfo.size / (1024 * 1024)).toFixed(0)} MB
                        </span>
                      </div>
                      {dockerImageInfo.stale && (
                        <p className="mb-2 text-xs text-yellow-400">
                          Image is outdated. Click "Build Image" to update it.
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-[var(--color-text-muted)] mb-3">No image found</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {onBuildImage && (
                      <button
                        type="button"
                        onClick={() => { onClose(); onBuildImage(); }}
                        disabled={isRebuilding}
                        data-testid="build-image-button"
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
                          <path d="m3.3 7 8.7 5 8.7-5" />
                          <path d="M12 22V12" />
                        </svg>
                        Build Image
                      </button>
                    )}
                    {onDeleteImage && dockerImageInfo && !imageRemoved && (
                      <button
                        type="button"
                        onClick={() => { onClose(); onDeleteImage(); }}
                        disabled={isRebuilding}
                        data-testid="delete-image-button"
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-400 border border-red-400/30 rounded-md hover:bg-red-400/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 6h18" />
                          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                        </svg>
                        Delete Image
                      </button>
                    )}
                  </div>
                </section>
              )}
            </div>
          </div>
        </div>

        <div
          className="sticky bottom-0 z-10 border-t border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]/95 backdrop-blur"
          data-testid="git-config-footer"
        >
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p className="text-xs text-[var(--color-text-muted)]">
              Changes apply to new terminals only. Restart existing terminals to use the new settings.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                data-testid="git-config-cancel"
                className="px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
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
          </div>
        </div>
      </form>
    </div>
  );
}
