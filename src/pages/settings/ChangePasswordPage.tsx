/**
 * Change Password Settings Page  (BRD §4.9, Step 14)
 *
 * Form: current password, new password, confirm new password.
 * Inline strength indicator beneath the new password field.
 * Calls useAuthStore.changePassword() which hits the /auth/change-password edge function.
 */

import { useState }      from 'react'
import { ChevronLeft, Eye, EyeOff, CheckCircle2 } from 'lucide-react'
import { Link }          from 'react-router-dom'
import { useAuthStore }  from '../../stores/useAuthStore'
import { useToast }      from '../../contexts/ToastContext'

// ── Password strength ─────────────────────────────────────────────────────────

function passwordStrength(pw: string): { score: number; label: string; colour: string } {
  if (pw.length === 0) return { score: 0, label: '',        colour: 'var(--border)' }
  let score = 0
  if (pw.length >= 8)               score++
  if (pw.length >= 12)              score++
  if (/[A-Z]/.test(pw))            score++
  if (/[0-9]/.test(pw))            score++
  if (/[^A-Za-z0-9]/.test(pw))    score++

  if (score <= 1) return { score, label: 'Weak',   colour: 'var(--danger)' }
  if (score <= 3) return { score, label: 'Fair',    colour: 'var(--warning)' }
  if (score === 4) return { score, label: 'Good',   colour: '#f59e0b' }
  return                { score, label: 'Strong',  colour: 'var(--success)' }
}

// ── Show/hide input ───────────────────────────────────────────────────────────

function PasswordInput({
  label, value, onChange, placeholder,
}: {
  label:       string
  value:       string
  onChange:    (v: string) => void
  placeholder?: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>{label}</label>
      <div className="relative">
        <input
          className="input text-sm pr-10"
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={label.toLowerCase().includes('current') ? 'current-password' : 'new-password'}
        />
        <button
          type="button"
          className="absolute inset-y-0 right-3 flex items-center"
          style={{ color: 'var(--text-subtle)' }}
          onClick={() => setShow(s => !s)}
          tabIndex={-1}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export function ChangePasswordPage() {
  const { changePassword } = useAuthStore()
  const { toast }          = useToast()

  const [current,  setCurrent]  = useState('')
  const [next,     setNext]     = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [saving,   setSaving]   = useState(false)
  const [success,  setSuccess]  = useState(false)

  const strength = passwordStrength(next)
  const mismatch = confirm.length > 0 && next !== confirm

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!current.trim())        { toast('Enter your current password', 'error'); return }
    if (next.length < 8)        { toast('New password must be at least 8 characters', 'error'); return }
    if (next !== confirm)       { toast('Passwords do not match', 'error'); return }

    setSaving(true)
    try {
      await changePassword(current, next)
      setSuccess(true)
      setCurrent('')
      setNext('')
      setConfirm('')
      toast('Password changed successfully')
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to change password', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4 lg:p-6 max-w-md">
      <div className="page-header">
        <div className="flex items-center gap-2">
          <Link to="/settings" className="flex h-8 w-8 items-center justify-center rounded-md
            transition-colors hover:opacity-70" style={{ color: 'var(--text-subtle)' }}>
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <h1 className="page-title">Change Password</h1>
        </div>
      </div>

      {success && (
        <div
          className="mb-5 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium"
          style={{
            background:  'color-mix(in srgb, var(--success) 10%, transparent)',
            borderColor: 'var(--success)',
            color:       'var(--success)',
          }}
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Password changed successfully.
        </div>
      )}

      <form className="card rounded-lg p-5 flex flex-col gap-4" onSubmit={handleSubmit}>
        <PasswordInput
          label="Current password"
          value={current}
          onChange={setCurrent}
          placeholder="Enter current password"
        />

        <div>
          <PasswordInput
            label="New password"
            value={next}
            onChange={v => { setNext(v); setSuccess(false) }}
            placeholder="At least 8 characters"
          />
          {/* Strength bar */}
          {next.length > 0 && (
            <div className="mt-2">
              <div className="flex gap-1 mb-1">
                {[1, 2, 3, 4, 5].map(i => (
                  <div
                    key={i}
                    className="h-1 flex-1 rounded-full transition-colors"
                    style={{
                      background: i <= strength.score ? strength.colour : 'var(--border)',
                    }}
                  />
                ))}
              </div>
              <p className="text-xs" style={{ color: strength.colour }}>
                {strength.label}
              </p>
            </div>
          )}
        </div>

        <div>
          <PasswordInput
            label="Confirm new password"
            value={confirm}
            onChange={setConfirm}
            placeholder="Repeat new password"
          />
          {mismatch && (
            <p className="text-xs mt-1" style={{ color: 'var(--danger)' }}>
              Passwords do not match
            </p>
          )}
        </div>

        <div className="flex justify-end pt-1">
          <button type="submit" className="btn-primary" disabled={saving || mismatch}>
            {saving ? <span className="spinner" /> : null}
            Change password
          </button>
        </div>
      </form>
    </div>
  )
}
