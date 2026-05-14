import { createContext, useCallback, useContext, useRef, useState } from 'react'

interface SaveContextValue {
  isSaving:   boolean
  withSave:   <T>(fn: () => Promise<T>) => Promise<T>
}

const SaveContext = createContext<SaveContextValue>({
  isSaving: false,
  withSave: async fn => fn(),
})

export function SaveProvider({ children }: { children: React.ReactNode }) {
  const [count, setCount]   = useState(0)
  const isSaving            = count > 0
  const inc = useCallback(() => setCount(n => n + 1), [])
  const dec = useCallback(() => setCount(n => Math.max(0, n - 1)), [])
  const pendingRef = useRef(0)

  const withSave = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    pendingRef.current++
    inc()
    try {
      return await fn()
    } finally {
      pendingRef.current--
      dec()
    }
  }, [inc, dec])

  return (
    <SaveContext.Provider value={{ isSaving, withSave }}>
      {children}
    </SaveContext.Provider>
  )
}

export const useSave = () => useContext(SaveContext)
