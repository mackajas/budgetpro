import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { CheckCircle, XCircle, AlertCircle, X } from 'lucide-react'

type ToastVariant = 'success' | 'error' | 'warning'

interface Toast {
  id:      string
  message: string
  variant: ToastVariant
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} })

const ICONS: Record<ToastVariant, React.ComponentType<{ className?: string }>> = {
  success: CheckCircle,
  error:   XCircle,
  warning: AlertCircle,
}

const ICON_COLOURS: Record<ToastVariant, string> = {
  success: 'text-emerald-400',
  error:   'text-red-400',
  warning: 'text-amber-400',
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const dismiss = useCallback((id: string) => {
    clearTimeout(timers.current[id])
    delete timers.current[id]
    setToasts(ts => ts.filter(t => t.id !== id))
  }, [])

  const toast = useCallback((message: string, variant: ToastVariant = 'success') => {
    const id = crypto.randomUUID()
    setToasts(ts => [...ts, { id, message, variant }])
    timers.current[id] = setTimeout(() => dismiss(id), 3200)
  }, [dismiss])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast container — top-right */}
      <div className="fixed right-4 top-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => {
          const Icon = ICONS[t.variant]
          return (
            <div key={t.id} className="toast animate-fade-in">
              <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${ICON_COLOURS[t.variant]}`} />
              <span className="flex-1 text-sm">{t.message}</span>
              <button
                onClick={() => dismiss(t.id)}
                className="pointer-events-auto -mr-1 -mt-1 rounded p-1 opacity-50 hover:opacity-100 transition-opacity"
                aria-label="Dismiss"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
