import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, ArrowLeftRight, RefreshCcw, Settings, LogOut, Loader2
} from 'lucide-react'
import { useAuthStore } from '../stores/useAuthStore'

const NAV = [
  { to: '/',            label: 'Dashboard',    Icon: LayoutDashboard },
  { to: '/transactions', label: 'Transactions', Icon: ArrowLeftRight  },
  { to: '/reconcile',   label: 'Reconcile',    Icon: RefreshCcw       },
  { to: '/settings',    label: 'Settings',     Icon: Settings         },
]

interface Props {
  isSaving: boolean
}

export function Sidebar({ isSaving }: Props) {
  const { logout } = useAuthStore()
  const navigate   = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <nav
      className="hidden lg:flex h-full shrink-0 flex-col border-r py-5"
      style={{
        width:           'var(--sidebar-w)',
        background:      'var(--surface)',
        borderColor:     'var(--border)',
      }}
    >
      {/* Wordmark */}
      <div className="mb-6 px-4 flex items-center justify-between">
        <span className="text-base font-semibold" style={{ color: 'var(--text)' }}>
          Budget<span style={{ color: 'var(--pink)' }}>Pro</span>
        </span>
        {isSaving && (
          <Loader2
            className="h-3.5 w-3.5 animate-spin"
            style={{ color: 'var(--text-subtle)' }}
            aria-label="Saving…"
          />
        )}
      </div>

      {/* Nav links */}
      <ul className="flex flex-1 flex-col gap-0.5 px-2">
        {NAV.map(({ to, label, Icon }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `nav-link${isActive ? ' active' : ''}`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={`nav-icon h-4 w-4 shrink-0 ${isActive ? '' : 'opacity-60'}`}
                  />
                  {label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>

      {/* Logout */}
      <div className="px-2">
        <button
          onClick={handleLogout}
          className="nav-link w-full text-left"
        >
          <LogOut className="h-4 w-4 shrink-0 opacity-60" />
          Sign out
        </button>
      </div>
    </nav>
  )
}
