/**
 * detectDuplicate()
 *
 * Returns true if an existing transaction in the store matches the candidate
 * row on all three fields: date + amount + description (case-insensitive).
 *
 * This is the duplicate detection strategy per BRD §4.5.2:
 * "Duplicate detection prevents importing transactions already in the database"
 *
 * The match is intentionally strict (all three fields) to avoid false positives
 * for recurring transactions at the same amount (e.g. monthly rent).
 *
 * Description normalisation: trailing Australian state/territory or country codes
 * (e.g. " VIC", " AUS") are stripped before comparing. Coles CC exports pending
 * transactions without these suffixes, then appends them when the transaction
 * settles — without this step the same transaction would slip through twice.
 */

import type { Transaction } from '../../types/database'
import type { ImportRow } from './validate'

/** Matches a trailing Australian state, territory, or country code. */
const TRAILING_GEO = /\s+(VIC|NSW|QLD|SA|WA|TAS|ACT|NT|AUS)$/i

function normaliseDesc(desc: string): string {
  return desc.toLowerCase().trim().replace(TRAILING_GEO, '')
}

export function detectDuplicate(
  candidate: ImportRow,
  existing: Transaction[],
): boolean {
  const candDesc = normaliseDesc(candidate.description)

  return existing.some(tx => {
    if (tx.deleted) return false
    if (tx.date !== candidate.date) return false
    if (Number(tx.amount) !== candidate.amount) return false
    if (normaliseDesc(tx.description) !== candDesc) return false
    return true
  })
}
