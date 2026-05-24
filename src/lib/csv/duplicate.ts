/**
 * detectDuplicate()
 *
 * Returns a two-tier result for the candidate row against existing transactions:
 *
 *   'hard'  — Exact match on date + amount + normalised description.
 *             Auto-skip during import; no user action needed.
 *
 *   'soft'  — Same date + same amount, and descriptions share a common prefix
 *             of ≥ PREFIX_LEN normalised characters. Typical of pending-vs-settled
 *             variants (e.g. "TRYBOOKING*Jaguars Net ball Club" vs
 *             "TRYBOOKING*Jaguars Net SOUTH YARRA AUS"). Imported but flagged for
 *             user review with a note.
 *
 *   false   — No match. Import normally.
 *
 * This is the duplicate detection strategy per BRD §4.5.2:
 * "Duplicate detection prevents importing transactions already in the database"
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

/**
 * Minimum shared prefix length (in normalised characters) required to flag a
 * soft duplicate. 12 chars is enough to identify the same merchant while
 * avoiding false positives on short generic prefixes.
 */
export const PREFIX_LEN = 12

function normaliseDesc(desc: string): string {
  return desc.toLowerCase().trim().replace(TRAILING_GEO, '')
}

export type DuplicateResult = 'hard' | 'soft' | false

export function detectDuplicate(
  candidate: ImportRow,
  existing: Transaction[],
): DuplicateResult {
  const candDesc   = normaliseDesc(candidate.description)
  const candPrefix = candDesc.substring(0, PREFIX_LEN)

  let softMatch = false

  for (const tx of existing) {
    if (tx.deleted) continue
    if (tx.date    !== candidate.date)          continue
    if (Number(tx.amount) !== candidate.amount) continue

    const txDesc = normaliseDesc(tx.description)

    // Tier 1 — hard duplicate: exact normalised description
    if (txDesc === candDesc) return 'hard'

    // Tier 2 — soft duplicate: shared prefix of ≥ PREFIX_LEN chars
    if (
      candDesc.length   >= PREFIX_LEN &&
      txDesc.length     >= PREFIX_LEN &&
      txDesc.substring(0, PREFIX_LEN) === candPrefix
    ) {
      softMatch = true
      // Keep scanning — a later entry might be a hard match
    }
  }

  return softMatch ? 'soft' : false
}
