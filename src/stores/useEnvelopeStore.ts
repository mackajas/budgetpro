import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { Envelope } from '../types/database'

interface EnvelopeState {
  envelopes: Envelope[]
  isLoading: boolean
  error:     string | null
}

interface EnvelopeActions {
  fetch:  () => Promise<void>
  add:    (name: string, parentId?: string | null) => Promise<Envelope>
  rename: (id: string, name: string) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useEnvelopeStore = create<EnvelopeState & EnvelopeActions>((set, get) => ({
  envelopes: [],
  isLoading: false,
  error:     null,

  fetch: async () => {
    set({ isLoading: true, error: null })
    const { data, error } = await supabase
      .from('envelopes')
      .select('*')
      .order('display_order', { ascending: true })
    if (error) {
      set({ isLoading: false, error: error.message })
    } else {
      set({ envelopes: (data ?? []) as Envelope[], isLoading: false })
    }
  },

  add: async (name: string, parentId: string | null = null) => {
    const maxOrder = get().envelopes.reduce((m, e) => Math.max(m, e.display_order), -1)
    const { data, error } = await supabase
      .from('envelopes')
      .insert({ name, parent_id: parentId, display_order: maxOrder + 1 })
      .select()
      .single()
    if (error) throw new Error(error.message)
    const envelope = data as Envelope
    set(s => ({ envelopes: [...s.envelopes, envelope] }))
    return envelope
  },

  rename: async (id: string, name: string) => {
    const { error } = await supabase
      .from('envelopes')
      .update({ name })
      .eq('id', id)
    if (error) throw new Error(error.message)
    set(s => ({
      envelopes: s.envelopes.map(e => e.id === id ? { ...e, name } : e),
    }))
  },

  remove: async (id: string) => {
    const { error } = await supabase
      .from('envelopes')
      .delete()
      .eq('id', id)
    if (error) throw new Error(error.message)
    set(s => ({ envelopes: s.envelopes.filter(e => e.id !== id) }))
  },
}))
