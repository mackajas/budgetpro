/**
 * Integration tests — Edit Transaction Modal  (BRD §15.3 Flows 4+5)
 *
 * Flow 4: CSV-imported transaction — date/amount/description locked, envelope editable
 * Flow 5: Paycheque transaction    — fully read-only with splits breakdown
 */

import { describe, it, expect, beforeAll, afterEach, afterAll, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent            from '@testing-library/user-event'
import { server }           from '../server'
import { renderWithProviders, resetStores, seedStores } from '../utils'
import { EditTransactionModal } from '../../components/EditTransactionModal'
import type { Transaction }     from '../../types/database'

beforeAll(()  => server.listen({ onUnhandledRequest: 'warn' }))
afterEach(()  => { server.resetHandlers(); resetStores() })
afterAll(()   => server.close())

beforeEach(() => seedStores())

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CSV_TX: Transaction = {
  id:              'tx-csv-001',
  date:            '2024-03-15',
  description:     'WOOLWORTHS 1234',
  amount:          -87.45,
  kind:            'expense',
  envelope_id:     null,
  splits:          null,
  how_categorised: 'auto',
  review:          true,
  notes:           null,
  import_batch_id: 'batch-abc',   // marks as imported → locks date/amount/description
  deleted:         false,
  imported_at:     '2024-03-16T10:00:00Z',
}

const PAYCHEQUE_TX: Transaction = {
  id:              'tx-pay-001',
  date:            '2024-03-14',
  description:     'ACME Corp Salary',
  amount:          5000,
  kind:            'paycheque',
  envelope_id:     null,
  splits:          {
    'env-groceries': 1000,
    'env-utilities': 300,
    'env-rent':      3700,
  },
  how_categorised: 'auto-paycheque',
  review:          false,
  notes:           null,
  import_batch_id: 'batch-abc',
  deleted:         false,
  imported_at:     '2024-03-16T10:00:00Z',
}

// ── Flow 4: CSV-imported transaction ─────────────────────────────────────────

describe('Flow 4 — Edit transaction: CSV-imported row', () => {
  it('shows "Edit Transaction" heading for a regular imported row', () => {
    renderWithProviders(
      <EditTransactionModal transaction={CSV_TX} onClose={() => {}} />,
    )
    expect(screen.getByText('Edit Transaction')).toBeInTheDocument()
  })

  it('displays locked date, amount, and description in read-only panel', () => {
    renderWithProviders(
      <EditTransactionModal transaction={CSV_TX} onClose={() => {}} />,
    )
    // Date shown as formatted string
    expect(screen.getByText('15 Mar 2024')).toBeInTheDocument()
    // Description
    expect(screen.getByText('WOOLWORTHS 1234')).toBeInTheDocument()
    // Lock notice
    expect(screen.getByText(/locked for imported transactions/i)).toBeInTheDocument()
  })

  it('shows envelope selector so the user can assign a category', () => {
    renderWithProviders(
      <EditTransactionModal transaction={CSV_TX} onClose={() => {}} />,
    )
    // Envelope combobox
    const comboboxes = screen.getAllByRole('combobox')
    // At minimum the envelope selector should be present
    expect(comboboxes.length).toBeGreaterThanOrEqual(1)
    // "Unassigned" option present
    expect(screen.getByText(/unassigned/i)).toBeInTheDocument()
  })

  it('can select a different envelope and save', async () => {
    const user    = userEvent.setup()
    const onClose = vi.fn()
    renderWithProviders(
      <EditTransactionModal transaction={CSV_TX} onClose={onClose} />,
    )

    // Find envelope combobox — index 1 because index 0 is the kind dropdown
    const envelopeSelect = screen.getAllByRole('combobox')[1]
    await user.selectOptions(envelopeSelect, 'env-groceries')

    await user.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('shows Delete button (not present for opening-balance)', () => {
    renderWithProviders(
      <EditTransactionModal transaction={CSV_TX} onClose={() => {}} />,
    )
    expect(screen.getByText(/delete/i)).toBeInTheDocument()
  })

  it('requires confirmation before deleting', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <EditTransactionModal transaction={CSV_TX} onClose={() => {}} />,
    )

    await user.click(screen.getByText('Delete'))
    // Confirmation prompt appears
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /yes, delete/i })).toBeInTheDocument()
  })
})

// ── Flow 5: Paycheque transaction (read-only) ─────────────────────────────────

describe('Flow 5 — Edit transaction: Paycheque read-only view', () => {
  it('shows "Paycheque" as the modal title', () => {
    renderWithProviders(
      <EditTransactionModal transaction={PAYCHEQUE_TX} onClose={() => {}} />,
    )
    expect(screen.getByText('Paycheque')).toBeInTheDocument()
  })

  it('displays the paycheque amount', () => {
    renderWithProviders(
      <EditTransactionModal transaction={PAYCHEQUE_TX} onClose={() => {}} />,
    )
    expect(screen.getByText('$5,000.00')).toBeInTheDocument()
  })

  it('shows allocation breakdown heading', () => {
    renderWithProviders(
      <EditTransactionModal transaction={PAYCHEQUE_TX} onClose={() => {}} />,
    )
    expect(screen.getByText(/allocation breakdown/i)).toBeInTheDocument()
  })

  it('lists all three split envelope names with amounts', () => {
    renderWithProviders(
      <EditTransactionModal transaction={PAYCHEQUE_TX} onClose={() => {}} />,
    )
    // Envelope names from MOCK_ENVELOPES
    expect(screen.getByText('Groceries')).toBeInTheDocument()
    expect(screen.getByText('Utilities')).toBeInTheDocument()
    expect(screen.getByText('Rent')).toBeInTheDocument()
    // Amounts
    expect(screen.getByText('$1,000.00')).toBeInTheDocument()
    expect(screen.getByText('$300.00')).toBeInTheDocument()
    expect(screen.getByText('$3,700.00')).toBeInTheDocument()
  })

  it('has only a Close button, no Save — but does have a Delete option', () => {
    renderWithProviders(
      <EditTransactionModal transaction={PAYCHEQUE_TX} onClose={() => {}} />,
    )
    // The modal header has an ✕ icon button (aria-label="Close") and the
    // PaychequeView has a text "Close" button — both are valid close buttons.
    const closeButtons = screen.getAllByRole('button', { name: /close/i })
    expect(closeButtons.length).toBeGreaterThanOrEqual(1)
    // No "Save" button
    expect(screen.queryByRole('button', { name: /^save$/i })).not.toBeInTheDocument()
    // Delete button is present (paycheques can be soft-deleted)
    expect(screen.getByText(/^delete$/i)).toBeInTheDocument()
  })

  it('calls onClose when Close is clicked', async () => {
    const user    = userEvent.setup()
    const onClose = vi.fn()
    renderWithProviders(
      <EditTransactionModal transaction={PAYCHEQUE_TX} onClose={onClose} />,
    )

    // Click the text "Close" button (in PaychequeView, not the ✕ icon button)
    await user.click(screen.getByText('Close'))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
