import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { Transaction, TransactionKind } from '../types/database'

const PAGE_SIZE = 50

export interface TransactionFilters {
  envelopeId:  string | null
  search:      string
  dateFrom:    string | null
  dateTo:      string | null
  kind:        TransactionKind | null
  unassigned:  boolean
}

const defaultFilters: TransactionFilters = {
  envelopeId:  null,
  search:      '',
  dateFrom:    null,
  dateTo:      null,
  kind:        null,
  unassigned:  false,
}

interface TransactionState {
  transactions: Transaction[]
  allTransactions: Transaction[]  // full unfiltered dataset for balance calculations
  filters:      TransactionFilters
  page:         number
  hasMore:      boolean
  isLoading:    boolean
  isFetching:   boolean           // background refetch
  error:        string | null
  reviewCount:  number
}

interface TransactionActions {
  fetchAll:      () => Promise<void>
  fetchPage:     () => Promise<void>
  nextPage:      () => void
  setFilters:    (f: Partial<TransactionFilters>) => void
  resetFilters:  () => void
  add:           (t: Omit<Transaction, 'id' | 'imported_at'>) => Promise<Transaction>
  update:        (id: string, patch: Partial<Transaction>) => Promise<void>
  softDelete:    (id: string) => Promise<void>
  invalidate:    () => Promise<void>
}

export const useTransactionStore = create<TransactionState & TransactionActions>((set, get) => ({
  transactions:    [],
  allTransactions: [],
  filters:         defaultFilters,
  page:            0,
  hasMore:         true,
  isLoading:       false,
  isFetching:      false,
  error:           null,
  reviewCount:     0,

  fetchAll: async () => {
    set({ isLoading: true, error: null })
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('deleted', false)
      .order('date', { ascending: false })
    if (error) {
      set({ isLoading: false, error: error.message })
    } else {
      const all = (data ?? []) as Transaction[]
      const reviewCount = all.filter(t =>
        t.review && !t.envelope_id && !t.splits && t.kind !== 'paycheque' && t.kind !== 'ignored'
      ).length
      set({ allTransactions: all, isLoading: false, reviewCount })
    }
  },

  fetchPage: async () => {
    const { page, filters } = get()
    set({ isFetching: true })

    let q = supabase
      .from('transactions')
      .select('*')
      .eq('deleted', false)
      .order('date', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (filters.envelopeId) q = q.eq('envelope_id', filters.envelopeId)
    // Ignored transactions are hidden by default; selecting "Ignored" in the
    // kind filter shows only ignored rows; any other kind filter excludes them naturally.
    if (filters.kind)       q = q.eq('kind', filters.kind)
    else                    q = q.neq('kind', 'ignored')
    if (filters.dateFrom)   q = q.gte('date', filters.dateFrom)
    if (filters.dateTo)     q = q.lte('date', filters.dateTo)
    if (filters.unassigned) q = q.is('envelope_id', null).is('splits', null)
    if (filters.search)     q = q.ilike('description', `%${filters.search}%`)

    const { data, error } = await q
    if (error) {
      set({ isFetching: false, error: error.message })
    } else {
      const rows = (data ?? []) as Transaction[]
      set(s => ({
        transactions: page === 0 ? rows : [...s.transactions, ...rows],
        hasMore:      rows.length === PAGE_SIZE,
        isFetching:   false,
      }))
    }
  },

  nextPage: () => {
    if (!get().hasMore || get().isFetching) return
    set(s => ({ page: s.page + 1 }))
    get().fetchPage()
  },

  setFilters: (f) => {
    set(s => ({ filters: { ...s.filters, ...f }, page: 0, transactions: [], hasMore: true }))
    get().fetchPage()
  },

  resetFilters: () => {
    set({ filters: defaultFilters, page: 0, transactions: [], hasMore: true })
    get().fetchPage()
  },

  add: async (t) => {
    const { data, error } = await supabase
      .from('transactions')
      .insert(t)
      .select()
      .single()
    if (error) throw new Error(error.message)
    const tx = data as Transaction
    set(s => ({
      transactions:    [tx, ...s.transactions],
      allTransactions: [tx, ...s.allTransactions],
    }))
    return tx
  },

  update: async (id, patch) => {
    const { error } = await supabase
      .from('transactions')
      .update(patch)
      .eq('id', id)
    if (error) throw new Error(error.message)
    const apply = (arr: Transaction[]) =>
      arr.map(t => t.id === id ? { ...t, ...patch } : t)
    set(s => ({
      transactions:    apply(s.transactions),
      allTransactions: apply(s.allTransactions),
      reviewCount: s.allTransactions.filter(t =>
        t.id === id
          ? (patch.review ?? t.review) && !(patch.envelope_id ?? t.envelope_id) && !(patch.splits ?? t.splits) && (patch.kind ?? t.kind) !== 'paycheque' && (patch.kind ?? t.kind) !== 'ignored'
          : t.review && !t.envelope_id && !t.splits && t.kind !== 'paycheque' && t.kind !== 'ignored'
      ).length,
    }))
  },

  softDelete: async (id) => {
    await get().update(id, { deleted: true })
    set(s => ({
      transactions:    s.transactions.filter(t => t.id !== id),
      allTransactions: s.allTransactions.filter(t => t.id !== id),
    }))
  },

  invalidate: async () => {
    set({ page: 0 })
    await Promise.all([get().fetchAll(), get().fetchPage()])
  },
}))
