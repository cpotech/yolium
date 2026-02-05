/**
 * @module src/hooks/useFavoriteFolders
 * Hook for managing favorite folder paths with localStorage persistence.
 */

import { useState, useCallback } from 'react'

const FAVORITES_STORAGE_KEY = 'yolium:favoriteFolders'

/**
 * Load favorites from localStorage.
 * @returns Array of favorite paths
 */
function loadFavorites(): string[] {
  try {
    const stored = localStorage.getItem(FAVORITES_STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

/**
 * Save favorites to localStorage.
 * @param favorites - Array of favorite paths to save
 */
function saveFavorites(favorites: string[]): void {
  localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites))
}

export interface UseFavoriteFoldersReturn {
  favorites: string[]
  toggleFavorite: (path: string, e: React.MouseEvent) => void
  isFavorite: (path: string) => boolean
}

/**
 * Hook for managing favorite folders with localStorage persistence.
 * @returns Favorites state and actions
 */
export function useFavoriteFolders(): UseFavoriteFoldersReturn {
  const [favorites, setFavorites] = useState<string[]>(loadFavorites)

  const toggleFavorite = useCallback((path: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setFavorites(prev => {
      const newFavorites = prev.includes(path)
        ? prev.filter(f => f !== path)
        : [...prev, path]
      saveFavorites(newFavorites)
      return newFavorites
    })
  }, [])

  const isFavorite = useCallback((path: string) => favorites.includes(path), [favorites])

  return {
    favorites,
    toggleFavorite,
    isFavorite,
  }
}
