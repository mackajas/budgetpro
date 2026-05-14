/**
 * Integration tests — Import Modal  (BRD §15.3 Flow 1)
 *
 * Flow 1: Import CSV — stage transitions (drop → parsing → preview → importing → done)
 *
 * runImportPipeline is mocked to avoid full CSV parsing in integration tests
 * (the pipeline itself is tested thoroughly in parser.test.ts).
 */

import { describe, it, expect, beforeAll, afterEach, afterAll, beforeEach, vi } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent                       from '@testing-library/user-event'
import { http, HttpResponse }          from 'msw'
import { server }                      from '../server'
import { SUPABASE_URL }                from '../handlers'
import { renderWithProviders, resetStores, seedStores } from '../utils'
import { ImportModal }                 from '../../components/ImportModal'
import type { PipelineResult }         from '../../lib/importPipeline'

// Mock the pipeline so tests don't depend on PapaParse internals
vi.mock('../../lib/importPipeline', () => ({
  runImportPipeline: vi.fn(),
}))

import { runImportPipeline } from '../../lib/importPipeline'
const mockPipeline = vi.mocked(runImportPipeline)

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal File object that mimics a CSV upload. */
function makeCsvFile(content = 'Date,Amount,Description\n01/03/2024,-50.00,Groceries\n') {
  return new File([content], 'statement.csv', { type: 'text/csv' })
}

/**
 * Standard pipeline result: 2 valid rows, 1 needs review.
 * Matches the ProcessedRow and PipelineResult interfaces exactly.
 */
const PIPELINE_RESULT: PipelineResult = {
  format: 'cba',
  rows: [
    {
      date:            '2024-03-01',
      description:     'Groceries',
      amount:          -50.00,
      kind:            'expense',
      envelope_id:     'env-groceries',
      splits:          null,
      how_categorised: 'auto',
      review:          false,
      isDuplicate:     false,
      importAnyway:    false,
      validationError: null,
    },
    {
      date:            '2024-03-02',
      description:     'Power bill',
      amount:          -120.00,
      kind:            'expense',
      envelope_id:     null,
      splits:          null,
      how_categorised: 'review',
      review:          true,
      isDuplicate:     false,
      importAnyway:    false,
      validationError: null,
    },
  ],
  ready: [
    {
      date:            '2024-03-01',
      description:     'Groceries',
      amount:          -50.00,
      kind:            'expense',
      envelope_id:     'env-groceries',
      splits:          null,
      how_categorised: 'auto',
      review:          false,
      isDuplicate:     false,
      importAnyway:    false,
      validationError: null,
    },
    {
      date:            '2024-03-02',
      description:     'Power bill',
      amount:          -120.00,
      kind:            'expense',
      envelope_id:     null,
      splits:          null,
      how_categorised: 'review',
      review:          true,
      isDuplicate:     false,
      importAnyway:    false,
      validationError: null,
    },
  ],
  counts: {
    total:      2,
    valid:      2,
    duplicates: 0,
    invalid:    0,
    paycheques: 0,
    needsReview: 1,
  },
}

beforeAll(()  => server.listen({ onUnhandledRequest: 'warn' }))
afterEach(()  => { server.resetHandlers(); resetStores(); vi.clearAllMocks() })
afterAll(()   => server.close())

beforeEach(() => {
  seedStores()
  mockPipeline.mockResolvedValue(PIPELINE_RESULT)
})

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Trigger file selection and wait for the preview stage. */
async function selectFileAndWaitForPreview() {
  const fileInput = document.querySelector('input[type="file"]')!
  fireEvent.change(fileInput, { target: { files: [makeCsvFile()] } })
  // Wait until the Import button appears (preview stage reached)
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /import 2 rows/i })).toBeInTheDocument(),
    { timeout: 3000 },
  )
}

// ── Flow 1: Import stages ─────────────────────────────────────────────────────

