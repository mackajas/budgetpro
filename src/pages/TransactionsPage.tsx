/**
 * Transactions Page  (BRD §4.6.2, Step 11)
 *
 * Filterable, paginated list with inline Edit and Add modals.
 *
 * Filters: envelope, kind, date range, search text, Unassigned toggle
 * Pagination: 50 rows per page via useTransactionStore.nextPage()
 *
 * URL params honoured on mount:
 *   ?unassigned=true   — activates Unassigned toggle (from ImportModal "View unassigned")
 *   ?envelope=<id>     — pre-selects envelope filter (from Dashboard envelope click)
 */

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams }        from 'react-router-dom'
import { Plus, Upload, Search, X } from 'lucide-react'
import { useTransactionStore }    from '../stores/useTransactionStore'
import { useEnvelopeStore }       from '../stores/useEnvelopeStore'
import { useBankAccountStore }    from '../stores/useBankAccountStore'
import { EditTransactionModal }   from '../components/EditTransactionModal'
import { AddTransactionModal }    from '../components/AddTransactionModal'
import { ImportModal }            from '../components/ImportModal'
import { SourceBadge }            from '../components/SourceBadge'
import { formatCurrency, formatDate, KIND_LABELS } from '../lib/formatters'
import type { Transaction, TransactionKind, Envelope, BankAccount } from '../types/database'

// ── Helpers ───────────────────────────────────────────────────────────────────

function envelopeName(id: string | null, envelopes: Envelope[], splits: Record<string,number>|null): string {
  if (splits && Object.keys(splits).length > 0) return 'Split'
  if (!id) return '—'
  return envelopes.find(e => e.id === id)?.name ?? '—'
}

const KINDS: TransactionKind[] = [
  'paycheque','expense','cash-income','cash-income-split',
  'income-other','opening-balance','ignored',
]

// Grid column template — must match the header row exactly
// Columns: date(7rem) | description(1fr) | envelope(8rem) | source(7rem) | badge(2rem) | amount(6rem)
const TX_GRID = '7rem 1fr 8rem 7rem 2rem 6rem'

// ── Row ───────────────────────────────────────────────────────────────────────

function TxRow({ tx, envelopes, accounts, onEdit }: {
  tx: Transaction; envelopes: Envelope[]; accounts: BankAccount[]; onEdit: (t: Transaction) => void
}) {
  const isIncome     = tx.amount > 0
  const amountColour = isIncome ? 'var(--success)' : 'var(--text-muted)'
  const hasReview    = tx.review && !tx.envelope_id && !(tx.splits && Object.keys(tx.splits).length > 0)
  const envName      = envelopeName(tx.envelope_id, envelopes, tx.splits)

  const sharedProps = {
    className: 'tx-row cursor-pointer select-none',
    onClick: () => onEdit(tx),
    role: 'button' as const,
    tabIndex: 0,
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter') onEdit(tx) },
    'aria-label': `Edit transaction: ${tx.description}`,
  }

  return (
    <div {...sharedProps}>

      {/* ── Mobile layout (< sm) — matches Recent Activity style ─────────── */}
      <div className="flex items-center gap-3 sm:hidden">
        <div className="flex-1 min-w-0">
          <p className="truncate text-sm font-medium" style={{ color: 'var(--text)' }}>
            {tx.description}
          </p>
          <p className="text-xs mt-0.5 flex items-center gap-1 flex-wrap" style={{ color: 'var(--text-subtle)' }}>
            <span>{formatDate(tx.date)}</span>
            <span>·</span>
            <span style={{ color: 'var(--text-muted)' }}>{envName}</span>
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="text-sm font-medium tabular-nums" style={{ color: amountColour }}>
            {isIncome ? '+' : ''}{formatCurrency(tx.amount)}
          </span>
          <SourceBadge
            bankAccountId={tx.bank_account_id}
            importBatchId={tx.import_batch_id}
            accounts={accounts}
          />
          {hasReview && (
            <span className="rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap"
              style={{ background: 'color-mix(in srgb, #f59e0b 15%, transparent)', color: '#d97706' }}>
              Review
            </span>
          )}
        </div>
      </div>

      {/* ── Desktop layout (sm+) — CSS grid with fixed columns ───────────── */}
      <div className="hidden sm:grid items-center gap-3" style={{ gridTemplateColumns: TX_GRID }}>
        {/* Date */}
        <span className="tabular-nums text-xs truncate" style={{ color: 'var(--text-muted)' }}>
          {formatDate(tx.date)}
        </span>

        {/* Description */}
        <span className="min-w-0 truncate text-sm" style={{ color: 'var(--text)' }}>
          {tx.description}
        </span>

        {/* Envelope */}
        <span className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>
          {envName}
        </span>

        {/* Source badge */}
        <span className="flex items-center">
          <SourceBadge
            bankAccountId={tx.bank_account_id}
            importBatchId={tx.import_batch_id}
            accounts={accounts}
          />
        </span>

        {/* Review badge */}
        <span className="flex items-center">
          {hasReview && (
            <span className="rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap"
              style={{ background: 'color-mix(in srgb, #f59e0b 15%, transparent)', color: '#d97706' }}>
              Review
            </span>
          )}
        </span>

        {/* Amount */}
        <span className="text-right text-sm font-medium tabular-nums" style={{ color: amountColour }}>
          {isIncome ? '+' : ''}{formatCurrency(tx.amount)}
        </span>
      </div>

    </div>
  )
}

