import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  normalizePath,
  getParentDirectory,
  ensureTrailingSeparator,
  hasTrailingSeparator,
  getBasename,
  PATH_SEP,
} from '../lib/path-utils';

interface DirectoryEntry {
  name: string;
  path: string;
  isHidden: boolean;
}

interface PathInputDialogProps {
  isOpen: boolean;
  initialPath?: string;
  onConfirm: (path: string) => void;
  onCancel: () => void;
}

const FAVORITES_STORAGE_KEY = 'yolium:favoriteFolders';

function loadFavorites(): string[] {
  try {
    const stored = localStorage.getItem(FAVORITES_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveFavorites(favorites: string[]): void {
  localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
}

export function PathInputDialog({
  isOpen,
  initialPath,
  onConfirm,
  onCancel,
}: PathInputDialogProps): React.ReactElement | null {
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<DirectoryEntry[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showHidden, setShowHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>(loadFavorites);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [createFolderError, setCreateFolderError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const newFolderInputRef = useRef<HTMLInputElement>(null);

  // Filter suggestions based on hidden files preference
  const filteredSuggestions = showHidden
    ? suggestions
    : suggestions.filter(s => !s.isHidden);

  // Toggle favorite status for a folder
  const toggleFavorite = useCallback((path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorites(prev => {
      const newFavorites = prev.includes(path)
        ? prev.filter(f => f !== path)
        : [...prev, path];
      saveFavorites(newFavorites);
      return newFavorites;
    });
  }, []);

  const isFavorite = useCallback((path: string) => favorites.includes(path), [favorites]);

  // Get current directory from input value
  const getCurrentDirectory = useCallback((): string => {
    if (!inputValue) return PATH_SEP;
    // If path already ends with a separator, normalize and return it
    if (hasTrailingSeparator(inputValue)) {
      return normalizePath(inputValue);
    }
    // Otherwise, get the parent directory
    return getParentDirectory(inputValue);
  }, [inputValue]);

  // Start folder creation mode
  const startFolderCreation = useCallback(() => {
    setIsCreatingFolder(true);
    setNewFolderName('');
    setCreateFolderError(null);
    setTimeout(() => newFolderInputRef.current?.focus(), 50);
  }, []);

  // Cancel folder creation
  const cancelFolderCreation = useCallback(() => {
    setIsCreatingFolder(false);
    setNewFolderName('');
    setCreateFolderError(null);
    inputRef.current?.focus();
  }, []);

  // Confirm folder creation
  const confirmFolderCreation = useCallback(async () => {
    if (!newFolderName.trim()) {
      setCreateFolderError('Folder name cannot be empty');
      return;
    }

    const parentDir = getCurrentDirectory();
    const result = await window.electronAPI.createDirectory(parentDir, newFolderName.trim());

    if (result.success && result.path) {
      setIsCreatingFolder(false);
      setNewFolderName('');
      setCreateFolderError(null);
      // Navigate to the new folder (normalize path and ensure trailing separator)
      setInputValue(ensureTrailingSeparator(result.path));
      // Return focus to main input
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setCreateFolderError(result.error || 'Failed to create folder');
    }
  }, [newFolderName, getCurrentDirectory]);

  // Fetch directory suggestions
  const fetchSuggestions = useCallback(async (path: string) => {
    if (!path) {
      setSuggestions([]);
      setError(null);
      return;
    }

    const result = await window.electronAPI.listDirectory(path);
    if (result.success) {
      // Normalize paths from backend to use forward slashes consistently
      const normalizedEntries = result.entries.map((entry: DirectoryEntry) => ({
        ...entry,
        path: normalizePath(entry.path),
      }));
      setSuggestions(normalizedEntries);
      setError(null);
    } else {
      setSuggestions([]);
      setError(result.error);
    }
    setSelectedIndex(0);
  }, []);

  // Initialize with last used path or home directory on open
  useEffect(() => {
    if (isOpen) {
      // Normalize the initial path to use forward slashes
      const startPath = initialPath ? normalizePath(initialPath) : '~/';
      setInputValue(startPath);
      setSelectedIndex(0);
      setShowHidden(false);
      setError(null);
      setIsCreatingFolder(false);
      setNewFolderName('');
      setCreateFolderError(null);
      fetchSuggestions(startPath);
      // Focus input after a brief delay to ensure dialog is rendered
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, initialPath, fetchSuggestions]);

  // Debounced fetch on input change
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSuggestions(inputValue);
    }, 100);
    return () => clearTimeout(timer);
  }, [inputValue, fetchSuggestions]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current && filteredSuggestions.length > 0) {
      const selectedElement = listRef.current.children[selectedIndex] as HTMLElement;
      selectedElement?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex, filteredSuggestions.length]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Ctrl+N to create new folder
      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        startFolderCreation();
        return;
      }

      // Ctrl+1 through Ctrl+9 to select favorites
      if (e.ctrlKey && e.key >= '1' && e.key <= '9') {
        const favIndex = parseInt(e.key) - 1;
        if (favIndex < favorites.length) {
          e.preventDefault();
          const favPath = favorites[favIndex];
          onConfirm(ensureTrailingSeparator(favPath));
        }
        return;
      }

      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          onCancel();
          break;

        case 'Enter':
          e.preventDefault();
          if (inputValue.trim()) {
            // Ensure path is normalized and ends with separator
            onConfirm(ensureTrailingSeparator(inputValue));
          }
          break;

        case 'Tab':
        case 'ArrowRight':
          e.preventDefault();
          if (filteredSuggestions.length > 0) {
            const selected = filteredSuggestions[selectedIndex];
            setInputValue(ensureTrailingSeparator(selected.path));
          }
          break;

        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev =>
            prev > 0 ? prev - 1 : filteredSuggestions.length - 1
          );
          break;

        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev =>
            prev < filteredSuggestions.length - 1 ? prev + 1 : 0
          );
          break;

        case 'Backspace':
          // Go up one directory when backspace at path separator
          if (hasTrailingSeparator(inputValue) && inputValue.length > 1) {
            e.preventDefault();
            // Navigate to parent directory
            const parentPath = getParentDirectory(inputValue);
            setInputValue(parentPath || PATH_SEP);
          }
          break;
      }
    },
    [inputValue, filteredSuggestions, selectedIndex, favorites, onConfirm, onCancel, startFolderCreation]
  );

  // Handle input change - normalize backslashes to forward slashes as user types
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Normalize the path as user types to provide consistent experience
    const value = e.target.value;
    // Only normalize if there are backslashes, to preserve cursor position when possible
    if (value.includes('\\')) {
      setInputValue(normalizePath(value));
    } else {
      setInputValue(value);
    }
  };

  // Handle suggestion click
  const handleSuggestionClick = (entry: DirectoryEntry) => {
    setInputValue(ensureTrailingSeparator(entry.path));
    inputRef.current?.focus();
  };

  // Handle suggestion double-click to confirm
  const handleSuggestionDoubleClick = (entry: DirectoryEntry) => {
    onConfirm(ensureTrailingSeparator(entry.path));
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onCancel}
    >
      <div
        data-testid="path-dialog"
        className="bg-gray-800 rounded-lg shadow-xl border border-gray-700 p-4 max-w-lg w-full mx-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          <svg
            className="w-5 h-5 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
            />
          </svg>
          <h2 className="text-lg font-semibold text-white">Select Project Folder</h2>
        </div>

        {/* Input */}
        <div className="relative">
          <input
            ref={inputRef}
            data-testid="path-input"
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Enter path (e.g., ~/projects/)"
            className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-md text-white font-mono text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            autoFocus
          />
        </div>

        {/* Error message */}
        {error && (
          <div className="mt-2 text-sm text-red-400">{error}</div>
        )}

        {/* Favorites section */}
        {favorites.length > 0 && (
          <div className="mt-2">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1 flex items-center gap-1">
              <svg className="w-3 h-3 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              Favorites
            </div>
            <ul className="border border-gray-700 rounded-md bg-gray-900 max-h-32 overflow-y-auto">
              {favorites.map((favPath, index) => {
                const folderName = getBasename(favPath) || favPath;
                const shortcutNum = index < 9 ? index + 1 : null;
                return (
                  <li
                    key={favPath}
                    onClick={() => {
                      setInputValue(ensureTrailingSeparator(favPath));
                      inputRef.current?.focus();
                    }}
                    onDoubleClick={() => onConfirm(ensureTrailingSeparator(favPath))}
                    className="px-3 py-1.5 cursor-pointer flex items-center gap-2 text-gray-300 hover:bg-gray-700 group"
                  >
                    {shortcutNum && (
                      <span className="text-xs text-gray-600 font-mono w-4" title={`Ctrl+${shortcutNum}`}>
                        {shortcutNum}
                      </span>
                    )}
                    <svg
                      className="w-4 h-4 text-gray-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                      />
                    </svg>
                    <span className="font-mono text-sm flex-1 truncate" title={favPath}>
                      {folderName}
                    </span>
                    <button
                      onClick={(e) => toggleFavorite(favPath, e)}
                      className="p-0.5 hover:bg-gray-600 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Remove from favorites"
                    >
                      <svg className="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* New folder creation inline */}
        {isCreatingFolder && (
          <div className="mt-2 border border-gray-700 rounded-md bg-gray-900 p-2">
            <div className="flex items-center gap-2">
              <svg
                className="w-4 h-4 text-green-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"
                />
              </svg>
              <input
                ref={newFolderInputRef}
                type="text"
                value={newFolderName}
                onChange={(e) => {
                  setNewFolderName(e.target.value);
                  setCreateFolderError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    confirmFolderCreation();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelFolderCreation();
                  }
                }}
                placeholder="New folder name"
                className="flex-1 px-2 py-1 bg-gray-800 border border-gray-600 rounded text-white font-mono text-sm focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
              />
              <button
                onClick={confirmFolderCreation}
                className="p-1 text-green-500 hover:bg-gray-700 rounded"
                title="Create folder (Enter)"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </button>
              <button
                onClick={cancelFolderCreation}
                className="p-1 text-gray-400 hover:bg-gray-700 rounded"
                title="Cancel (Escape)"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {createFolderError && (
              <div className="mt-1 text-sm text-red-400">{createFolderError}</div>
            )}
            <div className="mt-1 text-xs text-gray-500">
              Creating in: {getCurrentDirectory()}
            </div>
          </div>
        )}

        {/* Suggestions list */}
        {filteredSuggestions.length > 0 && (
          <ul
            ref={listRef}
            className="mt-2 max-h-48 overflow-y-auto border border-gray-700 rounded-md bg-gray-900"
          >
            {filteredSuggestions.map((entry, index) => (
              <li
                key={entry.path}
                onClick={() => handleSuggestionClick(entry)}
                onDoubleClick={() => handleSuggestionDoubleClick(entry)}
                className={`px-3 py-1.5 cursor-pointer flex items-center gap-2 group ${
                  index === selectedIndex
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:bg-gray-700'
                }`}
              >
                <svg
                  className={`w-4 h-4 ${index === selectedIndex ? 'text-white' : 'text-gray-500'}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                  />
                </svg>
                <span className={`font-mono text-sm flex-1 ${entry.isHidden ? 'text-gray-500' : ''}`}>
                  {entry.name}
                </span>
                <button
                  onClick={(e) => toggleFavorite(entry.path, e)}
                  className={`p-0.5 rounded transition-opacity ${
                    isFavorite(entry.path)
                      ? 'opacity-100'
                      : 'opacity-0 group-hover:opacity-100 hover:bg-gray-600'
                  } ${index === selectedIndex ? 'hover:bg-blue-500' : ''}`}
                  title={isFavorite(entry.path) ? 'Remove from favorites' : 'Add to favorites'}
                >
                  <svg
                    className={`w-4 h-4 ${
                      isFavorite(entry.path)
                        ? 'text-yellow-500'
                        : index === selectedIndex
                          ? 'text-white/60'
                          : 'text-gray-500'
                    }`}
                    fill={isFavorite(entry.path) ? 'currentColor' : 'none'}
                    stroke="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
                    />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Empty state */}
        {inputValue && filteredSuggestions.length === 0 && !error && (
          <div className="mt-2 py-4 text-center text-gray-500 text-sm">
            No subdirectories found
          </div>
        )}

        {/* Show hidden toggle and New Folder button */}
        <div className="mt-3 flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={showHidden}
              onChange={e => setShowHidden(e.target.checked)}
              className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-800"
            />
            Show hidden folders
          </label>
          {!isCreatingFolder && (
            <button
              onClick={startFolderCreation}
              className="flex items-center gap-1.5 px-2 py-1 text-sm text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
              title="Create new folder (Ctrl+N)"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"
                />
              </svg>
              New Folder
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 pt-3 border-t border-gray-700 flex items-center justify-between">
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
            <span><kbd className="px-1 py-0.5 bg-gray-700 rounded text-gray-400">Tab</kbd> complete</span>
            <span><kbd className="px-1 py-0.5 bg-gray-700 rounded text-gray-400">^N</kbd> new folder</span>
            {favorites.length > 0 && (
              <span><kbd className="px-1 py-0.5 bg-gray-700 rounded text-gray-400">^#</kbd> favorite</span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              data-testid="path-cancel"
              onClick={onCancel}
              className="px-3 py-1.5 text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-2"
            >
              Cancel
              <kbd className="text-xs bg-gray-700 px-1.5 py-0.5 rounded text-gray-500">Esc</kbd>
            </button>
            <button
              data-testid="path-next"
              onClick={() => {
                if (inputValue.trim()) {
                  onConfirm(ensureTrailingSeparator(inputValue));
                }
              }}
              disabled={!inputValue.trim()}
              className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:text-gray-400 text-white rounded-md transition-colors flex items-center gap-2"
            >
              Next
              <kbd className="text-xs bg-blue-700 px-1.5 py-0.5 rounded text-blue-300 disabled:bg-gray-500">↵</kbd>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
