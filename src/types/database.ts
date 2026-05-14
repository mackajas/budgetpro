// Database types derived from schema.sql

export type TransactionKind =
  | 'paycheque'
  | 'expense'
  | 'cash-income'
  | 'cash-income-split'
  | 'income-other'
  | 'opening-balance'
  | 'ignored'
  | 'move-money'

export type HowCategorised =
  | 'auto-paycheque'
  | 'auto'
  | 'manual'
  | 'split'
  | 'review'

export type AllocationSource = 'default' | 'manual' | 'learned'
export type AllocationType   = 'fixed' | 'percentage'

export interface Envelope {
  id:            string
  name:          string
  display_order: number
  parent_id:     string | null
}

export interface Transaction {
  id:              string
  date:            string        // ISO date YYYY-MM-DD
  description:     string
  amount:          number
  kind:            TransactionKind
  envelope_id:     string | null
  splits:          Record<string, number> | null  // { envelope_id: amount }
  how_categorised: HowCategorised | null
  review:          boolean
  notes:           string | null
  import_batch_id:  string | null
  bank_account_id:  string | null
  deleted:          boolean
  imported_at:      string | null
}

export interface EnvelopeAllocation {
  envelope_id:     string
  employer_id:     1 | 2
  allocation_type: AllocationType
  value:           number
  updated_at:      string
}

export interface CategoryRule {
  id:          string
  keyword:     string
  envelope_id: string | null  // null = ignore rule (no envelope assignment)
  source:      AllocationSource
  priority:    number
  created_at:  string
}

export interface BankAccount {
  id:                 string
  name:               string
  balance:            number | null
  balance_updated_at: string | null
  created_at:         string
}

export interface ReconciliationRecord {
  id:               string
  reconciled_at:    string
  bank_total:       number
  envelope_total:   number
  gap:              number
  is_balanced:      boolean
  notes:            string | null
  account_snapshot: Array<{ account_name: string; balance: number }> | null
  created_at:       string
}

export interface Settings {
  id:                       1
  password_hash:            string | null
  featured_envelope_1_id:   string | null
  featured_envelope_2_id:   string | null
  featured_envelope_3_id:   string | null
  employer_name_1:          string | null
  employer_1_gross:         number | null
  employer_1_keyword:       string | null
  employer_name_2:          string | null
  employer_2_pay_1:         number | null
  employer_2_pay_1_keyword: string | null
  employer_2_pay_2:         number | null
  employer_2_pay_2_keyword: string | null
  pay_frequency:            string
  default_bank_format:      string
}
