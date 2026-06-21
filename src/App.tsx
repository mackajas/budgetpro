import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ThemeProvider }       from './contexts/ThemeContext'
import { ToastProvider }       from './contexts/ToastContext'
import { SaveProvider }        from './contexts/SaveContext'
import { ProtectedRoute }      from './components/ProtectedRoute'
import { AppShell }            from './components/AppShell'
import { LoginPage }           from './pages/LoginPage'
import { DashboardPage }       from './pages/DashboardPage'
import { TransactionsPage }    from './pages/TransactionsPage'
import { ReconcilePage }       from './pages/ReconcilePage'
import { ExpensesPage }        from './pages/ExpensesPage'
import { SettingsHub }         from './pages/settings/SettingsHub'
import { EnvelopesPage }       from './pages/settings/EnvelopesPage'
import { PaychequePage }       from './pages/settings/PaychequePage'
import { AllocationsPage }     from './pages/settings/AllocationsPage'
import { OpeningBalancesPage } from './pages/settings/OpeningBalancesPage'
import { IgnoredPage }         from './pages/settings/IgnoredPage'
import { BankAccountsPage }    from './pages/settings/BankAccountsPage'
import { AppearancePage }      from './pages/settings/AppearancePage'
import { ChangePasswordPage }  from './pages/settings/ChangePasswordPage'
import { RulesPage }           from './pages/settings/RulesPage'
import { useAuthStore }        from './stores/useAuthStore'

function AuthInit({ children }: { children: React.ReactNode }) {
  const verify = useAuthStore(s => s.verify)
  useEffect(() => { verify() }, [verify])
  return <>{children}</>
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <SaveProvider>
          <BrowserRouter>
            <AuthInit>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route
                  element={
                    <ProtectedRoute>
                      <AppShell />
                    </ProtectedRoute>
                  }
                >
                  <Route index               element={<DashboardPage />} />
                  <Route path="transactions" element={<TransactionsPage />} />
                  <Route path="reconcile"    element={<ReconcilePage />} />
                  <Route path="expenses"     element={<ExpensesPage />} />

                  {/* Settings */}
                  <Route path="settings"                      element={<SettingsHub />} />
                  <Route path="settings/envelopes"            element={<EnvelopesPage />} />
                  <Route path="settings/paycheque"            element={<PaychequePage />} />
                  <Route path="settings/allocations"          element={<AllocationsPage />} />
                  <Route path="settings/opening-balances"     element={<OpeningBalancesPage />} />
                  <Route path="settings/ignored"              element={<IgnoredPage />} />
                  <Route path="settings/bank-accounts"        element={<BankAccountsPage />} />
                  <Route path="settings/appearance"           element={<AppearancePage />} />
                  <Route path="settings/change-password"      element={<ChangePasswordPage />} />
                  <Route path="settings/rules"                element={<RulesPage />} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </AuthInit>
          </BrowserRouter>
        </SaveProvider>
      </ToastProvider>
    </ThemeProvider>
  )
}
