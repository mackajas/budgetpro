/**
 * Edit Bank Account Modal
 *
 * Unified editor for a bank account's name, colour, type (icon), and balance.
 * Also handles delete-with-confirmation.
 */

import { useState }     from 'react'
import {
  Landmark, PiggyBank, CreditCard, Wallet, Banknote,
  Home, TrendingUp, Smartphone, ShoppingCart,
  type LucideIcon,
} from 'lucide-react'
import { useBankAccountStore } from '../stores/useBankAccountStore'
import { useToast }            from '../contexts/ToastContext'
import type { BankAccount }    from '../types/database'

// ── Account type config ───────────────────────────────────────────────────────

interface AccountTypeEntry {
  label: string
  Icon:  LucideIcon
}

export const ACCOUNT_TYPE_CONFIG: Record<string, AccountTypeEntry> = {
  bank:        { label: 'Bank',         Icon: Landmark    },
  savings:     { label: 'Savings',      Icon: PiggyBank   },
  credit_card: { label: 'Credit Card',  Icon: CreditCard  },
  wallet:      { label: 'Wallet',       Icon: Wallet      },
  cash:        { label: 'Cash',         Icon: Banknote    },
  home_loan:   { label: 'Home Loan',    Icon: Home        },
  investment:  { label: 'Investment',   Icon: TrendingUp  },
  digital:     { label: 'Digital Bank', Icon: Smartphone  },
  store_card:  { label: 'Store Card',   Icon: ShoppingCart },
}

/** Returns the Lucide icon component for a given account_type value. */
export function accountTypeIcon(type: string | null | undefined): LucideIcon {
  return ACCOUNT_TYPE_CONFIG[type ?? 'bank']?.Icon ?? Landmark
}

// ── Modal ─────────────────────────────────────────────────────────────────────

interface Props {
  account: BankAccount
  onClose: () => void
}

export function EditBankAccountModal({ account, onClose }: Props) {
  const { updateAccount, remove } = useBankAccountStore()
  const { toast }                 = useToast()

  const [name,        setName]        = useState(account.name)
  const [color,       setColor]       = useState(account.badge_color  ?? '#9CA3AF')
  const [accountType, setAccountType] = useState(account.account_type ?? 'bank')
  const [balance,     setBalance]     = useState(
    account.balance !== null ? String(account.balance) : '',
  )

  const [saving,       setSaving]       = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting,      setDeleting]     = useState(false)

  const TypeIcon = accountTypeIcon(accountType)

  async function handleSave() {
    if (!name.trim()) { toast('Name is required', 'error'); return }
    setSaving(true)
    try {
      const patch: Parameters<typeof updateAccount>[1] = {
        name:         name.trim(),
        badge_color:  color,
        account_type: accountType,
      }
      if (balance.trim() !== '') {
        const num = parseFloat(balance)
        if (isNaN(num)) { toast('Enter a valid balance', 'error'); setSaving(false); return }
        patch.balance = num
      }
      await updateAccount(account.id, patch)
      toast('Account updated')
      onClose()
    } catch {
      toast('Failed to update account', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await remove(account.id)
      toast('Account deleted')
      onClose()
    } catch {
      toast('Failed to delete account', 'error')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>

        <h2 className="text-base font-semibold mb-5" style={{ color: 'var(--text)' }}>
          Edit Account
        </h2>

        {/* Name */}
        <div className="mb-4">
          <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>
            Account name
          </label>
          <input
            className="input text-sm w-full"
            value={name}
            onChange={e => setName(e.target.value)}
            autoFocus
            maxLength={50}
            placeholder="Account name"
          />
        </div>

        {/* Type */}
        <div className="mb-4">
          <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>
            Account type
          </label>
          <div className="flex items-center gap-2">
            <TypeIcon className="h-4 w-4 shrink-0" style={{ color: 'var(--text-subtle)' }} />
            <select
              className="select text-sm flex-1"
              value={accountType}
              onChange={e => setAccountType(e.target.value)}
            >
              {Object.entries(ACCOUNT_TYPE_CONFIG).map(([value, { label }]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Colour */}
        <div className="mb-4">
          <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>
            Label colour
          </label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={color}
              onChange={e => setColor(e.target.value)}
              className="h-8 w-14 cursor-pointer rounded border-0 p-0.5"
              style={{ background: 'none' }}
            />
            <span className="text-xs font-mono" style={{ color: 'var(--text-subtle)' }}>
              {color}
            </span>
            <span
              className="text-xs font-medium ml-auto"
              style={{ color, fontWeight: 500 }}
            >
              {name || 'Preview'}
            </span>
          </div>
        </div>

        {/* Balance */}
        <div className="mb-6">
          <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>
            Current balance ($)
          </label>
          <div className="relative">
            <span
              className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm"
              style={{ color: 'var(--text-subtle)' }}
            >$</span>
            <input
              className="input pl-7 text-sm w-full"
              type="number"
              step="0.01"
              value={balance}
              onChange={e => setBalance(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
              placeholder="0.00"
            />
          </div>
        </div>

        {/* Footer: Save / Cancel */}
        <div className="flex justify-end gap-2 mb-5">
          <button className="btn-ghost" onClick={onClose} disabled={saving || deleting}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleSave} disabled={saving || deleting}>
            {saving ? <span className="spinner" /> : null}
            Save
          </button>
        </div>

        {/* Delete section */}
        <div
          className="border-t pt-4"
          style={{ borderColor: 'var(--border)' }}
        >
          {confirmDelete ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs" style={{ color: 'var(--danger)' }}>
                Delete <strong>{account.name}</strong>? This cannot be undone.
              </p>
              <div className="flex gap-2">
                <button
                  className="btn-danger text-xs px-3 py-1.5"
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting ? <span className="spinner" /> : null}
                  Yes, delete
                </button>
                <button
                  className="btn-ghost text-xs px-3 py-1.5"
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleting}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              className="text-xs transition-opacity hover:opacity-70"
              style={{ color: 'var(--danger)' }}
              onClick={() => setConfirmDelete(true)}
            >
              Delete account
            </button>
          )}
        </div>

      </div>
    </div>
  )
}
