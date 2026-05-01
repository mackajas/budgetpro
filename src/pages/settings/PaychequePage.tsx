/**
 * Settings — Paycheque  (BRD §4.4, §6.5, Step 9)
 *
 * Configures:
 *   Employer 1 — name, fortnightly gross, single detection keyword
 *   Employer 2 — name, two pay components each with amount + detection keyword
 *
 * All fields auto-save on blur via SaveContext.
 * Detection keywords are case-insensitive substring matches used during CSV import.
 */

import { useEffect, useState, useRef } from 'react'
import { Link }      from 'react-router-dom'
import { ChevronLeft, HelpCircle } from 'lucide-react'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { useSave }          from '../../contexts/SaveContext'
import { useToast }         from '../../contexts/ToastContext'
import type { Settings }    from '../../types/database'

interface FieldImplProps {
  label:        string
  hint?:        string
  serverValue:  string
  type?:        'text' | 'number'
  placeholder?: string
  onSave:       (val: string) => Promise<void>
}

function FieldImpl({ label, hint, serverValue, type = 'text', placeholder, onSave }: FieldImplProps) {
  const [draft, setDraft]   = useState(serverValue)
  const [saving, setSaving] = useState(false)
  const prevRef             = useRef(serverValue)

  // Sync when server value changes (e.g. after initial fetch)
  useEffect(() => {
    if (prevRef.current !== serverValue) {
      setDraft(serverValue)
      prevRef.current = serverValue
    }
  }, [serverValue])

  async function handleBlur() {
    const val = draft.trim()
    if (val === prevRef.current) return
    setSaving(true)
    try {
      await onSave(val)
      prevRef.current = val
    } catch {
      setDraft(prevRef.current) // revert on error
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
        {label}
        {hint && (
          <span className="ml-1.5 inline-flex items-center gap-0.5" title={hint}
            style={{ color: 'var(--text-subtle)', cursor: 'help' }}>
            <HelpCircle className="h-3 w-3" />
          </span>
        )}
      </label>
      <input
        className="input"
        type={type}
        value={draft}
        placeholder={placeholder}
        onChange={e => setDraft(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
        disabled={saving}
        min={type === 'number' ? '0' : undefined}
        step={type === 'number' ? '0.01' : undefined}
      />
    </div>
  )
}

// ── Section card ──────────────────────────────────────────────────────────────

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card rounded-lg p-5 mb-4">
      <h2 className="section-label mb-4">{title}</h2>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function PaychequePage() {
  const { settings, isLoading, fetch, update } = useSettingsStore()
  const { withSave } = useSave()
  const { toast }    = useToast()

  useEffect(() => { fetch() }, [fetch])

  function saveField(key: keyof Omit<Settings, 'id'>) {
    return async (val: string) => {
      await withSave(async () => {
        const patch: Partial<Omit<Settings, 'id'>> = {}
        // Numbers stored as numbers; everything else as text
        const numericKeys: Array<keyof Settings> = [
          'employer_1_gross', 'employer_2_pay_1', 'employer_2_pay_2',
        ]
        if (numericKeys.includes(key as keyof Settings)) {
          const n = parseFloat(val)
          ;(patch as Record<string, unknown>)[key] = isNaN(n) ? null : n
        } else {
          ;(patch as Record<string, unknown>)[key] = val || null
        }
        await update(patch)
        toast('Saved')
      })
    }
  }

  const str  = (v: string | number | null | undefined) => v != null ? String(v) : ''

  const header = (
    <div className="page-header">
      <div className="flex items-center gap-3">
        <Link to="/settings"
          className="flex h-8 w-8 items-center justify-center rounded-md transition-colors"
          style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <h1 className="page-title">Paycheque</h1>
      </div>
    </div>
  )

  if (isLoading) {
    return (
      <div className="p-4 lg:p-6 max-w-2xl">
        {header}
        <div className="card p-8 text-center">
          <span className="spinner" style={{ color: 'var(--text-subtle)' }} />
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 max-w-2xl">
      {header}

      {/* ── Employer 1 ──────────────────────────────────────────────────── */}
      <SectionCard title="Employer 1">
        <FieldImpl
          label="Employer name"
          serverValue={str(settings?.employer_name_1)}
          placeholder="e.g. Acme Corp"
          onSave={saveField('employer_name_1')}
        />
        <FieldImpl
          label="Fortnightly gross ($)"
          serverValue={str(settings?.employer_1_gross)}
          type="number"
          placeholder="e.g. 5000"
          onSave={saveField('employer_1_gross')}
        />
        <FieldImpl
          label="Detection keyword"
          hint="Case-insensitive substring matched against the bank transaction description to identify paycheques"
          serverValue={str(settings?.employer_1_keyword)}
          placeholder="e.g. ACME CORP PAYROLL"
          onSave={saveField('employer_1_keyword')}
        />
      </SectionCard>

      {/* ── Employer 2 ──────────────────────────────────────────────────── */}
      <SectionCard title="Employer 2">
        <FieldImpl
          label="Employer name"
          serverValue={str(settings?.employer_name_2)}
          placeholder="e.g. Big Co"
          onSave={saveField('employer_name_2')}
        />

        <div className="flex flex-col gap-1 pt-1">
          <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Pay component 1
          </p>
          <p className="text-xs mb-2" style={{ color: 'var(--text-subtle)' }}>
            Employer 2 pay arrives as two separate bank transactions — configure each component below.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FieldImpl
            label="Amount ($)"
            serverValue={str(settings?.employer_2_pay_1)}
            type="number"
            placeholder="e.g. 3000"
            onSave={saveField('employer_2_pay_1')}
          />
          <FieldImpl
            label="Detection keyword"
            hint="Substring matched against bank description for this pay component"
            serverValue={str(settings?.employer_2_pay_1_keyword)}
            placeholder="e.g. BIG CO SALARY"
            onSave={saveField('employer_2_pay_1_keyword')}
          />
        </div>

        <div className="flex flex-col gap-1 pt-1">
          <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Pay component 2
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FieldImpl
            label="Amount ($)"
            serverValue={str(settings?.employer_2_pay_2)}
            type="number"
            placeholder="e.g. 800"
            onSave={saveField('employer_2_pay_2')}
          />
          <FieldImpl
            label="Detection keyword"
            hint="Substring matched against bank description for this pay component"
            serverValue={str(settings?.employer_2_pay_2_keyword)}
            placeholder="e.g. BIG CO SUPER"
            onSave={saveField('employer_2_pay_2_keyword')}
          />
        </div>
      </SectionCard>
    </div>
  )
}
