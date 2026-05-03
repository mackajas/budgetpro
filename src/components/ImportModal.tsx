/**
 * Import Modal  (BRD §4.5, Step 10)
 *
 * Stages:
 *  drop       → user selects / drops a CSV file
 *  parsing    → pipeline running (PapaParse + classification)
 *  preview    → summary shown; user confirms or cancels
 *  importing  → Supabase batch insert in progress
 *  done       → results shown with link to unassigned transactions
 *
 * Constraints (BRD §4.5.1):
 *  - .csv extension only
 *  - Max 5 MB
 *  - Max 10,000 rows
 *  - UTF-8 with BOM stripped automatically
 *
 * Placement: rendered by DashboardPage and TransactionsPage;
 * "user remains on the page they imported from" after dismiss.
 */

import {
  useEffect, useRef, useState, useCallback, type DragEvent,
} from 'react'
import { useNavigate }       from 'react-router-dom'
import { Upload, X, CheckCircle, AlertTriangle, SkipForward, FileText } from 'lucide-react'
import { supabase }              from '../lib/supabase'
import { runImportPipeline }     from '../lib/importPipeline'
import { useEnvelopeStore }      from '../stores/useEnvelopeStore'
import { useSettingsStore }      from '../stores/useSettingsStore'
import { useTransactionStore }   from '../stores/useTransactionStore'
import { useBankAccountStore }   from '../stores/useBankAccountStore'
import { useToast }              from '../contexts/ToastContext'
import type { ProcessedRow, PipelineResult } from '../lib/importPipeline'
import type { CategoryRule, EnvelopeAllocation } from '../types/database'

const MAX_SIZE_BYTES = 5 * 1024 * 1024   // 5 MB
const MAX_ROWS       = 10_000

// ── Format label ─────────────────────────────────────────────────────────────

const FORMAT_LABELS: Record<string, string> = {
  cba: 'Commonwealth Bank (CBA)', anz: 'ANZ', nab: 'NAB',
  westpac: 'Westpac', ing: 'ING', bankwest: 'Bankwest',
  coles: 'Coles Credit Card (legacy)', 'coles-cc': 'Coles Credit Card',
}

// ── Stat pill ─────────────────────────────────────────────────────────────────

function Stat({ label, value, colour }: { label: string; value: number; colour: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border px-4 py-3"
      style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
      <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className="text-sm font-semibold tabular-nums" style={{ color: colour }}>{value}</span>
    </div>
  )
}

// ── Drop zone ─────────────────────────────────────────────────────────────────

interface DropZoneProps {
  onFile: (file: File) => void
  error:  string | null
}

function DropZone({ onFile, error }: DropZoneProps) {
  const inputRef          = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  function validate(file: File): string | null {
    if (!file.name.toLowerCase().endsWith('.csv')) return 'Only .csv files are supported.'
    if (file.size > MAX_SIZE_BYTES) return 'File must be under 5 MB.'
    return null
  }

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    const file = files[0]
    const err  = validate(file)
    if (err) { onFile(Object.assign(new File([], ''), { _error: err }) as File); return }
    onFile(file)
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault(); setDragging(false)
    handleFiles(e.dataTransfer.files)
  }

  return (
    <div>
      <div
        className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 text-center cursor-pointer transition-colors"
        style={{
          borderColor:     dragging ? 'var(--pink)' : 'var(--border-2)',
          background:      dragging ? 'color-mix(in srgb, var(--pink) 5%, transparent)' : 'var(--surface-2)',
        }}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click() }}
        aria-label="Click or drag to upload CSV"
      >
        <Upload className="h-8 w-8" style={{ color: 'var(--pink)' }} />
        <div>
          <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
            Drop your CSV file here
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            or click to browse — max 5 MB, 10,000 rows
          </p>
        </div>
        <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>
          ANZ · CBA · NAB · Westpac · ING · Bankwest · Coles
        </p>
      </div>

      {error && (
        <p className="mt-2 text-sm" style={{ color: 'var(--danger)' }}>{error}</p>
      )}

      <input
        ref={inputRef} type="file" accept=".csv"
        className="hidden"
        onChange={e => handleFiles(e.target.files)}
      />
    </div>
  )
}

