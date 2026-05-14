/**
 * Bank Accounts Settings Page  (BRD §4.9, Step 14)
 *
 * Add and delete bank accounts used in reconciliation.
 * Balance editing is done on the Reconcile page.
 */

import { useEffect, useState }      from 'react'
import { ChevronLeft, Plus, Trash2 } from 'lucide-react'
import { Link }                      from 'react-router-dom'
import { useBankAccountStore }       from '../../stores/useBankAccountStore'
import { useToast }                  from '../../contexts/ToastContext'
import { formatCurrency, formatDate } from '../../lib/formatters'

export function BankAccountsPage() {
  const { accounts, isLoading, fetch, add, remove, updateBadgeColor } = useBankAccountStore()
  const { toast } = useToast()

  const [newName,    setNewName]    = useState('')
  const [adding,     setAdding]     = useState(false)
  const [confirmId,  setConfirmId]  = useState<string | null>(null)
  const [deleting,   setDeleting]   = useState<string | null>(null)

  useEffect(() => { fetch() }, [fetch])

  async function handleAdd() {
    if (!newName.trim()) { toast('Enter an account name', 'error'); return }
    setAdding(true)
    try {
      await add(newName.trim())
      setNewName('')
      toast('Account added')
    } catch {
      toast('Failed to add account', 'error')
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    try {
      await remove(id)
      toast('Account deleted')
    } catch {
      toast('Failed to delete account', 'error')
    } finally {
      setDeleting(null)
      setConfirmId(null)
    }
  }

  return (
    <div className="p-4 lg:p-6 max-w-2xl">
      <div className="page-header">
        <div className="flex items-center gap-2">
          <Link to="/settings" className="flex h-8 w-8 items-center justify-center rounded-md
            transition-colors hover:opacity-70" style={{ color: 'var(--text-subtle)' }}>
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <h1 className="page-title">Bank Accounts</h1>
        </div>
      </div>

      <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>
        Manage the bank accounts used in reconciliation.
        Update account balances on the{' '}
        <Link to="/reconcile" style={{ color: 'var(--pink)' }}>Reconcile</Link>{' '}
        page.
      </p>

      {/* Add new account */}
      <div className="flex gap-2 mb-5">
        <input
          className="input text-sm flex-1"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
          placeholder="Account name (e.g. Everyday account)"
        />
        <button className="btn-primary" onClick={handleAdd} disabled={adding}>
          {adding ? <span className="spinner" /> : <Plus className="h-4 w-4" />}
          Add
        </button>
      </div>

      {isLoading && (
        <div className="card p-8 flex justify-center">
          <span className="spinner" style={{ color: 'var(--text-subtle)' }} />
        </div>
      )}

      {!isLoading && accounts.length === 0 && (
        <div className="card">
          <div className="empty-state py-10">
            <p className="empty-state-title">No bank accounts</p>
            <p className="empty-state-body">Add an account above to get started.</p>
          </div>
        </div>
      )}

      {!isLoading && accounts.length > 0 && (
        <div className="card overflow-hidden">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="flex items-center gap-3 px-4 py-3 text-sm border-b last:border-b-0"
              style={{ borderColor: 'var(--border)' }}
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium" style={{ color: 'var(--text)' }}>
                  {account.name}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-subtle)' }}>
                  {account.balance !== null
                    ? `Balance: ${formatCurrency(account.balance)}${account.balance_updated_at
                        ? ` · Updated ${formatDate(account.balance_updated_at.slice(0, 10))}`
                        : ''}`
                    : 'No balance recorded'}
                </p>
              </div>

              {/* Badge colour picker */}
              <label
                className="flex items-center gap-1.5 cursor-pointer"
                title="Label colour"
              >
                <span className="text-xs" style={{ color: 'var(--text-subtle)' }}>Colour</span>
                <input
                  type="color"
                  value={account.badge_color ?? '#9CA3AF'}
                  onChange={e => {
                    updateBadgeColor(account.id, e.target.value).catch(() =>
                      toast('Failed to update colour', 'error')
                    )
                  }}
                  className="h-6 w-6 cursor-pointer rounded border-0 p-0"
                  style={{ background: 'none' }}
                />
              </label>

              {/* Delete / Confirm */}
              {confirmId === account.id ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: 'var(--danger)' }}>Delete?</span>
                  <button
                    className="text-xs font-medium transition-opacity hover:opacity-70"
                    style={{ color: 'var(--danger)' }}
                    onClick={() => handleDelete(account.id)}
                    disabled={deleting === account.id}
                  >
                    {deleting === account.id ? <span className="spinner" /> : 'Yes'}
                  </button>
                  <button
                    className="text-xs transition-opacity hover:opacity-70"
                    style={{ color: 'var(--text-subtle)' }}
                    onClick={() => setConfirmId(null)}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  className="flex items-center gap-1 text-xs transition-opacity hover:opacity-70"
                  style={{ color: 'var(--text-subtle)' }}
                  onClick={() => setConfirmId(account.id)}
                  aria-label={`Delete ${account.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
