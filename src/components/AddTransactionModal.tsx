/**
 * Add Transaction Modal  (BRD §4.6.3)
 *
 * Three tabs:
 *   Expense  — negative amount, single envelope
 *   Cash     — positive amount, single envelope or split across multiple
 *   Other    — signed amount, kind = income-other | ignored, optional envelope
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

interface SplitLine { id: string; envelopeId: string; amount: string }

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
            <select className="select flex-1 py-1.5 text-sm" value={line.envelopeId}
              onChange={e => onChange(lines.map((l, j) => j === i ? { ...l, envelopeId: e.target.value } : l))}>
              <option value="">Select envelope…</option>
              {envelopes.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
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
        onClick={() => onChange([...lines, { id: crypto.randomUUID(), envelopeId: '', amount: '' }])}>
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

  const leafEnvelopes = envelopes.filter(e => !envelopes.some(c => c.parent_id === e.id))

  const [tab,         setTab]        = useState<Tab>('expense')
  const [date,        setDate]        = useState(today())
  const [description, setDescription] = useState('')
  const [amount,      setAmount]      = useState('')
  const [envelopeId,  setEnvelopeId]  = useState('')
  const [notes,       setNotes]       = useState('')
  const [splitMode,   setSplitMode]   = useState(false)
  const [splitLines,  setSplitLines]  = useState<SplitLine[]>([
    { id: crypto.randomUUID(), envelopeId: '', amount: '' },
    { id: crypto.randomUUID(), envelopeId: '', amount: '' },
  ])
  const [otherKind,   setOtherKind]   = useState<TransactionKind>('income-other')
  const [saving,      setSaving]      = useState(false)

  const amountNum = parseFloat(amount) || 0

  function validate(): string | null {
    if (!date)        return 'Date is required.'
    if (!description.trim()) return 'Description is required.'
    if (!amount || amountNum === 0) return 'Amount must be non-zero.'
    return null
  }

  async function handleSave() {
    const err = validate()
    if (err) { toast(err, 'error'); return }
    setSaving(true)

    try {
      let kind:        TransactionKind = 'expense'
      let finalAmount  = amountNum
      let envId:       string | null   = envelopeId || null
      let splits:      Record<string, number> | null = null
      let how_categorised = 'manual' as const

      if (tab === 'expense') {
        kind        = 'expense'
        finalAmount = -Math.abs(amountNum)
      } else if (tab === 'cash') {
        finalAmount = Math.abs(amountNum)
        if (splitMode) {
          kind   = 'cash-income-split'
          envId  = null
          splits = Object.fromEntries(
            splitLines
              .filter(l => l.envelopeId && l.amount)
              .map(l => [l.envelopeId, parseFloat(l.amount) || 0]),
          )
          if (Object.keys(splits).length < 2) {
            toast('Add at least two split lines', 'error')
            setSaving(false)
            return
          }
        } else {
          kind = 'cash-income'
        }
      } else {
        kind        = otherKind
        finalAmount = amountNum   // signed as entered
      }

      await add({
        date,
        description: description.trim(),
        amount:      finalAmount,
        kind,
        envelope_id:     envId,
        splits,
        how_categorised,
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
                Amount{tab === 'expense' ? ' ($)' : tab === 'cash' ? ' ($, positive)' : ' (signed $)'}
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

          {/* Tab-specific fields */}
          {(tab === 'expense') && (
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Envelope</label>
              <select className="select text-sm w-full" value={envelopeId}
                onChange={e => setEnvelopeId(e.target.value)}>
                <option value="">— Unassigned —</option>
                {leafEnvelopes.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
          )}

          {tab === 'cash' && (
            <>
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Envelope</label>
                <label className="flex items-center gap-1.5 text-xs cursor-pointer"
                  style={{ color: 'var(--text-muted)' }}>
                  <input type="checkbox" checked={splitMode} onChange={e => setSplitMode(e.target.checked)} />
                  Split across envelopes
                </label>
              </div>
              {splitMode ? (
                <SplitLines total={amountNum} envelopes={leafEnvelopes}
                  lines={splitLines} onChange={setSplitLines} />
              ) : (
                <select className="select text-sm w-full" value={envelopeId}
                  onChange={e => setEnvelopeId(e.target.value)}>
                  <option value="">— Unassigned —</option>
                  {leafEnvelopes.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              )}
            </>
          )}

          {tab === 'other' && (
            <>
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Kind</label>
                <select className="select text-sm w-full" value={otherKind}
                  onChange={e => setOtherKind(e.target.value as TransactionKind)}>
                  <option value="income-other">Other income</option>
                  <option value="ignored">Ignored</option>
                </select>
              </div>
              {otherKind !== 'ignored' && (
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Envelope</label>
                  <select className="select text-sm w-full" value={envelopeId}
                    onChange={e => setEnvelopeId(e.target.value)}>
                    <option value="">— Unassigned —</option>
                    {leafEnvelopes.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
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
