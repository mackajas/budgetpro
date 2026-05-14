/**
 * Category Rules Settings Page  (BRD §4.9, Step 14)
 *
 * Keyword-based auto-categorisation rules stored in category_rules table.
 * Each rule: keyword, envelope, priority (lower = higher priority).
 * Rules with source='auto' are created by the import pipeline (learned).
 * Rules with source='manual' are created here by the user.
 *
 * Actions: Add rule, Delete rule.
 */

import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, Plus, Trash2 }     from 'lucide-react'
import { Link }                          from 'react-router-dom'
import { supabase }                      from '../../lib/supabase'
import { useEnvelopeStore }              from '../../stores/useEnvelopeStore'
import { useToast }                      from '../../contexts/ToastContext'
import type { CategoryRule }             from '../../types/database'

export function RulesPage() {
  const { envelopes, fetch: fetchEnvelopes } = useEnvelopeStore()
  const { toast } = useToast()

  const [rules,      setRules]      = useState<CategoryRule[]>([])
  const [isLoading,  setIsLoading]  = useState(false)
  const [confirmId,  setConfirmId]  = useState<string | null>(null)
  const [deleting,   setDeleting]   = useState<string | null>(null)
  const [ruleFilter, setRuleFilter] = useState<'all' | 'envelope' | 'ignore'>('all')

  // New rule form state
  const [keyword,   setKeyword]   = useState('')
  const [envId,     setEnvId]     = useState('')
  const [priority,  setPriority]  = useState('50')
  const [adding,    setAdding]    = useState(false)

  useEffect(() => {
    fetchEnvelopes()
    loadRules()
  }, [fetchEnvelopes])

  async function loadRules() {
    setIsLoading(true)
    try {
      const { data, error } = await supabase
        .from('category_rules')
        .select('*')
        .order('priority', { ascending: true })
      if (error) throw error
      setRules((data ?? []) as CategoryRule[])
    } catch {
      toast('Failed to load rules', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  const leafEnvelopes = useMemo(
    () => envelopes.filter(e => !envelopes.some(c => c.parent_id === e.id)),
    [envelopes],
  )

  const envMap = useMemo(
    () => new Map(envelopes.map(e => [e.id, e.name])),
    [envelopes],
  )

  const visibleRules = useMemo(() => {
    if (ruleFilter === 'envelope') return rules.filter(r => r.envelope_id !== null)
    if (ruleFilter === 'ignore')   return rules.filter(r => r.envelope_id === null)
    return rules
  }, [rules, ruleFilter])

  async function handleAdd() {
    if (!keyword.trim()) { toast('Enter a keyword', 'error'); return }
    if (!envId)          { toast('Select an envelope or choose Ignore', 'error'); return }
    const pri = parseInt(priority, 10)
    if (isNaN(pri) || pri < 1 || pri > 999) {
      toast('Priority must be 1–999', 'error'); return
    }
    setAdding(true)
    try {
      const { data, error } = await supabase
        .from('category_rules')
        .insert({
          keyword:     keyword.trim().toLowerCase(),
          envelope_id: envId === '__ignore__' ? null : envId,
          source:      'manual',
          priority:    pri,
        })
        .select()
        .single()
      if (error) throw error
      setRules(rs => [...rs, data as CategoryRule].sort((a, b) => a.priority - b.priority))
      setKeyword('')
      setEnvId('')
      setPriority('50')
      toast('Rule added')
    } catch {
      toast('Failed to add rule', 'error')
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    try {
      const { error } = await supabase
        .from('category_rules')
        .delete()
        .eq('id', id)
      if (error) throw error
      setRules(rs => rs.filter(r => r.id !== id))
      toast('Rule deleted')
    } catch {
      toast('Failed to delete rule', 'error')
    } finally {
      setDeleting(null)
      setConfirmId(null)
    }
  }

  return (
    <div className="p-4 lg:p-6 max-w-3xl">
      <div className="page-header">
        <div className="flex items-center gap-2">
          <Link to="/settings" className="flex h-8 w-8 items-center justify-center rounded-md
            transition-colors hover:opacity-70" style={{ color: 'var(--text-subtle)' }}>
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <h1 className="page-title">Category Rules</h1>
        </div>
      </div>

      <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>
        Keyword rules automatically assign envelopes during import. Select
        "— Ignore transaction —" to silently skip matching transactions. Lower
        priority numbers match first.
      </p>

      {/* Add rule form */}
      <div
        className="card rounded-lg p-4 mb-5 flex flex-wrap gap-3 items-end"
      >
        <div className="flex-1 min-w-40">
          <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>
            Keyword (case-insensitive)
          </label>
          <input
            className="input text-sm"
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
            placeholder="e.g. woolworths"
          />
        </div>
        <div className="w-44">
          <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>
            Envelope
          </label>
          <select className="select text-sm w-full" value={envId}
            onChange={e => setEnvId(e.target.value)}>
            <option value="">Select…</option>
            <option value="__ignore__">— Ignore transaction —</option>
            {leafEnvelopes.map(e => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </div>
        <div className="w-24">
          <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>
            Priority
          </label>
          <input
            className="input text-sm"
            type="number"
            min="1"
            max="999"
            value={priority}
            onChange={e => setPriority(e.target.value)}
          />
        </div>
        <button className="btn-primary" onClick={handleAdd} disabled={adding}>
          {adding ? <span className="spinner" /> : <Plus className="h-4 w-4" />}
          Add rule
        </button>
      </div>

      {isLoading && (
        <div className="card p-8 flex justify-center">
          <span className="spinner" style={{ color: 'var(--text-subtle)' }} />
        </div>
      )}

      {!isLoading && rules.length === 0 && (
        <div className="card">
          <div className="empty-state py-10">
            <p className="empty-state-title">No rules yet</p>
            <p className="empty-state-body">
              Add a rule above to auto-categorise transactions on import.
            </p>
          </div>
        </div>
      )}

      {!isLoading && rules.length > 0 && (
        <>
          {/* Filter tabs */}
          <div className="flex gap-1 mb-3">
            {(['all', 'envelope', 'ignore'] as const).map(f => (
              <button
                key={f}
                onClick={() => setRuleFilter(f)}
                className="px-3 py-1 rounded-full text-xs font-medium transition-colors"
                style={ruleFilter === f
                  ? { background: 'var(--pink)', color: '#fff' }
                  : { background: 'var(--surface-2)', color: 'var(--text-muted)' }
                }
              >
                {f === 'all' ? `All (${rules.length})` : f === 'envelope' ? `Envelope (${rules.filter(r => r.envelope_id !== null).length})` : `Ignore (${rules.filter(r => r.envelope_id === null).length})`}
              </button>
            ))}
          </div>

        <div className="card overflow-hidden">
          {/* Column headers */}
          <div
            className="hidden sm:grid gap-4 px-4 py-2 text-xs border-b"
            style={{
              gridTemplateColumns: '1fr 10rem 5rem 6rem 2.5rem',
              borderColor: 'var(--border)',
              background: 'var(--surface-2)',
            }}
          >
            <span className="section-label">Keyword</span>
            <span className="section-label">Envelope</span>
            <span className="section-label text-center">Priority</span>
            <span className="section-label">Source</span>
            <span />
          </div>

          {visibleRules.map(rule => (
            <div
              key={rule.id}
              className="flex flex-wrap sm:grid items-center gap-3 sm:gap-4 px-4 py-3
                border-b last:border-b-0 text-sm"
              style={{
                gridTemplateColumns: '1fr 10rem 5rem 6rem 2.5rem',
                borderColor: 'var(--border)',
              }}
            >
              <span className="font-mono text-sm" style={{ color: 'var(--text)' }}>
                {rule.keyword}
              </span>
              <span className="truncate" style={{ color: 'var(--text-muted)' }}>
                {rule.envelope_id
                  ? (envMap.get(rule.envelope_id) ?? '—')
                  : <span
                      className="rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{
                        background: 'color-mix(in srgb, var(--danger) 10%, transparent)',
                        color: 'var(--danger)',
                      }}
                    >
                      Ignore
                    </span>
                }
              </span>
              <span className="text-center tabular-nums" style={{ color: 'var(--text-muted)' }}>
                {rule.priority}
              </span>
              <span>
                <span
                  className="rounded-full px-2 py-0.5 text-xs font-medium"
                  style={rule.source === 'manual'
                    ? { background: 'color-mix(in srgb, var(--pink) 12%, transparent)', color: 'var(--pink)' }
                    : { background: 'var(--surface-2)', color: 'var(--text-subtle)' }
                  }
                >
                  {rule.source === 'manual' ? 'Manual' : 'Learned'}
                </span>
              </span>

              {/* Delete */}
              {confirmId === rule.id ? (
                <div className="flex items-center gap-2 col-span-full sm:col-span-1">
                  <button
                    className="text-xs font-medium"
                    style={{ color: 'var(--danger)' }}
                    onClick={() => handleDelete(rule.id)}
                    disabled={deleting === rule.id}
                  >
                    {deleting === rule.id ? <span className="spinner" /> : 'Delete'}
                  </button>
                  <button
                    className="text-xs"
                    style={{ color: 'var(--text-subtle)' }}
                    onClick={() => setConfirmId(null)}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  className="flex justify-end items-center transition-opacity hover:opacity-70"
                  style={{ color: 'var(--text-subtle)' }}
                  onClick={() => setConfirmId(rule.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
        </>
      )}
    </div>
  )
}