describe('Flow 1 — Import modal', () => {
  it('renders drop zone on initial open', () => {
    renderWithProviders(<ImportModal onClose={() => {}} />)
    expect(screen.getByText(/drop your csv file here/i)).toBeInTheDocument()
  })

  it('shows "Import Transactions" heading', () => {
    renderWithProviders(<ImportModal onClose={() => {}} />)
    expect(screen.getByText(/import transactions/i)).toBeInTheDocument()
  })

  it('shows error when a non-CSV file is selected', async () => {
    renderWithProviders(<ImportModal onClose={() => {}} />)

    const fileInput = document.querySelector('input[type="file"]')!
    const badFile   = new File(['not csv'], 'image.png', { type: 'image/png' })
    fireEvent.change(fileInput, { target: { files: [badFile] } })

    await waitFor(() =>
      expect(screen.getByText(/only .csv files/i)).toBeInTheDocument(),
    )
  })

  it('transitions to preview stage — shows Ready to import stat', async () => {
    renderWithProviders(<ImportModal onClose={() => {}} />)
    await selectFileAndWaitForPreview()

    // Preview stats panel appears
    expect(screen.getByText(/ready to import/i)).toBeInTheDocument()
    // Import button with row count
    expect(screen.getByRole('button', { name: /import 2 rows/i })).toBeInTheDocument()
  })

  it('preview shows rows found and need review stats', async () => {
    renderWithProviders(<ImportModal onClose={() => {}} />)
    await selectFileAndWaitForPreview()

    expect(screen.getByText(/rows found/i)).toBeInTheDocument()
    expect(screen.getByText(/need review/i)).toBeInTheDocument()
  })

  it('preview shows duplicate stat when duplicates exist', async () => {
    const withDupe: PipelineResult = {
      ...PIPELINE_RESULT,
      rows: PIPELINE_RESULT.rows.map((r, i) =>
        i === 0 ? { ...r, isDuplicate: true } : r,
      ),
      ready: [PIPELINE_RESULT.rows[1]],
      counts: { ...PIPELINE_RESULT.counts, duplicates: 1 },
    }
    mockPipeline.mockResolvedValueOnce(withDupe)

    // The ImportModal re-runs duplicate detection against actual Supabase data
    // AFTER the pipeline runs. Override the transactions endpoint to return a
    // transaction matching row 1 so detectDuplicate() also flags it.
    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/transactions`, () =>
        HttpResponse.json([{
          id:          'existing-tx-001',
          date:        '2024-03-01',
          amount:      -50.00,
          description: 'Groceries',
          deleted:     false,
        }]),
      ),
    )

    renderWithProviders(<ImportModal onClose={() => {}} />)

    const fileInput = document.querySelector('input[type="file"]')!
    fireEvent.change(fileInput, { target: { files: [makeCsvFile()] } })

    await waitFor(() =>
      expect(screen.getByText(/duplicates detected/i)).toBeInTheDocument(),
    )
  })

  it('completes import and shows done stage with transaction count', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ImportModal onClose={() => {}} />)

    await selectFileAndWaitForPreview()

    // Import button shows row count
    await user.click(screen.getByRole('button', { name: /import 2 rows/i }))

    // Done stage: "{n} transactions imported"
    await waitFor(() =>
      expect(screen.getByText(/transactions imported/i)).toBeInTheDocument(),
      { timeout: 3000 },
    )
  })

  it('done stage shows "View unassigned" link when needsReview > 0', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ImportModal onClose={() => {}} />)

    await selectFileAndWaitForPreview()
    await user.click(screen.getByRole('button', { name: /import 2 rows/i }))

    await waitFor(() =>
      expect(screen.getByText(/transactions imported/i)).toBeInTheDocument(),
      { timeout: 3000 },
    )
    // "View unassigned →" button in done stage (rendered as <button>, not <a>)
    expect(screen.getByText(/view unassigned/i)).toBeInTheDocument()
  })

  it('close (✕) button calls onClose', async () => {
    const user    = userEvent.setup()
    const onClose = vi.fn()
    renderWithProviders(<ImportModal onClose={onClose} />)

    // The ✕ icon button has aria-label="Close"
    await user.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
