import { createClient, SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL  as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// Lazily-resolved token getter — set by useAuthStore after login/verify.
// Using a getter rather than recreating the client keeps a single stable instance.
let _getToken: (() => string | null) = () => null

export function setTokenGetter(fn: () => string | null) {
  _getToken = fn
}

export const supabase: SupabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession:   false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (url, options = {}) => {
        const token = _getToken()
        const headers = new Headers((options as RequestInit).headers)
        if (token) headers.set('Authorization', `Bearer ${token}`)
        return fetch(url, { ...(options as RequestInit), headers })
      },
    },
  },
)
