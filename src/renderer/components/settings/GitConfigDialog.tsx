import React, { useCallback, useRef, useEffect, useState } from 'react';
import type { GitConfigWithPat } from '@shared/types/git';

export type { GitConfigWithPat } from '@shared/types/git';

interface GitConfigDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: { githubPat?: string; openaiApiKey?: string; anthropicApiKey?: string; useClaudeOAuth?: boolean }) => void;
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
  const dialogRef = useRef<HTMLDivElement>(null);
  const patInputRef = useRef<HTMLInputElement>(null);

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
  const [dockerImageInfo, setDockerImageInfo] = useState<{ name: string; size: number; created: string; stale: boolean } | null>(null);

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
      // Fetch Docker image info
      window.electronAPI.docker.getImageInfo().then(setDockerImageInfo).catch(() => setDockerImageInfo(null));
      // Focus dialog wrapper immediately for keyboard events (e.g. Escape)
      dialogRef.current?.focus();
      // Then move focus to PAT field for better UX
      setTimeout(() => patInputRef.current?.focus(), 50);
    }
  }, [isOpen, initialConfig]);

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
    if (value) setOpenaiKeyCleared(false);
  };

  const handleClearOpenaiKey = () => {
    setOpenaiApiKey('');
    setOpenaiKeyError(null);
    setOpenaiKeyCleared(true);
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
      const config: { githubPat?: string; openaiApiKey?: string; anthropicApiKey?: string; useClaudeOAuth?: boolean } = {};
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
      if (openaiApiKey.trim()) {
        config.openaiApiKey = openaiApiKey.trim();
      } else if (openaiKeyCleared) {
        config.openaiApiKey = '';  // Explicitly signal to clear the key
      }
      onSave(config);
    },
    [githubPat, patCleared, useClaudeOAuth, anthropicApiKey, anthropicKeyCleared, openaiApiKey, openaiKeyCleared, onSave]
  );

  if (!isOpen) return null;

  const isValid = validatePat(githubPat).valid && (useClaudeOAuth || validateAnthropicKey(anthropicApiKey).valid) && validateOpenaiKey(openaiApiKey).valid;

  // Show derived identity when PAT is configured and not being cleared
  const showIdentity = initialConfig?.githubLogin && !patCleared;

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
        <h2 className="text-lg font-semibold text-white mb-2">Settings</h2>
        <p className="text-sm text-gray-400 mb-4">
          Configure credentials for Yolium containers.
        </p>

        <div className="space-y-4">
          {/* GitHub PAT — primary position */}
          <div>
            <label htmlFor="github-pat" className="block text-sm font-medium text-gray-300 mb-1">
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
            <p className="mt-1 text-xs text-gray-500">
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
          </div>

          {/* Derived GitHub Identity */}
          {showIdentity && (
            <div className="px-3 py-2 bg-gray-700/50 rounded-md" data-testid="github-identity">
              <p className="text-sm text-green-400">
                Authenticated as <span className="font-mono font-semibold">{initialConfig?.githubLogin}</span>
              </p>
              {initialConfig?.name && (
                <p className="text-xs text-gray-400 mt-1">{initialConfig.name} &lt;{initialConfig.email}&gt;</p>
              )}
            </div>
          )}

          {/* Claude Max OAuth Toggle */}
          <div className="border-t border-gray-700 pt-4">
            <div className="flex items-center justify-between">
              <div>
                <label htmlFor="claude-oauth-toggle" className="text-sm font-medium text-gray-300">
                  Claude Max (OAuth)
                </label>
                <p className="text-xs text-gray-500 mt-0.5">
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
                className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800 ${
                  useClaudeOAuth ? 'bg-blue-600' : 'bg-gray-600'
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
              <p className="mt-1 text-xs text-yellow-400">
                No OAuth credentials found. Run <span className="font-mono">claude</span> on your host to authenticate first.
              </p>
            )}
          </div>

          {/* Anthropic API Key */}
          <div className="border-t border-gray-700 pt-4">
            <label htmlFor="anthropic-key" className="block text-sm font-medium text-gray-300 mb-1">
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
                className={`w-full px-3 py-2 pr-20 bg-gray-700 border rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm ${
                  anthropicKeyError ? 'border-red-500' : 'border-gray-600'
                } ${useClaudeOAuth ? 'opacity-50 cursor-not-allowed' : ''}`}
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                {!useClaudeOAuth && (
                  <button
                    type="button"
                    onClick={() => setShowAnthropicKey(!showAnthropicKey)}
                    className="p-1 text-gray-400 hover:text-white transition-colors"
                    title={showAnthropicKey ? 'Hide key' : 'Show key'}
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
                    className="p-1 text-gray-400 hover:text-red-400 transition-colors"
                    title="Clear key"
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
            <p className="mt-1 text-xs text-gray-500">
              {useClaudeOAuth
                ? 'Claude Code will use your Claude Max OAuth session.'
                : 'Required for Claude Code and OpenCode agents.'}
            </p>
          </div>

          {/* OpenAI API Key */}
          <div className="border-t border-gray-700 pt-4">
            <label htmlFor="openai-key" className="block text-sm font-medium text-gray-300 mb-1">
              OpenAI API Key
              {initialConfig?.hasOpenaiKey && !openaiApiKey && !openaiKeyCleared && (
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
                placeholder={initialConfig?.hasOpenaiKey ? '(keep existing key)' : 'sk-...'}
                data-testid="openai-key-input"
                className={`w-full px-3 py-2 pr-20 bg-gray-700 border rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm ${
                  openaiKeyError ? 'border-red-500' : 'border-gray-600'
                }`}
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                <button
                  type="button"
                  onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                  className="p-1 text-gray-400 hover:text-white transition-colors"
                  title={showOpenaiKey ? 'Hide key' : 'Show key'}
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
                {(openaiApiKey || (initialConfig?.hasOpenaiKey && !openaiKeyCleared)) && (
                  <button
                    type="button"
                    onClick={handleClearOpenaiKey}
                    className="p-1 text-gray-400 hover:text-red-400 transition-colors"
                    title="Clear key"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
            {openaiKeyError && (
              <p className="mt-1 text-xs text-red-400">{openaiKeyError}</p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              Required for the Codex agent. Passed only to Codex containers.
            </p>
          </div>

          {/* Docker Image Management */}
          {(onDeleteImage || onBuildImage) && (
            <div className="border-t border-gray-700 pt-4">
              <p className="text-sm font-medium text-gray-300 mb-3">Docker Image</p>
              {dockerImageInfo && !imageRemoved ? (
                <>
                  <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-gray-700/50 rounded-md">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 shrink-0">
                      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
                      <path d="m3.3 7 8.7 5 8.7-5" />
                      <path d="M12 22V12" />
                    </svg>
                    <span className="text-sm text-white font-mono">{dockerImageInfo.name}</span>
                    <span className="text-xs text-gray-500 ml-auto">
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
                <p className="text-sm text-gray-500 mb-3">No image found</p>
              )}
              <div className="flex gap-2">
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
            </div>
          )}

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
