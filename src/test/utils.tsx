/**
 * Test utilities — providers wrapper and store reset helpers.
 */

import { type ReactElement } from 'react'
import { render, type RenderOptions } from '@testing-library/react'
import { MemoryRouter }      from 'react-router-dom'
import { ThemeProvider }     from '../contexts/ThemeContext'
import { ToastProvider }     from '../contexts/ToastContext'
import { SaveProvider }      from '../contexts/SaveContext'
import { useEnvelopeStore }  from '../stores/useEnvelopeStore'
import { useSettingsStore }  from '../stores/useSettingsStore'
import { useTransactionStore } from '../stores/useTransactionStore'
import { MOCK_ENVELOPES, MOCK_SETTINGS } from './handlers'

// ── Provider wrapper ──────────────────────────────────────────────────────────

function AllProviders({ children }: { children: React.ReactNode }) {
  return (
    <MemoryRouter>
      <ThemeProvider>
        <ToastProvider>
          <SaveProvider>
            {children}
          </SaveProvider>
        </ToastProvider>
      </ThemeProvider>
    </MemoryRouter>
  )
}

export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
) {
  return render(ui, { wrapper: AllProviders, ...options })
}

// ── Store reset helpers ───────────────────────────────────────────────────────

/** Reset all stores to empty initial state. Call in beforeEach. */
export function resetStores() {
  useEnvelopeStore.setState({ envelopes: [], isLoading: false, error: null })
  useTransactionStore.setState({
    transactions:    [],
    allTransactions: [],
    filters:         {
      envelopeId:  null,
      search:      '',
      dateFrom:    null,
      dateTo:      null,
      kind:        null,
      unassigned:  false,
    },
    page:       0,
    hasMore:    true,
    isLoading:  false,
    isFetching: false,
    error:      null,
    reviewCount: 0,
  })
  useSettingsStore.setState({ settings: null, isLoading: false, error: null })
}

/** Pre-populate stores with standard mock data. */
export function seedStores() {
  useEnvelopeStore.setState({ envelopes: MOCK_ENVELOPES, isLoading: false, error: null })
  useSettingsStore.setState({ settings: MOCK_SETTINGS as never, isLoading: false, error: null })
}
