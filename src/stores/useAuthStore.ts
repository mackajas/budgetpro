import { create } from 'zustand'
import { setTokenGetter } from '../lib/supabase'

const AUTH_BASE    = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auth`
const STORAGE_KEY  = 'bp_session'

interface StoredSession {
  token:     string
  expiresAt: number
}

interface AuthState {
  token:           string | null
  expiresAt:       number | null   // ms timestamp
  isAuthenticated: boolean
  isLoading:       boolean
  error:           string | null
}

interface AuthActions {
  verify:         () => Promise<void>
  login:          (password: string) => Promise<void>
  logout:         () => Promise<void>
  changePassword: (current: string, next: string) => Promise<void>
  clearError:     () => void
}

type AuthStore = AuthState & AuthActions

function hydrate(token: string, expiresAt: number) {
  setTokenGetter(() => token)
  return { token, expiresAt, isAuthenticated: true, isLoading: false, error: null }
}

function saveSession(token: string, expiresAt: number) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, expiresAt } satisfies StoredSession))
  } catch { /* storage full or blocked */ }
}

function clearSession() {
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
}

function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const s: StoredSession = JSON.parse(raw)
    if (typeof s.token !== 'string' || typeof s.expiresAt !== 'number') return null
    return s
  } catch { return null }
}

export const useAuthStore = create<AuthStore>((set, get) => {
  // Wire up the token getter once on store creation
  setTokenGetter(() => get().token)

  return {
    token:           null,
    expiresAt:       null,
    isAuthenticated: false,
    isLoading:       true,   // true on mount until verify completes
    error:           null,

    // Restore session from localStorage on app start.
    // No network call needed — token expiry is self-contained in the JWT payload.
    verify: async () => {
      set({ isLoading: true, error: null })
      const session = loadSession()
      if (session && session.expiresAt > Date.now()) {
        set(hydrate(session.token, session.expiresAt))
      } else {
        clearSession()
        setTokenGetter(() => null)
        set({ token: null, expiresAt: null, isAuthenticated: false, isLoading: false })
      }
    },

    login: async (password: string) => {
      set({ isLoading: true, error: null })
      try {
        const res = await fetch(`${AUTH_BASE}/login`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ password }),
        })
        const data = await res.json()
        if (res.ok) {
          saveSession(data.token, data.expiresAt)
          set(hydrate(data.token, data.expiresAt))
        } else {
          set({ isLoading: false, error: data.error ?? 'Login failed' })
        }
      } catch {
        set({ isLoading: false, error: 'Network error — check your connection' })
      }
    },

    logout: async () => {
      clearSession()
      setTokenGetter(() => null)
      set({ token: null, expiresAt: null, isAuthenticated: false, isLoading: false, error: null })
    },

    changePassword: async (current: string, next: string) => {
      const token = get().token
      const res = await fetch(`${AUTH_BASE}/change-password`, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          // Use x-bp-token instead of Authorization to avoid Supabase gateway
          // rejecting our custom JWT (gateway validates Bearer tokens as Supabase JWTs)
          ...(token ? { 'x-bp-token': token } : {}),
        },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Password change failed')
      }
    },

    clearError: () => set({ error: null }),
  }
})
