import React, { forwardRef, useCallback, useEffect, useRef, useState } from 'react'
import type { KanbanAttachment, KanbanComment, AgentStatus } from '@shared/types/kanban'
import type { VimMode } from '@renderer/hooks/useVimMode'
import { CommentsList, type CommentsListHandle } from '../CommentsList'

interface ItemDetailEditorPaneProps {
  title: string
  description: string
  comments: KanbanComment[]
  commentText: string
  isAddingComment: boolean
  onTitleChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  onCommentTextChange: (value: string) => void
  onAddComment: () => void
  onSelectCommentOption: (value: string) => void
  vimMode?: VimMode
  focusedFieldIndex?: number
  onFieldFocus?: (index: number) => void
  focusedCommentId?: string | null
  selectedCommentIds?: Set<string>
  commentSearchRef?: React.Ref<CommentsListHandle>
  agentStatus?: AgentStatus
  answerText?: string
  isAnswering?: boolean
  onSetAnswerText?: (text: string) => void
  onAnswerQuestion?: () => void
  projectPath?: string
  itemId?: string
  attachments?: KanbanAttachment[]
  onAttachmentsChanged?: () => void
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function isImageMimeType(mimeType: string): boolean {
  return mimeType.startsWith('image/')
}

interface AttachmentThumbnailProps {
  attachment: KanbanAttachment
  projectPath: string
  onDelete: (id: string) => void
}

function AttachmentThumbnail({ attachment, projectPath, onDelete }: AttachmentThumbnailProps) {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!isImageMimeType(attachment.mimeType)) return

    let cancelled = false
    window.electronAPI.kanban.readAttachment(projectPath, attachment.itemId, attachment.id)
      .then(result => {
        if (result && !cancelled) {
          setThumbnailUrl(`data:${result.mimeType};base64,${result.data}`)
        }
      })
      .catch(() => { /* ignore thumbnail load errors */ })

    return () => { cancelled = true }
  }, [attachment.id, attachment.itemId, attachment.mimeType, projectPath])

  return (
    <div
      data-testid={`attachment-${attachment.id}`}
      className="relative group border border-[var(--color-border-primary)] rounded-md overflow-hidden bg-[var(--color-bg-primary)]"
    >
      {isImageMimeType(attachment.mimeType) && thumbnailUrl ? (
        <img
          src={thumbnailUrl}
          alt={attachment.filename}
          className="w-full h-24 object-cover"
        />
      ) : (
        <div className="w-full h-24 flex items-center justify-center text-[var(--color-text-tertiary)]">
          <div className="text-center">
            <div className="text-2xl">
              {attachment.filename.split('.').pop()?.toUpperCase() || 'FILE'}
            </div>
          </div>
        </div>
      )}
      <div className="px-2 py-1.5 text-xs text-[var(--color-text-secondary)] truncate">
        {attachment.filename}
        <span className="ml-1 text-[var(--color-text-tertiary)]">
          ({formatFileSize(attachment.size)})
        </span>
      </div>
      <button
        data-testid={`delete-attachment-${attachment.id}`}
        onClick={() => onDelete(attachment.id)}
        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-600 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700"
        title="Delete attachment"
      >
        x
      </button>
    </div>
  )
}