// ── Filter bar ────────────────────────────────────────────────────────────────

interface FilterBarProps {
  envelopes:   Envelope[]
  onSearchChange:     (v: string) => void
  onEnvelopeChange:   (v: string) => void
  onKindChange:       (v: string) => void
  onDateFromChange:   (v: string) => void
  onDateToChange:     (v: string) => void
  onUnassignedToggle: (v: boolean) => void
  values: {
    search: string; envelopeId: string; kind: string
    dateFrom: string; dateTo: string; unassigned: boolean
  }
}

function FilterBar({ envelopes, onSearchChange, onEnvelopeChange, onKindChange,
  onDateFromChange, onDateToChange, onUnassignedToggle, values }: FilterBarProps) {

  const leafEnvelopes = envelopes.filter(e => !envelopes.some(c => c.parent_id === e.id))

  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {/* Search */}
      <div className="relative flex-1 min-w-40">
        <Search className="pointer-events-none absolute inset-y-0 left-3 my-auto h-3.5 w-3.5"
          style={{ color: 'var(--text-subtle)' }} />
        <input className="input py-1.5 pl-8 text-sm" placeholder="Search…"
          value={values.search} onChange={e => onSearchChange(e.target.value)} />
      </div>

      {/* Envelope */}
      <select className="select py-1.5 text-sm w-40"
        value={values.envelopeId} onChange={e => onEnvelopeChange(e.target.value)}>
        <option value="">All envelopes</option>
        {leafEnvelopes.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
      </select>

      {/* Kind */}
      <select className="select py-1.5 text-sm w-36"
        value={values.kind} onChange={e => onKindChange(e.target.value)}>
        <option value="">All types</option>
        {KINDS.map(k => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
      </select>

      {/* Date from */}
      <input className="input py-1.5 text-sm w-36" type="date"
        value={values.dateFrom} onChange={e => onDateFromChange(e.target.value)} />

      {/* Date to */}
      <input className="input py-1.5 text-sm w-36" type="date"
        value={values.dateTo} onChange={e => onDateToChange(e.target.value)} />

      {/* Unassigned toggle */}
      <button
        className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium border transition-colors"
        style={values.unassigned
          ? { background: 'var(--pink)', color: '#fff', borderColor: 'var(--pink)' }
          : { color: 'var(--text-muted)', borderColor: 'var(--border)', background: 'transparent' }}
        onClick={() => onUnassignedToggle(!values.unassigned)}
        title="Show only unassigned transactions"
      >
        Unassigned
        {values.unassigned && <X className="h-3 w-3" />}
      </button>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function TransactionsPage() {
  const [searchParams]    = useSearchParams()
  const {
    transactions, isLoading, isFetching, hasMore,
    filters, setFilters, fetchPage, nextPage,
  } = useTransactionStore()
  const { envelopes, fetch: fetchEnvelopes } = useEnvelopeStore()
  const { accounts, fetch: fetchAccounts }   = useBankAccountStore()

  const [editTx,      setEditTx]      = useState<Transaction | null>(null)
  const [addOpen,     setAddOpen]     = useState(false)
  const [importOpen,  setImportOpen]  = useState(false)

  // Local filter state (drives store)
  const [search,     setSearchLocal]  = useState(filters.search)
  const [envelopeId, setEnvelopeId]   = useState(filters.envelopeId ?? '')
  const [kind,       setKind]         = useState<string>(filters.kind ?? '')
  const [dateFrom,   setDateFrom]     = useState(filters.dateFrom ?? '')
  const [dateTo,     setDateTo]       = useState(filters.dateTo ?? '')
  const [unassigned, setUnassigned]   = useState(filters.unassigned)

  // Initialise from URL params once on mount
  useEffect(() => {
    const ua = searchParams.get('unassigned') === 'true'
    const ev = searchParams.get('envelope') ?? ''
    const initial = {
      search:     '',
      envelopeId: ev || null,
      kind:       null,
      dateFrom:   null,
      dateTo:     null,
      unassigned: ua,
    }
    if (ua) setUnassigned(true)
    if (ev) setEnvelopeId(ev)
    fetchEnvelopes()
    void fetchAccounts()
    setFilters(initial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Debounced filter pushes
  const applyFilters = useCallback((patch: Parameters<typeof setFilters>[0]) => {
    setFilters(patch)
  }, [setFilters])

  function handleSearch(v: string) {
    setSearchLocal(v)
    applyFilters({ search: v })
  }
  function handleEnvelope(v: string) {
    setEnvelopeId(v)
    applyFilters({ envelopeId: v || null })
  }
  function handleKind(v: string) {
    setKind(v)
    applyFilters({ kind: (v as TransactionKind) || null })
  }
  function handleDateFrom(v: string) {
    setDateFrom(v)
    applyFilters({ dateFrom: v || null })
  }
  function handleDateTo(v: string) {
    setDateTo(v)
    applyFilters({ dateTo: v || null })
  }
  function handleUnassigned(v: boolean) {
    setUnassigned(v)
    applyFilters({ unassigned: v })
  }

  useEffect(() => { void fetchPage() }, [fetchPage])

  return (
    <div className="p-4 lg:p-6">
      {/* Page header */}
      <div className="page-header">
        <h1 className="page-title">Transactions</h1>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4" />
            <span className="hidden sm:inline">Import</span>
          </button>
          <button className="btn-primary" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Add transaction</span>
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <FilterBar
        envelopes={envelopes}
        onSearchChange={handleSearch}
        onEnvelopeChange={handleEnvelope}
        onKindChange={handleKind}
        onDateFromChange={handleDateFrom}
        onDateToChange={handleDateTo}
        onUnassignedToggle={handleUnassigned}
        values={{ search, envelopeId, kind, dateFrom, dateTo, unassigned }}
      />

      {/* Table */}
      <div className="card overflow-hidden">
        {/* Column headers — desktop */}
        <div className="hidden sm:grid items-center gap-3 border-b px-4 py-2 text-xs"
          style={{ gridTemplateColumns: TX_GRID, borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
          <span className="section-label">Date</span>
          <span className="section-label">Description</span>
          <span className="section-label">Envelope</span>
          <span className="section-label">Source</span>
          <span />  {/* review badge space */}
          <span className="text-right section-label">Amount</span>
        </div>

        {/* Loading skeleton */}
        {isLoading && (
          <div className="flex flex-col">
            {[...Array(5)].map((_, i) => (
              <div key={`skeleton-${i}`} className="tx-row animate-pulse">
                {/* Mobile skeleton */}
                <div className="flex items-center gap-3 sm:hidden">
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 rounded w-3/4" style={{ background: 'var(--border)' }} />
                    <div className="h-2.5 rounded w-1/3" style={{ background: 'var(--border)' }} />
                  </div>
                  <div className="h-3 rounded w-16 shrink-0" style={{ background: 'var(--border)' }} />
                </div>
                {/* Desktop skeleton */}
                <div className="hidden sm:grid items-center gap-3" style={{ gridTemplateColumns: TX_GRID }}>
                  <span className="h-3 rounded" style={{ background: 'var(--border)' }} />
                  <span className="h-3 rounded" style={{ background: 'var(--border)' }} />
                  <span className="h-3 rounded" style={{ background: 'var(--border)' }} />
                  <span />
                  <span />
                  <span className="h-3 rounded" style={{ background: 'var(--border)' }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Rows */}
        {!isLoading && transactions.length > 0 && (
          <>
            {transactions.map(tx => (
              <TxRow key={tx.id} tx={tx} envelopes={envelopes} accounts={accounts} onEdit={setEditTx} />
            ))}
          </>
        )}

        {/* Empty state */}
        {!isLoading && transactions.length === 0 && (
          <div className="empty-state py-12">
            <p className="empty-state-title">No transactions found</p>
            <p className="empty-state-body">
              {Object.values(filters).some(Boolean)
                ? 'No transactions match your current filters — try adjusting them.'
                : 'Import a bank statement or add a transaction to get started.'}
            </p>
          </div>
        )}
      </div>

      {/* Load more */}
      {!isLoading && hasMore && (
        <div className="mt-4 flex justify-center">
          <button
            className="btn-ghost"
            onClick={nextPage}
            disabled={isFetching}
          >
            {isFetching ? <span className="spinner" /> : 'Load more'}
          </button>
        </div>
      )}

      {/* Modals */}
      {editTx   && <EditTransactionModal transaction={editTx} onClose={() => setEditTx(null)} />}
      {addOpen  && <AddTransactionModal onClose={() => setAddOpen(false)} />}
      {importOpen && <ImportModal onClose={() => setImportOpen(false)} />}
    </div>
  )
}
