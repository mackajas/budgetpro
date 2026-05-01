import { NavLink } from 'react-router-dom'
import { LayoutDashboard, ArrowLeftRight, RefreshCcw, Settings } from 'lucide-react'

const NAV = [
  { to: '/',             label: 'Dashboard',    Icon: LayoutDashboard },
  { to: '/transactions', label: 'Transactions', Icon: ArrowLeftRight  },
  { to: '/reconcile',    label: 'Reconcile',    Icon: RefreshCcw      },
  { to: '/settings',     label: 'Settings',     Icon: Settings        },
]

export function MobileNav() {
  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 flex border-t"
      style={{
        background:  'var(--surface)',
        borderColor: 'var(--border)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {NAV.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className="flex flex-1 flex-col items-center gap-0.5 py-2 px-1 text-xs font-medium transition-colors"
          style={({ isActive }) => ({
            color: isActive ? 'var(--pink)' : 'var(--text-subtle)',
          })}
        >
          <Icon className="h-5 w-5" />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
