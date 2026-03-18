/**
 * @module src/hooks/useDirectoryNavigation
 * Hook for directory navigation with debounced fetching and keyboard navigation.
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import {
  normalizePath,
  getParentDirectory,
  ensureTrailingSeparator,
  hasTrailingSeparator,
  PATH_SEP,
} from '@shared/lib/path-utils'
import { isCloseShortcut } from '@renderer/lib/dialog-shortcuts'

export interface DirectoryEntry {
  name: string
  path: string
  isHidden: boolean
}

export interface UseDirectoryNavigationOptions {
  initialPath?: string
  isOpen: boolean
  onConfirm: (path: string) => void
  onCancel: () => void
  favorites: string[]
}

export interface UseDirectoryNavigationReturn {
  inputValue: string
  setInputValue: React.Dispatch<React.SetStateAction<string>>
  suggestions: DirectoryEntry[]
  filteredSuggestions: DirectoryEntry[]
  selectedIndex: number
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>
  showHidden: boolean
  setShowHidden: React.Dispatch<React.SetStateAction<boolean>>
  error: string | null
  inputRef: React.RefObject<HTMLInputElement | null>
  listRef: React.RefObject<HTMLUListElement | null>
  handleKeyDown: (e: React.KeyboardEvent) => void
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  handleSuggestionClick: (entry: DirectoryEntry) => void
  handleSuggestionDoubleClick: (entry: DirectoryEntry) => void
  getCurrentDirectory: () => string
  startFolderCreation: () => void
  startClone: () => void
  isCreatingFolder: boolean
  setIsCreatingFolder: React.Dispatch<React.SetStateAction<boolean>>
  isCloning: boolean
  setIsCloning: React.Dispatch<React.SetStateAction<boolean>>
}

/**
 * Hook for directory navigation with debounced fetching.
 * @param options - Configuration options
 * @returns Directory navigation state and handlers
 */
export function useDirectoryNavigation({
  initialPath,
  isOpen,
  onConfirm,
  onCancel,
  favorites,
}: UseDirectoryNavigationOptions): UseDirectoryNavigationReturn {
  const [inputValue, setInputValue] = useState('')
  const [suggestions, setSuggestions] = useState<DirectoryEntry[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [showHidden, setShowHidden] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)
  const [isCloning, setIsCloning] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  // Filter suggestions based on hidden files preference
  const filteredSuggestions = showHidden
    ? suggestions
    : suggestions.filter(s => !s.isHidden)

  // Get current directory from input value
  const getCurrentDirectory = useCallback((): string => {
    if (!inputValue) return PATH_SEP
    if (hasTrailingSeparator(inputValue)) {
      return normalizePath(inputValue)
    }
    return getParentDirectory(inputValue)
  }, [inputValue])

  // Start folder creation mode
  const startFolderCreation = useCallback(() => {
    setIsCloning(false)
    setIsCreatingFolder(true)
  }, [])

  // Start clone mode
  const startClone = useCallback(() => {
    setIsCreatingFolder(false)
    setIsCloning(true)
  }, [])

  // Fetch directory suggestions
  const fetchSuggestions = useCallback(async (path: string) => {
    if (!path) {
      setSuggestions([])
      setError(null)
      return
    }

    const result = await window.electronAPI.fs.listDirectory(path)
    if (result.success) {
      const normalizedEntries = result.entries.map((entry: DirectoryEntry) => ({
        ...entry,
        path: normalizePath(entry.path),
      }))
      setSuggestions(normalizedEntries)
      setError(null)
    } else {
      setSuggestions([])
      setError(result.error)
    }
    setSelectedIndex(0)
  }, [])

  // Initialize with last used path or home directory on open
  useEffect(() => {
    if (isOpen) {
      const startPath = initialPath ? normalizePath(initialPath) : '~/'
      setInputValue(startPath)
      setSelectedIndex(0)
      setShowHidden(false)
      setError(null)
      setIsCreatingFolder(false)
      setIsCloning(false)
      fetchSuggestions(startPath)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen, initialPath, fetchSuggestions])

  // Debounced fetch on input change
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSuggestions(inputValue)
    }, 100)
    return () => clearTimeout(timer)
  }, [inputValue, fetchSuggestions])

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current && filteredSuggestions.length > 0) {
      const selectedElement = listRef.current.children[selectedIndex] as HTMLElement
      selectedElement?.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex, filteredSuggestions.length])

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Ctrl+N to create new folder
      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault()
        startFolderCreation()
        return
      }

      // Ctrl+G to clone repository
      if (e.ctrlKey && e.key === 'g') {
        e.preventDefault()
        startClone()
        return
      }

      // Ctrl+1 through Ctrl+9 to select favorites
      if (e.ctrlKey && e.key >= '1' && e.key <= '9') {
        const favIndex = parseInt(e.key) - 1
        if (favIndex < favorites.length) {
          e.preventDefault()
          const favPath = favorites[favIndex]
          onConfirm(ensureTrailingSeparator(favPath))
        }
        return
      }

      // Ctrl+Q to cancel
      if (isCloseShortcut(e)) {
        e.preventDefault()
        onCancel()
        return
      }

      // Escape navigates up one directory (does not cancel)
      if (e.key === 'Escape' && inputValue) {
        e.preventDefault()
        const parentPath = getParentDirectory(inputValue)
        setInputValue(parentPath)
        return
      }

      switch (e.key) {
        case 'Enter':
          e.preventDefault()
          if (inputValue.trim()) {
            onConfirm(ensureTrailingSeparator(inputValue))
          }
          break

        case 'Tab':
        case 'ArrowRight':
          e.preventDefault()
          if (filteredSuggestions.length > 0) {
            const selected = filteredSuggestions[selectedIndex]
            setInputValue(ensureTrailingSeparator(selected.path))
          }
          break

        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex(prev =>
            prev > 0 ? prev - 1 : filteredSuggestions.length - 1
          )
          break

        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex(prev =>
            prev < filteredSuggestions.length - 1 ? prev + 1 : 0
          )
          break

        case 'Backspace':
          if (hasTrailingSeparator(inputValue) && inputValue.length > 1) {
            e.preventDefault()
            const parentPath = getParentDirectory(inputValue)
            setInputValue(parentPath || PATH_SEP)
          }
          break
      }
    },
    [inputValue, filteredSuggestions, selectedIndex, favorites, onConfirm, onCancel, startFolderCreation, startClone]
  )

  // Handle input change
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    if (value.includes('\\')) {
      setInputValue(normalizePath(value))
    } else {
      setInputValue(value)
    }
  }, [])

  // Handle suggestion click
  const handleSuggestionClick = useCallback((entry: DirectoryEntry) => {
    setInputValue(ensureTrailingSeparator(entry.path))
    inputRef.current?.focus()
  }, [])

  // Handle suggestion double-click
  const handleSuggestionDoubleClick = useCallback((entry: DirectoryEntry) => {
    onConfirm(ensureTrailingSeparator(entry.path))
  }, [onConfirm])

  return {
    inputValue,
    setInputValue,
    suggestions,
    filteredSuggestions,
    selectedIndex,
    setSelectedIndex,
    showHidden,
    setShowHidden,
    error,
    inputRef,
    listRef,
    handleKeyDown,
    handleInputChange,
    handleSuggestionClick,
    handleSuggestionDoubleClick,
    getCurrentDirectory,
    startFolderCreation,
    startClone,
    isCreatingFolder,
    setIsCreatingFolder,
    isCloning,
    setIsCloning,
  }
}
