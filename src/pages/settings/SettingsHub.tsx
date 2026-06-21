import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useTheme } from '../../contexts/ThemeContext'

const LINK_GROUPS = [
  {
    title: 'Transactions',
    pages: [
      { to: '/settings/ignored', label: 'Ignored', desc: 'Review transactions excluded from calculations' },
      { to: '/settings/rules',   label: 'Rules',   desc: 'Keyword rules for auto-categorising transactions' },
    ],
  },
  {
    title: 'Envelopes',
    pages: [
      { to: '/settings/envelopes',        label: 'Manage Envelopes', desc: 'Add, rename, and organise budget envelopes' },
      { to: '/settings/opening-balances', label: 'Opening Balances', desc: 'Set initial envelope balances' },
      { to: '/settings/expenses',         label: 'Expenses',         desc: 'Document recurring committed expenses' },
    ],
  },
  {
    title: 'Salary',
    pages: [
      { to: '/settings/paycheque',   label: 'Paycheque',   desc: 'Employer names, keywords, and pay amounts' },
      { to: '/settings/allocations', label: 'Allocations', desc: 'Configure how each paycheque is split' },
    ],
  },
  {
    title: 'Account',
    pages: [
      { to: '/settings/change-password', label: 'Change Password', desc: 'Update the household password' },
    ],
  },
]

export function SettingsHub() {
  const { theme, toggleTheme } = useTheme()

  return (
    <div className="p-4 lg:p-6 max-w-2xl">
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
      </div>

      {LINK_GROUPS.map(({ title, pages }) => (
        <div key={title} className="mb-6">
          <p
            className="text-xs font-semibold uppercase tracking-wide mb-2 px-1"
            style={{ color: 'var(--text-muted)' }}
          >
            {title}
          </p>
          <div className="card overflow-hidden rounded-lg">
            {pages.map(({ to, label, desc }, i) => (
              <Link
                key={to}
                to={to}
                className="flex items-center justify-between px-4 py-3.5 transition-colors hover:opacity-80"
                style={{
                  borderBottom: i < pages.length - 1 ? '1px solid var(--border)' : 'none',
                }}
              >
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{label}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{desc}</p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0" style={{ color: 'var(--text-subtle)' }} />
              </Link>
            ))}
          </div>
        </div>
      ))}

      {/* App group — toggle rows only */}
      <div className="mb-6">
        <p
          className="text-xs font-semibold uppercase tracking-wide mb-2 px-1"
          style={{ color: 'var(--text-muted)' }}
        >
          App
        </p>
        <div className="card overflow-hidden rounded-lg">
          <div className="flex items-center justify-between px-4 py-3.5">
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>Dark Mode</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {theme === 'dark' ? 'Currently dark' : 'Currently light'}
              </p>
            </div>
            <button
              onClick={toggleTheme}
              role="switch"
              aria-checked={theme === 'dark'}
              aria-label="Toggle dark mode"
              className="relative h-6 w-11 rounded-full transition-colors"
              style={{ background: theme === 'dark' ? 'var(--pink)' : 'var(--border-2)' }}
            >
              <span
                className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform"
                style={{ transform: theme === 'dark' ? 'translateX(20px)' : 'translateX(0)' }}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
