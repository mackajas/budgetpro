import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { ExpenseCategory, ExpenseItem, ExpenseFrequency } from '../types/database'

interface ExpensesState {
  categories: ExpenseCategory[]
  items:       ExpenseItem[]
  isLoading:   boolean
  error:       string | null
}

interface ExpensesActions {
  fetch:            () => Promise<void>
  addCategory:      (name: string) => Promise<void>
  removeCategory:   (id: string) => Promise<void>
  moveCategoryUp:   (id: string) => Promise<void>
  moveCategoryDown: (id: string) => Promise<void>
  addItem:          (categoryId: string, data: {
    name: string; description: string | null; amount: number; frequency: ExpenseFrequency
  }) => Promise<void>
  updateCategory:   (id: string, name: string) => Promise<void>
  removeItem:       (id: string) => Promise<void>
  updateItem:       (id: string, patch: {
    name: string; description: string | null; amount: number; frequency: ExpenseFrequency
  }) => Promise<void>
  moveItem:         (id: string, newCategoryId: string) => Promise<void>
}

export const useExpensesStore = create<ExpensesState & ExpensesActions>((set, get) => ({
  categories: [],
  items:      [],
  isLoading:  false,
  error:      null,

  fetch: async () => {
    set({ isLoading: true, error: null })
    try {
      const [catRes, itemRes] = await Promise.all([
        supabase.from('expense_categories').select('*').order('sort_order', { ascending: true }),
        supabase.from('expense_items').select('*').order('sort_order', { ascending: true }),
      ])
      if (catRes.error)  throw catRes.error
      if (itemRes.error) throw itemRes.error
      set({ categories: catRes.data ?? [], items: itemRes.data ?? [] })
    } catch (e: unknown) {
      set({ error: e instanceof Error ? e.message : 'Failed to load expenses' })
    } finally {
      set({ isLoading: false })
    }
  },

  addCategory: async (name: string) => {
    const { categories } = get()
    const maxOrder = categories.reduce((m, c) => Math.max(m, c.sort_order), -1)
    const { error } = await supabase
      .from('expense_categories')
      .insert({ name, sort_order: maxOrder + 1 })
    if (error) throw error
    await get().fetch()
  },

  removeCategory: async (id: string) => {
    const { error } = await supabase
      .from('expense_categories')
      .delete()
      .eq('id', id)
    if (error) throw error
    set(s => ({
      categories: s.categories.filter(c => c.id !== id),
      items:      s.items.filter(i => i.category_id !== id),
    }))
  },

  moveCategoryUp: async (id: string) => {
    const { categories } = get()
    const sorted = [...categories].sort((a, b) => a.sort_order - b.sort_order)
    const idx = sorted.findIndex(c => c.id === id)
    if (idx <= 0) return
    const current = sorted[idx]
    const above   = sorted[idx - 1]
    const [e1, e2] = await Promise.all([
      supabase.from('expense_categories').update({ sort_order: above.sort_order }).eq('id', current.id),
      supabase.from('expense_categories').update({ sort_order: current.sort_order }).eq('id', above.id),
    ])
    if (e1.error) throw e1.error
    if (e2.error) throw e2.error
    set(s => ({
      categories: s.categories.map(c => {
        if (c.id === current.id) return { ...c, sort_order: above.sort_order }
        if (c.id === above.id)   return { ...c, sort_order: current.sort_order }
        return c
      }).sort((a, b) => a.sort_order - b.sort_order),
    }))
  },

  moveCategoryDown: async (id: string) => {
    const { categories } = get()
    const sorted = [...categories].sort((a, b) => a.sort_order - b.sort_order)
    const idx = sorted.findIndex(c => c.id === id)
    if (idx < 0 || idx >= sorted.length - 1) return
    const current = sorted[idx]
    const below   = sorted[idx + 1]
    const [e1, e2] = await Promise.all([
      supabase.from('expense_categories').update({ sort_order: below.sort_order }).eq('id', current.id),
      supabase.from('expense_categories').update({ sort_order: current.sort_order }).eq('id', below.id),
    ])
    if (e1.error) throw e1.error
    if (e2.error) throw e2.error
    set(s => ({
      categories: s.categories.map(c => {
        if (c.id === current.id) return { ...c, sort_order: below.sort_order }
        if (c.id === below.id)   return { ...c, sort_order: current.sort_order }
        return c
      }).sort((a, b) => a.sort_order - b.sort_order),
    }))
  },

  addItem: async (categoryId, data) => {
    const { items } = get()
    const catItems = items.filter(i => i.category_id === categoryId)
    const maxOrder = catItems.reduce((m, i) => Math.max(m, i.sort_order), -1)
    const { error } = await supabase
      .from('expense_items')
      .insert({ ...data, category_id: categoryId, sort_order: maxOrder + 1 })
    if (error) throw error
    await get().fetch()
  },

  updateCategory: async (id: string, name: string) => {
    const { error } = await supabase
      .from('expense_categories')
      .update({ name })
      .eq('id', id)
    if (error) throw error
    set(s => ({
      categories: s.categories.map(c => c.id === id ? { ...c, name } : c),
    }))
  },

  removeItem: async (id: string) => {
    const { error } = await supabase
      .from('expense_items')
      .delete()
      .eq('id', id)
    if (error) throw error
    set(s => ({ items: s.items.filter(i => i.id !== id) }))
  },

  updateItem: async (id: string, patch) => {
    const { error } = await supabase
      .from('expense_items')
      .update(patch)
      .eq('id', id)
    if (error) throw error
    set(s => ({
      items: s.items.map(i => i.id === id ? { ...i, ...patch } : i),
    }))
  },

  moveItem: async (id: string, newCategoryId: string) => {
    const { error } = await supabase
      .from('expense_items')
      .update({ category_id: newCategoryId })
      .eq('id', id)
    if (error) throw error
    set(s => ({
      items: s.items.map(i => i.id === id ? { ...i, category_id: newCategoryId } : i),
    }))
  },
}))
