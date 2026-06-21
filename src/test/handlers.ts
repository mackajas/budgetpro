/**
 * MSW request handlers — mock the Supabase PostgREST API.
 *
 * Handlers are intentionally permissive: they match on the table name
 * and ignore query parameters, returning appropriate mock payloads.
 * Per-test overrides are added via server.use() in individual tests.
 */

import { http, HttpResponse } from 'msw'
import type { Envelope, EnvelopeAllocation } from '../types/database'

// ── Supabase base URL (matches .env.local) ────────────────────────────────────

export const SUPABASE_URL = 'https://piaazdfouhzqnpkbbjuw.supabase.co'

// ── Shared mock data ──────────────────────────────────────────────────────────

export const MOCK_ENVELOPES: Envelope[] = [
  { id: 'env-groceries', name: 'Groceries',  display_order: 0, parent_id: null },
  { id: 'env-utilities', name: 'Utilities',  display_order: 1, parent_id: null },
  { id: 'env-living',    name: 'Living',     display_order: 2, parent_id: null },
  { id: 'env-rent',      name: 'Rent',       display_order: 3, parent_id: 'env-living' },
]

export const MOCK_SETTINGS = {
  id: 1,
  featured_envelope_1_id:   null,
  featured_envelope_2_id:   null,
  featured_envelope_3_id:   null,
  employer_name_1:          'ACME Corp',
  employer_1_gross:         5000,
  employer_1_keyword:       'acme',
  employer_name_2:          'Side Co',
  employer_2_pay_1:         1000,
  employer_2_pay_1_keyword: 'sideco',
  employer_2_pay_2:         null,
  employer_2_pay_2_keyword: null,
  pay_frequency:            'fortnightly',
  default_bank_format:      'cba',
  password_hash:            null,
}

export const MOCK_ALLOCATIONS: EnvelopeAllocation[] = [
  {
    envelope_id:     'env-groceries',
    employer_id:     1,
    allocation_type: 'percentage',
    value:           20,
    updated_at:      '2024-01-01T00:00:00Z',
  },
  {
    envelope_id:     'env-utilities',
    employer_id:     1,
    allocation_type: 'fixed',
    value:           300,
    updated_at:      '2024-01-01T00:00:00Z',
  },
]

// ── Default handlers ──────────────────────────────────────────────────────────

export const handlers = [
  // Envelopes — read
  http.get(`${SUPABASE_URL}/rest/v1/envelopes`, () =>
    HttpResponse.json(MOCK_ENVELOPES),
  ),

  // Settings — read.
  // Always return a single JSON object so that supabase-js .single() always
  // receives the expected format regardless of the Accept header value.
  // (In jsdom/vitest, supabase-js does not always forward Accept headers to MSW.)
  http.get(`${SUPABASE_URL}/rest/v1/settings`, () =>
    HttpResponse.json(MOCK_SETTINGS),
  ),

  // Transactions — read
  http.get(`${SUPABASE_URL}/rest/v1/transactions`, () =>
    HttpResponse.json([]),
  ),

  // RPC: envelope-filtered transaction query (includes split rows)
  http.post(`${SUPABASE_URL}/rest/v1/rpc/transactions_for_envelope`, () =>
    HttpResponse.json([]),
  ),

  // Transactions — insert (returns created row)
  http.post(`${SUPABASE_URL}/rest/v1/transactions`, async ({ request }) => {
    const body = await request.json() as Record<string, unknown>
    const tx = {
      id:           crypto.randomUUID(),
      imported_at:  new Date().toISOString(),
      ...body,
    }
    return HttpResponse.json([tx], { status: 201 })
  }),

  // Transactions — update
  http.patch(`${SUPABASE_URL}/rest/v1/transactions`, () =>
    HttpResponse.json([]),
  ),

  // Envelope allocations — read
  http.get(`${SUPABASE_URL}/rest/v1/envelope_allocations`, () =>
    HttpResponse.json(MOCK_ALLOCATIONS),
  ),

  // Envelope allocations — upsert
  http.post(`${SUPABASE_URL}/rest/v1/envelope_allocations`, () =>
    HttpResponse.json([]),
  ),

  // Category rules — read
  http.get(`${SUPABASE_URL}/rest/v1/category_rules`, () =>
    HttpResponse.json([]),
  ),

  // Bank accounts — read
  http.get(`${SUPABASE_URL}/rest/v1/bank_accounts`, () =>
    HttpResponse.json([]),
  ),

  // Reconciliation records — read
  http.get(`${SUPABASE_URL}/rest/v1/reconciliation_records`, () =>
    HttpResponse.json([]),
  ),

  // Expenses — categories and items (read + write)
  http.get(`${SUPABASE_URL}/rest/v1/expense_categories`, () =>
    HttpResponse.json([]),
  ),
  http.post(`${SUPABASE_URL}/rest/v1/expense_categories`, () =>
    HttpResponse.json(null, { status: 201 }),
  ),
  http.patch(`${SUPABASE_URL}/rest/v1/expense_categories`, () =>
    HttpResponse.json(null),
  ),
  http.delete(`${SUPABASE_URL}/rest/v1/expense_categories`, () =>
    HttpResponse.json(null),
  ),
  http.get(`${SUPABASE_URL}/rest/v1/expense_items`, () =>
    HttpResponse.json([]),
  ),
  http.post(`${SUPABASE_URL}/rest/v1/expense_items`, () =>
    HttpResponse.json(null, { status: 201 }),
  ),
  http.patch(`${SUPABASE_URL}/rest/v1/expense_items`, () =>
    HttpResponse.json(null),
  ),
  http.delete(`${SUPABASE_URL}/rest/v1/expense_items`, () =>
    HttpResponse.json(null),
  ),
]
