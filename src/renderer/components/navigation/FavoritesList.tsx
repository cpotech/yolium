/**
 * @module src/components/FavoritesList
 * Favorites list component with keyboard shortcuts.
 */

import React from 'react'
import { getBasename, ensureTrailingSeparator } from '@shared/lib/path-utils'

interface FavoritesListProps {
  favorites: string[]
  onSelect: (path: string) => void
  onConfirm: (path: string) => void
  onToggleFavorite: (path: string, e: React.MouseEvent) => void
  inputRef: React.RefObject<HTMLInputElement | null>
}

/**
 * Display a list of favorite folders with keyboard shortcuts.
 * @param props - Component props
 */
export function FavoritesList({
  favorites,
  onSelect,
  onConfirm,
  onToggleFavorite,
  inputRef,
}: FavoritesListProps): React.ReactElement | null {
  if (favorites.length === 0) return null

  return (
    <div className="mt-2">
      <div className="text-xs text-gray-500 uppercase tracking-wide mb-1 flex items-center gap-1">
        <svg className="w-3 h-3 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
        Favorites
      </div>
      <ul className="border border-gray-700 rounded-md bg-gray-900 max-h-32 overflow-y-auto">
        {favorites.map((favPath, index) => {
          const folderName = getBasename(favPath) || favPath
          const shortcutNum = index < 9 ? index + 1 : null
          return (
            <li
              key={favPath}
              onClick={() => {
                onSelect(ensureTrailingSeparator(favPath))
                inputRef.current?.focus()
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
                onClick={(e) => onToggleFavorite(favPath, e)}
                className="p-0.5 hover:bg-gray-600 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                title="Remove from favorites"
              >
                <svg className="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
