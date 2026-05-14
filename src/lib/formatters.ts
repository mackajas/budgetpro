/**
 * Shared formatting utilities  (BRD §8.1 src/lib/formatters.js)
 */

import { format, parseISO } from 'date-fns'

/** Format a number as Australian currency: $1,234.56 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-AU', {
    style:                 'currency',
    currency:              'AUD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

/** Format an ISO date string YYYY-MM-DD as "30 Apr 2024" */
export function formatDate(iso: string): string {
  try { return format(parseISO(iso), 'd MMM yyyy') } catch { return iso }
}

/** Today as YYYY-MM-DD */
export function today(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

/** Kind → human-readable label */
export const KIND_LABELS: Record<string, string> = {
  paycheque:        'Paycheque',
  expense:          'Expense',
  'cash-income':    'Cash',
  'cash-income-split': 'Cash (split)',
  'income-other':   'Other income',
  'opening-balance': 'Opening balance',
  ignored:          'Ignored',
}
