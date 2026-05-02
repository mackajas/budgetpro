/**
 * Dashboard  (BRD §4.8, Step 12)
 *
 * Layout (lg+): left main column + right recent-activity sidebar
 *
 * Sections:
 *  - Review banner    — amber, shown when unassigned transactions exist
 *  - Featured cards   — up to 3 configurable envelope balance cards
 *  - Standalone list  — one card for all top-level envelopes without children
 *  - Parent groups    — one card per parent envelope with children listed inside
 *  - Recent activity  — sidebar: 8 most recent non-ignored transactions
 *
 * Empty state shown when no envelopes exist yet.
 */

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useNavigate, Link }            from 'react-router-dom'
import { Plus, Upload, AlertTriangle, FolderOpen, ChevronRight } from 'lucide-react'
import { useTransactionStore } from '../stores/useTransactionStore'
import { useEnvelopeStore }    from '../stores/useEnvelopeStore'
import { useSettingsStore }    from '../stores/useSettingsStore'
import { AddTransactionModal } from '../components/AddTransactionModal'
import { ImportModal }         from '../components/ImportModal'
import { computeBalances, computeDisplayBalances } from '../lib/balances'
import { formatCurrency, formatDate }              from '../lib/formatters'
import type { Envelope, Transaction } from '../types/database'

// ── Balance helpers ───────────────────────────────────────────────────────────

function balanceColour(b: number) {
  return b < 0 ? 'var(--danger)' : 'var(--text)'
}

// ── Featured envelope card ────────────────────────────────────────────────────

function FeaturedCard({
  envelopeId, envelopes, balances,
}: {
  envelopeId: string | null
  envelopes:  Envelope[]
  balances:   Record<string, number>
}) {
  const navigate = useNavigate()
  if (!envelopeId) return null                            // hidden if not configured

  const env     = envelopes.find(e => e.id === envelopeId)
  const balance = balances[envelopeId] ?? 0
  const isDown  = balance < 0

  if (!env) {
    return (
      <div className="card flex flex-col gap-1 rounded-xl p-5">
        <p className="text-xs section-label">Featured envelope</p>
        <p className="text-sm mt-1" style={{ color: 'var(--text-subtle)' }}>Not set up</p>
      </div>
    )
  }

  return (
    <button
      className="card flex flex-col gap-1 rounded-xl p-5 text-left transition-opacity hover:opacity-80 w-full"
      onClick={() => navigate(`/transactions?envelope=${envelopeId}`)}
    >
      <p className="text-xs section-label">{env.name}</p>
      <p
        className="text-2xl font-semibold tabular-nums mt-1"
        style={{ color: isDown ? 'var(--danger)' : 'var(--text)' }}
      >
        {formatCurrency(balance)}
      </p>
      {isDown && (
        <span className="badge-overdrawn self-start">Overdrawn</span>
      )}
    </button>
  )
}

// ── Envelope list row ─────────────────────────────────────────────────────────

function EnvRow({
  env, balance, isChild = false, onClick,
}: {
  env: Envelope; balance: number; isChild?: boolean; onClick: () => void
}) {
  const isDown = balance < 0
  return (
    <button
      className={`list-row w-full text-left ${isChild ? 'pl-8 relative' : ''}`}
      onClick={onClick}
    >
      {isChild && <span className="child-envelope-rule" />}
      <span className="flex-1 min-w-0 truncate text-sm" style={{ color: 'var(--text)' }}>{env.name}</span>
      {isDown && <span className="badge-overdrawn shrink-0">Overdrawn</span>}
      <span
        className="shrink-0 text-sm font-medium tabular-nums"
        style={{ color: balanceColour(balance) }}
      >
        {formatCurrency(balance)}
      </span>
      <ChevronRight className="shrink-0 h-4 w-4" style={{ color: 'var(--text-subtle)' }} />
    </button>
  )
}

// ── Standalone envelopes card ─────────────────────────────────────────────────

