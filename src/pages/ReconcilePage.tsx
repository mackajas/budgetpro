/**
 * Reconcile Page  (BRD §4.7, Step 13)
 *
 * Layout:
 *  - Stats bar:  Bank Total | Envelope Total | Gap
 *  - Account cards grid (from bank_accounts table)
 *    - Each card shows: name, balance, last-updated date, Edit Balance button
 *  - Mark as Reconciled button (creates reconciliation_record snapshot)
 *  - Recent reconciliations list (last 10, collapsible)
 *
 * Empty state shown when no bank accounts exist — links to Settings.
 */

import { useEffect, useMemo, useState } from 'react'
import { Link }                          from 'react-router-dom'
import { Landmark, Pencil, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react'
import { useBankAccountStore }   from '../stores/useBankAccountStore'
import { useTransactionStore }   from '../stores/useTransactionStore'
import { useEnvelopeStore }      from '../stores/useEnvelopeStore'
import { computeBalances, computeDisplayBalances } from '../lib/balances'
import { formatCurrency, formatDate } from '../lib/formatters'
import { useToast }              from '../contexts/ToastContext'
import type { BankAccount }      from '../types/database'

// ── Edit Balance Modal ────────────────────────────────────────────────────────

function EditBalanceModal({
  account,
  onClose,
}: {
  account: BankAccount
  onClose: () => void
}) {
  const { updateBalance } = useBankAccountStore()
  const { toast }         = useToast()

  const [value,  setValue]  = useState(account.balance !== null ? String(account.balance) : '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    const num = parseFloat(value)
    if (isNaN(num)) { toast('Enter a valid balance', 'error'); return }
    setSaving(true)
    try {
      await updateBalance(account.id, num)
      toast('Balance updated')
      onClose()
    } catch {
      toast('Failed to update balance', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 360 }} onClick={e => e.stopPropagation()}>
        <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--text)' }}>
          Edit Balance — {account.name}
        </h2>

        <div className="mb-5">
          <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>
            Current balance ($)
          </label>
          <div className="relative">
            <span
              className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm"
              style={{ color: 'var(--text-subtle)' }}
            >$</span>
            <input
              className="input pl-7 text-sm"
              type="number"
              step="0.01"
              autoFocus
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
              placeholder="0.00"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <span className="spinner" /> : null}
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Reconcile notes modal ─────────────────────────────────────────────────────

function ReconcileModal({
  bankTotal,
  envelopeTotal,
  gap,
  onConfirm,
  onClose,
}: {
  bankTotal:     number
  envelopeTotal: number
  gap:           number
  onConfirm:     (notes: string) => Promise<void>
  onClose:       () => void
}) {
  const [notes,  setNotes]  = useState('')
  const [saving, setSaving] = useState(false)
  const isBalanced = Math.abs(gap) < 0.005

  async function handleConfirm() {
    setSaving(true)
    try {
      await onConfirm(notes.trim())
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
        <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--text)' }}>
          Mark as Reconciled
        </h2>

        {/* Summary */}
        <div
          className="rounded-lg p-4 mb-4 flex flex-col gap-2 text-sm"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
        >
          <div className="flex justify-between">
            <span style={{ color: 'var(--text-muted)' }}>Bank total</span>
            <span className="tabular-nums font-medium" style={{ color: 'var(--text)' }}>
              {formatCurrency(bankTotal)}
            </span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: 'var(--text-muted)' }}>Envelope total</span>
            <span className="tabular-nums font-medium" style={{ color: 'var(--text)' }}>
              {formatCurrency(envelopeTotal)}
            </span>
          </div>
          <div
            className="flex justify-between border-t pt-2"
            style={{ borderColor: 'var(--border)' }}
          >
            <span style={{ color: 'var(--text-muted)' }}>Gap</span>
            <span
              className="tabular-nums font-semibold"
              style={{ color: isBalanced ? 'var(--success)' : 'var(--danger)' }}
            >
              {isBalanced ? 'Balanced' : formatCurrency(gap)}
            </span>
          </div>
        </div>

        <div className="mb-5">
          <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>
            Notes (optional)
          </label>
          <textarea
            className="input text-sm resize-none"
            rows={3}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Add any notes about this reconciliation…"
          />
        </div>

        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleConfirm} disabled={saving}>
            {saving ? <span className="spinner" /> : <CheckCircle2 className="h-4 w-4" />}
            Save reconciliation
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label, value, colour,
}: { label: string; value: number; colour?: string }) {
  return (
    <div className="card flex flex-col gap-1 rounded-xl p-5">
      <p className="text-xs section-label">{label}</p>
      <p
        className="text-2xl font-semibold tabular-nums mt-1"
        style={{ color: colour ?? 'var(--text)' }}
      >
        {formatCurrency(value)}
      </p>
    </div>
  )
}

