import type { BankAccount } from '../types/database'

interface Props {
  bankAccountId: string | null
  importBatchId: string | null
  accounts:      BankAccount[]
  className?:    string
}

/**
 * Compact source label on a transaction row.
 *   - bank_account_id set  → shows account name in its badge_color (no pill)
 *   - no bank_account_id, no import_batch_id → "Manual" (grey, no pill)
 *   - imported but no bank_account_id (legacy) → nothing
 */
export function SourceBadge({ bankAccountId, importBatchId, accounts, className = '' }: Props) {
  if (bankAccountId) {
    const account = accounts.find(a => a.id === bankAccountId)
    const label   = account?.name ?? '?'
    const color   = account?.badge_color ?? 'var(--pink)'
    return (
      <span
        className={`text-xs truncate max-w-full block ${className}`}
        style={{ color, fontWeight: 500 }}
        title={label}
      >
        {label}
      </span>
    )
  }

  if (!importBatchId) {
    return (
      <span
        className={`text-xs whitespace-nowrap ${className}`}
        style={{ color: 'var(--text-subtle)', fontWeight: 500 }}
      >
        Manual
      </span>
    )
  }

  // Imported but no bank account linked (legacy or user didn't select one)
  return (
    <span
      className={`text-xs whitespace-nowrap ${className}`}
      style={{ color: 'var(--text-subtle)', fontWeight: 500 }}
    >
      Imported
    </span>
  )
}
