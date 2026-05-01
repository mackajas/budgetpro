/**
 * Settings — Allocations  (BRD §4.4, Step 9)
 *
 * Two-tab page (Employer 1 / Employer 2) showing each envelope's allocation
 * configuration with a live preview dollar amount and a footer balance indicator.
 *
 * Rules per BRD §4.4:
 *  - Top-level / standalone envelopes: percentage = % of paycheque gross
 *  - Child envelopes: percentage = % of parent's computed dollar amount
 *  - Only top-level allocations contribute to the footer total (children subdivide)
 *  - Values auto-save on blur
 *  - Footer shows: Gross | Allocated | Remaining (Balanced / Under / Over)
 */

import { useEffect, useState, useRef, useCallback } from 'react'
import { Link }                from 'react-router-dom'
import { ChevronLeft }         from 'lucide-react'
import { useEnvelopeStore }    from '../../stores/useEnvelopeStore'
import { useSettingsStore }    from '../../stores/useSettingsStore'
import { useSave }             from '../../contexts/SaveContext'
import { useToast }            from '../../contexts/ToastContext'
import { supabase }            from '../../lib/supabase'
import { computeAllocationAmount, round2 } from '../../lib/allocations'
import { formatCurrency }      from '../../lib/formatters'
import type { Envelope, EnvelopeAllocation } from '../../types/database'

type EmployerId = 1 | 2
type AllocType  = 'fixed' | 'percentage'

interface LocalAlloc {
  type:  AllocType
  value: string   // string for input binding; parse on save
}

// ── Supabase helpers ───────────────────────────────────────────────────────────

async function fetchAllocations(employerId: EmployerId): Promise<EnvelopeAllocation[]> {
  const { data } = await supabase
    .from('envelope_allocations')
    .select('*')
    .eq('employer_id', employerId)
  return (data ?? []) as EnvelopeAllocation[]
}

async function upsertAllocation(
  envelopeId: string,
  employerId: EmployerId,
  type: AllocType,
  value: number,
) {
  const { error } = await supabase
    .from('envelope_allocations')
    .upsert(
      { envelope_id: envelopeId, employer_id: employerId, allocation_type: type, value, updated_at: new Date().toISOString() },
      { onConflict: 'envelope_id,employer_id' },
    )
  if (error) throw new Error(error.message)
}

async function deleteAllocation(envelopeId: string, employerId: EmployerId) {
  const { error } = await supabase
    .from('envelope_allocations')
    .delete()
    .eq('envelope_id', envelopeId)
    .eq('employer_id', employerId)
  if (error) throw new Error(error.message)
}

// ── Footer balance indicator ───────────────────────────────────────────────────

function BalanceFooter({ gross, allocated }: { gross: number; allocated: number }) {
  const remaining = round2(gross - allocated)
  const isOver    = remaining < -0.005
  const isExact   = Math.abs(remaining) <= 0.005

  const statusColour = isOver
    ? 'var(--danger)'
    : isExact
    ? 'var(--success)'
    : 'var(--warning)'

  const statusLabel = isOver
    ? `${formatCurrency(Math.abs(remaining))} over`
    : isExact
    ? 'Balanced'
    : `${formatCurrency(remaining)} remaining`

  return (
    <div
      className="flex items-center justify-between rounded-b-lg border-t px-4 py-3 text-sm"
      style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
    >
      <div className="flex gap-6">
        <span style={{ color: 'var(--text-muted)' }}>
          Gross{' '}
          <span className="font-medium" style={{ color: 'var(--text)' }}>
            {formatCurrency(gross)}
          </span>
        </span>
        <span style={{ color: 'var(--text-muted)' }}>
          Allocated{' '}
          <span className="font-medium" style={{ color: 'var(--text)' }}>
            {formatCurrency(allocated)}
          </span>
        </span>
      </div>
      <span className="font-medium text-xs" style={{ color: statusColour }}>
        {statusLabel}
      </span>
    </div>
  )
}

// ── Single allocation row ──────────────────────────────────────────────────────

interface AllocRowProps {
  envelope:   Envelope
  isChild:    boolean
  alloc:      LocalAlloc | undefined
  preview:    number | null
  onChange:   (id: string, alloc: LocalAlloc) => void
  onBlur:     (id: string) => void
}