// ── Account card ──────────────────────────────────────────────────────────────

function AccountCard({
  account,
  onEdit,
}: { account: BankAccount; onEdit: () => void }) {
  const hasBalance = account.balance !== null
  return (
    <div className="card rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Landmark className="h-4 w-4 shrink-0" style={{ color: 'var(--text-subtle)' }} />
          <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>
            {account.name}
          </span>
        </div>
        <button
          className="flex items-center gap-1 text-xs transition-opacity hover:opacity-70"
          style={{ color: 'var(--pink)' }}
          onClick={onEdit}
        >
          <Pencil className="h-3 w-3" />
          Edit
        </button>
      </div>

      <div>
        <p
          className="text-2xl font-semibold tabular-nums"
          style={{ color: hasBalance ? 'var(--text)' : 'var(--text-subtle)' }}
        >
          {hasBalance ? formatCurrency(account.balance!) : '—'}
        </p>
        {account.balance_updated_at && (
          <p className="text-xs mt-1" style={{ color: 'var(--text-subtle)' }}>
            Updated {formatDate(account.balance_updated_at.slice(0, 10))}
          </p>
        )}
        {!account.balance_updated_at && (
          <p className="text-xs mt-1" style={{ color: 'var(--text-subtle)' }}>
            No balance recorded
          </p>
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function ReconcilePage() {
  const {
    accounts, reconciliations, isLoading,
    fetch, saveReconciliation, fetchReconciliations,
  } = useBankAccountStore()
  const { allTransactions, fetchAll } = useTransactionStore()
  const { envelopes, fetch: fetchEnvelopes } = useEnvelopeStore()
  const { toast } = useToast()

  const [editAccount,   setEditAccount]   = useState<BankAccount | null>(null)
  const [reconcileOpen, setReconcileOpen] = useState(false)
  const [historyOpen,   setHistoryOpen]   = useState(false)

  useEffect(() => {
    void fetch()
    void fetchAll()
    void fetchEnvelopes()
    void fetchReconciliations()
  }, [fetch, fetchAll, fetchEnvelopes, fetchReconciliations])

  // ── Totals ─────────────────────────────────────────────────────────────────
  const bankTotal = useMemo(
    () => accounts.reduce((sum, a) => sum + (a.balance ?? 0), 0),
    [accounts],
  )

  const rawBalances = useMemo(() => computeBalances(allTransactions), [allTransactions])

  // computeDisplayBalances is used for potential future display; not needed for total here
  const _displayBalances = useMemo(
    () => computeDisplayBalances(rawBalances, envelopes),
    [rawBalances, envelopes],
  )
  void _displayBalances  // suppress unused warning

  // Sum only leaf (non-parent) envelopes so parent rollups aren't double-counted
  const envelopeTotal = useMemo(() => {
    const parentIds = new Set(
      envelopes.filter(e => e.parent_id !== null).map(e => e.parent_id!),
    )
    return envelopes
      .filter(e => !parentIds.has(e.id))
      .reduce((sum, e) => sum + (rawBalances[e.id] ?? 0), 0)
  }, [envelopes, rawBalances])

  const gap        = bankTotal - envelopeTotal
  const isBalanced = Math.abs(gap) < 0.005

  // ── Reconcile handler ──────────────────────────────────────────────────────
  async function handleReconcile(notes: string) {
    const snapshot = accounts
      .filter(a => a.balance !== null)
      .map(a => ({ account_name: a.name, balance: a.balance! }))
    try {
      await saveReconciliation({
        bankTotal,
        envelopeTotal,
        gap,
        isBalanced,
        notes: notes || null,
        snapshot,
      })
      toast('Reconciliation saved')
    } catch {
      toast('Failed to save reconciliation', 'error')
    }
  }

  const noAccounts = !isLoading && accounts.length === 0

  return (
    <div className="p-4 lg:p-6">
      {/* Page header */}
      <div className="page-header">
        <h1 className="page-title">Reconcile</h1>
        {accounts.length > 0 && (
          <button className="btn-primary" onClick={() => setReconcileOpen(true)}>
            <CheckCircle2 className="h-4 w-4" />
            Mark as Reconciled
          </button>
        )}
      </div>

      {/* Empty state */}
      {noAccounts && (
        <div className="card">
          <div className="empty-state">
            <Landmark className="empty-state-icon" />
            <p className="empty-state-title">No bank accounts</p>
            <p className="empty-state-body">
              Add your bank accounts in Settings to start reconciling.
            </p>
            <Link to="/settings" className="btn-primary mt-2">
              Go to Settings
            </Link>
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="card p-8 flex justify-center">
          <span className="spinner" style={{ color: 'var(--text-subtle)' }} />
        </div>
      )}

      {/* Main content */}
      {!isLoading && accounts.length > 0 && (
        <>
          {/* Stats bar */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-6">
            <StatCard label="Bank total"     value={bankTotal} />
            <StatCard label="Envelope total" value={envelopeTotal} />
            <StatCard
              label="Gap"
              value={gap}
              colour={isBalanced ? 'var(--success)' : 'var(--danger)'}
            />
          </div>

          {/* Balance status banner */}
          {isBalanced ? (
            <div
              className="mb-5 flex items-center gap-3 rounded-lg border px-4 py-3 text-sm font-medium"
              style={{
                background:  'color-mix(in srgb, var(--success) 10%, transparent)',
                borderColor: 'var(--success)',
                color:       'var(--success)',
              }}
            >
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Your bank accounts and envelopes are balanced.
            </div>
          ) : (
            <div
              className="mb-5 flex items-center gap-3 rounded-lg border px-4 py-3 text-sm font-medium"
              style={{
                background:  'color-mix(in srgb, var(--danger) 8%, transparent)',
                borderColor: 'var(--danger)',
                color:       'var(--danger)',
              }}
            >
              <Landmark className="h-4 w-4 shrink-0" />
              Gap of {formatCurrency(Math.abs(gap))} — check for missing transactions or
              unrecorded account activity.
            </div>
          )}

          {/* Account cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-6">
            {accounts.map(account => (
              <AccountCard
                key={account.id}
                account={account}
                onEdit={() => setEditAccount(account)}
              />
            ))}
          </div>

          {/* Reconciliation history */}
          {reconciliations.length > 0 && (
            <div className="card overflow-hidden">
              <button
                className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium"
                style={{
                  background:   'var(--surface-2)',
                  borderBottom: historyOpen ? '1px solid var(--border)' : 'none',
                  color:        'var(--text)',
                }}
                onClick={() => setHistoryOpen(h => !h)}
              >
                <span>Reconciliation history</span>
                {historyOpen
                  ? <ChevronUp   className="h-4 w-4" style={{ color: 'var(--text-subtle)' }} />
                  : <ChevronDown className="h-4 w-4" style={{ color: 'var(--text-subtle)' }} />
                }
              </button>

              {historyOpen && (
                <div>
                  {/* Column headers */}
                  <div
                    className="hidden sm:grid grid-cols-4 gap-4 px-4 py-2 text-xs border-b"
                    style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
                  >
                    <span className="section-label">Date</span>
                    <span className="section-label text-right">Bank total</span>
                    <span className="section-label text-right">Envelope total</span>
                    <span className="section-label text-right">Gap</span>
                  </div>

                  {reconciliations.map(rec => {
                    const recGap      = rec.gap
                    const recBalanced = Math.abs(recGap) < 0.005
                    return (
                      <div
                        key={rec.id}
                        className="grid grid-cols-2 sm:grid-cols-4 gap-4 px-4 py-3 border-b text-sm last:border-b-0"
                        style={{ borderColor: 'var(--border)' }}
                      >
                        <span style={{ color: 'var(--text-muted)' }}>
                          {formatDate(rec.reconciled_at.slice(0, 10))}
                        </span>
                        <span className="tabular-nums text-right hidden sm:block"
                          style={{ color: 'var(--text)' }}>
                          {formatCurrency(rec.bank_total)}
                        </span>
                        <span className="tabular-nums text-right hidden sm:block"
                          style={{ color: 'var(--text)' }}>
                          {formatCurrency(rec.envelope_total)}
                        </span>
                        <span
                          className="tabular-nums text-right font-medium"
                          style={{ color: recBalanced ? 'var(--success)' : 'var(--danger)' }}
                        >
                          {recBalanced ? 'Balanced' : formatCurrency(recGap)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {editAccount && (
        <EditBalanceModal
          account={editAccount}
          onClose={() => setEditAccount(null)}
        />
      )}
      {reconcileOpen && (
        <ReconcileModal
          bankTotal={bankTotal}
          envelopeTotal={envelopeTotal}
          gap={gap}
          onConfirm={handleReconcile}
          onClose={() => setReconcileOpen(false)}
        />
      )}
    </div>
  )
}
