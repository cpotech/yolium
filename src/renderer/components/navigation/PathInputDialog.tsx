/**
 * @module src/components/PathInputDialog
 * Dialog for selecting a project folder path with navigation and favorites.
 */

import React from 'react'
import { ensureTrailingSeparator } from '@shared/lib/path-utils'
import { useFavoriteFolders } from '@renderer/hooks/useFavoriteFolders'
import { useDirectoryNavigation } from '@renderer/hooks/useDirectoryNavigation'
import { DirectoryListing } from './DirectoryListing'
import { FavoritesList } from './FavoritesList'
import { FolderCreationInput } from './FolderCreationInput'

interface PathInputDialogProps {
  isOpen: boolean
  initialPath?: string
  onConfirm: (path: string) => void
  onCancel: () => void
}

/**
 * Dialog for selecting a project folder path.
 * @param props - Component props
 */
export function PathInputDialog({
  isOpen,
  initialPath,
  onConfirm,
  onCancel,
}: PathInputDialogProps): React.ReactElement | null {
  const { favorites, toggleFavorite, isFavorite } = useFavoriteFolders()

  const nav = useDirectoryNavigation({
    initialPath,
    isOpen,
    onConfirm,
    onCancel,
    favorites,
  })

  if (!isOpen) return null

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
            ref={nav.inputRef}
            data-testid="path-input"
            type="text"
            value={nav.inputValue}
            onChange={nav.handleInputChange}
            onKeyDown={nav.handleKeyDown}
            placeholder="Enter path (e.g., ~/projects/)"
            className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-md text-white font-mono text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            autoFocus
          />
        </div>

        {/* Error message */}
        {nav.error && (
          <div className="mt-2 text-sm text-red-400">{nav.error}</div>
        )}

        {/* Favorites section */}
        <FavoritesList
          favorites={favorites}
          onSelect={nav.setInputValue}
          onConfirm={onConfirm}
          onToggleFavorite={toggleFavorite}
          inputRef={nav.inputRef}
        />

        {/* New folder creation inline */}
        {nav.isCreatingFolder && (
          <FolderCreationInput
            parentDirectory={nav.getCurrentDirectory()}
            onCreated={(newPath) => {
              nav.setIsCreatingFolder(false)
              nav.setInputValue(ensureTrailingSeparator(newPath))
            }}
            onCancel={() => nav.setIsCreatingFolder(false)}
            inputRef={nav.inputRef}
          />
        )}

        {/* Suggestions list */}
        <DirectoryListing
          entries={nav.filteredSuggestions}
          selectedIndex={nav.selectedIndex}
          listRef={nav.listRef}
          onEntryClick={nav.handleSuggestionClick}
          onEntryDoubleClick={nav.handleSuggestionDoubleClick}
          isFavorite={isFavorite}
          onToggleFavorite={toggleFavorite}
        />

        {/* Empty state */}
        {nav.inputValue && nav.filteredSuggestions.length === 0 && !nav.error && (
          <div className="mt-2 py-4 text-center text-gray-500 text-sm">
            No subdirectories found
          </div>
        )}

        {/* Show hidden toggle and New Folder button */}
        <div className="mt-3 flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={nav.showHidden}
              onChange={e => nav.setShowHidden(e.target.checked)}
              className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-800"
            />
            Show hidden folders
          </label>
          {!nav.isCreatingFolder && (
            <button
              onClick={nav.startFolderCreation}
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
            <span><kbd className="px-1 py-0.5 bg-gray-700 rounded text-gray-400">Esc</kbd> back</span>
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
                if (nav.inputValue.trim()) {
                  onConfirm(ensureTrailingSeparator(nav.inputValue))
                }
              }}
              disabled={!nav.inputValue.trim()}
              className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:text-gray-400 text-white rounded-md transition-colors flex items-center gap-2"
            >
              Next
              <kbd className="text-xs bg-blue-700 px-1.5 py-0.5 rounded text-blue-300 disabled:bg-gray-500">↵</kbd>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
