/**
 * detectBankFormat()
 *
 * Inspects the CSV header row and returns the matching BankFormat.
 * Detection is based on key distinguishing columns per BRD §4.5.1.
 *
 * Decision tree:
 *   1. Has 'narration' + ('debit' AND 'credit')  → bankwest
 *   2. Has 'debit' AND 'credit' (no 'narration')  → coles
 *   3. Has 'type'                                  → anz
 *   4. Has 'reference'                             → nab
 *   5. Has 'narration' (single amount)             → westpac
 *   6. Has 'description' but NOT 'balance'         → ing
 *   7. Default                                     → cba
 */

import type { BankFormat } from './formats'

export function detectBankFormat(rawHeaders: string[]): BankFormat {
  const h = rawHeaders.map(s => s.trim().toLowerCase())

  const has = (col: string) => h.includes(col)

  // ── Separate debit/credit group ──────────────────────────────────────────
  if (has('debit') && has('credit')) {
    // Bankwest uses 'narration'; Coles uses 'description'
    return has('narration') ? 'bankwest' : 'coles'
  }

  // ── Single signed amount group ───────────────────────────────────────────
  // ANZ: has a 'type' column
  if (has('type')) return 'anz'

  // NAB: has a 'reference' column
  if (has('reference')) return 'nab'

  // Westpac: uses 'narration' for description
  if (has('narration')) return 'westpac'

  // ING: has 'description' and 'amount' but no 'balance' column,
  // AND description appears BEFORE amount (CBA is the reverse: amount before description)
  const descIdx = h.indexOf('description')
  const amtIdx  = h.indexOf('amount')
  if (descIdx !== -1 && amtIdx !== -1 && !has('balance') && descIdx < amtIdx) return 'ing'

  // Coles Credit Card (actual export): single amount + 'transaction details' description
  if (has('transaction details')) return 'coles-cc'

  // CBA: default — has date, amount, description, balance
  return 'cba'
}
