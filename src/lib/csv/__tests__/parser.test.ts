/**
 * CSV Parser — unit tests (13 total, per BRD §16.3 Step 6)
 *
 * Tests are organised by function:
 *   T01–T07  detectBankFormat   — one per supported bank (7 banks)
 *   T08–T10  normaliseRow       — signed amount, signed negative, debit-credit
 *   T11      normaliseRow       — date format variants
 *   T12      detectDuplicate    — match and non-match
 *   T13      detectPaycheque    — keyword matching (case-insensitive)
 */

import { describe, it, expect } from 'vitest'
import { detectBankFormat }     from '../detect'
import { normaliseRow, parseDate } from '../normalise'
import { validateRow }          from '../validate'
import { detectDuplicate }      from '../duplicate'
import { detectPaycheque }      from '../paycheque'
import type { Transaction }     from '../../../types/database'

// ── T01–T07: detectBankFormat ─────────────────────────────────────────────────

describe('detectBankFormat', () => {
  it('T01 — detects CBA (default: date, amount, description, balance)', () => {
    expect(detectBankFormat(['Date', 'Amount', 'Description', 'Balance'])).toBe('cba')
  })

  it('T02 — detects ANZ (has Type column)', () => {
    expect(detectBankFormat(['Date', 'Amount', 'Description', 'Type', 'Balance'])).toBe('anz')
  })

  it('T03 — detects NAB (has Reference column)', () => {
    expect(detectBankFormat(['Date', 'Amount', 'Description', 'Reference'])).toBe('nab')
  })

  it('T04 — detects Westpac (uses Narration as description, single amount)', () => {
    expect(detectBankFormat(['Date', 'Narration', 'Amount', 'Balance'])).toBe('westpac')
  })

  it('T05 — detects ING (description + amount, no balance)', () => {
    expect(detectBankFormat(['Date', 'Description', 'Amount'])).toBe('ing')
  })

  it('T06 — detects Bankwest (separate Debit/Credit + Narration)', () => {
    expect(detectBankFormat(['Transaction Date', 'Narration', 'Debit', 'Credit', 'Balance'])).toBe('bankwest')
  })

  it('T07 — detects Coles Credit Card legacy (separate Debit/Credit + Description, no Balance)', () => {
    expect(detectBankFormat(['Date', 'Description', 'Debit', 'Credit'])).toBe('coles')
  })

  it('T07b — detects Coles Credit Card actual export (Transaction Details column)', () => {
    expect(detectBankFormat([
      'Date', 'Amount', 'Account Number', '', 'Transaction Type',
      'Transaction Details', 'Category', 'Merchant Name', 'Processed On',
    ])).toBe('coles-cc')
  })
})

// ── T08–T11: normaliseRow ─────────────────────────────────────────────────────

describe('normaliseRow', () => {
  it('T08 — normalises a positive (income) single-amount CBA row', () => {
    const row = { Date: '15/03/2024', Amount: '2500.00', Description: 'ACME CORP PAYROLL', Balance: '7500.00' }
    const result = normaliseRow(row, 'cba')
    expect(result.date).toBe('2024-03-15')
    expect(result.amount).toBe(2500)
    expect(result.description).toBe('ACME CORP PAYROLL')
  })

  it('T09 — normalises a negative (expense) single-amount CBA row', () => {
    const row = { Date: '16/03/2024', Amount: '-89.50', Description: 'WOOLWORTHS 1234 SYDNEY', Balance: '7410.50' }
    const result = normaliseRow(row, 'cba')
    expect(result.date).toBe('2024-03-16')
    expect(result.amount).toBe(-89.50)
    expect(result.description).toBe('WOOLWORTHS 1234 SYDNEY')
  })

  it('T10 — normalises a Bankwest debit-credit row (debit = expense)', () => {
    // Real Bankwest exports use 'Transaction Date' (not 'Date')
    const row = { 'Transaction Date': '17/03/2024', Narration: 'COLES SUPERMARKETS', Debit: '45.20', Credit: '', Balance: '7365.30' }
    const result = normaliseRow(row, 'bankwest')
    expect(result.date).toBe('2024-03-17')
    expect(result.amount).toBe(-45.20)
    expect(result.description).toBe('COLES SUPERMARKETS')
  })

  it('T11 — parses all supported date formats to ISO', () => {
    // DD/MM/YYYY
    expect(parseDate('01/04/2024')).toBe('2024-04-01')
    // DD/MM/YY
    expect(parseDate('01/04/24')).toBe('2024-04-01')
    // DD-Mon-YYYY (NAB style)
    expect(parseDate('01-Apr-2024')).toBe('2024-04-01')
    // D-Mon-YY (Coles CC style — 2-digit year)
    expect(parseDate('2-May-26')).toBe('2026-05-02')
    // Already ISO
    expect(parseDate('2024-04-01')).toBe('2024-04-01')
  })

  it('T11b — normalises a Coles CC row (Transaction Details, D-Mon-YY date, signed amount)', () => {
    const row = {
      Date: '2-May-26',
      Amount: '-3.89',
      'Account Number': 'Card ending 2531',
      '': '',
      'Transaction Type': 'CREDIT CARD PURCHASE',
      'Transaction Details': 'COLES 7612 DEER PARK VIC',
      Category: 'Groceries',
      'Merchant Name': 'Coles (Brimbank Shopping Centre)',
      'Processed On': '2-May-26',
    }
    const result = normaliseRow(row, 'coles-cc')
    expect(result.date).toBe('2026-05-02')
    expect(result.amount).toBe(-3.89)
    expect(result.description).toBe('COLES 7612 DEER PARK VIC')
  })
})

