import { useEffect, useRef, useState } from 'react'
import { ChevronUp, ChevronDown, MoreVertical, Plus, Receipt } from 'lucide-react'
import { useExpensesStore }  from '../stores/useExpensesStore'
import { useToast }          from '../contexts/ToastContext'
import { useSave }           from '../contexts/SaveContext'
import { formatCurrency }    from '../lib/formatters'
import type { ExpenseCategory, ExpenseItem, ExpenseFrequency } from '../types/database'

// ── Frequency config ──────────────────────────────────────────────────────────

const FREQ_LABELS: Record<ExpenseFrequency, string> = {
  weekly:      'Weekly',
  fortnightly: 'Fortnightly',
  monthly:     'Monthly',
  quarterly:   'Quarterly',
  annually:    'Annually',
}

const FREQ_TO_ANNUAL: Record<ExpenseFrequency, number> = {
  weekly:      52,
  fortnightly: 26,
  monthly:     12,
  quarterly:   4,
  annually:    1,
}

function toAnnual(amount: number, freq: ExpenseFrequency): number {
  return amount * FREQ_TO_ANNUAL[freq]
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ── Move Item Modal ───────────────────────────────────────────────────────────

function MoveItemModal({
  item,
  categories,
  onMove,
  onClose,
}: {
  item:       ExpenseItem
  categories: ExpenseCategory[]
  onMove:     (newCategoryId: string) => Promise<void>
  onClose:    () => void
}) {
  const others = categories.filter(c => c.id !== item.category_id)
  const [selected, setSelected] = useState(others[0]?.id ?? '')
  const [saving,   setSaving]   = useState(false)

  async function handleMove() {
    if (!selected) return
    setSaving(true)
    try {
      await onMove(selected)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2 className="text-base font-semibold mb-1" style={{ color: 'var(--text)' }}>Move item</h2>
        <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
          Moving <strong style={{ color: 'var(--text)' }}>{item.name}{item.description ? ` — ${item.description}` : ''}</strong>
        </p>
        <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Destination envelope</label>
        <select
          className="select text-sm w-full mb-5"
          value={selected}
          onChange={e => setSelected(e.target.value)}
        >
          <option value="">Select an envelope…</option>
          {others.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            disabled={!selected || saving}
            onClick={handleMove}
          >
            {saving ? 'Moving…' : 'Move'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Edit Envelope Modal ───────────────────────────────────────────────────────

function EditEnvelopeModal({
  category,
  onSave,
  onClose,
}: {
  category: ExpenseCategory
  onSave:   (name: string) => Promise<void>
  onClose:  () => void
}) {
  const [name,   setName]   = useState(category.name)
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus(); ref.current?.select() }, [])

  async function handleSave() {
    const trimmed = name.trim()
    if (!trimmed) return
    setSaving(true)
    try { await onSave(trimmed); onClose() } finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--text)' }}>Edit envelope</h2>
        <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Envelope name</label>
        <input
          ref={ref}
          className="input text-sm w-full mb-5"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onClose() }}
        />
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            disabled={!name.trim() || saving}
            onClick={handleSave}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Edit Item Modal ───────────────────────────────────────────────────────────

function EditItemModal({
  item,
  onSave,
  onClose,
}: {
  item:    ExpenseItem
  onSave:  (patch: { name: string; description: string | null; amount: number; frequency: ExpenseFrequency }) => Promise<void>
  onClose: () => void
}) {
  const [name,      setName]      = useState(item.name)
  const [desc,      setDesc]      = useState(item.description ?? '')
  const [amount,    setAmount]    = useState(String(item.amount))
  const [frequency, setFrequency] = useState<ExpenseFrequency>(item.frequency)
  const [saving,    setSaving]    = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus(); ref.current?.select() }, [])

  async function handleSave() {
    const parsed = parseFloat(amount)
    if (!name.trim() || isNaN(parsed) || parsed <= 0) return
    setSaving(true)
    try {
      await onSave({ name: name.trim(), description: desc.trim() || null, amount: parsed, frequency })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--text)' }}>Edit item</h2>

        <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Item name</label>
        <input
          ref={ref}
          className="input text-sm w-full mb-3"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Escape' && onClose()}
        />

        <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Description (optional)</label>
        <input
          className="input text-sm w-full mb-3"
          value={desc}
          onChange={e => setDesc(e.target.value)}
          onKeyDown={e => e.key === 'Escape' && onClose()}
        />

        <div className="flex gap-3 mb-5">
          <div className="flex-1">
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Amount</label>
            <input
              className="input text-sm w-full text-right"
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              onKeyDown={e => e.key === 'Escape' && onClose()}
            />
          </div>
          <div className="flex-1">
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Frequency</label>
            <select
              className="select text-sm w-full"
              value={frequency}
              onChange={e => setFrequency(e.target.value as ExpenseFrequency)}
            >
              {(Object.keys(FREQ_LABELS) as ExpenseFrequency[]).map(f => (
                <option key={f} value={f}>{FREQ_LABELS[f]}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            disabled={!name.trim() || !amount || saving}
            onClick={handleSave}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Row menu (⋮) ──────────────────────────────────────────────────────────────

function RowMenu({
  onEdit,
  onMove,
  onRemove,
}: {
  onEdit:   () => void
  onMove:   () => void
  onRemove: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        className="btn-ghost p-1"
        aria-label="Item options"
        onClick={() => setOpen(o => !o)}
        style={{ color: 'var(--text-subtle)' }}
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div
          style={{
            position:   'absolute',
            right:      0,
            top:        '100%',
            marginTop:  4,
            background: 'var(--surface)',
            border:     '1px solid var(--border)',
            borderRadius: 8,
            boxShadow:  '0 4px 12px rgba(0,0,0,0.1)',
            minWidth:   130,
            zIndex:     50,
            padding:    '4px 0',
          }}
        >
          <button
            className="w-full text-left px-3 py-2 text-sm flex items-center gap-2"
            style={{ color: 'var(--text)', background: 'none', border: 'none', cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            onClick={() => { setOpen(false); onEdit() }}
          >
            Edit
          </button>
          <button
            className="w-full text-left px-3 py-2 text-sm flex items-center gap-2"
            style={{ color: 'var(--text)', background: 'none', border: 'none', cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            onClick={() => { setOpen(false); onMove() }}
          >
            Move
          </button>
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
          <button
            className="w-full text-left px-3 py-2 text-sm flex items-center gap-2"
            style={{ color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            onClick={() => { setOpen(false); onRemove() }}
          >
            Remove
          </button>
        </div>
      )}
    </div>
  )
}

// ── Envelope menu (⋮) ─────────────────────────────────────────────────────────

function EnvelopeMenu({
  isFirst,
  isLast,
  onEdit,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  isFirst:    boolean
  isLast:     boolean
  onEdit:     () => void
  onMoveUp:   () => void
  onMoveDown: () => void
  onRemove:   () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        className="btn-ghost p-1"
        aria-label="Envelope options"
        onClick={() => setOpen(o => !o)}
        style={{ color: 'var(--text-subtle)' }}
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div
          style={{
            position:   'absolute',
            right:      0,
            top:        '100%',
            marginTop:  4,
            background: 'var(--surface)',
            border:     '1px solid var(--border)',
            borderRadius: 8,
            boxShadow:  '0 4px 12px rgba(0,0,0,0.1)',
            minWidth:   140,
            zIndex:     50,
            padding:    '4px 0',
          }}
        >
          <button
            className="w-full text-left px-3 py-2 text-sm flex items-center gap-2"
            style={{ color: 'var(--text)', background: 'none', border: 'none', cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            onClick={() => { setOpen(false); onEdit() }}
          >
            Edit
          </button>
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
          <button
            disabled={isFirst}
            className="w-full text-left px-3 py-2 text-sm flex items-center gap-2"
            style={{
              color: isFirst ? 'var(--text-subtle)' : 'var(--text)',
              background: 'none', border: 'none',
              cursor: isFirst ? 'default' : 'pointer',
              opacity: isFirst ? 0.45 : 1,
            }}
            onMouseEnter={e => { if (!isFirst) e.currentTarget.style.background = 'var(--surface-2)' }}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            onClick={() => { if (!isFirst) { setOpen(false); onMoveUp() } }}
          >
            <ChevronUp className="h-3.5 w-3.5" /> Move up
          </button>
          <button
            disabled={isLast}
            className="w-full text-left px-3 py-2 text-sm flex items-center gap-2"
            style={{
              color: isLast ? 'var(--text-subtle)' : 'var(--text)',
              background: 'none', border: 'none',
              cursor: isLast ? 'default' : 'pointer',
              opacity: isLast ? 0.45 : 1,
            }}
            onMouseEnter={e => { if (!isLast) e.currentTarget.style.background = 'var(--surface-2)' }}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            onClick={() => { if (!isLast) { setOpen(false); onMoveDown() } }}
          >
            <ChevronDown className="h-3.5 w-3.5" /> Move down
          </button>
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
          <button
            className="w-full text-left px-3 py-2 text-sm"
            style={{ color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            onClick={() => { setOpen(false); onRemove() }}
          >
            Remove
          </button>
        </div>
      )}
    </div>
  )
}

// ── Add Item Form ─────────────────────────────────────────────────────────────

function AddItemForm({
  onSave,
  onCancel,
}: {
  onSave:   (data: { name: string; description: string | null; amount: number; frequency: ExpenseFrequency }) => Promise<void>
  onCancel: () => void
}) {
  const [name,      setName]      = useState('')
  const [desc,      setDesc]      = useState('')
  const [amount,    setAmount]    = useState('')
  const [frequency, setFrequency] = useState<ExpenseFrequency>('monthly')
  const [saving,    setSaving]    = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => { nameRef.current?.focus() }, [])

  async function handleSave() {
    const parsed = parseFloat(amount)
    if (!name.trim() || isNaN(parsed) || parsed <= 0) return
    setSaving(true)
    try {
      await onSave({ name: name.trim(), description: desc.trim() || null, amount: parsed, frequency })
    } finally {
      setSaving(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSave()
    if (e.key === 'Escape') onCancel()
  }

  return (
    <tr style={{ background: 'var(--surface-2)' }}>
      <td className="px-4 py-2">
        <input
          ref={nameRef}
          className="input text-sm py-1 w-full"
          placeholder="Item name"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </td>
      <td className="px-4 py-2">
        <input
          className="input text-sm py-1 w-full"
          placeholder="Description (optional)"
          value={desc}
          onChange={e => setDesc(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </td>
      <td className="px-4 py-2">
        <input
          className="input text-sm py-1 w-full text-right"
          type="number"
          min="0"
          step="0.01"
          placeholder="0.00"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </td>
      <td className="px-4 py-2">
        <select
          className="select text-sm py-1 w-full"
          value={frequency}
          onChange={e => setFrequency(e.target.value as ExpenseFrequency)}
        >
          {(Object.keys(FREQ_LABELS) as ExpenseFrequency[]).map(f => (
            <option key={f} value={f}>{FREQ_LABELS[f]}</option>
          ))}
        </select>
      </td>
      <td className="px-4 py-2 text-right">
        <div className="flex items-center justify-end gap-1">
          <button className="btn-ghost py-1 px-2 text-xs" onClick={onCancel}>Cancel</button>
          <button
            className="btn-primary py-1 px-2 text-xs"
            disabled={!name.trim() || !amount || saving}
            onClick={handleSave}
          >
            {saving ? '…' : 'Save'}
          </button>
        </div>
      </td>
    </tr>
  )
}

// ── Envelope Card ─────────────────────────────────────────────────────────────

function EnvelopeCard({
  category,
  items,
  isFirst,
  isLast,
  onEdit,
  onMoveUp,
  onMoveDown,
  onRemove,
  onAddItem,
  onRemoveItem,
  onMoveItem,
  onEditItem,
}: {
  category:    ExpenseCategory
  items:       ExpenseItem[]
  isFirst:     boolean
  isLast:      boolean
  onEdit:       () => void
  onMoveUp:    () => void
  onMoveDown:  () => void
  onRemove:    () => void
  onAddItem:   (data: { name: string; description: string | null; amount: number; frequency: ExpenseFrequency }) => Promise<void>
  onRemoveItem: (id: string) => void
  onMoveItem:   (item: ExpenseItem) => void
  onEditItem:   (item: ExpenseItem) => void
}) {
  const [addingItem,    setAddingItem]    = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)

  const annual      = items.reduce((sum, i) => sum + toAnnual(i.amount, i.frequency), 0)
  const perFortnight = round2(annual / 26)
  const perMonth     = round2(annual / 12)

  return (
    <div className="card mb-4 overflow-visible" style={{ padding: 0 }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{category.name}</h2>
        <EnvelopeMenu
          isFirst={isFirst}
          isLast={isLast}
          onEdit={onEdit}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          onRemove={() => setConfirmRemove(true)}
        />
      </div>

      {/* Items table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <th className="text-left px-4 py-2 text-xs font-medium" style={{ color: 'var(--text-muted)', width: '26%' }}>Item</th>
            <th className="text-left px-4 py-2 text-xs font-medium" style={{ color: 'var(--text-muted)', width: '26%' }}>Description</th>
            <th className="text-right px-4 py-2 text-xs font-medium" style={{ color: 'var(--text-muted)', width: '16%' }}>Amount</th>
            <th className="text-right px-4 py-2 text-xs font-medium" style={{ color: 'var(--text-muted)', width: '20%' }}>Frequency</th>
            <th style={{ width: '12%' }} />
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
              <td className="px-4 py-2.5 font-medium" style={{ color: 'var(--text)' }}>{item.name}</td>
              <td className="px-4 py-2.5" style={{ color: 'var(--text-muted)', fontSize: 12 }}>{item.description ?? ''}</td>
              <td className="px-4 py-2.5 text-right" style={{ color: 'var(--text)' }}>{formatCurrency(item.amount)}</td>
              <td className="px-4 py-2.5 text-right">
                <span
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}
                >
                  {FREQ_LABELS[item.frequency]}
                </span>
              </td>
              <td className="px-4 py-2.5 text-right">
                <RowMenu
                  onEdit={() => onEditItem(item)}
                  onMove={() => onMoveItem(item)}
                  onRemove={() => onRemoveItem(item.id)}
                />
              </td>
            </tr>
          ))}

          {addingItem ? (
            <AddItemForm
              onSave={async data => { await onAddItem(data); setAddingItem(false) }}
              onCancel={() => setAddingItem(false)}
            />
          ) : (
            <tr>
              <td colSpan={5} className="px-4 py-2 text-right">
                <button
                  className="btn-ghost text-xs flex items-center gap-1 ml-auto"
                  style={{ color: 'var(--text-subtle)' }}
                  onClick={() => setAddingItem(true)}
                >
                  <Plus className="h-3 w-3" /> Add item
                </button>
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Remove confirm strip */}
      {confirmRemove && (
        <div
          className="flex items-center justify-between px-4 py-2.5"
          style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)' }}
        >
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Remove <strong style={{ color: 'var(--text)' }}>{category.name}</strong>?
            {items.length > 0 && (
              <> This will permanently remove <strong style={{ color: 'var(--text)' }}>{items.length} item{items.length !== 1 ? 's' : ''}</strong>.</>
            )}
          </p>
          <div className="flex gap-2">
            <button className="btn-ghost text-sm py-1 px-3" onClick={() => setConfirmRemove(false)}>Cancel</button>
            <button
              className="text-sm py-1 px-3 rounded"
              style={{
                background: 'none',
                border:     '1px solid var(--border)',
                color:      'var(--danger)',
                cursor:     'pointer',
              }}
              onClick={onRemove}
            >
              Yes, remove
            </button>
          </div>
        </div>
      )}

      {/* Tally footer */}
      <div
        style={{
          display:     'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          borderTop:   '1px solid var(--border)',
        }}
      >
        {([
          ['Per fortnight', formatCurrency(perFortnight)],
          ['Per month',     formatCurrency(perMonth)],
          ['Per year',      formatCurrency(round2(annual))],
        ] as [string, string][]).map(([label, value], i) => (
          <div
            key={label}
            className="py-2.5 text-center"
            style={{ borderLeft: i > 0 ? '1px solid var(--border)' : undefined }}
          >
            <div className="text-xs mb-0.5" style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
            <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Add Envelope Form ─────────────────────────────────────────────────────────

function AddEnvelopeForm({
  onSave,
  onCancel,
}: {
  onSave:   (name: string) => Promise<void>
  onCancel: () => void
}) {
  const [name,   setName]   = useState('')
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus() }, [])

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    try { await onSave(name.trim()) } finally { setSaving(false) }
  }

  return (
    <div className="card mb-4 flex items-center gap-3 px-4 py-3">
      <input
        ref={ref}
        className="input text-sm flex-1"
        placeholder="Envelope name"
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onCancel() }}
      />
      <button className="btn-ghost text-sm py-1.5 px-3" onClick={onCancel}>Cancel</button>
      <button
        className="btn-primary text-sm py-1.5 px-3"
        disabled={!name.trim() || saving}
        onClick={handleSave}
      >
        {saving ? 'Adding…' : 'Add'}
      </button>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function ExpensesPage() {
  const { categories, items, isLoading, fetch,
    addCategory, updateCategory, removeCategory, moveCategoryUp, moveCategoryDown,
    addItem, updateItem, removeItem, moveItem,
  } = useExpensesStore()
  const { toast }    = useToast()
  const { withSave } = useSave()

  const [addingEnvelope,   setAddingEnvelope]   = useState(false)
  const [movingItem,       setMovingItem]        = useState<ExpenseItem | null>(null)
  const [editingCategory,  setEditingCategory]   = useState<ExpenseCategory | null>(null)
  const [editingItem,      setEditingItem]       = useState<ExpenseItem | null>(null)

  useEffect(() => { fetch() }, [fetch])

  const sorted = [...categories].sort((a, b) => a.sort_order - b.sort_order)

  async function handleAddCategory(name: string) {
    await withSave(async () => {
      try { await addCategory(name); setAddingEnvelope(false) }
      catch { toast('Failed to add envelope', 'error') }
    })
  }

  async function handleRemoveCategory(id: string) {
    await withSave(async () => {
      try { await removeCategory(id); toast('Envelope removed') }
      catch { toast('Failed to remove envelope', 'error') }
    })
  }

  async function handleMoveUp(id: string) {
    await withSave(async () => {
      try { await moveCategoryUp(id) }
      catch { toast('Failed to reorder', 'error') }
    })
  }

  async function handleMoveDown(id: string) {
    await withSave(async () => {
      try { await moveCategoryDown(id) }
      catch { toast('Failed to reorder', 'error') }
    })
  }

  async function handleAddItem(
    categoryId: string,
    data: { name: string; description: string | null; amount: number; frequency: ExpenseFrequency },
  ) {
    await withSave(async () => {
      try { await addItem(categoryId, data) }
      catch { toast('Failed to add item', 'error') }
    })
  }

  async function handleRemoveItem(id: string) {
    await withSave(async () => {
      try { await removeItem(id); toast('Item removed') }
      catch { toast('Failed to remove item', 'error') }
    })
  }

  async function handleMoveItem(newCategoryId: string) {
    if (!movingItem) return
    await withSave(async () => {
      try { await moveItem(movingItem.id, newCategoryId); toast('Item moved') }
      catch { toast('Failed to move item', 'error') }
    })
  }

  async function handleUpdateCategory(name: string) {
    if (!editingCategory) return
    await withSave(async () => {
      try { await updateCategory(editingCategory.id, name) }
      catch { toast('Failed to update envelope', 'error') }
    })
  }

  async function handleUpdateItem(
    patch: { name: string; description: string | null; amount: number; frequency: ExpenseFrequency },
  ) {
    if (!editingItem) return
    await withSave(async () => {
      try { await updateItem(editingItem.id, patch) }
      catch { toast('Failed to update item', 'error') }
    })
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Expenses</h1>
        <button
          className="btn-primary flex items-center gap-1.5 text-sm"
          onClick={() => setAddingEnvelope(true)}
        >
          <Plus className="h-4 w-4" /> Add envelope
        </button>
      </div>

      {isLoading && (
        <div className="card p-8 text-center">
          <span className="spinner" style={{ color: 'var(--text-subtle)' }} />
        </div>
      )}

      {!isLoading && sorted.length === 0 && !addingEnvelope && (
        <div className="card">
          <div className="empty-state">
            <Receipt className="empty-state-icon" />
            <p className="empty-state-title">No envelopes yet</p>
            <p className="empty-state-body">
              Create an envelope to start documenting your recurring expenses.
            </p>
            <button className="btn-primary" onClick={() => setAddingEnvelope(true)}>
              Add your first envelope
            </button>
          </div>
        </div>
      )}

      {addingEnvelope && (
        <AddEnvelopeForm
          onSave={handleAddCategory}
          onCancel={() => setAddingEnvelope(false)}
        />
      )}

      {sorted.map((cat, idx) => (
        <EnvelopeCard
          key={cat.id}
          category={cat}
          items={items.filter(i => i.category_id === cat.id).sort((a, b) => a.sort_order - b.sort_order)}
          isFirst={idx === 0}
          isLast={idx === sorted.length - 1}
          onEdit={() => setEditingCategory(cat)}
          onMoveUp={() => handleMoveUp(cat.id)}
          onMoveDown={() => handleMoveDown(cat.id)}
          onRemove={() => handleRemoveCategory(cat.id)}
          onAddItem={data => handleAddItem(cat.id, data)}
          onRemoveItem={handleRemoveItem}
          onMoveItem={setMovingItem}
          onEditItem={setEditingItem}
        />
      ))}

      {movingItem && (
        <MoveItemModal
          item={movingItem}
          categories={categories}
          onMove={handleMoveItem}
          onClose={() => setMovingItem(null)}
        />
      )}

      {editingCategory && (
        <EditEnvelopeModal
          category={editingCategory}
          onSave={handleUpdateCategory}
          onClose={() => setEditingCategory(null)}
        />
      )}

      {editingItem && (
        <EditItemModal
          item={editingItem}
          onSave={handleUpdateItem}
          onClose={() => setEditingItem(null)}
        />
      )}
    </div>
  )
}
