/**
 * Edit Transaction Modal  (BRD §4.6.2)
 *
 * Two variants:
 *   Paycheque  — all fields read-only; shows split allocation breakdown
 *   Regular    — description/amount/date locked if CSV-imported (import_batch_id set);
 *                envelope, kind, notes always editable;
 *                "Split across envelopes" toggle for multi-envelope splits
 *
 * Soft-delete available for all except opening-balance transactions.
 */

import { useState }            from 'react'
import { X, Trash2, Plus, Minus } from 'lucide-react'
import { useEnvelopeStore }    from '../stores/useEnvelopeStore'
import { useTransactionStore } from '../stores/useTransactionStore'
import { useBankAccountStore } from '../stores/useBankAccountStore'
import { useToast }            from '../contexts/ToastContext'
import { formatCurrency, formatDate, KIND_LABELS } from '../lib/formatters'
import { round2 }              from '../lib/allocations'
import { SourceBadge }         from './SourceBadge'
import type { Transaction, TransactionKind, Envelope } from '../types/database'

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildEnvelopeGroups(envelopes: Envelope[]) {
  const parentIdSet = new Set(envelopes.map(e => e.parent_id).filter(Boolean) as string[])
  const parents = envelopes.filter(e => parentIdSet.has(e.id))
  const orphans = envelopes.filter(e => !e.parent_id && !parentIdSet.has(e.id))
  const groups  = parents.map(parent => ({
    parent,
    children: envelopes.filter(e => e.parent_id === parent.id),
  }))
  return { orphans, groups }
}

interface SplitGroup {
  parent: Envelope | null
  rows:   Array<{ envelope: Envelope; amount: number }>
}

function groupSplitsByParent(
  splits:    Record<string, number>,
  envelopes: Envelope[],
): SplitGroup[] {
  const byParent = new Map<string, SplitGroup>()

  for (const [envId, amt] of Object.entries(splits)) {
    const env = envelopes.find(e => e.id === envId)
    if (!env) continue
    const parentId = env.parent_id ?? null
    const parent   = parentId ? (envelopes.find(e => e.id === parentId) ?? null) : null
    const key      = parentId ?? `__orphan__${envId}`

    if (!byParent.has(key)) byParent.set(key, { parent, rows: [] })
    byParent.get(key)!.rows.push({ envelope: env, amount: amt })
  }

  // Grouped (has parent) before standalones
  return [...byParent.values()].sort((a, b) =>
    a.parent && !b.parent ? -1 : !a.parent && b.parent ? 1 : 0,
  )
}

const EDITABLE_KINDS: TransactionKind[] = [
  'expense', 'cash-income', 'cash-income-split', 'income-other', 'ignored',
]

// ── Paycheque read-only view ──────────────────────────────────────────────────

