/**
 * Integration tests — Add Transaction Modal  (BRD §15.3 Flows 2+3)
 *
 * Flow 2: Cash income tab — single envelope assignment
 * Flow 3: Other tab — kind = ignored
 */

import { describe, it, expect, beforeAll, afterEach, afterAll, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent            from '@testing-library/user-event'
import { server }           from '../server'
import { renderWithProviders, resetStores, seedStores } from '../utils'
import { AddTransactionModal } from '../../components/AddTransactionModal'

beforeAll(()  => server.listen({ onUnhandledRequest: 'warn' }))
afterEach(()  => { server.resetHandlers(); resetStores() })
afterAll(()   => server.close())

beforeEach(() => seedStores())

// ── Flow 2: Cash income tab ───────────────────────────────────────────────────

describe('Flow 2 — Add transaction: Cash income tab', () => {
  it('renders three tabs with Cash income selectable', async () => {
    const user = userEvent.setup()
    renderWithProviders(<AddTransactionModal onClose={() => {}} />)

    expect(screen.getByRole('button', { name: 'Expense' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cash income' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Other' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cash income' }))
    // Split toggle appears only on Cash tab
    expect(screen.getByText(/split across envelopes/i)).toBeInTheDocument()
  })

  it('fills in cash income and submits with single envelope', async () => {
    const user    = userEvent.setup()
    const onClose = vi.fn()
    renderWithProviders(<AddTransactionModal onClose={onClose} />)

    // Switch to Cash tab
    await user.click(screen.getByRole('button', { name: 'Cash income' }))

    // Fill shared fields
    const amountInput = screen.getByPlaceholderText('0.00')
    await user.clear(amountInput)
    await user.type(amountInput, '1500')

    const descInput = screen.getByPlaceholderText('Transaction description')
    await user.clear(descInput)
    await user.type(descInput, 'Salary payment')

    // On the Cash tab (non-split), there is exactly one combobox: the envelope selector
    const envSelect = screen.getByRole('combobox')
    await user.selectOptions(envSelect, 'env-groceries')

    // Submit
    await user.click(screen.getByRole('button', { name: /add transaction/i }))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('enables split mode and shows at least two split lines', async () => {
    const user = userEvent.setup()
    renderWithProviders(<AddTransactionModal onClose={() => {}} />)

    await user.click(screen.getByRole('button', { name: 'Cash income' }))

    // Enable split mode
    const splitToggle = screen.getByRole('checkbox')
    await user.click(splitToggle)

    // Two split lines appear by default
    const selects = screen.getAllByRole('combobox')
    // One or more comboboxes for envelope selection in split lines
    expect(selects.length).toBeGreaterThanOrEqual(2)
    // "Add line" button is visible
    expect(screen.getByText(/add line/i)).toBeInTheDocument()
  })

  it('shows balance tracker: over / remaining / balanced', async () => {
    const user = userEvent.setup()
    renderWithProviders(<AddTransactionModal onClose={() => {}} />)

    await user.click(screen.getByRole('button', { name: 'Cash income' }))

    // Enter a total amount
    const amountInput = screen.getByPlaceholderText('0.00')
    await user.clear(amountInput)
    await user.type(amountInput, '200')

    // Enable split
    await user.click(screen.getByRole('checkbox'))

    // Initially allocated = 0, remaining = 200
    expect(screen.getByText(/remaining/i)).toBeInTheDocument()
  })
})

// ── Flow 3: Other tab ─────────────────────────────────────────────────────────

describe('Flow 3 — Add transaction: Other tab', () => {
  it('shows kind dropdown with income-other and ignored options', async () => {
    const user = userEvent.setup()
    renderWithProviders(<AddTransactionModal onClose={() => {}} />)

    await user.click(screen.getByRole('button', { name: 'Other' }))

    // On the Other tab, there are 2 comboboxes: kind + envelope (income-other default)
    // The kind select is first
    const [kindSelect] = screen.getAllByRole('combobox')
    const options = Array.from(kindSelect.querySelectorAll('option')).map(o => o.textContent)
    expect(options).toContain('Other income')
    expect(options).toContain('Ignored')
  })

  it('hides envelope field when kind = ignored', async () => {
    const user = userEvent.setup()
    renderWithProviders(<AddTransactionModal onClose={() => {}} />)

    await user.click(screen.getByRole('button', { name: 'Other' }))

    // Two comboboxes on Other tab (kind + envelope for income-other default)
    const [kindSelect] = screen.getAllByRole('combobox')
    await user.selectOptions(kindSelect, 'ignored')

    // After selecting ignored, envelope selector disappears — only kind remains
    expect(screen.getAllByRole('combobox')).toHaveLength(1)
  })

  it('submits an ignored transaction and calls onClose', async () => {
    const user    = userEvent.setup()
    const onClose = vi.fn()
    renderWithProviders(<AddTransactionModal onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'Other' }))

    // Select Ignored from the kind combobox (first)
    const [kindSelect] = screen.getAllByRole('combobox')
    await user.selectOptions(kindSelect, 'ignored')

    // Fill required fields
    const amountInput = screen.getByPlaceholderText('0.00')
    await user.clear(amountInput)
    await user.type(amountInput, '-50')

    await user.type(screen.getByPlaceholderText('Transaction description'), 'Bank fee')

    await user.click(screen.getByRole('button', { name: /add transaction/i }))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('shows envelope selector when kind = income-other', async () => {
    const user = userEvent.setup()
    renderWithProviders(<AddTransactionModal onClose={() => {}} />)

    await user.click(screen.getByRole('button', { name: 'Other' }))

    // Default is income-other — two comboboxes present (kind + envelope)
    expect(screen.getAllByRole('combobox')).toHaveLength(2)

    // Switch to ignored → envelope disappears
    const [kindSelect] = screen.getAllByRole('combobox')
    await user.selectOptions(kindSelect, 'ignored')
    expect(screen.getAllByRole('combobox')).toHaveLength(1)

    // Switch back to income-other → envelope re-appears
    await user.selectOptions(screen.getAllByRole('combobox')[0], 'income-other')
    expect(screen.getAllByRole('combobox')).toHaveLength(2)
  })
})