function AllocRow({ envelope, isChild, alloc, preview, onChange, onBlur }: AllocRowProps) {
  const type  = alloc?.type  ?? 'fixed'
  const value = alloc?.value ?? ''

  return (
    <div
      className={`flex items-center gap-3 border-b px-4 py-2.5 text-sm ${isChild ? 'pl-8' : ''}`}
      style={{ borderColor: 'var(--border)' }}
    >
      {isChild && <span className="child-envelope-rule" />}

      {/* Envelope name */}
      <span className="flex-1 truncate" style={{ color: 'var(--text)' }}>
        {envelope.name}
      </span>

      {/* Type dropdown */}
      <select
        className="select w-32 py-1.5 text-xs"
        value={type}
        onChange={e =>
          onChange(envelope.id, { type: e.target.value as AllocType, value })
        }
        onBlur={() => onBlur(envelope.id)}
      >
        <option value="fixed">Fixed $</option>
        <option value="percentage">Percentage %</option>
      </select>

      {/* Value input */}
      <div className="relative w-24">
        <span
          className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-xs"
          style={{ color: 'var(--text-subtle)' }}
        >
          {type === 'fixed' ? '$' : '%'}
        </span>
        <input
          className="input py-1.5 pl-7 text-xs"
          type="number"
          min="0"
          step={type === 'fixed' ? '0.01' : '0.1'}
          value={value}
          placeholder="—"
          onChange={e => onChange(envelope.id, { type, value: e.target.value })}
          onBlur={() => onBlur(envelope.id)}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
        />
      </div>

      {/* Live preview */}
      <span
        className="w-24 text-right text-xs tabular-nums"
        style={{ color: preview != null ? 'var(--text-muted)' : 'var(--text-subtle)' }}
      >
        {preview != null ? formatCurrency(preview) : '—'}
      </span>
    </div>
  )
}

// ── Employer tab panel ─────────────────────────────────────────────────────────

interface TabPanelProps {
  employerId:  EmployerId
  gross:       number
  envelopes:   Envelope[]
}

