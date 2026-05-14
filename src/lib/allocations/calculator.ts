/**
 * Allocation Calculator
 *
 * Implements the two-pass paycheque split algorithm per BRD §4.4 and §4.5.2.
 *
 * ── Algorithm overview ────────────────────────────────────────────────────────
 *
 * Pass 1 — Top-level allocations (parents + standalones)
 *   For each top-level envelope with an allocation for this employer:
 *     fixed      → dollar amount = value  (scaled by gross/totalGross when multi-component)
 *     percentage → dollar amount = round(gross × value ÷ 100, 2)
 *
 * Pass 2 — Child envelope subdivision
 *   For each child envelope with an allocation for this employer:
 *     fixed      → dollar amount = value  (absolute $, scaled by gross/totalGross)
 *     percentage → dollar amount = round(parentDollarAmount × value ÷ 100, 2)
 *
 * ── Splits output ────────────────────────────────────────────────────────────
 *
 * Only LEAF envelopes appear in splits (per BRD §4.3.1 — parents don't hold
 * transactions; child and standalone envelopes do).
 *
 * A parent envelope whose children have allocations contributes its computed
 * dollar amount as the basis for child percentage calculations but does NOT
 * appear in splits itself.
 *
 * A parent envelope with NO child allocations IS included in splits directly
 * (its full allocated amount goes to it as a lump, since there are no children
 * to subdivide into — the operator simply hasn't set up child allocations yet).
 *
 * Remainder = gross − sum(all leaf split amounts)
 *   positive → under-allocated (money left unassigned)
 *   negative → over-allocated (splits exceed gross)
 *
 * ── Rounding ─────────────────────────────────────────────────────────────────
 *
 * All individual amounts are rounded to 2 decimal places at calculation time.
 * A tolerance of $0.01 is acceptable in the remainder due to floating-point
 * rounding across many envelopes.
 */

import type { Envelope, EnvelopeAllocation } from '../../types/database'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PaychequeSplit {
  /** Dollar amounts keyed by envelope_id — only leaf envelopes included */
  splits:    Record<string, number>
  /** Sum of all split amounts (should ≈ gross when fully allocated) */
  allocated: number
  /** gross − allocated  (positive = under, negative = over) */
  remainder: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Round to 2 decimal places using banker-safe arithmetic */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/**
 * Compute the dollar amount for a single allocation.
 *
 * @param type   'fixed' | 'percentage'
 * @param value  Dollar amount (fixed) or percentage 0–100 (percentage)
 * @param basis  The amount the allocation is relative to (gross for top-level,
 *               parent dollar amount for children)
 */
export function computeAllocationAmount(
  type:  'fixed' | 'percentage',
  value: number,
  basis: number,
): number {
  if (type === 'fixed') return round2(value)
  return round2(basis * value / 100)
}

// ── Main algorithm ────────────────────────────────────────────────────────────

export function buildPaychequeSplit(
  envelopes:   Pick<Envelope, 'id' | 'parent_id'>[],
  allocations: EnvelopeAllocation[],
  gross:       number,
  employerId:  1 | 2,
  totalGross?: number,
): PaychequeSplit {
  // When an employer has multiple paycheque components, fixed allocations are
  // defined against the combined total but must be distributed pro-rata across
  // each component. Percentages naturally produce the right share of the
  // component gross, so only fixed amounts need scaling.
  const scaleFactor = (totalGross != null && totalGross > 0) ? gross / totalGross : 1

  // Filter allocations to this employer only
  const empAllocations = allocations.filter(a => a.employer_id === employerId)
  const allocByEnvId   = new Map(empAllocations.map(a => [a.envelope_id, a]))

  // Classify envelopes
  const childIds     = new Set(envelopes.filter(e => e.parent_id !== null).map(e => e.id))
  const parentIds    = new Set(envelopes.filter(e => e.parent_id === null).map(e => {
    // An envelope is a parent if any other envelope has parent_id = this id
    return e.id
  }).filter(id => envelopes.some(e => e.parent_id === id)))

  const isChild      = (id: string) => childIds.has(id)
  const isParent     = (id: string) => parentIds.has(id)
  const isStandalone = (id: string) => !isChild(id) && !isParent(id)

  // ── Pass 1: compute dollar amounts for all top-level envelopes ───────────
  const topLevelAmounts = new Map<string, number>()

  for (const env of envelopes) {
    if (isChild(env.id)) continue  // skip children in pass 1
    const alloc = allocByEnvId.get(env.id)
    if (!alloc) continue
    const raw = computeAllocationAmount(alloc.allocation_type, alloc.value, gross)
    topLevelAmounts.set(
      env.id,
      alloc.allocation_type === 'fixed' ? round2(raw * scaleFactor) : raw,
    )
  }

  // ── Pass 2: compute dollar amounts for child envelopes ───────────────────
  const childAmounts = new Map<string, number>()

  for (const env of envelopes) {
    if (!isChild(env.id)) continue
    const alloc = allocByEnvId.get(env.id)
    if (!alloc) continue
    const parentAmount = topLevelAmounts.get(env.parent_id!) ?? 0
    const raw = computeAllocationAmount(alloc.allocation_type, alloc.value, parentAmount)
    childAmounts.set(
      env.id,
      alloc.allocation_type === 'fixed' ? round2(raw * scaleFactor) : raw,
    )
  }

  // ── Build splits (leaf envelopes only) ───────────────────────────────────
  const splits: Record<string, number> = {}

  for (const env of envelopes) {
    if (isChild(env.id)) {
      // Children always appear in splits if they have an allocation
      const amount = childAmounts.get(env.id)
      if (amount !== undefined) splits[env.id] = amount
    } else if (isStandalone(env.id)) {
      // Standalone envelopes appear directly
      const amount = topLevelAmounts.get(env.id)
      if (amount !== undefined) splits[env.id] = amount
    } else if (isParent(env.id)) {
      // Parent appears in splits only if none of its children have allocations
      const hasChildAllocs = envelopes
        .filter(e => e.parent_id === env.id)
        .some(e => childAmounts.has(e.id))
      if (!hasChildAllocs) {
        const amount = topLevelAmounts.get(env.id)
        if (amount !== undefined) splits[env.id] = amount
      }
    }
  }

  const allocated = round2(Object.values(splits).reduce((s, v) => s + v, 0))
  const remainder = round2(gross - allocated)

  return { splits, allocated, remainder }
}
