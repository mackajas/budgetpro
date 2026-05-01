import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { Settings } from '../types/database'

interface SettingsState {
  settings:  Settings | null
  isLoading: boolean
  error:     string | null
}

interface SettingsActions {
  fetch:  () => Promise<void>
  update: (patch: Partial<Omit<Settings, 'id'>>) => Promise<void>
}

export const useSettingsStore = create<SettingsState & SettingsActions>((set) => ({
  settings:  null,
  isLoading: false,
  error:     null,

  fetch: async () => {
    set({ isLoading: true, error: null })
    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .eq('id', 1)
      .single()
    if (error) {
      set({ isLoading: false, error: error.message })
    } else {
      set({ settings: data as Settings, isLoading: false })
    }
  },

  update: async (patch) => {
    const { error } = await supabase
      .from('settings')
      .update(patch)
      .eq('id', 1)
    if (error) throw new Error(error.message)
    set(s => ({
      settings: s.settings ? { ...s.settings, ...patch } : s.settings,
    }))
  },
}))
