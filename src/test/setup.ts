import '@testing-library/jest-dom'

// Provide Supabase env vars for tests (mirrors .env.local values)
// These are used by src/lib/supabase.ts via import.meta.env
Object.defineProperty(import.meta, 'env', {
  value: {
    ...import.meta.env,
    VITE_SUPABASE_URL:      'https://piaazdfouhzqnpkbbjuw.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'test-anon-key',
  },
  writable: true,
})
