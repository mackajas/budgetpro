/**
 * Allocation Calculator — unit tests (12 total, per BRD §16.3 Step 7)
 *
 * T01  Fixed allocation for a standalone envelope
 * T02  Percentage allocation for a standalone envelope (% of gross)
 * T03  Child fixed allocation (absolute dollar, not relative to parent)
 * T04  Child percentage allocation (% of parent's computed amount)
 * T05  Two-pass split — mixed parent+child hierarchy with remainder
 * T06  Allocations that sum to exactly gross → remainder = 0
 * T07  Rounding to 2 decimal places (fractional-cent percentages)
 * T08  Over-allocation (total splits > gross) → negative remainder
 * T09  Pro-rata: fixed allocation split proportionally across two components
 * T10  Pro-rata: equal component sizes → each receives exactly half
 * T11  Pro-rata: percentage allocations unaffected by totalGross
 * T12  Pro-rata: child fixed allocations also scale pro-rata
 */

import { describe, it, expect } from 'vitest'
import {
  buildPaychequeSplit,
  computeAllocationAmount,
  round2,
} from '../calculator'
import type { EnvelopeAllocation } from '../../../types/database'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const GROSS = 5000.00  // standard fortnightly gross for all tests

/** Minimal envelope factory */
const env = (id: string, parent_id: string | null = null) => ({ id, parent_id })

/** Minimal allocation factory */
const alloc = (
  envelope_id: string,
  allocation_type: 'fixed' | 'percentage',
  value: number,
  employer_id: 1 | 2 = 1,
): EnvelopeAllocation => ({
  envelope_id,
  employer_id,
  allocation_type,
  value,
  updated_at: '2024-01-01T00:00:00Z',
})

// ── T01: Fixed standalone allocation ─────────────────────────────────────────

describe('T01 — fixed allocation for a standalone envelope', () => {
  it('deducts the exact fixed dollar amount from gross', () => {
    const envelopes   = [env('rent')]
    const allocations = [alloc('rent', 'fixed', 1800)]
    const result      = buildPaychequeSplit(envelopes, allocations, GROSS, 1)

    expect(result.splits['rent']).toBe(1800)
    expect(result.allocated).toBe(1800)
    expect(result.remainder).toBe(3200)
  })
})

// ── T02: Percentage standalone allocation ─────────────────────────────────────

describe('T02 — percentage allocation for a standalone envelope (% of gross)', () => {
  it('computes percentage of gross rounded to 2dp', () => {
    // 10% of 5000 = 500.00
    const envelopes   = [env('savings')]
    const allocations = [alloc('savings', 'percentage', 10)]
    const result      = buildPaychequeSplit(envelopes, allocations, GROSS, 1)

    expect(result.splits['savings']).toBe(500)
    expect(result.remainder).toBe(4500)
  })
})

// ── T03: Child fixed allocation ───────────────────────────────────────────────

describe('T03 — child fixed allocation (absolute dollar, independent of parent)', () => {
  it('assigns the fixed dollar amount to the child, not a percentage of parent', () => {
    // Parent "food" gets $600; child "groceries" gets a fixed $400 of that
    const envelopes = [
      env('food'),
      env('groceries', 'food'),
    ]
    const allocations = [
      alloc('food',      'fixed', 600),
      alloc('groceries', 'fixed', 400),
    ]
    const result = buildPaychequeSplit(envelopes, allocations, GROSS, 1)

    // groceries appears in splits (child), food does NOT (has children)
    expect(result.splits['groceries']).toBe(400)
    expect(result.splits['food']).toBeUndefined()
  })
})

// ── T04: Child percentage allocation ─────────────────────────────────────────

describe('T04 — child percentage allocation (% of parent computed amount)', () => {
  it('computes percentage of parent dollar amount, not gross', () => {
    // Parent "food" gets 20% of 5000 = 1000
    // Child "groceries" gets 60% of 1000 = 600
    // Child "dining"    gets 40% of 1000 = 400
    const envelopes = [
      env('food'),
      env('groceries', 'food'),
      env('dining',    'food'),
    ]
    const allocations = [
      alloc('food',      'percentage', 20),
      alloc('groceries', 'percentage', 60),
      alloc('dining',    'percentage', 40),
    ]
    const result = buildPaychequeSplit(envelopes, allocations, GROSS, 1)

    expect(result.splits['groceries']).toBe(600)
    expect(result.splits['dining']).toBe(400)
    expect(result.splits['food']).toBeUndefined()
  })
})

