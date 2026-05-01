/**
 * Bank Account Store  (BRD §13 / Step 13)
 *
 * Manages CRUD for the bank_accounts table and reconciliation records.
 */

import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { BankAccount, ReconciliationRecord } from '../types/database'

interface BankAccountState {
  accounts:         BankAccount[]
  reconciliations:  ReconciliationRecord[]
  isLoading:        boolean
  error:            string | null
}

interface BankAccountActions {
  fetch:       () => Promise<void>
  add:         (name: string) => Promise<void>
  updateBalance: (id: string, balance: number) => Promise<void>
  remove:      (id: string) => Promise<void>
  saveReconciliation: (params: {
    bankTotal:    number
    envelopeTotal: number
    gap:           number
    isBalanced:    boolean
    notes:         string | null
    snapshot:      Array<{ account_name: string; balance: number }>
  }) => Promise<void>
  fetchReconciliations: () => Promise<void>
}

export const useBankAccountStore = create<BankAccountState & BankAccountActions>((set, get) => ({
  accounts:        [],
  reconciliations: [],
  isLoading:       false,
  error:           null,

  fetch: async () => {
    set({ isLoading: true, error: null })
    try {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('*')
        .order('created_at', { ascending: true })
      if (error) throw error
      set({ accounts: data ?? [] })
    } catch (e: unknown) {
      set({ error: e instanceof Error ? e.message : 'Failed to load accounts' })
    } finally {
      set({ isLoading: false })
    }
  },

  add: async (name: string) => {
    const { error } = await supabase
      .from('bank_accounts')
      .insert({ name, balance: null })
    if (error) throw error
    await get().fetch()
  },

  updateBalance: async (id: string, balance: number) => {
    const { error } = await supabase
      .from('bank_accounts')
      .update({ balance, balance_updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
    set(s => ({
      accounts: s.accounts.map(a =>
        a.id === id
          ? { ...a, balance, balance_updated_at: new Date().toISOString() }
          : a,
      ),
    }))
  },

  remove: async (id: string) => {
    const { error } = await supabase
      .from('bank_accounts')
      .delete()
      .eq('id', id)
    if (error) throw error
    set(s => ({ accounts: s.accounts.filter(a => a.id !== id) }))
  },

  saveReconciliation: async ({ bankTotal, envelopeTotal, gap, isBalanced, notes, snapshot }) => {
    const { error } = await supabase
      .from('reconciliation_records')
      .insert({
        bank_total:       bankTotal,
        envelope_total:   envelopeTotal,
        gap,
        is_balanced:      isBalanced,
        notes,
        account_snapshot: snapshot,
        reconciled_at:    new Date().toISOString(),
      })
    if (error) throw error
    await get().fetchReconciliations()
  },

  fetchReconciliations: async () => {
    const { data, error } = await supabase
      .from('reconciliation_records')
      .select('*')
      .order('reconciled_at', { ascending: false })
      .limit(10)
    if (error) throw error
    set({ reconciliations: data ?? [] })
  },
}))
