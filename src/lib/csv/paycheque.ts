/**
 * detectPaycheque()
 *
 * Returns true if the transaction description matches any of the configured
 * employer detection keywords (case-insensitive substring match).
 *
 * Per BRD §4.5.2:
 *   "Paycheque transactions are detected via employer detection keywords
 *    configured in Settings > Employers."
 *
 *   Employer 1: single keyword (employer_1_keyword)
 *   Employer 2: two keywords (employer_2_pay_1_keyword, employer_2_pay_2_keyword)
 *     — each instalment arrives as a separate bank transaction
 *
 * Returns the matching keyword string so the caller can record which employer
 * pay component triggered the match.
 */

import type { Settings } from '../../types/database'

export interface PaychequeMatch {
  matched:    true
  employerId: 1 | 2
  /** Which keyword slot matched (only relevant for employer 2) */
  component:  1 | 2
  keyword:    string
}

export type PaychequeResult = PaychequeMatch | { matched: false }

export function detectPaycheque(
  description: string,
  settings: Pick<
    Settings,
    | 'employer_1_keyword'
    | 'employer_2_pay_1_keyword'
    | 'employer_2_pay_2_keyword'
  >,
): PaychequeResult {
  const desc = description.toLowerCase()

  const check = (kw: string | null): boolean =>
    !!kw && kw.trim().length > 0 && desc.includes(kw.toLowerCase().trim())

  if (check(settings.employer_1_keyword)) {
    return {
      matched:    true,
      employerId: 1,
      component:  1,
      keyword:    settings.employer_1_keyword!,
    }
  }

  if (check(settings.employer_2_pay_1_keyword)) {
    return {
      matched:    true,
      employerId: 2,
      component:  1,
      keyword:    settings.employer_2_pay_1_keyword!,
    }
  }

  if (check(settings.employer_2_pay_2_keyword)) {
    return {
      matched:    true,
      employerId: 2,
      component:  2,
      keyword:    settings.employer_2_pay_2_keyword!,
    }
  }

  return { matched: false }
}