// ── T05: Two-pass split — mixed hierarchy ─────────────────────────────────────

describe('T05 — full two-pass split with mixed parent/child/standalone', () => {
  it('correctly splits gross across all leaf envelopes and computes remainder', () => {
    // Gross: $5000
    // rent        standalone  fixed $1800     → splits: rent = 1800
    // food        parent      fixed $600       → not in splits (has children)
    //   groceries child       pct  70%         → splits: groceries = 420 (70% of 600)
    //   dining    child       pct  30%         → splits: dining    = 180 (30% of 600)
    // savings     standalone  pct  10%         → splits: savings   = 500 (10% of 5000)
    // total allocated = 1800 + 420 + 180 + 500 = 2900
    // remainder = 5000 - 2900 = 2100

    const envelopes = [
      env('rent'),
      env('food'),
      env('groceries', 'food'),
      env('dining',    'food'),
      env('savings'),
    ]
    const allocations = [
      alloc('rent',      'fixed',      1800),
      alloc('food',      'fixed',       600),
      alloc('groceries', 'percentage',   70),
      alloc('dining',    'percentage',   30),
      alloc('savings',   'percentage',   10),
    ]
    const result = buildPaychequeSplit(envelopes, allocations, GROSS, 1)

    expect(result.splits['rent']).toBe(1800)
    expect(result.splits['groceries']).toBe(420)
    expect(result.splits['dining']).toBe(180)
    expect(result.splits['savings']).toBe(500)
    expect(result.splits['food']).toBeUndefined()
    expect(result.allocated).toBe(2900)
    expect(result.remainder).toBe(2100)
  })
})

// ── T06: Fully allocated (remainder = 0) ─────────────────────────────────────

describe('T06 — allocations sum to exactly gross → remainder = 0', () => {
  it('returns remainder of 0 when 100% of gross is allocated', () => {
    // 50% + 30% + 20% = 100% of 5000
    const envelopes = [env('a'), env('b'), env('c')]
    const allocations = [
      alloc('a', 'percentage', 50),
      alloc('b', 'percentage', 30),
      alloc('c', 'percentage', 20),
    ]
    const result = buildPaychequeSplit(envelopes, allocations, GROSS, 1)

    expect(result.allocated).toBe(5000)
    expect(result.remainder).toBe(0)
  })
})

// ── T07: Rounding ─────────────────────────────────────────────────────────────

describe('T07 — rounding to 2 decimal places', () => {
  it('rounds fractional-cent percentage amounts correctly', () => {
    // 1% of 3333.33 = 33.3333 → rounds to 33.33
    expect(computeAllocationAmount('percentage', 1, 3333.33)).toBe(33.33)
  })

  it('round2 handles floating-point epsilon correctly', () => {
    // Classic JS floating-point issue: 1.005 * 100 / 100
    expect(round2(1.005)).toBe(1.01)
    expect(round2(2.5550000000000002)).toBe(2.56)
  })

  it('full split with non-round gross — sum of parts within $0.01 tolerance', () => {
    // 33.33% + 33.33% + 33.34% of $3001 — checks rounding tolerance
    const gross       = 3001.00
    const envelopes   = [env('x'), env('y'), env('z')]
    const allocations = [
      alloc('x', 'percentage', 33.33),
      alloc('y', 'percentage', 33.33),
      alloc('z', 'percentage', 33.34),
    ]
    const result = buildPaychequeSplit(envelopes, allocations, gross, 1)
    const diff   = Math.abs(result.remainder)
    expect(diff).toBeLessThanOrEqual(0.01)
  })
})

// ── T08: Over-allocation ──────────────────────────────────────────────────────

