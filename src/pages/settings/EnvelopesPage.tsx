/**
 * Settings — Manage Envelopes  (BRD §4.3, Step 8)
 *
 * Displays all envelopes in parent/child order with inline rename,
 * add-child, and delete actions.
 *
 * Rules enforced:
 *  - Rename auto-saves on blur (via SaveContext)
 *  - Delete requires confirmation modal
 *  - Cannot delete a parent that still has children
 *  - Cannot delete an envelope that has active (non-deleted) transactions
 *  - Max hierarchy depth = 2 (children cannot have children)
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { Link }                         from 'react-router-dom'
import { ChevronLeft, Plus, Trash2, FolderOpen } from 'lucide-react'
import { useEnvelopeStore }  from '../../stores/useEnvelopeStore'
import { useSave }           from '../../contexts/SaveContext'
import { useToast }          from '../../contexts/ToastContext'
import { supabase }          from '../../lib/supabase'
import type { Envelope }     from '../../types/database'

// ── Delete-guard check ────────────────────────────────────────────────────────

async function getDeleteBlocker(
  id: string,
  envelopes: Envelope[],
): Promise<string | null> {
  // Guard 1: has child envelopes
  const hasChildren = envelopes.some(e => e.parent_id === id)
  if (hasChildren) return 'Remove all child envelopes first.'

  // Guard 2: has active transactions
  const { count } = await supabase
    .from('transactions')
    .select('*', { count: 'exact', head: true })
    .eq('envelope_id', id)
    .eq('deleted', false)
  if ((count ?? 0) > 0) return 'This envelope has transactions — reassign or delete them first.'

  return null
}

// ── Confirm modal ─────────────────────────────────────────────────────────────

interface ConfirmModalProps {
  name:      string
  onConfirm: () => void
  onCancel:  () => void
}

function ConfirmDeleteModal({ name, onConfirm, onCancel }: ConfirmModalProps) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2 className="text-base font-semibold mb-2" style={{ color: 'var(--text)' }}>
          Delete envelope?
        </h2>
        <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>
          <strong style={{ color: 'var(--text)' }}>{name}</strong> will be permanently deleted.
          This cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn-danger" onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  )
}

// ── Envelope row ──────────────────────────────────────────────────────────────

interface RowProps {
  envelope:     Envelope
  isChild:      boolean
  onRename:     (id: string, name: string) => Promise<void>
  onAddChild:   (parentId: string) => Promise<void>
  onDelete:     (envelope: Envelope) => void
  isDeleting:   boolean
  /** Focus this row's input on mount */
  autoFocus:    boolean
  /** Called after auto-focus fires so parent can clear the newly-added flag */
  onFocused:    () => void
  /** Called after Enter is pressed and name is saved — creates the next sibling */
  onCreateNext?: () => Promise<void>
}

