/**
 * @module src/hooks/useDockerState
 * Hook for managing Docker state, image building, and progress tracking.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useConfirmDialog } from '@renderer/hooks/useConfirmDialog'
import type { ConfirmDialogProps } from '@renderer/components/shared/ConfirmDialog'

export interface UseDockerStateResult {
  /** Docker readiness state: null = checking, true = ready, false = needs setup */
  dockerReady: boolean | null
  /** Build progress lines (null when not building) */
  buildProgress: string[] | null
  /** Build error message (null if no error) */
  buildError: string | null
  /** Whether image is being rebuilt */
  isRebuilding: boolean
  /** Whether image has been removed */
  imageRemoved: boolean
  /** Ref for auto-scrolling progress container */
  progressRef: React.RefObject<HTMLDivElement | null>
  /** Ref to cancel builds */
  buildCancelledRef: React.MutableRefObject<boolean>
  /** Set build progress lines */
  setBuildProgress: React.Dispatch<React.SetStateAction<string[] | null>>
  /** Set build error */
  setBuildError: React.Dispatch<React.SetStateAction<string | null>>
  /** Set image removed state */
  setImageRemoved: React.Dispatch<React.SetStateAction<boolean>>
  /** Handle Docker setup completion */
  handleDockerSetupComplete: () => void
  /** Delete Docker image — shows confirmation, returns true if confirmed */
  handleDeleteImage: () => Promise<boolean>
  /** Execute the image deletion (call after closing tabs) */
  executeImageDeletion: () => Promise<void>
  /** Manually trigger Docker image build */
  handleBuildImage: () => void
  /** Props for the confirm dialog used by this hook */
  confirmDialogProps: ConfirmDialogProps
}

/**
 * Manages Docker state, image building, and progress tracking.
 * @returns State and handlers for Docker functionality
 */
export function useDockerState(): UseDockerStateResult {
  const [dockerReady, setDockerReady] = useState<boolean | null>(null)
  const [buildProgress, setBuildProgress] = useState<string[] | null>(null)
  const [buildError, setBuildError] = useState<string | null>(null)
  const [isRebuilding, setIsRebuilding] = useState(false)
  const [imageRemoved, setImageRemoved] = useState(false)

  const { confirm: confirmAction, dialogProps: confirmDialogProps } = useConfirmDialog()

  const progressRef = useRef<HTMLDivElement | null>(null)
  const buildCancelledRef = useRef<boolean>(false)

  // Check Docker state on mount
  useEffect(() => {
    window.electronAPI.docker.detectState().then((state) => {
      if (state.running) {
        setDockerReady(true)
      } else {
        setDockerReady(false)
      }
    }).catch(() => {
      setDockerReady(false)
    })
  }, [])

  // Auto-check/build Docker image on startup when Docker is ready
  useEffect(() => {
    if (!dockerReady) return
    buildCancelledRef.current = false

    const cleanupProgress = window.electronAPI.docker.onBuildProgress((message) => {
      setBuildProgress(prev => {
        const lines = prev || []
        return [...lines, message].slice(-50)
      })
    })

    setBuildError(null)
    setBuildProgress(['Checking Yolium image...'])

    window.electronAPI.docker.ensureImage()
      .then(() => {
        cleanupProgress()
        if (!buildCancelledRef.current) {
          setBuildProgress(null)
          setImageRemoved(false)
        }
      })
      .catch((err) => {
        cleanupProgress()
        if (!buildCancelledRef.current) {
          const message = err instanceof Error ? err.message : 'Unknown error'
          setBuildError(message)
        }
      })

    return () => { cleanupProgress() }
  }, [dockerReady])

  // Auto-scroll build progress to bottom
  useEffect(() => {
    if (progressRef.current && buildProgress) {
      progressRef.current.scrollTop = progressRef.current.scrollHeight
    }
  }, [buildProgress])

  const handleDockerSetupComplete = useCallback(() => {
    setDockerReady(true)
  }, [])

  const handleDeleteImage = useCallback(async (): Promise<boolean> => {
    const confirmed = await confirmAction({
      title: 'Delete Docker Image',
      message: 'This will:\n\u2022 End all active terminals\n\u2022 Remove all yolium containers\n\u2022 Remove the Docker image\n\nThe image will be rebuilt automatically when you start a new terminal.\n\nContinue?',
      confirmLabel: 'Delete',
    })
    if (!confirmed) return false

    setIsRebuilding(true)
    setBuildProgress(['Stopping containers...'])

    // Return true so caller can close tabs while we proceed
    return true
  }, [confirmAction])

  const executeImageDeletion = useCallback(async () => {
    try {
      setBuildProgress(['Removing containers...'])
      await window.electronAPI.docker.removeAllContainers()

      setBuildProgress(['Removing Docker image...'])
      await window.electronAPI.docker.removeImage()

      setImageRemoved(true)

      setBuildProgress(['Docker image removed. It will rebuild on next terminal start.'])
      setTimeout(() => { setBuildProgress(null); setIsRebuilding(false) }, 2000)
    } catch (err) {
      console.error('Failed to delete image:', err)
      const message = err instanceof Error ? err.message : 'Unknown error'
      setBuildProgress([`Error: ${message}`])
      setTimeout(() => { setBuildProgress(null); setIsRebuilding(false) }, 3000)
    }
  }, [])

  const handleBuildImage = useCallback(() => {
    buildCancelledRef.current = false
    setBuildError(null)
    setBuildProgress(['Checking Yolium image...'])

    let receivedProgress = false
    const cleanupProgress = window.electronAPI.docker.onBuildProgress((message) => {
      receivedProgress = true
      setBuildProgress(prev => {
        const lines = prev || []
        return [...lines, message].slice(-50)
      })
    })

    window.electronAPI.docker.ensureImage()
      .then(() => {
        cleanupProgress()
        if (!buildCancelledRef.current) {
          if (receivedProgress) {
            // Image was actually built — clear immediately
            setBuildProgress(null)
          } else {
            // Image already existed — show brief confirmation
            setBuildProgress(['Image is up to date.'])
            setTimeout(() => setBuildProgress(null), 1500)
          }
          setImageRemoved(false)
        }
      })
      .catch((err) => {
        cleanupProgress()
        if (!buildCancelledRef.current) {
          const message = err instanceof Error ? err.message : 'Unknown error'
          setBuildError(message)
        }
      })
  }, [])

  return {
    dockerReady,
    buildProgress,
    buildError,
    isRebuilding,
    imageRemoved,
    progressRef,
    buildCancelledRef,
    setBuildProgress,
    setBuildError,
    setImageRemoved,
    handleDockerSetupComplete,
    handleDeleteImage,
    executeImageDeletion,
    handleBuildImage,
    confirmDialogProps,
  }
}
