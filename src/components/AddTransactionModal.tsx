/**
 * Add Transaction Modal  (BRD §4.6.3)
 *
 * Three tabs:
 *   Expense    — negative amount, single envelope or split
 *   Cash       — positive amount, single envelope or split
 *   Other      — signed amount, kind = income-other | move-money
 *
 * Move money: takes $X from a source envelope and credits destination(s).
 *   Stored as kind='move-money', amount=-X, envelope_id=source,
 *   splits={dest: X} (always uses splits even for single destination).
 */

import { useState }            from 'react'
import { X, Plus, Minus }      from 'lucide-react'
import { useEnvelopeStore }    from '../stores/useEnvelopeStore'
import { useTransactionStore } from '../stores/useTransactionStore'
import { useToast }            from '../contexts/ToastContext'
import { today, formatCurrency } from '../lib/formatters'
import { round2 }              from '../lib/allocations'
import type { TransactionKind, Envelope } from '../types/database'

type Tab = 'expense' | 'cash' | 'other'

// ── Envelope grouping helpers ─────────────────────────────────────────────────

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

/** Renders a grouped envelope <select> with parent <optgroup> headers. */
function EnvelopeSelect({
  envelopes, value, onChange, placeholder = '— Unassigned —', className = '',
}: {
  envelopes:   Envelope[]
  value:       string
  onChange:    (id: string) => void
  placeholder?: string
  className?:  string
}) {
  const { orphans, groups } = buildEnvelopeGroups(envelopes)
  return (
    <select className={`select text-sm w-full ${className}`} value={value}
      onChange={e => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {orphans.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
      {groups.map(({ parent, children }) => (
        <optgroup key={parent.id} label={parent.name}>
          {children.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </optgroup>
      ))}
    </select>
  )
}

interface SplitLine { id: string; envelopeId: string; amount: string }

function newLine(): SplitLine {
  return { id: crypto.randomUUID(), envelopeId: '', amount: '' }
}

function SplitLines({
  total, envelopes, lines, onChange,
}: {
  total: number
  envelopes: Envelope[]
  lines: SplitLine[]
  onChange: (l: SplitLine[]) => void
}) {
  const allocated = lines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0)
  const remaining = round2(total - allocated)
  const isOver    = remaining < -0.005
  const isExact   = Math.abs(remaining) <= 0.005

  return (
    <div>
      <div className="flex flex-col gap-2 mb-2">
        {lines.map((line, i) => (
          <div key={line.id} className="flex gap-2 items-center">
            <EnvelopeSelect
              envelopes={envelopes}
              value={line.envelopeId}
              placeholder="Select envelope…"
              className="flex-1 py-1.5"
              onChange={id => onChange(lines.map((l, j) => j === i ? { ...l, envelopeId: id } : l))}
            />
            <div className="relative w-28">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-xs"
                style={{ color: 'var(--text-subtle)' }}>$</span>
              <input className="input py-1.5 pl-6 text-sm w-full" type="number" min="0" step="0.01"
                value={line.amount}
                onChange={e => onChange(lines.map((l, j) => j === i ? { ...l, amount: e.target.value } : l))} />
            </div>
            <button className="flex h-8 w-8 items-center justify-center rounded-md"
              style={{ color: 'var(--text-subtle)' }}
              onClick={() => onChange(lines.filter((_, j) => j !== i))}
              disabled={lines.length <= 2}>
              <Minus className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      <button className="flex items-center gap-1 text-xs mb-2 hover:opacity-70 transition-opacity"
        style={{ color: 'var(--pink)' }}
        onClick={() => onChange([...lines, newLine()])}>
        <Plus className="h-3 w-3" /> Add line
      </button>
      <div className="flex justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
        <span>Allocated: <span className="font-medium">{formatCurrency(allocated)}</span></span>
        <span style={{ color: isOver ? 'var(--danger)' : isExact ? 'var(--success)' : 'var(--warning)' }}>
          {isOver
            ? `$${Math.abs(remaining).toFixed(2)} over`
            : isExact ? 'Balanced'
            : `$${remaining.toFixed(2)} remaining`}
        </span>
      </div>
    </div>
  )
}

interface Props { onClose: () => void }

export function AddTransactionModal({ onClose }: Props) {
  const { envelopes }  = useEnvelopeStore()
  const { add }        = useTransactionStore()
  const { toast }      = useToast()

  const [tab,         setTab]        = useState<Tab>('expense')
  const [date,        setDate]        = useState(today())
  const [description, setDescription] = useState('')
  const [amount,      setAmount]      = useState('')
  const [notes,       setNotes]       = useState('')
  const [saving,      setSaving]      = useState(false)

  // Expense tab
  const [expEnvId,      setExpEnvId]      = useState('')
  const [expSplitMode,  setExpSplitMode]  = useState(false)
  const [expSplitLines, setExpSplitLines] = useState<SplitLine[]>([newLine(), newLine()])

  // Cash tab
  const [cashEnvId,      setCashEnvId]      = useState('')
  const [cashSplitMode,  setCashSplitMode]  = useState(false)
  const [cashSplitLines, setCashSplitLines] = useState<SplitLine[]>([newLine(), newLine()])

  // Other tab
  const [otherKind,       setOtherKind]       = useState<TransactionKind>('income-other')
  const [otherEnvId,      setOtherEnvId]      = useState('')
  // Move money
  const [moveSourceId,    setMoveSourceId]    = useState('')
  const [moveDestSplit,   setMoveDestSplit]   = useState(false)
  const [moveDestEnvId,   setMoveDestEnvId]   = useState('')
  const [moveDestLines,   setMoveDestLines]   = useState<SplitLine[]>([newLine(), newLine()])

  const amountNum = parseFloat(amount) || 0

  // Amount field label varies by tab/kind
  const amountLabel = tab === 'expense'
    ? 'Amount ($)'
    : tab === 'cash' || (tab === 'other' && otherKind === 'move-money')
      ? 'Amount ($, positive)'
      : 'Amount (signed $)'

  function validate(): string | null {
    if (!date)                    return 'Date is required.'
    if (!description.trim())      return 'Description is required.'
    if (!amount || amountNum === 0) return 'Amount must be non-zero.'
    if (tab === 'other' && otherKind === 'move-money') {
      if (!moveSourceId)          return 'Select a source (From) envelope.'
      if (!moveDestSplit && !moveDestEnvId) return 'Select a destination (To) envelope.'
    }
    return null
  }

  async function handleSave() {
    const err = validate()
    if (err) { toast(err, 'error'); return }
    setSaving(true)

    try {
      let kind:        TransactionKind             = 'expense'
      let finalAmount  = amountNum
      let envId:       string | null               = null
      let splits:      Record<string, number> | null = null

      if (tab === 'expense') {
        kind        = 'expense'
        finalAmount = -Math.abs(amountNum)
        if (expSplitMode) {
          envId  = null
          splits = Object.fromEntries(
            expSplitLines
              .filter(l => l.envelopeId && l.amount)
              .map(l => [l.envelopeId, parseFloat(l.amount) || 0]),
          )
          if (Object.keys(splits).length < 2) {
            toast('Add at least two split lines', 'error'); setSaving(false); return
          }
        } else {
          envId = expEnvId || null
        }

      } else if (tab === 'cash') {
        finalAmount = Math.abs(amountNum)
        if (cashSplitMode) {
          kind   = 'cash-income-split'
          envId  = null
          splits = Object.fromEntries(
            cashSplitLines
              .filter(l => l.envelopeId && l.amount)
              .map(l => [l.envelopeId, parseFloat(l.amount) || 0]),
          )
          if (Object.keys(splits).length < 2) {
            toast('Add at least two split lines', 'error'); setSaving(false); return
          }
        } else {
          kind  = 'cash-income'
          envId = cashEnvId || null
        }

      } else {
        // Other tab
        if (otherKind === 'move-money') {
          kind        = 'move-money'
          finalAmount = -Math.abs(amountNum)   // stored as negative (debit from source)
          envId       = moveSourceId            // source envelope
          if (moveDestSplit) {
            splits = Object.fromEntries(
              moveDestLines
                .filter(l => l.envelopeId && l.amount)
                .map(l => [l.envelopeId, parseFloat(l.amount) || 0]),
            )
            if (Object.keys(splits).length < 2) {
              toast('Add at least two destination split lines', 'error'); setSaving(false); return
            }
          } else {
            // Single destination — still use splits so computeBalances can credit it
            splits = { [moveDestEnvId]: Math.abs(amountNum) }
          }
        } else {
          kind        = otherKind
          finalAmount = amountNum   // signed as entered
          envId       = otherEnvId || null
        }
      }

      await add({
        date,
        description:     description.trim(),
        amount:          finalAmount,
        kind,
        envelope_id:     envId,
        splits,
        how_categorised: 'manual',
        review:          false,
        notes:           notes.trim() || null,
        import_batch_id: null,
        bank_account_id: null,
        deleted:         false,
      })

      toast('Transaction added')
      onClose()
    } catch {
      toast('Failed to add transaction', 'error')
    } finally {
      setSaving(false)
    }
  }

  const TAB_LABELS: Record<Tab, string> = {
    expense: 'Expense', cash: 'Cash income', other: 'Other',
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>
            Add Transaction
          </h2>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-md"
            style={{ color: 'var(--text-subtle)' }} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 rounded-lg p-1"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          {(['expense', 'cash', 'other'] as Tab[]).map(t => (
            <button key={t}
              className="flex-1 rounded-md py-1.5 text-sm font-medium transition-colors"
              style={tab === t
                ? { background: 'var(--pink)', color: '#fff' }
                : { color: 'var(--text-muted)' }}
              onClick={() => setTab(t)}>
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        {/* Shared fields */}
        <div className="flex flex-col gap-3 mb-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Date</label>
              <input className="input text-sm" type="date" value={date}
                onChange={e => setDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>
                {amountLabel}
              </label>
              <input className="input text-sm" type="number" min="0" step="0.01"
                value={amount} placeholder="0.00"
                onChange={e => setAmount(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Description</label>
            <input className="input text-sm" value={description} placeholder="Transaction description"
              onChange={e => setDescription(e.target.value)} />
          </div>

          {/* ── Expense tab ─────────────────────────────────────────────────── */}
          {tab === 'expense' && (
            <>
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Envelope</label>
                <label className="flex items-center gap-1.5 text-xs cursor-pointer"
                  style={{ color: 'var(--text-muted)' }}>
                  <input type="checkbox" checked={expSplitMode}
                    onChange={e => setExpSplitMode(e.target.checked)} />
                  Split across envelopes
                </label>
              </div>
              {expSplitMode ? (
                <SplitLines total={Math.abs(amountNum)} envelopes={envelopes}
                  lines={expSplitLines} onChange={setExpSplitLines} />
              ) : (
                <EnvelopeSelect envelopes={envelopes} value={expEnvId} onChange={setExpEnvId} />
              )}
            </>
          )}

          {/* ── Cash income tab ─────────────────────────────────────────────── */}
          {tab === 'cash' && (
            <>
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Envelope</label>
                <label className="flex items-center gap-1.5 text-xs cursor-pointer"
                  style={{ color: 'var(--text-muted)' }}>
                  <input type="checkbox" checked={cashSplitMode}
                    onChange={e => setCashSplitMode(e.target.checked)} />
                  Split across envelopes
                </label>
              </div>
              {cashSplitMode ? (
                <SplitLines total={amountNum} envelopes={envelopes}
                  lines={cashSplitLines} onChange={setCashSplitLines} />
              ) : (
                <EnvelopeSelect envelopes={envelopes} value={cashEnvId} onChange={setCashEnvId} />
              )}
            </>
          )}

          {/* ── Other tab ───────────────────────────────────────────────────── */}
          {tab === 'other' && (
            <>
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Kind</label>
                <select className="select text-sm w-full" value={otherKind}
                  onChange={e => setOtherKind(e.target.value as TransactionKind)}>
                  <option value="income-other">Other income</option>
                  <option value="move-money">Move money</option>
                </select>
              </div>

              {otherKind === 'income-other' && (
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Envelope</label>
                  <EnvelopeSelect envelopes={envelopes} value={otherEnvId} onChange={setOtherEnvId} />
                </div>
              )}

              {otherKind === 'move-money' && (
                <>
                  {/* Source */}
                  <div>
                    <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>
                      From envelope
                    </label>
                    <EnvelopeSelect
                      envelopes={envelopes}
                      value={moveSourceId}
                      onChange={setMoveSourceId}
                      placeholder="Select source…"
                    />
                  </div>

                  {/* Destination */}
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                      To envelope
                    </label>
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer"
                      style={{ color: 'var(--text-muted)' }}>
                      <input type="checkbox" checked={moveDestSplit}
                        onChange={e => setMoveDestSplit(e.target.checked)} />
                      Split across envelopes
                    </label>
                  </div>
                  {moveDestSplit ? (
                    <SplitLines total={Math.abs(amountNum)} envelopes={envelopes}
                      lines={moveDestLines} onChange={setMoveDestLines} />
                  ) : (
                    <EnvelopeSelect
                      envelopes={envelopes}
                      value={moveDestEnvId}
                      onChange={setMoveDestEnvId}
                      placeholder="Select destination…"
                    />
                  )}
                </>
              )}
            </>
          )}

          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Notes</label>
            <textarea className="input text-sm resize-none" rows={2}
              value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Optional note…" />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <span className="spinner" /> : null}
            Add transaction
          </button>
        </div>
      </div>
    </div>
  )
}
