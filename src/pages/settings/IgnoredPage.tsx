/**
 * Ignored Transactions Settings Page  (BRD §4.9, Step 14)
 *
 * Lists all non-deleted transactions with kind='ignored'.
 * Allows "Unignore" which sets kind to 'expense' (negative) or 'cash-income' (positive)
 * and clears the review flag so the transaction re-enters normal flow.
 */

import { useEffect, useState } from 'react'
import { ChevronLeft, RotateCcw, AlertCircle } from 'lucide-react'
import { Link }                          from 'react-router-dom'
import { supabase }                      from '../../lib/supabase'
import { formatCurrency, formatDate }    from '../../lib/formatters'
import { useToast }                      from '../../contexts/ToastContext'
import type { Transaction }              from '../../types/database'

export function IgnoredPage() {
  const { toast } = useToast()

  const [ignored,   setIgnored]   = useState<Transaction[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [unignoring, setUnignoring] = useState<Set<string>>(new Set())

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setIsLoading(true)
    setLoadError(null)
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('kind', 'ignored')
        .eq('deleted', false)
        .order('date', { ascending: false })
      if (error) throw error
      setIgnored((data ?? []) as Transaction[])
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? 'Failed to load ignored transactions'
      setLoadError(msg)
      toast('Failed to load ignored transactions', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  async function handleUnignore(tx: Transaction) {
    setUnignoring(s => new Set(s).add(tx.id))
    try {
      const newKind = tx.amount >= 0 ? 'cash-income' : 'expense'
      const { error } = await supabase
        .from('transactions')
        .update({ kind: newKind, review: true, envelope_id: null })
        .eq('id', tx.id)
      if (error) throw error
      setIgnored(ts => ts.filter(t => t.id !== tx.id))
      toast('Transaction restored — assign an envelope to categorise it')
    } catch {
      toast('Failed to unignore transaction', 'error')
    } finally {
      setUnignoring(s => { const n = new Set(s); n.delete(tx.id); return n })
    }
  }

  return (
    <div className="p-4 lg:p-6 max-w-2xl">
      <div className="page-header">
        <div className="flex items-center gap-2">
          <Link to="/settings" className="flex h-8 w-8 items-center justify-center rounded-md
            transition-colors hover:opacity-70" style={{ color: 'var(--text-subtle)' }}>
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <h1 className="page-title">Ignored Transactions</h1>
        </div>
      </div>

      <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>
        These transactions are excluded from balance calculations. Unignore them
        to restore them to the pending review queue.
      </p>

      {isLoading && (
        <div className="card p-8 flex justify-center">
          <span className="spinner" style={{ color: 'var(--text-subtle)' }} />
        </div>
      )}

      {!isLoading && loadError && (
        <div
          className="card p-5 flex flex-col items-center gap-3 text-center"
          style={{ color: 'var(--danger)' }}
        >
          <AlertCircle className="h-6 w-6 shrink-0" />
          <div>
            <p className="text-sm font-medium mb-1">Failed to load ignored transactions</p>
            <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>{loadError}</p>
          </div>
          <button className="btn-ghost text-sm" onClick={load}>Retry</button>
        </div>
      )}

      {!isLoading && !loadError && ignored.length === 0 && (
        <div className="card">
          <div className="empty-state py-10">
            <p className="empty-state-title">No ignored transactions</p>
            <p className="empty-state-body">
              Transactions marked as "Ignored" will appear here.
            </p>
          </div>
        </div>
      )}

      {!isLoading && !loadError && ignored.length > 0 && (
        <div className="card overflow-hidden">
          {/* Column headers */}
          <div
            className="hidden sm:flex items-center gap-3 px-4 py-2 text-xs border-b"
            style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
          >
            <span className="w-24 section-label">Date</span>
            <span className="flex-1 section-label">Description</span>
            <span className="w-24 text-right section-label">Amount</span>
            <span className="w-20" />
          </div>

          {ignored.map(tx => (
            <div
              key={tx.id}
              className="flex flex-wrap items-center gap-3 border-b px-4 py-3 last:border-b-0 text-sm"
              style={{ borderColor: 'var(--border)' }}
            >
              <span className="w-24 shrink-0 tabular-nums text-xs"
                style={{ color: 'var(--text-muted)' }}>
                {formatDate(tx.date)}
              </span>
              <span className="flex-1 min-w-0 truncate" style={{ color: 'var(--text)' }}>
                {tx.description}
              </span>
              <span className="w-24 text-right tabular-nums font-medium"
                style={{ color: 'var(--text-muted)' }}>
                {formatCurrency(tx.amount)}
              </span>
              <button
                className="flex items-center gap-1 text-xs transition-opacity hover:opacity-70 w-20 justify-end"
                style={{ color: 'var(--pink)' }}
                onClick={() => handleUnignore(tx)}
                disabled={unignoring.has(tx.id)}
              >
                {unignoring.has(tx.id)
                  ? <span className="spinner" />
                  : <><RotateCcw className="h-3 w-3" /> Unignore</>
                }
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
