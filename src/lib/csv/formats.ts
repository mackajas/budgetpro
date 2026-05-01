/**
 * Bank format definitions.
 *
 * Two structural groups (per BRD §4.5.1):
 *   - Single signed Amount column:  ANZ, CBA, NAB, Westpac, ING
 *   - Separate Debit / Credit cols:  Bankwest, Coles Credit Card
 *
 * Detection is header-based — see detectFormat.ts.
 */

export type BankFormat =
  | 'cba'
  | 'anz'
  | 'nab'
  | 'westpac'
  | 'ing'
  | 'bankwest'
  | 'coles'

/** Structural family — drives amount parsing in normaliseRow */
export type AmountStructure = 'single' | 'debit-credit'

export interface FormatSpec {
  format:          BankFormat
  amountStructure: AmountStructure
  /** Header name (case-insensitive) for the date column */
  dateCol:         string
  /** Header name for the description / narration column */
  descCol:         string
  /** Header name for the single amount column (single formats only) */
  amountCol?:      string
  /** Header name for the debit column (debit-credit formats only) */
  debitCol?:       string
  /** Header name for the credit column (debit-credit formats only) */
  creditCol?:      string
  /** Expected date format hint for parsing */
  dateFormat:      'DD/MM/YYYY' | 'DD/MM/YY' | 'DD-Mon-YYYY' | 'YYYY-MM-DD'
}

/**
 * Known format specs, listed in detection-priority order.
 * detectBankFormat() matches against these.
 */
export const FORMAT_SPECS: FormatSpec[] = [
  // ── ANZ ─────────────────────────────────────────────────────────────────
  // Distinguisher: has a 'type' column alongside 'amount'
  {
    format:          'anz',
    amountStructure: 'single',
    dateCol:         'date',
    descCol:         'description',
    amountCol:       'amount',
    dateFormat:      'DD/MM/YYYY',
  },
  // ── NAB ─────────────────────────────────────────────────────────────────
  // Distinguisher: has a 'reference' column
  {
    format:          'nab',
    amountStructure: 'single',
    dateCol:         'date',
    descCol:         'description',
    amountCol:       'amount',
    dateFormat:      'DD/MM/YYYY',
  },
  // ── Westpac ──────────────────────────────────────────────────────────────
  // Distinguisher: uses 'narration' for the description column
  {
    format:          'westpac',
    amountStructure: 'single',
    dateCol:         'date',
    descCol:         'narration',
    amountCol:       'amount',
    dateFormat:      'DD/MM/YYYY',
  },
  // ── ING ──────────────────────────────────────────────────────────────────
  // Distinguisher: description column appears BEFORE amount column; no 'balance'
  {
    format:          'ing',
    amountStructure: 'single',
    dateCol:         'date',
    descCol:         'description',
    amountCol:       'amount',
    dateFormat:      'DD/MM/YYYY',
  },
  // ── Bankwest ─────────────────────────────────────────────────────────────
  // Distinguisher: separate debit/credit columns AND 'narration' description column
  {
    format:          'bankwest',
    amountStructure: 'debit-credit',
    dateCol:         'date',
    descCol:         'narration',
    debitCol:        'debit',
    creditCol:       'credit',
    dateFormat:      'DD/MM/YYYY',
  },
  // ── Coles Credit Card ─────────────────────────────────────────────────────
  // Distinguisher: separate debit/credit columns AND 'description' column; NO 'balance'
  {
    format:          'coles',
    amountStructure: 'debit-credit',
    dateCol:         'date',
    descCol:         'description',
    debitCol:        'debit',
    creditCol:       'credit',
    dateFormat:      'DD/MM/YYYY',
  },
  // ── CBA ──────────────────────────────────────────────────────────────────
  // Default single-amount format; listed last as the catch-all
  {
    format:          'cba',
    amountStructure: 'single',
    dateCol:         'date',
    descCol:         'description',
    amountCol:       'amount',
    dateFormat:      'DD/MM/YYYY',
  },
]
