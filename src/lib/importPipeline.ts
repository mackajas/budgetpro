/**
 * Import pipeline — pure processing logic  (BRD §4.5, §4.7, Step 10)
 *
 * Stages:
 *  1. Parse CSV with PapaParse → raw rows
 *  2. detectBankFormat from headers
 *  3. normaliseRow → { date, amount, description }
 *  4. validateRow (Zod)
 *  5. detectPaycheque (keyword match)
 *  6. detectDuplicate (3-field match against existing transactions)
 *  7. autoCategorise (category rules, case-insensitive priority order)
 *  8. For paycheques: buildPaychequeSplit (two-pass allocation)
 *
 * The pipeline returns ProcessedRow[] ready for UI preview and DB insert.
 */

import Papa from 'papaparse'
import { detectBankFormat }     from './csv/detect'
import { normaliseRow }         from './csv/normalise'
import { validateRow }          from './csv/validate'
import { detectDuplicate }      from './csv/duplicate'
import { detectPaycheque }      from './csv/paycheque'
import { buildPaychequeSplit }  from './allocations'
import type { BankFormat }      from './csv/formats'
import type {
  Transaction, TransactionKind, HowCategorised,
  CategoryRule, EnvelopeAllocation, Envelope, Settings,
} from '../types/database'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ProcessedRow {
  // Parsed fields
  date:        string
  amount:      number
  description: string

  // Classification
  kind:            TransactionKind
  envelope_id:     string | null
  splits:          Record<string, number> | null
  how_categorised: HowCategorised | null
  review:          boolean

  // Source account (set by ImportModal before insert)
  bank_account_id:  string | null

  // Import flags
  isDuplicate:      boolean
  importAnyway:     boolean     // user can override duplicates
  validationError:  string | null
}

export interface PipelineResult {
  format:   BankFormat
  rows:     ProcessedRow[]
  /** Rows that passed validation and are not flagged as duplicates (or importAnyway=true) */
  ready:    ProcessedRow[]
  /** Counts for the preview UI */
  counts: {
    total:      number
    valid:      number
    duplicates: number
    invalid:    number
    paycheques: number
    needsReview: number
  }
}

// ── Auto-categorisation helper ────────────────────────────────────────────────

function autoCategorise(
  description: string,
  rules: CategoryRule[],
): CategoryRule | null {
  const desc = description.toLowerCase()
  const matching = rules.filter(r =>
    r.keyword && desc.includes(r.keyword.toLowerCase()),
  )
  if (matching.length === 0) return null
  // Lower priority number = higher priority (BRD §6.4)
  return [...matching].sort((a, b) => a.priority - b.priority)[0]
}

// ── Gross amount for a paycheque row ─────────────────────────────────────────

function resolveGross(
  employerId: 1 | 2,
  component: 1 | 2,
  settings: Pick<Settings,
    'employer_1_gross' | 'employer_2_pay_1' | 'employer_2_pay_2'
  >,
  actualAmount: number,
): number {
  if (employerId === 1) return settings.employer_1_gross ?? actualAmount
  return component === 1
    ? (settings.employer_2_pay_1 ?? actualAmount)
    : (settings.employer_2_pay_2 ?? actualAmount)
}

// ── BOM stripper ──────────────────────────────────────────────────────────────

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

// ── Headerless CBA detection ──────────────────────────────────────────────────

/**
 * Some CBA exports omit the header row entirely (columns are always
 * Date, Amount, Description[, Balance] in that order).
 *
 * If the first field of the first line looks like a date (D/M/YYYY or
 * DD/MM/YYYY) rather than a column name, prepend synthetic CBA headers
 * so PapaParse can map columns correctly.
 */
const DATE_LIKE = /^\d{1,2}\/\d{1,2}\/\d{2,4}$/

export function ensureHeaders(content: string): string {
  const firstLine  = content.split('\n')[0].trim()
  const firstField = firstLine.split(',')[0].trim()
  if (!DATE_LIKE.test(firstField)) return content   // already has headers

  // Count columns to decide whether a Balance column is present
  const colCount = firstLine.split(',').length
  const header   = colCount >= 4
    ? 'Date,Amount,Description,Balance'
    : 'Date,Amount,Description'

  return header + '\n' + content
}

// ── Main pipeline ─────────────────────────────────────────────────────────────