function StandaloneCard({
  standalones, balances,
}: {
  standalones: Envelope[]
  balances:    Record<string, number>
}) {
  const navigate = useNavigate()
  if (standalones.length === 0) return null

  return (
    <div className="card overflow-hidden mb-4">
      {standalones.map(env => (
        <EnvRow
          key={env.id}
          env={env}
          balance={balances[env.id] ?? 0}
          onClick={() => navigate(`/transactions?envelope=${env.id}`)}
        />
      ))}
    </div>
  )
}

// ── Parent group card ─────────────────────────────────────────────────────────

function ParentCard({
  parent, children, balances,
}: {
  parent:   Envelope
  children: Envelope[]
  balances: Record<string, number>
}) {
  const navigate     = useNavigate()
  const groupBalance = balances[parent.id] ?? 0
  const isDown       = groupBalance < 0

  return (
    <div className="card overflow-hidden mb-4">
      {/* Group header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
      >
        <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>
          {parent.name}
        </span>
        <span
          className="text-sm font-semibold tabular-nums"
          style={{ color: isDown ? 'var(--danger)' : 'var(--text-muted)' }}
        >
          {formatCurrency(groupBalance)}
        </span>
      </div>

      {/* Children */}
      {children.length === 0 ? (
        <p className="px-4 py-3 text-sm" style={{ color: 'var(--text-subtle)' }}>
          No child envelopes
        </p>
      ) : (
        children.map(child => (
          <EnvRow
            key={child.id}
            env={child}
            balance={balances[child.id] ?? 0}
            isChild
            onClick={() => navigate(`/transactions?envelope=${child.id}`)}
          />
        ))
      )}
    </div>
  )
}

// ── Recent activity ───────────────────────────────────────────────────────────

