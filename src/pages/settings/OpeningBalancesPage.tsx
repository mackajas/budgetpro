/**
 * Opening Balances Settings Page  (BRD §4.9, Step 14)
 *
 * Shows all leaf envelopes with an input for the opening balance.
 * Opening balances are stored as kind='opening-balance' transactions.
 * Auto-saves on blur — creates or updates the opening-balance transaction.
 * Clearing the value soft-deletes the existing opening-balance transaction.
 */

import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, AlertCircle } from 'lucide-react'
import { Link }                    from 'react-router-dom'
import { useEnvelopeStore }        from '../../stores/useEnvelopeStore'
import { useToast }                from '../../contexts/ToastContext'
import { useSave }                 from '../../contexts/SaveContext'
import { supabase }                from '../../lib/supabase'
import { formatCurrency }          from '../../lib/formatters'
import type { Envelope, Transaction } from '../../types/database'

// ── Opening balance row ────────────────────────────────────────────────────────

function OpeningBalanceRow({
  envelope,
  current,
  onSave,
}: {
  envelope: Envelope
  current:  Transaction | null
  onSave:   (envId: string, amount: number | null) => Promise<void>
}) {
  const { withSave } = useSave()
  const { toast }    = useToast()

  const [draft, setDraft] = useState(
    current !== null ? String(current.amount) : '',
  )

  async function handleBlur() {
    const raw = draft.trim()
    const num = raw === '' ? null : parseFloat(raw)
    if (num !== null && isNaN(num)) {
      toast('Invalid amount', 'error')
      setDraft(current !== null ? String(current.amount) : '')
      return
    }
    // No change
    const existing = current?.amount ?? null
    if (num === existing) return

    await withSave(async () => {
      try {
        await onSave(envelope.id, num)
      } catch {
        toast(`Failed to save opening balance for ${envelope.name}`, 'error')
        setDraft(current !== null ? String(current.amount) : '')
      }
    })
  }

  return (
    <div
      className="flex items-center justify-between gap-4 px-4 py-3 border-b last:border-b-0"
      style={{ borderColor: 'var(--border)' }}
    >
      <span className="flex-1 text-sm" style={{ color: 'var(--text)' }}>
        {envelope.name}
      </span>
      <div className="relative w-36">
        <span
          className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-xs"
          style={{ color: 'var(--text-subtle)' }}
        >$</span>
        <input
          className="input py-1.5 pl-7 text-sm w-full"
          type="number"
          step="0.01"
          value={draft}
          placeholder="0.00"
          onChange={e => setDraft(e.target.value)}
          onBlur={handleBlur}
        />
      </div>
      <span
        className="w-28 text-right text-xs tabular-nums"
        style={{ color: 'var(--text-subtle)' }}
      >
        {current ? formatCurrency(current.amount) : '—'}
      </span>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export function OpeningBalancesPage() {
  const { envelopes, fetch: fetchEnvelopes, isLoading: envLoading } = useEnvelopeStore()
  const { toast }     = useToast()

  const [openingTxs,  setOpeningTxs]  = useState<Transaction[]>([])
  const [txLoading,   setTxLoading]   = useState(false)
  const [txError,     setTxError]     = useState<string | null>(null)

  // Load envelopes + opening-balance transactions
  useEffect(() => {
    fetchEnvelopes()
    loadOpeningBalances()
  }, [fetchEnvelopes])

  async function loadOpeningBalances() {
    setTxLoading(true)
    setTxError(null)
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('kind', 'opening-balance')
        .eq('deleted', false)
      if (error) throw error
      setOpeningTxs((data ?? []) as Transaction[])
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? 'Failed to load opening balances'
      setTxError(msg)
      toast('Failed to load opening balances', 'error')
    } finally {
      setTxLoading(false)
    }
  }

  // Only leaf envelopes (no children)
  const leafEnvelopes = useMemo(
    () => envelopes.filter(e => !envelopes.some(c => c.parent_id === e.id)),
    [envelopes],
  )

  const txByEnvelope = useMemo(
    () => new Map(openingTxs.map(t => [t.envelope_id!, t])),
    [openingTxs],
  )

  async function handleSave(envId: string, amount: number | null) {
    const existing = txByEnvelope.get(envId) ?? null

    if (amount === null) {
      // Clear: soft-delete existing if present
      if (existing) {
        const { error } = await supabase
          .from('transactions')
          .update({ deleted: true })
          .eq('id', existing.id)
        if (error) throw error
        setOpeningTxs(ts => ts.filter(t => t.id !== existing.id))
      }
      return
    }

    if (existing) {
      // Update
      const { error } = await supabase
        .from('transactions')
        .update({ amount })
        .eq('id', existing.id)
      if (error) throw error
      setOpeningTxs(ts => ts.map(t => t.id === existing.id ? { ...t, amount } : t))
    } else {
      // Insert
      const { data, error } = await supabase
        .from('transactions')
        .insert({
          date:            new Date().toISOString().slice(0, 10),
          description:     'Opening balance',
          amount,
          kind:            'opening-balance',
          envelope_id:     envId,
          splits:          null,
          how_categorised: 'manual',
          review:          false,
          notes:           null,
          import_batch_id: null,
          deleted:         false,
        })
        .select()
        .single()
      if (error) throw error
      setOpeningTxs(ts => [...ts, data as Transaction])
    }
    toast('Saved')
  }

  const isLoading = envLoading || txLoading

  return (
    <div className="p-4 lg:p-6 max-w-2xl">
      <div className="page-header">
        <div className="flex items-center gap-2">
          <Link to="/settings" className="flex h-8 w-8 items-center justify-center rounded-md
            transition-colors hover:opacity-70" style={{ color: 'var(--text-subtle)' }}>
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <h1 className="page-title">Opening Balances</h1>
        </div>
      </div>

      <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>
        Set the starting balance for each envelope. These are recorded as
        opening-balance transactions and included in all calculations.
      </p>

      {isLoading && (
        <div className="card p-8 flex justify-center">
          <span className="spinner" style={{ color: 'var(--text-subtle)' }} />
        </div>
      )}

      {!isLoading && txError && (
        <div
          className="card p-5 flex flex-col items-center gap-3 text-center"
          style={{ color: 'var(--danger)' }}
        >
          <AlertCircle className="h-6 w-6 shrink-0" />
          <div>
            <p className="text-sm font-medium mb-1">Failed to load opening balances</p>
            <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>{txError}</p>
          </div>
          <button className="btn-ghost text-sm" onClick={loadOpeningBalances}>
            Retry
          </button>
        </div>
      )}

      {!isLoading && !txError && leafEnvelopes.length === 0 && (
        <div className="card">
          <div className="empty-state py-10">
            <p className="empty-state-title">No envelopes yet</p>
            <p className="empty-state-body">
              <Link to="/settings/envelopes" style={{ color: 'var(--pink)' }}>
                Create some envelopes
              </Link>{' '}
              first.
            </p>
          </div>
        </div>
      )}

      {!isLoading && !txError && leafEnvelopes.length > 0 && (
        <div className="card overflow-hidden">
          {/* Column headers */}
          <div
            className="flex items-center justify-between gap-4 px-4 py-2 text-xs border-b"
            style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
          >
            <span className="flex-1 section-label">Envelope</span>
            <span className="w-36 section-label text-right">Set amount</span>
            <span className="w-28 section-label text-right">Current</span>
          </div>

          {leafEnvelopes.map(env => (
            <OpeningBalanceRow
              key={env.id}
              envelope={env}
              current={txByEnvelope.get(env.id) ?? null}
              onSave={handleSave}
            />
          ))}
        </div>
      )}
    </div>
  )
}