export async function runImportPipeline(params: {
  file:         File
  settings:     Settings
  envelopes:    Envelope[]
  allocations:  EnvelopeAllocation[]
  rules:        CategoryRule[]
  existing:     Transaction[]
}): Promise<PipelineResult> {
  const { file, settings, envelopes, allocations, rules, existing } = params

  // Read file text — strip BOM, then auto-add headers if missing
  const raw     = await file.text()
  const content = ensureHeaders(stripBom(raw))

  // Parse CSV
  const parsed = Papa.parse<Record<string, string>>(content, {
    header:         true,
    skipEmptyLines: true,
    transformHeader: h => h.trim(),
  })

  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    throw new Error(`CSV parse failed: ${parsed.errors[0].message}`)
  }

  const headers = parsed.meta.fields ?? []
  const format  = detectBankFormat(headers)
  const rows: ProcessedRow[] = []

  for (const rawRow of parsed.data) {
    // ── Normalise ────────────────────────────────────────────────────────
    let normalised: ReturnType<typeof normaliseRow>
    try {
      normalised = normaliseRow(rawRow, format)
    } catch (e) {
      rows.push({
        date: '', amount: 0, description: '',
        kind: 'expense', envelope_id: null, splits: null,
        how_categorised: null, review: false,
        bank_account_id: null,
        isDuplicate: false, importAnyway: false,
        validationError: `Parse error: ${e instanceof Error ? e.message : String(e)}`,
      })
      continue
    }

    // ── Validate ─────────────────────────────────────────────────────────
    const validation = validateRow(normalised)
    if (!validation.success) {
      rows.push({
        date: normalised.date, amount: normalised.amount, description: normalised.description,
        kind: 'expense', envelope_id: null, splits: null,
        how_categorised: null, review: false,
        bank_account_id: null,
        isDuplicate: false, importAnyway: false,
        validationError: validation.error,
      })
      continue
    }

    const { date, amount, description } = validation.data

    // ── Detect paycheque ─────────────────────────────────────────────────
    const paychequeResult = detectPaycheque(description, {
      employer_1_keyword:       settings.employer_1_keyword,
      employer_2_pay_1_keyword: settings.employer_2_pay_1_keyword,
      employer_2_pay_2_keyword: settings.employer_2_pay_2_keyword,
    })

    // ── Detect duplicate ─────────────────────────────────────────────────
    const isDuplicate = detectDuplicate({ date, amount, description }, existing)

    // ── Build classification ─────────────────────────────────────────────
    let kind:            TransactionKind   = amount >= 0 ? 'cash-income' : 'expense'
    let envelope_id:     string | null     = null
    let splits:          Record<string, number> | null = null
    let how_categorised: HowCategorised | null = null
    let review                             = false

    if (paychequeResult.matched) {
      // Paycheque: run two-pass split
      kind            = 'paycheque'
      how_categorised = 'auto-paycheque'
      review          = false

      const gross = resolveGross(
        paychequeResult.employerId,
        paychequeResult.component,
        settings,
        Math.abs(amount),
      )
      // For Employer 2 (multi-component), pass the combined gross so fixed
      // allocations are distributed pro-rata rather than applied in full to
      // each component separately.
      const totalGross = paychequeResult.employerId === 2
        ? (settings.employer_2_pay_1 ?? 0) + (settings.employer_2_pay_2 ?? 0)
        : undefined
      const split = buildPaychequeSplit(
        envelopes,
        allocations,
        gross,
        paychequeResult.employerId,
        totalGross,
      )
      splits = Object.keys(split.splits).length > 0 ? split.splits : null
    } else {
      // Regular transaction: auto-categorise via rules
      const rule = autoCategorise(description, rules)
      if (rule) {
        if (rule.envelope_id === null) {
          // Ignore rule — mark transaction as ignored, no envelope assignment
          kind            = 'ignored'
          how_categorised = 'auto'
          review          = false
        } else {
          envelope_id     = rule.envelope_id
          how_categorised = 'auto'
          review          = false
        }
      } else {
        how_categorised = 'review'
        review          = true
      }
    }

    rows.push({
      date, amount, description,
      kind, envelope_id, splits, how_categorised, review,
      bank_account_id: null,
      isDuplicate, importAnyway: false,
      validationError: null,
    })
  }

  // ── Compute counts ───────────────────────────────────────────────────────
  const valid      = rows.filter(r => !r.validationError)
  const invalid    = rows.filter(r =>  r.validationError)
  const duplicates = valid.filter(r => r.isDuplicate)
  const paycheques = valid.filter(r => r.kind === 'paycheque')
  const needsReview = valid.filter(r => r.review && !r.isDuplicate)
  const ready      = valid.filter(r => !r.isDuplicate)

  return {
    format,
    rows,
    ready,
    counts: {
      total:      rows.length,
      valid:      valid.length,
      duplicates: duplicates.length,
      invalid:    invalid.length,
      paycheques: paycheques.length,
      needsReview: needsReview.length,
    },
  }
}
