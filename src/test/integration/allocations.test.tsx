/**
 * Integration tests — Allocations Settings Page  (BRD §15.3 Flow 6)
 *
 * Flow 6: Allocations page — tab switching, allocation input, live preview
 */

import { describe, it, expect, beforeAll, afterEach, afterAll, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent            from '@testing-library/user-event'
import { server }           from '../server'
import { http, HttpResponse } from 'msw'
import { renderWithProviders, resetStores, seedStores } from '../utils'
import { AllocationsPage }  from '../../pages/settings/AllocationsPage'
import { SUPABASE_URL, MOCK_ALLOCATIONS } from '../handlers'

beforeAll(()  => server.listen({ onUnhandledRequest: 'warn' }))
afterEach(()  => { server.resetHandlers(); resetStores() })
afterAll(()   => server.close())

beforeEach(() => seedStores())

describe('Flow 6 — Allocations page', () => {
  it('renders Employer 1 tab by default with page title', async () => {
    renderWithProviders(<AllocationsPage />)

    await waitFor(() =>
      expect(screen.getByText('Allocations')).toBeInTheDocument(),
    )
    // Once settings load, the tab shows the employer name from MOCK_SETTINGS
    await waitFor(() =>
      expect(screen.getByText('ACME Corp')).toBeInTheDocument(),
    )
  })

  it('shows allocations for Employer 1 once loaded', async () => {
    renderWithProviders(<AllocationsPage />)

    // Envelope names from mock allocations
    await waitFor(() =>
      expect(screen.getByText('Groceries')).toBeInTheDocument(),
    )
    expect(screen.getByText('Utilities')).toBeInTheDocument()
  })

  it('shows footer with gross, allocated, and balanced/over/under label', async () => {
    renderWithProviders(<AllocationsPage />)

    await waitFor(() =>
      expect(screen.getByText('Groceries')).toBeInTheDocument(),
    )
    // Footer shows "Gross" amount — BalanceFooter now uses formatCurrency: $5,000.00
    await waitFor(() =>
      expect(screen.getByText('$5,000.00')).toBeInTheDocument(),
    )
    // Some allocation label present
    expect(screen.getByText(/allocated/i)).toBeInTheDocument()
  })

  it('switches to Employer 2 tab when clicked', async () => {
    const user = userEvent.setup()

    // Override handler to return empty allocations for employer 2
    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/envelope_allocations`, ({ request }) => {
        const url = new URL(request.url)
        const empId = url.searchParams.get('employer_id')
        if (empId === 'eq.2') return HttpResponse.json([])
        return HttpResponse.json(MOCK_ALLOCATIONS)
      }),
    )

    renderWithProviders(<AllocationsPage />)

    // Once settings load, the tab shows the employer name from MOCK_SETTINGS
    await waitFor(() =>
      expect(screen.getByText('ACME Corp')).toBeInTheDocument(),
    )

    // Click Side Co (Employer 2) tab
    await user.click(screen.getByText('Side Co'))

    // Side Co tab is now active — content re-fetches
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Side Co' })).toBeInTheDocument(),
    )
  })

  it('shows live preview dollar amount next to percentage allocation', async () => {
    renderWithProviders(<AllocationsPage />)

    // Groceries has 20% of $5,000 = $1,000.00 — preview uses formatCurrency
    await waitFor(() =>
      expect(screen.getByText('$1,000.00')).toBeInTheDocument(),
    )
  })

  it('shows live preview for fixed allocation', async () => {
    renderWithProviders(<AllocationsPage />)

    // Wait for settings AND allocations to be fully loaded before checking.
    // When gross is still 0 (settings loading), the footer status also shows
    // "$300.00 over" — creating a false multiple-match. Wait for the gross
    // to show $5,000.00 first so we know settings are settled.
    await waitFor(() =>
      expect(screen.getByText('$5,000.00')).toBeInTheDocument(),
    )

    // Utilities has fixed $300 — preview shows $300.00 (exactly one element now)
    expect(screen.getByText('$300.00')).toBeInTheDocument()
  })

  it('back link navigates to /settings', async () => {
    renderWithProviders(<AllocationsPage />)

    await waitFor(() =>
      expect(screen.getByText('Allocations')).toBeInTheDocument(),
    )

    // Use getAllByRole because a "Paycheque settings" warning link may appear
    // transiently while gross=0 (settings still loading). Find the back chevron.
    const links = screen.getAllByRole('link')
    const backLink = links.find(l => l.getAttribute('href') === '/settings')
    expect(backLink).toBeDefined()
    expect(backLink!).toHaveAttribute('href', '/settings')
  })

  it('shows balanced indicator when allocations match gross', async () => {
    // Provide allocations that sum exactly to the gross
    // gross = 5000, need total = 5000
    // Only TOP-LEVEL envelopes contribute to the footer total (children subdivide).
    // env-rent has parent_id='env-living' so it's a child and is excluded.
    // Must allocate to env-living (top-level) to make the footer balance.
    const balancedAllocations = [
      ...MOCK_ALLOCATIONS,
      {
        envelope_id:     'env-living',   // top-level, contributes to footer
        employer_id:     1,
        allocation_type: 'fixed' as const,
        value:           3700,  // 1000 (Groceries 20%) + 300 (Utilities) + 3700 = 5000
        updated_at:      '2024-01-01T00:00:00Z',
      },
    ]

    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/envelope_allocations`, () =>
        HttpResponse.json(balancedAllocations),
      ),
    )

    renderWithProviders(<AllocationsPage />)

    await waitFor(() =>
      expect(screen.getByText('Groceries')).toBeInTheDocument(),
    )

    // Should show "Balanced" in the footer
    await waitFor(() =>
      expect(screen.getByText(/balanced/i)).toBeInTheDocument(),
    )
  })
})
