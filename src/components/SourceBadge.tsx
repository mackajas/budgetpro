import type { BankAccount } from '../types/database'

interface Props {
  bankAccountId: string | null
  importBatchId: string | null
  accounts:      BankAccount[]
  className?:    string
}

/**
 * Compact source label on a transaction row.
 *   - bank_account_id set  → shows the account name (e.g. "CW", "BW", "CC")
 *   - no bank_account_id, no import_batch_id → "Manual"
 *   - imported but no bank_account_id (legacy) → nothing
 */
export function SourceBadge({ bankAccountId, importBatchId, accounts, className = '' }: Props) {
  if (bankAccountId) {
    const label = accounts.find(a => a.id === bankAccountId)?.name ?? '?'
    return (
      <span
        className={`rounded px-1.5 py-0.5 text-xs font-medium truncate max-w-full block ${className}`}
        style={{
          background: 'color-mix(in srgb, var(--pink) 12%, transparent)',
          color:      'var(--pink)',
        }}
        title={label}
      >
        {label}
      </span>
    )
  }

  if (!importBatchId) {
    return (
      <span
        className={`rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap ${className}`}
        style={{
          background: 'color-mix(in srgb, var(--text-subtle) 15%, transparent)',
          color:      'var(--text-subtle)',
        }}
      >
        Manual
      </span>
    )
  }

  // Imported but no bank account linked (legacy or user didn't select one)
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap ${className}`}
      style={{
        background: 'color-mix(in srgb, var(--text-subtle) 10%, transparent)',
        color:      'var(--text-subtle)',
      }}
    >
      Imported
    </span>
  )
}
