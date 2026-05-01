/**
 * Appearance Settings Page  (BRD §4.9, Step 14)
 *
 * Dark mode toggle (mirrors the SettingsHub toggle for direct navigation).
 */

import { ChevronLeft } from 'lucide-react'
import { Link }        from 'react-router-dom'
import { useTheme }    from '../../contexts/ThemeContext'

export function AppearancePage() {
  const { theme, toggleTheme } = useTheme()

  return (
    <div className="p-4 lg:p-6 max-w-2xl">
      <div className="page-header">
        <div className="flex items-center gap-2">
          <Link to="/settings" className="flex h-8 w-8 items-center justify-center rounded-md
            transition-colors hover:opacity-70" style={{ color: 'var(--text-subtle)' }}>
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <h1 className="page-title">Appearance</h1>
        </div>
      </div>

      <div className="card rounded-lg overflow-hidden">
        {/* Dark mode row */}
        <div className="flex items-center justify-between px-4 py-4">
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>Dark Mode</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {theme === 'dark'
                ? 'Dark theme is active'
                : 'Light theme is active — switch to dark for easier nighttime use'}
            </p>
          </div>
          <button
            onClick={toggleTheme}
            role="switch"
            aria-checked={theme === 'dark'}
            className="relative h-6 w-11 rounded-full transition-colors shrink-0"
            style={{ background: theme === 'dark' ? 'var(--pink)' : 'var(--border-2)' }}
          >
            <span
              className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform"
              style={{ transform: theme === 'dark' ? 'translateX(20px)' : 'translateX(0)' }}
            />
          </button>
        </div>

        {/* Colour preview swatches */}
        <div
          className="border-t px-4 py-4"
          style={{ borderColor: 'var(--border)' }}
        >
          <p className="text-xs mb-3 section-label">Colour palette</p>
          <div className="flex flex-wrap gap-2">
            {[
              { label: 'Background', token: 'var(--bg)' },
              { label: 'Surface',    token: 'var(--surface)' },
              { label: 'Surface 2',  token: 'var(--surface-2)' },
              { label: 'Pink',       token: 'var(--pink)' },
              { label: 'Success',    token: 'var(--success)' },
              { label: 'Danger',     token: 'var(--danger)' },
            ].map(({ label, token }) => (
              <div key={label} className="flex items-center gap-1.5">
                <span
                  className="h-4 w-4 rounded-full border"
                  style={{ background: token, borderColor: 'var(--border)' }}
                />
                <span className="text-xs" style={{ color: 'var(--text-subtle)' }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