// ── Main modal ─────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void
}

type Stage = 'drop' | 'parsing' | 'preview' | 'importing' | 'done'

interface DoneResult {
  imported:    number
  needsReview: number
  duplicatesSkipped: number
}

export function ImportModal({ onClose }: Props) {
  const navigate    = useNavigate()
  const { toast }   = useToast()
  const { envelopes, fetch: fetchEnvelopes }       = useEnvelopeStore()
  const { settings,  fetch: fetchSettings }        = useSettingsStore()
  const { invalidate: invalidateTransactions }     = useTransactionStore()
  const { accounts,  fetch: fetchAccounts }        = useBankAccountStore()

  const [stage,           setStage]           = useState<Stage>('drop')
  const [fileError,       setFileError]       = useState<string | null>(null)
  const [parseResult,     setParseResult]     = useState<PipelineResult | null>(null)
  const [rows,            setRows]            = useState<ProcessedRow[]>([])
  const [doneResult,      setDoneResult]      = useState<DoneResult | null>(null)
  const [parseError,      setParseError]      = useState<string | null>(null)
  const [bankAccountId,   setBankAccountId]   = useState<string>('')

  // Ensure stores are loaded
  useEffect(() => {
    fetchEnvelopes()
    fetchSettings()
    fetchAccounts()
  }, [fetchEnvelopes, fetchSettings, fetchAccounts])

  // ── Toggle "import anyway" for a duplicate row ───────────────────────────
  const toggleAnyway = useCallback((idx: number) => {
    setRows(prev => prev.map((r, i) =>
      i === idx ? { ...r, importAnyway: !r.importAnyway } : r,
    ))
  }, [])

  // ── File selected ─────────────────────────────────────────────────────────
  const handleFile = useCallback(async (file: File) => {
    // Catch validation error attached by DropZone
    if ((file as File & { _error?: string })._error) {
      setFileError((file as File & { _error?: string })._error!)
      return
    }
    // Guard: settings must be loaded before we can run the import pipeline (BUG-03 fix)
    if (!settings) {
      toast('Settings not loaded yet — please wait a moment', 'error')
      return
    }
    setFileError(null)
    setParseError(null)
    setStage('parsing')

    try {
      // Load supporting data
      const [rulesRes, allocRes] = await Promise.all([
        supabase.from('category_rules').select('*').order('priority'),
        supabase.from('envelope_allocations').select('*'),
      ])

      const rules:       CategoryRule[]      = (rulesRes.data ?? []) as CategoryRule[]
      const allocations: EnvelopeAllocation[] = (allocRes.data ?? []) as EnvelopeAllocation[]

      // Run pipeline (parses file, classifies rows)
      const result = await runImportPipeline({
        file,
        settings,
        envelopes,
        allocations,
        rules,
        existing:    [],   // duplicate detection deferred — fetched after format/date range known below
      })

      // Re-run duplicate detection with actual existing transactions in date range
      if (result.rows.length > 0) {
        const dates = result.rows
          .filter(r => !r.validationError && r.date)
          .map(r => r.date)
          .sort()
        const minDate = dates[0]
        const maxDate = dates[dates.length - 1]

        const { data: existing } = await supabase
          .from('transactions')
          .select('id,date,amount,description,deleted')
          .gte('date', minDate)
          .lte('date', maxDate)
          .eq('deleted', false)

        // Re-check duplicates with the fetched existing rows
        const { detectDuplicate: checkDup } = await import('../lib/csv/duplicate')
        const updatedRows = result.rows.map(r => {
          if (r.validationError || !r.date) return r
          return {
            ...r,
            isDuplicate: checkDup(
              { date: r.date, amount: r.amount, description: r.description },
              (existing ?? []) as Parameters<typeof checkDup>[1],
            ),
          }
        })

        result.rows    = updatedRows
        result.ready   = updatedRows.filter(r => !r.validationError && !r.isDuplicate)
        result.counts.duplicates = updatedRows.filter(r => !r.validationError && r.isDuplicate).length
        result.counts.needsReview = updatedRows.filter(r => r.review && !r.isDuplicate && !r.validationError).length
      }

      // Check row limit
      if (result.counts.total > MAX_ROWS) {
        setParseError(`File has ${result.counts.total} rows — maximum is ${MAX_ROWS}.`)
        setStage('drop')
        return
      }

      setParseResult(result)
      setRows(result.rows)
      setStage('preview')
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Failed to parse file.')
      setStage('drop')
    }
  }, [settings, envelopes])

  // ── Confirm import ────────────────────────────────────────────────────────
  const handleImport = useCallback(async () => {
    if (!parseResult) return
    setStage('importing')

    const batchId = crypto.randomUUID()
    const toInsert = rows.filter(r =>
      !r.validationError && (!r.isDuplicate || r.importAnyway),
    )

    const accountId = bankAccountId || null

    const records = toInsert.map(r => ({
      date:            r.date,
      description:     r.description,
      amount:          r.amount,
      kind:            r.kind,
      envelope_id:     r.envelope_id,
      splits:          r.splits,
      how_categorised: r.how_categorised,
      review:          r.review,
      notes:           null,
      import_batch_id: batchId,
      bank_account_id: accountId,
      deleted:         false,
    }))

    try {
      const { error } = await supabase.from('transactions').insert(records)
      if (error) throw new Error(error.message)

      // Invalidate transaction store so pages refresh
      await invalidateTransactions()

      setDoneResult({
        imported:          records.length,
        needsReview:       toInsert.filter(r => r.review).length,
        duplicatesSkipped: rows.filter(r => !r.validationError && r.isDuplicate && !r.importAnyway).length,
      })
      setStage('done')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Import failed', 'error')
      setStage('preview')
    }
  }, [parseResult, rows, bankAccountId, invalidateTransactions, toast])

  // ── Duplicates ready count (includes importAnyway overrides) ─────────────
  const anyDuplicates = parseResult && parseResult.counts.duplicates > 0
  const readyCount    = rows.filter(r => !r.validationError && (!r.isDuplicate || r.importAnyway)).length
  const importAnywayCount = rows.filter(r => r.isDuplicate && r.importAnyway).length

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal w-full"
        style={{ maxWidth: '32rem' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>
            {stage === 'done' ? 'Import Complete' : 'Import Transactions'}
          </h2>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md transition-colors"
            style={{ color: 'var(--text-subtle)' }}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Drop ───────────────────────────────────────────────────── */}
        {stage === 'drop' && (
          <>
            {/* Bank account selector */}
            <div className="mb-4">
              <label className="text-xs mb-1.5 block font-medium" style={{ color: 'var(--text-muted)' }}>
                Import from account
              </label>
              <select
                className="select text-sm w-full"
                value={bankAccountId}
                onChange={e => setBankAccountId(e.target.value)}
              >
                <option value="">— Select account (optional) —</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <DropZone onFile={handleFile} error={fileError ?? parseError} />
          </>
        )}

        {/* ── Parsing ────────────────────────────────────────────────── */}
        {stage === 'parsing' && (
          <div className="flex flex-col items-center gap-3 py-10">
            <span className="spinner h-6 w-6" style={{ color: 'var(--pink)' }} />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Analysing file…
            </p>
          </div>
        )}

        {/* ── Preview ────────────────────────────────────────────────── */}
        {stage === 'preview' && parseResult && (
          <>
            {/* Format badge */}
            <div className="mb-4 flex items-center gap-2">
              <FileText className="h-4 w-4 shrink-0" style={{ color: 'var(--text-subtle)' }} />
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Format detected:{' '}
                <span className="font-medium" style={{ color: 'var(--text)' }}>
                  {FORMAT_LABELS[parseResult.format] ?? parseResult.format.toUpperCase()}
                </span>
              </span>
            </div>

            {/* Stats */}
            <div className="flex flex-col gap-2 mb-4">
              <Stat label="Rows found"        value={parseResult.counts.total}      colour="var(--text)" />
              <Stat label="Ready to import"   value={parseResult.counts.valid - parseResult.counts.duplicates} colour="var(--success)" />
              {parseResult.counts.paycheques > 0 && (
                <Stat label="Paycheques"      value={parseResult.counts.paycheques}  colour="var(--text-muted)" />
              )}
              {parseResult.counts.needsReview > 0 && (
                <Stat label="Need review (no category)" value={parseResult.counts.needsReview} colour="var(--warning)" />
              )}
              {parseResult.counts.duplicates > 0 && (
                <Stat label="Duplicates detected" value={parseResult.counts.duplicates} colour="var(--warning)" />
              )}
              {parseResult.counts.invalid > 0 && (
                <Stat label="Invalid rows (skipped)" value={parseResult.counts.invalid} colour="var(--danger)" />
              )}
            </div>

            {/* Import duplicates override */}
            {anyDuplicates && (
              <div
                className="mb-4 rounded-lg border px-4 py-3"
                style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
              >
                <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>
                  Duplicates ({parseResult.counts.duplicates})
                </p>
                <div className="flex flex-col gap-1 max-h-32 overflow-y-auto mb-3">
                  {rows.filter(r => r.isDuplicate).map((r) => (
                    <label key={`${r.date}-${r.description}-${r.amount}`} className="flex items-center gap-2 text-xs cursor-pointer"
                      style={{ color: 'var(--text-muted)' }}>
                      <input
                        type="checkbox"
                        checked={r.importAnyway}
                        onChange={() => {
                          const idx = rows.indexOf(r)
                          toggleAnyway(idx)
                        }}
                        className="rounded"
                      />
                      <span className="truncate">
                        {r.date} · {r.description} · ${Math.abs(r.amount).toFixed(2)}
                      </span>
                    </label>
                  ))}
                </div>
                {importAnywayCount > 0 && (
                  <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>
                    {importAnywayCount} duplicate{importAnywayCount > 1 ? 's' : ''} will be imported
                  </p>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setStage('drop')}>
                Back
              </button>
              <button
                className="btn-primary"
                onClick={handleImport}
                disabled={readyCount === 0}
              >
                Import {readyCount} row{readyCount !== 1 ? 's' : ''}
              </button>
            </div>
          </>
        )}

        {/* ── Importing ──────────────────────────────────────────────── */}
        {stage === 'importing' && (
          <div className="flex flex-col items-center gap-3 py-10">
            <span className="spinner h-6 w-6" style={{ color: 'var(--pink)' }} />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Importing transactions…
            </p>
          </div>
        )}

        {/* ── Done ───────────────────────────────────────────────────── */}
        {stage === 'done' && doneResult && (
          <>
            <div className="flex flex-col gap-2 mb-5">
              <div className="flex items-center gap-3 rounded-lg border px-4 py-3"
                style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
                <CheckCircle className="h-4 w-4 shrink-0" style={{ color: 'var(--success)' }} />
                <span className="text-sm" style={{ color: 'var(--text)' }}>
                  <span className="font-semibold tabular-nums">{doneResult.imported}</span> transaction{doneResult.imported !== 1 ? 's' : ''} imported
                </span>
              </div>

              {doneResult.needsReview > 0 && (
                <div className="flex items-center gap-3 rounded-lg border px-4 py-3"
                  style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
                  <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: 'var(--warning)' }} />
                  <span className="text-sm" style={{ color: 'var(--text)' }}>
                    <span className="font-semibold tabular-nums">{doneResult.needsReview}</span> need review — no category assigned
                  </span>
                </div>
              )}

              {doneResult.duplicatesSkipped > 0 && (
                <div className="flex items-center gap-3 rounded-lg border px-4 py-3"
                  style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
                  <SkipForward className="h-4 w-4 shrink-0" style={{ color: 'var(--text-subtle)' }} />
                  <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    <span className="font-semibold tabular-nums">{doneResult.duplicatesSkipped}</span> duplicate{doneResult.duplicatesSkipped !== 1 ? 's' : ''} skipped
                  </span>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center">
              {doneResult.needsReview > 0 ? (
                <button
                  className="text-sm font-medium transition-opacity hover:opacity-70"
                  style={{ color: 'var(--pink)' }}
                  onClick={() => {
                    navigate('/transactions?unassigned=true')
                    onClose()
                  }}
                >
                  View unassigned →
                </button>
              ) : (
                <span />
              )}
              <button className="btn-primary" onClick={onClose}>Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