export const ItemDetailEditorPane = forwardRef<React.ComponentRef<'div'>, ItemDetailEditorPaneProps>(function ItemDetailEditorPane({
  title,
  description,
  comments,
  commentText,
  isAddingComment,
  onTitleChange,
  onDescriptionChange,
  onCommentTextChange,
  onAddComment,
  onSelectCommentOption,
  vimMode,
  focusedFieldIndex,
  onFieldFocus,
  focusedCommentId,
  selectedCommentIds,
  commentSearchRef,
  agentStatus,
  answerText,
  isAnswering,
  onSetAnswerText,
  onAnswerQuestion,
  projectPath,
  itemId,
  attachments,
  onAttachmentsChanged,
}, ref) {
  const isNormal = vimMode === 'NORMAL'
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)

  const addAttachmentFromBlob = useCallback(async (blob: Blob, filename: string) => {
    if (!projectPath || !itemId) return

    setIsUploading(true)
    try {
      const buffer = await blob.arrayBuffer()
      const base64 = btoa(
        new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      )
      await window.electronAPI.kanban.addAttachment(
        projectPath, itemId, filename, blob.type || 'application/octet-stream', base64
      )
      onAttachmentsChanged?.()
    } catch (err) {
      // Error adding attachment — silently fail for now
    } finally {
      setIsUploading(false)
    }
  }, [projectPath, itemId, onAttachmentsChanged])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    if (!projectPath || !itemId) return

    const items = e.clipboardData?.items
    if (!items) return

    for (const clipItem of items) {
      if (clipItem.type.startsWith('image/')) {
        e.preventDefault()
        const blob = clipItem.getAsFile()
        if (blob) {
          const ext = clipItem.type.split('/')[1] || 'png'
          const filename = `paste-${Date.now()}.${ext}`
          void addAttachmentFromBlob(blob, filename)
        }
        return
      }
    }
  }, [projectPath, itemId, addAttachmentFromBlob])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    for (const file of files) {
      void addAttachmentFromBlob(file, file.name)
    }

    // Reset input so the same file can be selected again
    e.target.value = ''
  }, [addAttachmentFromBlob])

  const handleDeleteAttachment = useCallback(async (attachmentId: string) => {
    if (!projectPath || !itemId) return

    try {
      await window.electronAPI.kanban.deleteAttachment(projectPath, itemId, attachmentId)
      onAttachmentsChanged?.()
    } catch {
      // Error deleting attachment
    }
  }, [projectPath, itemId, onAttachmentsChanged])

  const hasAttachments = attachments && attachments.length > 0

  return (
    <div className="flex-1 overflow-y-auto p-6" ref={ref}>
      <div>
        <div
          data-field-index="0"
          className={`mb-5 ${isNormal && focusedFieldIndex === 0 ? 'ring-2 ring-[var(--color-accent-primary)] rounded-md' : ''}`}
        >
          <label
            htmlFor="detail-title"
            className="block text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)] mb-1.5"
          >
            Title <span className="text-red-400">*</span>
          </label>
          <input
            id="detail-title"
            data-testid="title-input"
            type="text"
            value={title}
            onChange={event => onTitleChange(event.target.value)}
            onFocus={() => onFieldFocus?.(0)}
            className="w-full px-3 py-2.5 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-md text-[var(--color-text-primary)] text-sm focus:outline-none focus:border-[var(--color-accent-primary)] focus:ring-1 focus:ring-[var(--color-accent-primary)]"
          />
        </div>

        <div
          data-field-index="1"
          className={`mb-5 ${isNormal && focusedFieldIndex === 1 ? 'ring-2 ring-[var(--color-accent-primary)] rounded-md' : ''}`}
        >
          <label
            htmlFor="detail-description"
            className="block text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)] mb-1.5"
          >
            Description
          </label>
          <textarea
            id="detail-description"
            data-testid="description-input"
            value={description}
            onChange={event => onDescriptionChange(event.target.value)}
            onFocus={() => onFieldFocus?.(1)}
            onPaste={handlePaste}
            rows={10}
            className="w-full px-3 py-2.5 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-md text-[var(--color-text-primary)] text-sm focus:outline-none focus:border-[var(--color-accent-primary)] focus:ring-1 focus:ring-[var(--color-accent-primary)] resize-y"
          />
        </div>

        {/* Attachments Section */}
        {projectPath && itemId && (
          <div data-testid="attachments-section" className="mb-5">
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">
                Attachments{hasAttachments ? ` (${attachments.length})` : ''}
              </label>
              <button
                data-testid="add-attachment-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="px-2 py-1 text-xs bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] text-[var(--color-text-secondary)] rounded hover:border-[var(--color-accent-primary)] hover:text-[var(--color-accent-primary)] disabled:opacity-50 transition-colors"
              >
                {isUploading ? 'Uploading...' : '+ Add file'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileSelect}
                className="hidden"
                data-testid="file-input"
              />
            </div>

            {hasAttachments ? (
              <div className="grid grid-cols-3 gap-2" data-testid="attachments-grid">
                {attachments.map(att => (
                  <AttachmentThumbnail
                    key={att.id}
                    attachment={att}
                    projectPath={projectPath}
                    onDelete={handleDeleteAttachment}
                  />
                ))}
              </div>
            ) : (
              <div
                onPaste={handlePaste as any}
                className="border border-dashed border-[var(--color-border-primary)] rounded-md p-4 text-center text-xs text-[var(--color-text-tertiary)]"
              >
                Paste an image or click &quot;+ Add file&quot; to attach files
              </div>
            )}
          </div>
        )}

        <CommentsList
          ref={commentSearchRef}
          comments={comments}
          onSelectOption={onSelectCommentOption}
          focusedCommentId={focusedCommentId}
          selectedCommentIds={selectedCommentIds}
          agentStatus={agentStatus}
          answerText={answerText}
          isAnswering={isAnswering}
          onSetAnswerText={onSetAnswerText}
          onAnswerQuestion={onAnswerQuestion}
        />

        <div
          data-field-index="2"
          className={`mt-4 ${isNormal && focusedFieldIndex === 2 ? 'ring-2 ring-[var(--color-accent-primary)] rounded-md' : ''}`}
        >
          <label
            htmlFor="comment-input"
            className="block text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)] mb-1.5"
          >
            Add Comment
          </label>
          <textarea
            id="comment-input"
            data-testid="comment-input"
            value={commentText}
            onChange={event => onCommentTextChange(event.target.value)}
            onFocus={() => onFieldFocus?.(2)}
            onPaste={handlePaste}
            onKeyDown={event => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault()
                onAddComment()
              }
            }}
            rows={3}
            placeholder="Write a comment..."
            className="w-full px-3 py-2.5 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-md text-[var(--color-text-primary)] text-sm placeholder-[var(--color-text-tertiary)] focus:outline-none focus:border-[var(--color-accent-primary)] focus:ring-1 focus:ring-[var(--color-accent-primary)] resize-y"
          />
          <div className="flex justify-end mt-2">
            <button
              data-testid="comment-submit"
              onClick={onAddComment}
              disabled={isAddingComment || !commentText.trim()}
              className="px-3 py-1.5 text-xs bg-[var(--color-accent-primary)] text-white rounded hover:bg-[var(--color-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isAddingComment ? 'Posting...' : 'Post Comment'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
})