function PaychequeView({
  tx, envelopes, onClose,
}: { tx: Transaction; envelopes: Envelope[]; onClose: () => void }) {
  const splits = tx.splits ?? {}

  return (
    <>
      <div className="flex flex-col gap-3 mb-5">
        <Row label="Date"        value={formatDate(tx.date)} />
        <Row label="Description" value={tx.description} />
        <Row label="Amount"      value={formatCurrency(tx.amount)} />

        {Object.keys(splits).length > 0 && (
          <div>
            <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>
              Allocation breakdown
            </p>
            <div className="rounded-lg border overflow-hidden"
              style={{ borderColor: 'var(--border)' }}>
              {groupSplitsByParent(splits, envelopes).map((group, gi) => (
                <div key={gi}>
                  {group.parent && (
                    <div
                      className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide"
                      style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}
                    >
                      {group.parent.name}
                    </div>
                  )}
                  {group.rows.map(({ envelope, amount }) => (
                    <div key={envelope.id}
                      className="flex justify-between items-center border-b px-3 py-2 text-sm last:border-b-0"
                      style={{ borderColor: 'var(--border)' }}>
                      <span style={{ color: 'var(--text-muted)', paddingLeft: group.parent ? '0.75rem' : 0 }}>
                        {envelope.name}
                      </span>
                      <span className="tabular-nums" style={{ color: 'var(--text)' }}>
                        {formatCurrency(amount)}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="flex justify-end">
        <button className="btn-primary" onClick={onClose}>Close</button>
      </div>
    </>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className="text-sm" style={{ color: 'var(--text)' }}>{value}</p>
    </div>
  )
}

// ── Split editor ──────────────────────────────────────────────────────────────

interface SplitLine { id: string; envelopeId: string; amount: string }

function SplitEditor({
  totalAmount,
  envelopes,
  initial,
  onChange,
}: {
  totalAmount:  number
  envelopes:    Envelope[]
  initial:      Record<string, number> | null
  onChange:     (splits: Record<string, number> | null) => void
}) {
  const { orphans, groups } = buildEnvelopeGroups(envelopes)

  const [lines, setLines] = useState<SplitLine[]>(() => {
    if (!initial || Object.keys(initial).length === 0)
      return [{ id: crypto.randomUUID(), envelopeId: '', amount: '' }]
    return Object.entries(initial).map(([envelopeId, amount]) => ({
      id: crypto.randomUUID(), envelopeId, amount: String(amount),
    }))
  })

  function update(updated: SplitLine[]) {
    setLines(updated)
    const valid = updated.filter(l => l.envelopeId && l.amount)
    if (valid.length < 2) { onChange(null); return }
    const splits: Record<string, number> = {}
    valid.forEach(l => { splits[l.envelopeId] = parseFloat(l.amount) || 0 })
    onChange(splits)
  }

  const allocated = lines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0)
  const remaining = round2(Math.abs(totalAmount) - allocated)
  const isOver    = remaining < -0.005
  const isExact   = Math.abs(remaining) <= 0.005

  return (
    <div>
      <div className="flex flex-col gap-2 mb-2">
        {lines.map((line, i) => (
          <div key={line.id} className="flex gap-2">
            <select
              className="select flex-1 py-1.5 text-sm"
              value={line.envelopeId}
              onChange={e => update(lines.map((l, j) => j === i ? { ...l, envelopeId: e.target.value } : l))}
            >
              <option value="">Select envelope…</option>
              {orphans.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              {groups.map(({ parent, children }) => (
                <optgroup key={parent.id} label={parent.name}>
                  {children.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </optgroup>
              ))}
            </select>
            <div className="relative w-28">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-xs"
                style={{ color: 'var(--text-subtle)' }}>$</span>
              <input className="input py-1.5 pl-6 text-sm w-full" type="number" min="0" step="0.01"
                value={line.amount}
                onChange={e => update(lines.map((l, j) => j === i ? { ...l, amount: e.target.value } : l))}
              />
            </div>
            <button className="flex h-8 w-8 items-center justify-center rounded-md transition-colors"
              style={{ color: 'var(--text-subtle)' }}
              onClick={() => update(lines.filter((_, j) => j !== i))}
              disabled={lines.length <= 1}
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      <button className="flex items-center gap-1 text-xs mb-3 transition-opacity hover:opacity-70"
        style={{ color: 'var(--pink)' }}
        onClick={() => update([...lines, { id: crypto.randomUUID(), envelopeId: '', amount: '' }])}>
        <Plus className="h-3 w-3" /> Add line
      </button>

      <div className="flex justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
        <span>Allocated: <span className="font-medium" style={{ color: 'var(--text)' }}>{formatCurrency(allocated)}</span></span>
        <span style={{ color: isOver ? 'var(--danger)' : isExact ? 'var(--success)' : 'var(--warning)' }}>
          {isOver ? `$${Math.abs(remaining).toFixed(2)} over` : isExact ? 'Balanced' : `$${remaining.toFixed(2)} remaining`}
        </span>
      </div>
    </div>
  )
}

// ── Main modal ─────────────────────────────────────────────────────────────────

interface Props {
  transaction: Transaction
  onClose:     () => void
}

export function EditTransactionModal({ transaction: tx, onClose }: Props) {
  const { envelopes }                  = useEnvelopeStore()
  const { update, softDelete }         = useTransactionStore()
  const { accounts }                   = useBankAccountStore()
  const { toast }                      = useToast()

  const isPaycheque  = tx.kind === 'paycheque'
  const isOpeningBal = tx.kind === 'opening-balance'
  const isImported   = tx.import_batch_id !== null
  const { orphans: mainOrphans, groups: mainGroups } = buildEnvelopeGroups(envelopes)

  const [kind,        setKind]        = useState<TransactionKind>(tx.kind)
  const [envelopeId,  setEnvelopeId]  = useState<string>(tx.envelope_id ?? '')
  const [notes,       setNotes]       = useState(tx.notes ?? '')
  const [splitMode,   setSplitMode]   = useState(
    tx.kind === 'cash-income-split' || (tx.splits && Object.keys(tx.splits).length > 0),
  )
  const [splits,      setSplits]      = useState<Record<string, number> | null>(tx.splits)
  const [saving,      setSaving]      = useState(false)
  const [confirming,  setConfirming]  = useState(false)

  // Local draft state for editable fields on non-imported transactions (BUG-04 fix:
  // previously these called update() on every keystroke, writing to the DB in real-time)
  const [draftDate,   setDraftDate]   = useState(tx.date)
  const [draftAmount, setDraftAmount] = useState(String(tx.amount))
  const [draftDesc,   setDraftDesc]   = useState(tx.description)

  async function handleSave() {
    setSaving(true)
    try {
      const patch: Partial<Transaction> = { notes: notes || null }

      // Include manually-entered field edits only for non-imported transactions
      if (!isImported) {
        const parsedAmount = parseFloat(draftAmount)
        patch.date        = draftDate || tx.date
        patch.amount      = isNaN(parsedAmount) ? tx.amount : parsedAmount
        patch.description = draftDesc.trim() || tx.description
      }

      if (!isPaycheque && !isOpeningBal) {
        patch.kind       = kind
        if (splitMode && splits && Object.keys(splits).length >= 2) {
          patch.splits        = splits
          patch.envelope_id   = null
          patch.how_categorised = 'split'
          patch.kind          = kind === 'cash-income' ? 'cash-income-split' : kind
        } else {
          patch.envelope_id   = envelopeId || null
          patch.splits        = null
          patch.review        = envelopeId ? false : tx.review
          if (envelopeId && tx.review) patch.how_categorised = 'manual'
        }
      }

      await update(tx.id, patch)
      toast('Transaction saved')
      onClose()
    } catch {
      toast('Failed to save', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setSaving(true)
    try {
      await softDelete(tx.id)
      toast('Transaction deleted')
      onClose()
    } catch {
      toast('Failed to delete', 'error')
    } finally {
      setSaving(false); setConfirming(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>
            {isPaycheque ? 'Paycheque' : 'Edit Transaction'}
          </h2>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-md"
            style={{ color: 'var(--text-subtle)' }} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        {isPaycheque ? (
          <PaychequeView tx={tx} envelopes={envelopes} onClose={onClose} />
        ) : (
          <>
            {/* Locked fields (imported) */}
            {isImported && (
              <div className="flex flex-col gap-3 mb-4 rounded-lg p-3"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <div className="grid grid-cols-2 gap-3">
                  <Row label="Date"   value={formatDate(tx.date)} />
                  <Row label="Amount" value={formatCurrency(tx.amount)} />
                </div>
                <Row label="Description" value={tx.description} />
                <div className="flex items-center justify-between">
                  <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>
                    Date, amount, and description are locked for imported transactions.
                  </p>
                  <SourceBadge
                    bankAccountId={tx.bank_account_id}
                    importBatchId={tx.import_batch_id}
                    accounts={accounts}
                  />
                </div>
              </div>
            )}

            {/* Editable fields (manual entry) */}
            {!isImported && (
              <div className="flex flex-col gap-3 mb-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Date</label>
                    <input className="input text-sm" type="date"
                      value={draftDate}
                      onChange={e => setDraftDate(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Amount</label>
                    <input className="input text-sm" type="number" step="0.01"
                      value={draftAmount}
                      onChange={e => setDraftAmount(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Description</label>
                  <input className="input text-sm"
                    value={draftDesc}
                    onChange={e => setDraftDesc(e.target.value)} />
                </div>
              </div>
            )}

            {/* Kind — always editable for all non-paycheque, non-opening-balance transactions */}
            {!isOpeningBal && (
              <div className="mb-4">
                <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Kind</label>
                <select className="select text-sm w-full" value={kind}
                  onChange={e => setKind(e.target.value as TransactionKind)}>
                  {EDITABLE_KINDS.map(k => (
                    <option key={k} value={k}>{KIND_LABELS[k]}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Envelope / split */}
            {!isOpeningBal && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                    Envelope
                  </label>
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer"
                    style={{ color: 'var(--text-muted)' }}>
                    <input type="checkbox" checked={splitMode ?? false}
                      onChange={e => setSplitMode(e.target.checked)} />
                    Split across envelopes
                  </label>
                </div>

                {splitMode ? (
                  <SplitEditor
                    totalAmount={tx.amount}
                    envelopes={envelopes}
                    initial={splits}
                    onChange={setSplits}
                  />
                ) : (
                  <select className="select text-sm w-full" value={envelopeId}
                    onChange={e => setEnvelopeId(e.target.value)}>
                    <option value="">— Unassigned —</option>
                    {mainOrphans.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                    {mainGroups.map(({ parent, children }) => (
                      <optgroup key={parent.id} label={parent.name}>
                        {children.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                      </optgroup>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* Notes */}
            <div className="mb-5">
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Notes</label>
              <textarea className="input text-sm resize-none" rows={2}
                value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Optional note…" />
            </div>

            {/* Delete confirmation */}
            {confirming ? (
              <div className="mb-4 rounded-lg border px-4 py-3 text-sm"
                style={{ borderColor: 'var(--danger)', color: 'var(--danger)',
                  background: 'color-mix(in srgb, var(--danger) 8%, transparent)' }}>
                <p className="mb-3">Delete this transaction? This cannot be undone.</p>
                <div className="flex gap-2">
                  <button className="btn-danger text-xs px-3 py-1.5" onClick={handleDelete} disabled={saving}>
                    Yes, delete
                  </button>
                  <button className="btn-ghost text-xs px-3 py-1.5" onClick={() => setConfirming(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}

            {/* Actions */}
            <div className="flex items-center justify-between">
              {!isOpeningBal ? (
                <button className="flex items-center gap-1.5 text-sm transition-opacity hover:opacity-70"
                  style={{ color: 'var(--text-subtle)' }}
                  onClick={() => setConfirming(true)}>
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              ) : <span />}
              <div className="flex gap-2">
                <button className="btn-ghost" onClick={onClose}>Cancel</button>
                <button className="btn-primary" onClick={handleSave} disabled={saving}>
                  {saving ? <span className="spinner" /> : null} Save
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
