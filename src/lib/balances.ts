/**
 * Balance calculation utilities  (BRD §8.1 src/lib/balances.js)
 *
 * computeBalances()        — raw per-envelope transaction sums
 * computeDisplayBalances() — parent totals as sum of children
 *
 * Rules:
 *  - deleted transactions are excluded
 *  - 'ignored' transactions are excluded
 *  - paycheques and cash-income-split: credit each envelope via the splits JSONB
 *  - all other transactions: credit/debit the assigned envelope_id
 *  - transactions with no envelope_id and no splits contribute nothing to any balance
 */

import type { Transaction, Envelope } from '../types/database'

/**
 * Returns a map of { envelope_id → running balance } across all transactions.
 * Does NOT include parent rollup totals — use computeDisplayBalances() for that.
 */
export function computeBalances(
  transactions: Transaction[],
): Record<string, number> {
  const balances: Record<string, number> = {}

  for (const tx of transactions) {
    if (tx.deleted)            continue
    if (tx.kind === 'ignored') continue

    if (tx.kind === 'move-money') {
      // Debit source envelope (amount is stored as negative)
      if (tx.envelope_id) {
        balances[tx.envelope_id] = (balances[tx.envelope_id] ?? 0) + tx.amount
      }
      // Credit destination(s) stored in splits
      for (const [envId, amt] of Object.entries(tx.splits ?? {})) {
        balances[envId] = (balances[envId] ?? 0) + (amt as number)
      }
      continue
    }

    const splits = tx.splits
    if (splits && Object.keys(splits).length > 0) {
      // Paycheque / cash-income-split / expense split: distribute via splits map
      for (const [envId, amt] of Object.entries(splits)) {
        balances[envId] = (balances[envId] ?? 0) + (amt as number)
      }
    } else if (tx.envelope_id) {
      balances[tx.envelope_id] = (balances[tx.envelope_id] ?? 0) + tx.amount
    }
  }

  return balances
}

/**
 * Returns display balances including parent rollup totals.
 * Parent balance = sum of all children's raw balances.
 * Standalone and child balances are taken directly from rawBalances.
 */
export function computeDisplayBalances(
  rawBalances:  Record<string, number>,
  envelopes:    Envelope[],
): Record<string, number> {
  const display: Record<string, number> = { ...rawBalances }

  for (const env of envelopes) {
    if (env.parent_id !== null) continue     // skip children
    const children = envelopes.filter(e => e.parent_id === env.id)
    if (children.length === 0) continue      // standalone — already in rawBalances

    // Parent = sum of children
    display[env.id] = children.reduce(
      (sum, child) => sum + (rawBalances[child.id] ?? 0),
      0,
    )
  }

  return display
}