function EnvelopeRow({ envelope, isChild, onRename, onAddChild, onDelete, isDeleting, autoFocus, onFocused, onCreateNext }: RowProps) {
  const [value, setValue]   = useState(envelope.name)
  const [saving, setSaving] = useState(false)
  const inputRef            = useRef<HTMLInputElement>(null)
  const enterPressed        = useRef(false)

  // Keep value in sync if the store updates externally
  useEffect(() => { setValue(envelope.name) }, [envelope.name])

  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus()
      onFocused()
    }
  }, [autoFocus, onFocused])

  async function handleBlur() {
    const trimmed      = value.trim()
    const didPressEnter = enterPressed.current
    enterPressed.current = false

    // Empty name — revert and do nothing (don't chain a new envelope)
    if (!trimmed) { setValue(envelope.name); return }

    if (trimmed !== envelope.name) {
      setSaving(true)
      try {
        await onRename(envelope.id, trimmed)
      } finally {
        setSaving(false)
      }
    }

    // Enter was pressed with a valid name → create the next sibling
    if (didPressEnter && onCreateNext) {
      await onCreateNext()
    }
  }

  return (
    <div
      className={`flex items-center gap-2 border-b px-4 py-2.5 ${isChild ? 'pl-8 relative' : ''}`}
      style={{ borderColor: 'var(--border)' }}
    >
      {/* Pink child rule */}
      {isChild && <span className="child-envelope-rule" />}

      <input
        ref={inputRef}
        className="input flex-1 py-1.5 text-sm"
        placeholder="Envelope name"
        value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            enterPressed.current = true
            inputRef.current?.blur()
          }
        }}
        disabled={saving}
        aria-label={`Envelope name: ${envelope.name || 'new envelope'}`}
      />

      {/* Add child button — only on top-level envelopes */}
      {!isChild && (
        <button
          className="btn-ghost px-2 py-1.5 text-xs gap-1"
          title="Add child envelope"
          aria-label={`Add child envelope to ${envelope.name}`}
          onClick={() => onAddChild(envelope.id)}
        >
          <Plus className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Add</span>
        </button>
      )}

      <button
        className="flex h-8 w-8 items-center justify-center rounded-md transition-colors"
        style={{ color: isDeleting ? 'var(--text-subtle)' : 'var(--text-subtle)' }}
        title="Delete envelope"
        aria-label={`Delete envelope: ${envelope.name}`}
        disabled={isDeleting}
        onClick={() => onDelete(envelope)}
        onMouseEnter={e => { if (!isDeleting) e.currentTarget.style.color = 'var(--danger)' }}
        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-subtle)')}
      >
        {isDeleting ? <span className="spinner h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
      </button>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function EnvelopesPage() {
  const { envelopes, isLoading, fetch, add, rename, remove } = useEnvelopeStore()
  const { withSave }  = useSave()
  const { toast }     = useToast()

  const [pendingDelete, setPendingDelete]   = useState<Envelope | null>(null)
  const [newlyAddedId,  setNewlyAddedId]    = useState<string | null>(null)
  const [isAdding,      setIsAdding]        = useState(false)
  const [checkingId,    setCheckingId]      = useState<string | null>(null)

  useEffect(() => { fetch() }, [fetch])

  // ── Sorted display list ──────────────────────────────────────────────────
  const topLevel = envelopes
    .filter(e => e.parent_id === null)
    .sort((a, b) => a.display_order - b.display_order)

  const childrenOf = (parentId: string) =>
    envelopes
      .filter(e => e.parent_id === parentId)
      .sort((a, b) => a.display_order - b.display_order)

  // ── Handlers ─────────────────────────────────────────────────────────────

  async function handleRename(id: string, name: string) {
    await withSave(async () => {
      await rename(id, name)
      toast('Envelope renamed')
    })
  }

  const handleAddTop = useCallback(async () => {
    setIsAdding(true)
    try {
      const e = await add('', null)
      setNewlyAddedId(e.id)
    } catch {
      toast('Failed to add envelope', 'error')
    } finally {
      setIsAdding(false)
    }
  }, [add, toast])

  const handleAddChild = useCallback(async (parentId: string) => {
    try {
      const e = await add('', parentId)
      setNewlyAddedId(e.id)
    } catch {
      toast('Failed to add child envelope', 'error')
    }
  }, [add, toast])

  async function handleDeleteClick(envelope: Envelope) {
    setCheckingId(envelope.id)
    try {
      const blocker = await getDeleteBlocker(envelope.id, envelopes)
      if (blocker) {
        toast(blocker, 'error')
        return
      }
      setPendingDelete(envelope)
    } finally {
      setCheckingId(null)
    }
  }

  async function handleDeleteConfirm() {
    if (!pendingDelete) return
    try {
      await remove(pendingDelete.id)
      toast('Envelope deleted')
    } catch {
      toast('Failed to delete envelope', 'error')
    } finally {
      setPendingDelete(null)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 lg:p-6 max-w-2xl">

      {/* Page header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <Link
            to="/settings"
            className="flex h-8 w-8 items-center justify-center rounded-md transition-colors"
            style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <h1 className="page-title">Manage Envelopes</h1>
        </div>
        <button
          className="btn-primary"
          onClick={handleAddTop}
          disabled={isAdding}
        >
          <Plus className="h-4 w-4" />
          New envelope
        </button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="card p-8 text-center">
          <span className="spinner" style={{ color: 'var(--text-subtle)' }} />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && envelopes.length === 0 && (
        <div className="card">
          <div className="empty-state">
            <FolderOpen className="empty-state-icon" />
            <p className="empty-state-title">No envelopes yet</p>
            <p className="empty-state-body">
              Create your first envelope to start budgeting.
            </p>
            <button className="btn-primary mt-2" onClick={handleAddTop} disabled={isAdding}>
              <Plus className="h-4 w-4" />
              New envelope
            </button>
          </div>
        </div>
      )}

      {/* Envelope list */}
      {!isLoading && envelopes.length > 0 && (
        <div className="card overflow-hidden">
          {topLevel.map(env => (
            <div key={env.id}>
              {/* Top-level row */}
              <EnvelopeRow
                envelope={env}
                isChild={false}
                onRename={handleRename}
                onAddChild={handleAddChild}
                onDelete={handleDeleteClick}
                isDeleting={checkingId === env.id}
                autoFocus={newlyAddedId === env.id}
                onFocused={() => setNewlyAddedId(null)}
                onCreateNext={handleAddTop}
              />
              {/* Children */}
              {childrenOf(env.id).map(child => (
                <EnvelopeRow
                  key={child.id}
                  envelope={child}
                  isChild={true}
                  onRename={handleRename}
                  onAddChild={handleAddChild}
                  onDelete={handleDeleteClick}
                  isDeleting={checkingId === child.id}
                  autoFocus={newlyAddedId === child.id}
                  onFocused={() => setNewlyAddedId(null)}
                  onCreateNext={() => handleAddChild(child.parent_id!)}
                />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Delete confirmation modal */}
      {pendingDelete && (
        <ConfirmDeleteModal
          name={pendingDelete.name}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  )
}
