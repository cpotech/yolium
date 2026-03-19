import { useState, useCallback, useRef } from 'react'
import type { ConfirmDialogProps } from '@renderer/components/shared/ConfirmDialog'

interface ConfirmOptions {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
}

interface UseConfirmDialogResult {
  confirm: (options: ConfirmOptions) => Promise<boolean>
  dialogProps: ConfirmDialogProps
}

export function useConfirmDialog(): UseConfirmDialogResult {
  const [isOpen, setIsOpen] = useState(false)
  const [options, setOptions] = useState<ConfirmOptions>({ title: '', message: '' })
  const resolveRef = useRef<((value: boolean) => void) | null>(null)

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    // If there's already a pending dialog, cancel it
    if (resolveRef.current) {
      resolveRef.current(false)
      resolveRef.current = null
    }

    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve
      setOptions(opts)
      setIsOpen(true)
    })
  }, [])

  const onConfirm = useCallback(() => {
    setIsOpen(false)
    if (resolveRef.current) {
      resolveRef.current(true)
      resolveRef.current = null
    }
  }, [])

  const onCancel = useCallback(() => {
    setIsOpen(false)
    if (resolveRef.current) {
      resolveRef.current(false)
      resolveRef.current = null
    }
  }, [])

  return {
    confirm,
    dialogProps: {
      isOpen,
      title: options.title,
      message: options.message,
      confirmLabel: options.confirmLabel,
      cancelLabel: options.cancelLabel,
      onConfirm,
      onCancel,
    },
  }
}