// ── T12: detectDuplicate ──────────────────────────────────────────────────────

describe('detectDuplicate', () => {
  const existing: Transaction[] = [
    {
      id:              'abc-123',
      date:            '2024-03-15',
      description:     'WOOLWORTHS 1234 SYDNEY',
      amount:          -89.50,
      kind:            'expense',
      envelope_id:     null,
      splits:          null,
      how_categorised: null,
      review:          false,
      notes:           null,
      import_batch_id: null,
      deleted:         false,
      imported_at:     '2024-03-16T00:00:00Z',
    },
  ]

  it('T12a — returns true when date + amount + description all match', () => {
    expect(
      detectDuplicate(
        { date: '2024-03-15', amount: -89.50, description: 'WOOLWORTHS 1234 SYDNEY' },
        existing,
      ),
    ).toBe(true)
  })

  it('T12b — returns false when description differs', () => {
    expect(
      detectDuplicate(
        { date: '2024-03-15', amount: -89.50, description: 'COLES SUPERMARKETS' },
        existing,
      ),
    ).toBe(false)
  })

  it('T12c — returns false when amount differs', () => {
    expect(
      detectDuplicate(
        { date: '2024-03-15', amount: -99.00, description: 'WOOLWORTHS 1234 SYDNEY' },
        existing,
      ),
    ).toBe(false)
  })

  it('T12d — returns false when date differs', () => {
    expect(
      detectDuplicate(
        { date: '2024-03-16', amount: -89.50, description: 'WOOLWORTHS 1234 SYDNEY' },
        existing,
      ),
    ).toBe(false)
  })

  it('T12e — match is case-insensitive on description', () => {
    expect(
      detectDuplicate(
        { date: '2024-03-15', amount: -89.50, description: 'woolworths 1234 sydney' },
        existing,
      ),
    ).toBe(true)
  })

  it('T12f — matches when existing has trailing state code the candidate lacks (pending→settled)', () => {
    // Simulates: existing = settled export ("WOOLWORTHS 1234 SYDNEY VIC"),
    // candidate = pending export ("WOOLWORTHS 1234 SYDNEY") — same real transaction
    const withSuffix: Transaction[] = [{
      ...existing[0],
      description: 'WOOLWORTHS 1234 SYDNEY VIC',
    }]
    expect(
      detectDuplicate(
        { date: '2024-03-15', amount: -89.50, description: 'WOOLWORTHS 1234 SYDNEY' },
        withSuffix,
      ),
    ).toBe(true)
  })

  it('T12g — matches when candidate has trailing country code the existing lacks (settled→pending)', () => {
    // Simulates: existing = pending export ("WOOLWORTHS 1234 SYDNEY"),
    // candidate = settled export ("WOOLWORTHS 1234 SYDNEY AUS") — same real transaction
    expect(
      detectDuplicate(
        { date: '2024-03-15', amount: -89.50, description: 'WOOLWORTHS 1234 SYDNEY AUS' },
        existing,
      ),
    ).toBe(true)
  })
})

// ── T13: detectPaycheque ──────────────────────────────────────────────────────

describe('detectPaycheque', () => {
  const settings = {
    employer_1_keyword:        'ACME CORP PAYROLL',
    employer_2_pay_1_keyword:  'BIG CO SALARY',
    employer_2_pay_2_keyword:  'BIG CO SUPER',
  }

  it('T13a — matches employer 1 keyword (case-insensitive substring)', () => {
    const result = detectPaycheque('ACME CORP PAYROLL 00023', settings)
    expect(result.matched).toBe(true)
    if (result.matched) {
      expect(result.employerId).toBe(1)
      expect(result.component).toBe(1)
    }
  })

  it('T13b — matches employer 2 pay component 1', () => {
    const result = detectPaycheque('BIG CO SALARY APR 2024', settings)
    expect(result.matched).toBe(true)
    if (result.matched) {
      expect(result.employerId).toBe(2)
      expect(result.component).toBe(1)
    }
  })

  it('T13c — matches employer 2 pay component 2', () => {
    const result = detectPaycheque('BIG CO SUPER CONTRIBUTION', settings)
    expect(result.matched).toBe(true)
    if (result.matched) {
      expect(result.employerId).toBe(2)
      expect(result.component).toBe(2)
    }
  })

  it('T13d — returns matched: false for unrecognised description', () => {
    const result = detectPaycheque('WOOLWORTHS 1234 SYDNEY', settings)
    expect(result.matched).toBe(false)
  })

  it('T13e — match is case-insensitive', () => {
    const result = detectPaycheque('acme corp payroll 00023', settings)
    expect(result.matched).toBe(true)
  })

  it('T13f — returns matched: false when all keywords are null', () => {
    const result = detectPaycheque('ACME CORP PAYROLL', {
      employer_1_keyword:       null,
      employer_2_pay_1_keyword: null,
      employer_2_pay_2_keyword: null,
    })
    expect(result.matched).toBe(false)
  })
})
