import { FormEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Lock } from 'lucide-react'
import { useAuthStore } from '../stores/useAuthStore'

export function LoginPage() {
  const [password, setPassword]   = useState('')
  const [visible,  setVisible]    = useState(false)
  const { login, isLoading, isAuthenticated, error, clearError } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => {
    if (isAuthenticated) navigate('/', { replace: true })
  }, [isAuthenticated, navigate])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    await login(password)
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center p-4"
      style={{ background: 'var(--bg)' }}
    >
      <div className="w-full max-w-sm">
        {/* Logo / wordmark */}
        <div className="mb-8 text-center">
          <div
            className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl"
            style={{ background: 'var(--pink)' }}
          >
            <Lock className="h-6 w-6 text-white" />
          </div>
          <h1
            className="text-2xl font-semibold tracking-tight"
            style={{ color: 'var(--text)' }}
          >
            BudgetPro
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
            Enter your household password to continue
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="card rounded-xl p-6 shadow-sm"
        >
          <div className="mb-4">
            <label
              htmlFor="password"
              className="mb-1.5 block text-sm font-medium"
              style={{ color: 'var(--text)' }}
            >
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={visible ? 'text' : 'password'}
                value={password}
                onChange={e => { setPassword(e.target.value); clearError() }}
                className="input pr-10"
                placeholder="Enter password"
                autoFocus
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setVisible(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-100 transition-opacity"
                aria-label={visible ? 'Hide password' : 'Show password'}
              >
                {visible
                  ? <EyeOff className="h-4 w-4" style={{ color: 'var(--text-muted)' }} />
                  : <Eye    className="h-4 w-4" style={{ color: 'var(--text-muted)' }} />
                }
              </button>
            </div>
          </div>

          {error && (
            <p className="mb-4 rounded-md px-3 py-2 text-sm text-red-400"
               style={{ background: 'color-mix(in srgb, #F87171 12%, transparent)' }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isLoading || !password}
            className="btn-primary w-full justify-center"
          >
            {isLoading
              ? <><span className="spinner" />Signing in…</>
              : 'Sign in'
            }
          </button>
        </form>
      </div>
    </div>
  )
}
