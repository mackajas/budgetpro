import { Outlet } from 'react-router-dom'
import { Sidebar }    from './Sidebar'
import { MobileNav }  from './MobileNav'
import { useSave }    from '../contexts/SaveContext'

export function AppShell() {
  const { isSaving } = useSave()

  return (
    <div className="flex h-screen overflow-hidden w-full" style={{ background: 'var(--bg)' }}>
      <Sidebar isSaving={isSaving} />
      <main className="flex-1 overflow-y-auto pb-16 lg:pb-0">
        <Outlet />
      </main>
      <MobileNav />
    </div>
  )
}
