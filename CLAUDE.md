# BudgetPro — CLAUDE.md

Private household envelope-budgeting SPA. Users import bank CSV files, allocate transactions to envelopes, and track balances against paycheque allocations. Single-user, password-protected, Supabase-backed.

**Requirements:** `../Projects/budgetpro/BudgetPro_BRD_v22.docx` — the authoritative source for all business rules (allocation logic, import pipeline behaviour, transaction kinds, reconciliation, etc.). Check it before implementing any non-trivial feature.

---

## Tech stack

| Layer | Choice |
|---|---|
| UI | React 19, TypeScript, Tailwind CSS v3, Lucide icons |
| Routing | React Router v7 |
| State | Zustand v5 (stores) + React Context (UI state) |
| Backend | Supabase (PostgREST + Edge Functions for auth) |
| Build | Vite v8 |
| Tests | Vitest v4 + React Testing Library + MSW v2 |

---

## Project structure

```
src/
├── App.tsx                  # Route tree + context provider stack
├── main.tsx                 # React entry point
├── components/              # Shared UI components (modals, shell, sidebar)
├── contexts/                # ThemeContext, ToastContext, SaveContext
├── lib/
│   ├── supabase.ts          # Supabase client (custom auth header injection)
│   ├── balances.ts          # computeBalances, computeDisplayBalances
│   ├── formatters.ts        # formatCurrency, formatDate, KIND_LABELS
│   ├── importPipeline.ts    # CSV import orchestration
│   ├── allocations/         # Paycheque split calculator
│   └── csv/                 # detect → normalise → validate → duplicate → paycheque
├── pages/                   # Page components (Dashboard, Transactions, Reconcile)
│   └── settings/            # All settings sub-pages
├── stores/                  # Zustand stores (auth, envelopes, transactions, settings, bankAccounts)
├── types/
│   └── database.ts          # TypeScript interfaces for every DB table
└── test/
    ├── setup.ts             # jest-dom + Supabase env vars
    ├── server.ts            # MSW setupServer
    ├── handlers.ts          # MSW handlers + MOCK_* data fixtures
    ├── utils.tsx            # renderWithProviders, resetStores, seedStores
    └── integration/         # Integration test files (one per BRD flow)
```

---

## Development commands

```bash
# Install dependencies (use Origin Nexus registry — see .npmrc)
npm install

# Start dev server → http://localhost:5173
npm run dev

# Run tests (single pass)
npm test

# Run tests in watch mode
npm run test:watch

# Run a specific test file
npx vitest run src/test/integration/import.test.tsx

# Lint
npm run lint

# Production build (tsc + vite)
npm run build

# Preview production build locally
npm run preview
```

> **Package registry:** All npm packages must be installed via the internal Nexus registry at `https://nexus.apps.origin.com.au/repository/shared-npm-proxy/`. Never use the public npm registry directly.

---

## Code style & conventions

**Language:** TypeScript throughout. Strict mode (`noUnusedLocals`, `noUnusedParameters`). Target ES2023.

**Modules:** ES modules everywhere (`import`/`export`). No CommonJS.

**Naming:**
- Files: `PascalCase` for components/pages, `camelCase` for lib/utils
- React components: PascalCase
- Zustand stores: `useXxxStore` (hook-style)
- CSS custom properties for design tokens (e.g. `var(--pink)`, `var(--surface-2)`)

**Zustand stores:** All follow `create<State & Actions>((set, get) => ({ ...state, ...actions }))`. Direct Supabase calls live inside store actions — no separate service layer.

**Supabase auth:** Token is injected via a custom fetch wrapper in `src/lib/supabase.ts` using `x-bp-token` header. Never use Supabase's built-in session management.

**Currency:** Always use `formatCurrency(amount)` from `src/lib/formatters.ts` for display. Never use `.toFixed(2)` directly in UI components.

**Transaction kinds:** Use the `TransactionKind` union from `src/types/database.ts`. The `splits` field (JSON map of `envelope_id → amount`) is only populated for `paycheque` and `cash-income-split` kinds.

**Contexts:**
- `useSave()` → wrap async form saves in `withSave(async () => { ... })`. Never use `isSaving` as a setter.
- `useToast()` → `toast(message, variant?)` for user feedback.

---

## Testing approach

**Framework:** Vitest with `jsdom` environment. Tests use `globals: true` so `describe`/`it`/`expect` are available without importing.

**Where tests live:**
- `src/lib/allocations/__tests__/` — unit tests for the allocation calculator
- `src/lib/csv/__tests__/` — unit tests for CSV parsing pipeline
- `src/test/integration/` — integration tests per BRD flow (uses full component render + MSW)

**Integration test pattern:**
```ts
beforeAll(()  => server.listen({ onUnhandledRequest: 'warn' }))
afterEach(()  => { server.resetHandlers(); resetStores() })
afterAll(()   => server.close())
beforeEach(() => seedStores())   // pre-populates envelopes + settings
```

Use `renderWithProviders(<Component />)` — wraps in MemoryRouter + all context providers.

Use `server.use(http.get(...))` inside a test to override the default MSW handler for that test only.

**Run a specific test:**
```bash
npx vitest run src/test/integration/addTransaction.test.tsx
```

---

## Always do

- **Create a feature branch** before making any changes.
- **Run `npm test` after every change** before considering work done. All 69 tests must pass.
- **Run `npm run lint`** before committing. Fix all errors (warnings are acceptable).
- **Use `formatCurrency()`** for any monetary display value in the UI.
- **Wrap form saves in `withSave()`** from `SaveContext` so the sidebar spinner activates.
- **Add MSW handlers** in `src/test/handlers.ts` for any new Supabase table your code queries.

---

## Never do

- **Never commit directly to `main`.**
- **Never skip tests** when adding a new feature or fixing a bug.
- **Never use public npm registry** — always use the Nexus proxy.
- **Never use Supabase session management** (`signIn`, `signOut`, `onAuthStateChange`). Auth is handled entirely by `useAuthStore` + the `/auth` Edge Function.
- **Never store secrets or tokens in component state** — tokens live in `useAuthStore` and are injected by the Supabase client's fetch wrapper.
- **Never write raw `.toFixed(2)`** for currency display in UI — it skips thousands separators and breaks consistency.
- **Never add top-level allocations to a child envelope** in allocation tests or paycheque split logic — only top-level envelopes contribute to the footer total.