function TabPanel({ employerId, gross, envelopes }: TabPanelProps) {
  const { withSave } = useSave()
  const { toast }    = useToast()

  const [allocs, setAllocs]   = useState<Record<string, LocalAlloc>>({})
  const [loading, setLoading] = useState(true)
  const serverRef             = useRef<Record<string, { type: AllocType; value: number }>>({})

  // Load allocations for this employer on mount / employer change
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchAllocations(employerId).then(rows => {
      if (cancelled) return
      const local: Record<string, LocalAlloc> = {}
      const server: typeof serverRef.current  = {}
      rows.forEach(r => {
        local[r.envelope_id]  = { type: r.allocation_type, value: String(r.value) }
        server[r.envelope_id] = { type: r.allocation_type, value: r.value }
      })
      setAllocs(local)
      serverRef.current = server
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [employerId])

  const handleChange = useCallback((id: string, a: LocalAlloc) => {
    setAllocs(prev => ({ ...prev, [id]: a }))
  }, [])

  const handleBlur = useCallback(async (id: string) => {
    const local  = allocs[id]
    const server = serverRef.current[id]
    if (!local) return

    const numVal = parseFloat(local.value)
    const isBlank = local.value.trim() === '' || isNaN(numVal)

    // If blank and didn't exist before → nothing to do
    if (isBlank && !server) return

    // If blank and existed → delete
    if (isBlank && server) {
      await withSave(async () => {
        await deleteAllocation(id, employerId)
        delete serverRef.current[id]
        setAllocs(prev => { const n = { ...prev }; delete n[id]; return n })
        toast('Allocation cleared')
      })
      return
    }

    // No change
    if (server && server.type === local.type && server.value === numVal) return

    await withSave(async () => {
      await upsertAllocation(id, employerId, local.type, numVal)
      serverRef.current[id] = { type: local.type, value: numVal }
      toast('Allocation saved')
    })
  }, [allocs, employerId, withSave, toast])

  // ── Preview calculations ───────────────────────────────────────────────────

  const topLevel = envelopes
    .filter(e => e.parent_id === null)
    .sort((a, b) => a.display_order - b.display_order)

  const childrenOf = (pid: string) =>
    envelopes.filter(e => e.parent_id === pid).sort((a, b) => a.display_order - b.display_order)

  const previewFor = (env: Envelope, parentPreview: number | null): number | null => {
    const a = allocs[env.id]
    if (!a || a.value.trim() === '') return null
    const n = parseFloat(a.value)
    if (isNaN(n) || n === 0) return null
    const basis = env.parent_id === null ? gross : (parentPreview ?? 0)
    return computeAllocationAmount(a.type, n, basis)
  }

  // Footer: only top-level allocated amounts contribute to total
  const footerAllocated = round2(
    topLevel.reduce((sum, env) => {
      const p = previewFor(env, null)
      return sum + (p ?? 0)
    }, 0),
  )

  if (loading) {
    return (
      <div className="card p-8 text-center">
        <span className="spinner" style={{ color: 'var(--text-subtle)' }} />
      </div>
    )
  }

  return (
    <div className="card overflow-hidden">
      {/* Column headers */}
      <div
        className="flex items-center gap-3 border-b px-4 py-2 text-xs"
        style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
      >
        <span className="flex-1 section-label">Envelope</span>
        <span className="w-32 section-label">Type</span>
        <span className="w-24 section-label">Value</span>
        <span className="w-24 text-right section-label">Preview</span>
      </div>

      {/* Rows */}
      {envelopes.length === 0 && (
        <div className="empty-state py-10">
          <p className="empty-state-body">
            No envelopes yet —{' '}
            <Link to="/settings/envelopes" style={{ color: 'var(--pink)' }}>
              create envelopes first
            </Link>
          </p>
        </div>
      )}

      {topLevel.map(env => {
        const topPreview = previewFor(env, null)
        return (
          <div key={env.id}>
            <AllocRow
              envelope={env}
              isChild={false}
              alloc={allocs[env.id]}
              preview={topPreview}
              onChange={handleChange}
              onBlur={handleBlur}
            />
            {childrenOf(env.id).map(child => (
              <AllocRow
                key={child.id}
                envelope={child}
                isChild={true}
                alloc={allocs[child.id]}
                preview={previewFor(child, topPreview)}
                onChange={handleChange}
                onBlur={handleBlur}
              />
            ))}
          </div>
        )
      })}

      {/* Footer */}
      {envelopes.length > 0 && (
        <BalanceFooter gross={gross} allocated={footerAllocated} />
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function AllocationsPage() {
  const { envelopes, isLoading: envLoading, fetch: fetchEnvelopes } = useEnvelopeStore()
  const { settings,  isLoading: setLoading, fetch: fetchSettings  } = useSettingsStore()
  const [tab, setTab] = useState<EmployerId>(1)

  useEffect(() => {
    fetchEnvelopes()
    fetchSettings()
  }, [fetchEnvelopes, fetchSettings])

  const gross1 = settings?.employer_1_gross ?? 0
  const gross2 = round2((settings?.employer_2_pay_1 ?? 0) + (settings?.employer_2_pay_2 ?? 0))
  const gross  = tab === 1 ? gross1 : gross2

  const isLoading = envLoading || setLoading

  const tabBase = 'px-4 py-2 text-sm font-medium rounded-md transition-colors'
  const tabActive = `${tabBase} text-white`
  const tabInactive = `${tabBase}`

  return (
    <div className="p-4 lg:p-6 max-w-2xl">
      {/* Page header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <Link
            to="/settings"
            className="flex h-8 w-8 items-center justify-center rounded-md transition-colors"
            style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <h1 className="page-title">Allocations</h1>
        </div>
      </div>

      {/* Employer tabs */}
      <div
        className="mb-4 inline-flex gap-1 rounded-lg p-1"
        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
      >
        {([1, 2] as EmployerId[]).map(id => (
          <button
            key={id}
            className={tab === id ? tabActive : tabInactive}
            style={tab === id
              ? { background: 'var(--pink)' }
              : { color: 'var(--text-muted)' }
            }
            onClick={() => setTab(id)}
          >
            {settings?.[`employer_name_${id}` as 'employer_name_1' | 'employer_name_2']
              || `Employer ${id}`}
          </button>
        ))}
      </div>

      {/* Gross hint */}
      {!isLoading && gross === 0 && (
        <div
          className="mb-4 rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: 'var(--warning)', color: 'var(--warning)', background: 'color-mix(in srgb, var(--warning) 8%, transparent)' }}
        >
          No gross configured for this employer — set amounts in{' '}
          <Link to="/settings/paycheque" style={{ textDecoration: 'underline' }}>
            Paycheque settings
          </Link>{' '}
          to enable percentage previews.
        </div>
      )}

      {isLoading ? (
        <div className="card p-8 text-center">
          <span className="spinner" style={{ color: 'var(--text-subtle)' }} />
        </div>
      ) : (
        <TabPanel
          key={tab}               // remount on tab change to reset state
          employerId={tab}
          gross={gross}
          envelopes={envelopes}
        />
      )}
    </div>
  )
}
