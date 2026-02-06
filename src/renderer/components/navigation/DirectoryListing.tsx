/**
 * @module src/components/DirectoryListing
 * Directory listing component with selection highlight and favorites toggle.
 */

import React from 'react'
import type { DirectoryEntry } from '@renderer/hooks/useDirectoryNavigation'

interface DirectoryListingProps {
  entries: DirectoryEntry[]
  selectedIndex: number
  listRef: React.RefObject<HTMLUListElement | null>
  onEntryClick: (entry: DirectoryEntry) => void
  onEntryDoubleClick: (entry: DirectoryEntry) => void
  isFavorite: (path: string) => boolean
  onToggleFavorite: (path: string, e: React.MouseEvent) => void
}

/**
 * Display a list of directory entries with selection and favorites.
 * @param props - Component props
 */
export function DirectoryListing({
  entries,
  selectedIndex,
  listRef,
  onEntryClick,
  onEntryDoubleClick,
  isFavorite,
  onToggleFavorite,
}: DirectoryListingProps): React.ReactElement | null {
  if (entries.length === 0) return null

  return (
    <ul
      ref={listRef}
      className="mt-2 max-h-48 overflow-y-auto border border-gray-700 rounded-md bg-gray-900"
    >
      {entries.map((entry, index) => (
        <li
          key={entry.path}
          onClick={() => onEntryClick(entry)}
          onDoubleClick={() => onEntryDoubleClick(entry)}
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
            onClick={(e) => onToggleFavorite(entry.path, e)}
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
  )
}