describe('T08 — over-allocation (total splits > gross) → negative remainder', () => {
  it('returns a negative remainder when envelopes are over-allocated', () => {
    // fixed $3000 + fixed $3000 = $6000 against gross of $5000
    const envelopes   = [env('a'), env('b')]
    const allocations = [
      alloc('a', 'fixed', 3000),
      alloc('b', 'fixed', 3000),
    ]
    const result = buildPaychequeSplit(envelopes, allocations, GROSS, 1)

    expect(result.allocated).toBe(6000)
    expect(result.remainder).toBe(-1000)
  })
})

// ── T09: Pro-rata — unequal components ───────────────────────────────────────

describe('T09 — pro-rata: fixed allocation split proportionally across two components', () => {
  it('scales fixed amounts by component/total so both components sum to the full allocation', () => {
    // Employer 2: component 1 = $700, component 2 = $689.54, total = $1389.54
    // Kids fixed $130 → component 1 gets $130 × (700/1389.54) ≈ $65.52
    //                 → component 2 gets $130 × (689.54/1389.54) ≈ $64.48
    const totalGross = 1389.54
    const comp1Gross = 700
    const comp2Gross = 689.54

    const envelopes   = [env('kids')]
    const allocations = [alloc('kids', 'fixed', 130, 2)]

    const result1 = buildPaychequeSplit(envelopes, allocations, comp1Gross, 2, totalGross)
    const result2 = buildPaychequeSplit(envelopes, allocations, comp2Gross, 2, totalGross)

    expect(result1.splits['kids']).toBe(round2(130 * (comp1Gross / totalGross)))
    expect(result2.splits['kids']).toBe(round2(130 * (comp2Gross / totalGross)))
    expect(round2(result1.splits['kids'] + result2.splits['kids'])).toBe(130)
  })
})

// ── T10: Pro-rata — equal components ─────────────────────────────────────────

describe('T10 — pro-rata: equal component sizes → each receives exactly half', () => {
  it('gives each component exactly half of a fixed allocation when both components are equal', () => {
    // total = $1000, component 1 = $500, component 2 = $500
    // fixed $130 → each gets $65
    const envelopes   = [env('kids')]
    const allocations = [alloc('kids', 'fixed', 130, 2)]

    const result1 = buildPaychequeSplit(envelopes, allocations, 500, 2, 1000)
    const result2 = buildPaychequeSplit(envelopes, allocations, 500, 2, 1000)

    expect(result1.splits['kids']).toBe(65)
    expect(result2.splits['kids']).toBe(65)
  })
})

// ── T11: Pro-rata — percentages unaffected ────────────────────────────────────

describe('T11 — pro-rata: percentage allocations are unaffected by totalGross', () => {
  it('computes percentage of component gross regardless of totalGross', () => {
    // 25% of component 1 ($700) should be $175 — totalGross does not change this
    const envelopes   = [env('giving')]
    const allocations = [alloc('giving', 'percentage', 25, 2)]

    const result = buildPaychequeSplit(envelopes, allocations, 700, 2, 1389.54)

    expect(result.splits['giving']).toBe(175)
  })
})

// ── T12: Pro-rata — child fixed allocations ───────────────────────────────────

describe('T12 — pro-rata: child fixed allocations also scale pro-rata', () => {
  it('applies scaleFactor to child fixed amounts as well as parent fixed amounts', () => {
    // total = $1389.54, component 1 = $700
    // Parent "kids" fixed $130 → scaled to $130 × (700/1389.54) ≈ $65.52
    // Child "school" fixed $80 → scaled to $80 × (700/1389.54) ≈ $40.32
    const totalGross = 1389.54
    const compGross  = 700
    const scaleFactor = compGross / totalGross

    const envelopes = [
      env('kids'),
      env('school', 'kids'),
    ]
    const allocations = [
      alloc('kids',   'fixed', 130, 2),
      alloc('school', 'fixed',  80, 2),
    ]

    const result = buildPaychequeSplit(envelopes, allocations, compGross, 2, totalGross)

    // kids has a child so it doesn't appear in splits itself
    expect(result.splits['kids']).toBeUndefined()
    expect(result.splits['school']).toBe(round2(80 * scaleFactor))
  })
})
