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
    // maybeSingle() returns data:null (no error) when no row found,
    // unlike single() which throws PGRST116 for 0 rows.
    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle()
    if (error) {
      set({ isLoading: false, error: error.message })
    } else {
      set({ settings: data as Settings | null, isLoading: false })
    }
  },

  update: async (patch) => {
    // upsert creates the row (id=1) on first save if it doesn't exist yet.
    const { error } = await supabase
      .from('settings')
      .upsert({ id: 1, ...patch }, { onConflict: 'id' })
    if (error) throw new Error(error.message)
    set(s => ({
      settings: s.settings
        ? { ...s.settings, ...patch }
        : { id: 1, ...patch } as Settings,
    }))
  },
}))
