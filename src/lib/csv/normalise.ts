/**
 * normaliseRow()
 *
 * Converts a raw PapaParse row object into a canonical NormalisedRow with:
 *   - date:        ISO string YYYY-MM-DD
 *   - amount:      signed number (negative = debit/expense, positive = credit/income)
 *   - description: trimmed string
 *
 * Handles both amount structures:
 *   single       — reads one signed Amount column directly
 *   debit-credit — credit is positive, debit is negative; one will be blank per row
 *
 * Date formats supported:
 *   DD/MM/YYYY  (most banks)
 *   DD/MM/YY    (some older exports)
 *   DD-Mon-YYYY (NAB — e.g. "01-Jan-2024")
 *   YYYY-MM-DD  (ISO — pass-through)
 */

import type { BankFormat } from './formats'
import { FORMAT_SPECS } from './formats'

export interface NormalisedRow {
  date:        string   // YYYY-MM-DD
  amount:      number   // negative = expense, positive = income
  description: string
}

// ── Date parsing ─────────────────────────────────────────────────────────────

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}

export function parseDate(raw: string): string {
  const s = raw.trim()

  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s

  // DD/MM/YYYY or DD/MM/YY
  const slashMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (slashMatch) {
    const [, d, m, y] = slashMatch
    const year = y.length === 2 ? `20${y}` : y
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  // DD-Mon-YYYY (e.g. "01-Jan-2024") or D-Mon-YY (e.g. "2-May-26" — Coles CC)
  const monMatch = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/)
  if (monMatch) {
    const [, d, mon, y] = monMatch
    const year = y.length === 2 ? `20${y}` : y
    const m = MONTHS[mon.toLowerCase()]
    if (m) return `${year}-${m}-${d.padStart(2, '0')}`
  }

  // DD Mon YYYY (e.g. "01 Jan 2024")
  const spaceMatch = s.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/)
  if (spaceMatch) {
    const [, d, mon, y] = spaceMatch
    const m = MONTHS[mon.toLowerCase()]
    if (m) return `${y}-${m}-${d.padStart(2, '0')}`
  }

  throw new Error(`Unrecognised date format: "${raw}"`)
}

// ── Amount parsing ────────────────────────────────────────────────────────────

function parseAmount(raw: string | undefined): number {
  if (!raw || raw.trim() === '') return 0
  // Remove currency symbols, commas, surrounding quotes
  const cleaned = raw.replace(/[$,\s"]/g, '').trim()
  const n = parseFloat(cleaned)
  return isNaN(n) ? 0 : n
}

// ── Column lookup (case-insensitive) ─────────────────────────────────────────

function col(row: Record<string, string>, name: string): string {
  const key = Object.keys(row).find(k => k.trim().toLowerCase() === name.toLowerCase())
  return key ? (row[key] ?? '').trim() : ''
}

// ── Main normaliser ───────────────────────────────────────────────────────────

export function normaliseRow(
  rawRow: Record<string, string>,
  format: BankFormat,
): NormalisedRow {
  const spec = FORMAT_SPECS.find(s => s.format === format)
  if (!spec) throw new Error(`Unknown format: ${format}`)

  const rawDate        = col(rawRow, spec.dateCol)
  const rawDescription = col(rawRow, spec.descCol)

  let amount: number

  if (spec.amountStructure === 'single') {
    amount = parseAmount(col(rawRow, spec.amountCol!))
  } else {
    // debit-credit: credit entries are positive income; debit entries are negative expenses
    const credit = parseAmount(col(rawRow, spec.creditCol!))
    const debit  = parseAmount(col(rawRow, spec.debitCol!))
    // One will be non-zero; credit → positive, debit → negative
    amount = credit !== 0 ? Math.abs(credit) : -Math.abs(debit)
  }

  return {
    date:        parseDate(rawDate),
    amount,
    description: rawDescription.replace(/\s+/g, ' ').trim(),
  }
}
