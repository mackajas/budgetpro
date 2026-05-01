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
 */

import type { Transaction } from '../../types/database'
import type { ImportRow } from './validate'

export function detectDuplicate(
  candidate: ImportRow,
  existing: Transaction[],
): boolean {
  const candDesc = candidate.description.toLowerCase().trim()

  return existing.some(tx => {
    if (tx.deleted) return false
    if (tx.date !== candidate.date) return false
    if (Number(tx.amount) !== candidate.amount) return false
    if (tx.description.toLowerCase().trim() !== candDesc) return false
    return true
  })
}