function RecentActivity({
  transactions, envelopes,
}: {
  transactions: Transaction[]
  envelopes:    Envelope[]
}) {
  const envMap = useMemo(
    () => new Map(envelopes.map(e => [e.id, e.name])),
    [envelopes],
  )

  const recent = useMemo(
    () => transactions
      .filter(t => t.kind !== 'ignored' && !t.deleted)
      .slice(0, 8),
    [transactions],
  )

  return (
    <div className="card overflow-hidden">
      <div
        className="px-4 py-3 border-b"
        style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
      >
        <h2 className="section-label">Recent activity</h2>
      </div>

      {recent.length === 0 ? (
        <div className="empty-state py-8">
          <p className="empty-state-body text-xs">No transactions yet</p>
        </div>
      ) : (
        recent.map(tx => {
          const isIncome   = tx.amount > 0
          const envName    = tx.splits && Object.keys(tx.splits).length > 0
            ? 'Split'
            : envMap.get(tx.envelope_id ?? '') ?? '—'
          return (
            <div key={tx.id} className="flex items-start gap-3 border-b px-4 py-3 last:border-b-0"
              style={{ borderColor: 'var(--border)' }}>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm" style={{ color: 'var(--text)' }}>
                  {tx.description}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-subtle)' }}>
                  {formatDate(tx.date)} · {envName}
                </p>
              </div>
              <span
                className="shrink-0 text-sm tabular-nums font-medium"
                style={{ color: isIncome ? 'var(--success)' : 'var(--text-muted)' }}
              >
                {isIncome ? '+' : ''}{formatCurrency(tx.amount)}
              </span>
            </div>
          )
        })
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function DashboardPage() {
  const { allTransactions, reviewCount, fetchAll, isLoading: txLoading } = useTransactionStore()
  const { envelopes, fetch: fetchEnvelopes, isLoading: envLoading }      = useEnvelopeStore()
  const { settings,  fetch: fetchSettings }                              = useSettingsStore()

  const [addOpen,    setAddOpen]    = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  useEffect(() => {
    void fetchAll()
    void fetchEnvelopes()
    void fetchSettings()
  }, [fetchAll, fetchEnvelopes, fetchSettings])

  // ── Balance maps ───────────────────────────────────────────────────────────
  const rawBalances     = useMemo(() => computeBalances(allTransactions), [allTransactions])
  const displayBalances = useMemo(
    () => computeDisplayBalances(rawBalances, envelopes),
    [rawBalances, envelopes],
  )

  // ── Envelope classification ────────────────────────────────────────────────
  const parentIds    = useMemo(
    () => new Set(envelopes.filter(e => e.parent_id !== null).map(e => e.parent_id as string)),
    [envelopes],
  )
  const topLevel     = useMemo(
    () => envelopes
      .filter(e => e.parent_id === null)
      .sort((a, b) => a.display_order - b.display_order),
    [envelopes],
  )
  const standalones  = useMemo(
    () => topLevel.filter(e => !parentIds.has(e.id)),
    [topLevel, parentIds],
  )
  const parents      = useMemo(
    () => topLevel.filter(e => parentIds.has(e.id)),
    [topLevel, parentIds],
  )
  const childrenOf   = useCallback(
    (pid: string) => envelopes
      .filter(e => e.parent_id === pid)
      .sort((a, b) => a.display_order - b.display_order),
    [envelopes],
  )

  const isLoading = txLoading || envLoading
  const noEnvelopes = !isLoading && envelopes.length === 0

  return (
    <div className="p-4 lg:p-6">
      {/* Page header */}
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
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

      {/* Review banner — amber per BRD §4.8.3 (Tailwind default amber scale, no custom CSS) */}
      {reviewCount > 0 && (
        <Link
          to="/transactions?unassigned=true"
          className="mb-5 flex items-center gap-3 rounded-lg border px-4 py-3 text-sm font-medium transition-opacity hover:opacity-80"
          style={{
            background:   '#fef3c7',  /* amber-100 */
            borderColor:  '#fcd34d',  /* amber-300 */
            color:        '#78350f',  /* amber-900 */
          }}
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {reviewCount} transaction{reviewCount > 1 ? 's' : ''} need review — click to assign envelopes
        </Link>
      )}

      {/* Empty state — no envelopes */}
      {noEnvelopes && (
        <div className="card">
          <div className="empty-state">
            <FolderOpen className="empty-state-icon" />
            <p className="empty-state-title">No envelopes yet</p>
            <p className="empty-state-body">
              Create your budget envelopes to start tracking balances.
            </p>
            <Link to="/settings/envelopes" className="btn-primary mt-2">
              Go to Manage Envelopes
            </Link>
          </div>
        </div>
      )}

      {/* Main content — two column layout on lg+ */}
      {!noEnvelopes && (
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">

          {/* ── Left column ────────────────────────────────────────────── */}
          <div className="flex-1 min-w-0">

            {/* Featured envelope cards */}
            {settings && (
              [settings.featured_envelope_1_id,
               settings.featured_envelope_2_id,
               settings.featured_envelope_3_id]
                .some(id => id !== null) && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-6">
                  {[
                    settings.featured_envelope_1_id,
                    settings.featured_envelope_2_id,
                    settings.featured_envelope_3_id,
                  ].map((id) =>
                    id ? (
                      <FeaturedCard
                        key={id}
                        envelopeId={id}
                        envelopes={envelopes}
                        balances={displayBalances}
                      />
                    ) : null,
                  )}
                </div>
              )
            )}

            {/* Loading skeleton */}
            {isLoading && (
              <div className="card p-8 flex justify-center">
                <span className="spinner" style={{ color: 'var(--text-subtle)' }} />
              </div>
            )}

            {/* Standalone envelopes */}
            {!isLoading && (
              <StandaloneCard standalones={standalones} balances={displayBalances} />
            )}

            {/* Parent group cards */}
            {!isLoading && parents.map(parent => (
              <ParentCard
                key={parent.id}
                parent={parent}
                children={childrenOf(parent.id)}
                balances={displayBalances}
              />
            ))}
          </div>

          {/* ── Right column — recent activity ─────────────────────────── */}
          <div className="w-full lg:w-72 shrink-0">
            <RecentActivity
              transactions={allTransactions}
              envelopes={envelopes}
            />
          </div>
        </div>
      )}

      {/* Modals */}
      {addOpen    && <AddTransactionModal onClose={() => setAddOpen(false)} />}
      {importOpen && <ImportModal onClose={() => setImportOpen(false)} />}
    </div>
  )
}

