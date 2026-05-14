-- BudgetPro schema
-- Run this against your Supabase project via the SQL editor.
-- Tables are created in FK dependency order.
-- APP_PASSWORD_HASH must be set as a Supabase config parameter before running:
--   ALTER DATABASE postgres SET app.password_hash = '<your-bcrypt-hash>';

-- ── Extensions ────────────────────────────────────────────────────────────
create extension if not exists "pgcrypto";

-- ── 1. envelopes ─────────────────────────────────────────────────────────
create table if not exists envelopes (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  display_order integer not null default 0,
  parent_id    uuid references envelopes(id) on delete restrict
);

-- ── 2. transactions ───────────────────────────────────────────────────────
create table if not exists transactions (
  id              uuid primary key default gen_random_uuid(),
  date            date not null,
  description     text not null,
  amount          numeric(12,2) not null,
  kind            text not null check (kind in (
                    'paycheque','expense','cash-income','cash-income-split',
                    'income-other','opening-balance','ignored','move-money'
                  )),
  envelope_id     uuid references envelopes(id) on delete set null,
  splits          jsonb,
  how_categorised text check (how_categorised in (
                    'auto-paycheque','auto','manual','split','review'
                  )),
  review          boolean not null default false,
  notes           text,
  import_batch_id uuid,
  deleted         boolean not null default false,
  imported_at     timestamptz default now()
);

create index if not exists transactions_date_idx       on transactions(date);
create index if not exists transactions_envelope_idx   on transactions(envelope_id);
create index if not exists transactions_review_idx     on transactions(review) where review = true;
create index if not exists transactions_deleted_idx    on transactions(deleted) where deleted = false;

-- ── RPC: transactions for a specific envelope (includes split rows) ───────────
-- Returns rows where envelope_id matches OR the envelope appears as a key
-- in the splits JSONB map (paycheque / cash-income-split transactions).
create or replace function transactions_for_envelope(
  p_envelope_id text,
  p_kind        text    default null,
  p_date_from   date    default null,
  p_date_to     date    default null,
  p_search      text    default null,
  p_limit       integer default 50,
  p_offset      integer default 0
)
returns setof transactions
language sql
stable
security invoker
as $$
  select * from transactions
  where deleted = false
    and (
      envelope_id = p_envelope_id::uuid
      or (splits is not null and splits ? p_envelope_id)
    )
    and (p_kind is null      or kind = p_kind)
    and (p_kind is not null  or kind != 'ignored')
    and (p_date_from is null or date >= p_date_from)
    and (p_date_to   is null or date <= p_date_to)
    and (p_search    is null or description ilike '%' || p_search || '%')
  order by date desc
  limit  p_limit
  offset p_offset
$$;

-- ── 3. envelope_allocations ───────────────────────────────────────────────
create table if not exists envelope_allocations (
  envelope_id     uuid not null references envelopes(id) on delete cascade,
  employer_id     integer not null check (employer_id in (1, 2)),
  allocation_type text not null check (allocation_type in ('fixed','percentage')),
  value           numeric(12,2) not null,
  updated_at      timestamptz not null default now(),
  primary key (envelope_id, employer_id)
);

-- ── 4. category_rules ────────────────────────────────────────────────────
create table if not exists category_rules (
  id          uuid primary key default gen_random_uuid(),
  keyword     text not null,
  envelope_id uuid references envelopes(id) on delete cascade,
  source      text not null check (source in ('default','manual','learned')),
  priority    integer not null default 100,
  created_at  timestamptz not null default now()
);

create index if not exists category_rules_priority_idx on category_rules(priority);

-- ── 5. bank_accounts ─────────────────────────────────────────────────────
create table if not exists bank_accounts (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null check (char_length(name) <= 50),
  balance            numeric(10,2),
  balance_updated_at timestamptz,
  badge_color        text,
  account_type       text,
  created_at         timestamptz not null default now()
);

-- ── 6. reconciliation_history ─────────────────────────────────────────────
create table if not exists reconciliation_history (
  id               uuid primary key default gen_random_uuid(),
  reconciled_at    timestamptz not null,
  bank_total       numeric(12,2) not null,
  envelope_total   numeric(12,2) not null,
  gap              numeric(12,2) not null generated always as (bank_total - envelope_total) stored,
  is_balanced      boolean not null,
  notes            text,
  account_snapshot jsonb,
  created_at       timestamptz not null default now()
);

create index if not exists reconciliation_history_date_idx on reconciliation_history(reconciled_at desc);

-- ── 7. login_attempts ────────────────────────────────────────────────────
-- Used for rate limiting in the auth Edge Function.
-- Written via service role client — no permissive anon policy needed.
create table if not exists login_attempts (
  id           uuid primary key default gen_random_uuid(),
  attempted_at timestamptz not null default now(),
  ip_address   text,
  succeeded    boolean not null default false
);

create index if not exists login_attempts_rate_limit_idx
  on login_attempts(ip_address, attempted_at desc);

-- ── 8. settings ──────────────────────────────────────────────────────────
create table if not exists settings (
  id                        integer primary key default 1 check (id = 1),
  password_hash             text,
  -- Featured dashboard envelope slots
  featured_envelope_1_id    uuid references envelopes(id) on delete set null,
  featured_envelope_2_id    uuid references envelopes(id) on delete set null,
  featured_envelope_3_id    uuid references envelopes(id) on delete set null,
  -- Employer 1
  employer_name_1           text,
  employer_1_gross          numeric(12,2),
  employer_1_keyword        text,
  -- Employer 2 (two pay components)
  employer_name_2           text,
  employer_2_pay_1          numeric(12,2),
  employer_2_pay_1_keyword  text,
  employer_2_pay_2          numeric(12,2),
  employer_2_pay_2_keyword  text,
  -- Misc
  pay_frequency             text not null default 'fortnightly',
  default_bank_format       text not null default 'cba'
);

-- Seed the single settings row.
-- !! BEFORE RUNNING: replace PASTE_BCRYPT_HASH_HERE with your actual bcrypt hash.
-- Generate one locally with:
--   node -e "require('bcryptjs').hash('yourpassword',12).then(console.log)"
insert into settings (id, password_hash)
values (1, '$2b$12$cNqTz9e/ImK4aB2xuOo.I.vglnYlVDuntLR8CfYV7oTKwQIdUyAyW')
on conflict (id) do update
  set password_hash = excluded.password_hash
  where settings.password_hash is null
     or settings.password_hash = 'PASTE_BCRYPT_HASH_HERE';

-- ── RLS policies ─────────────────────────────────────────────────────────
alter table envelopes            enable row level security;
alter table transactions         enable row level security;
alter table envelope_allocations enable row level security;
alter table category_rules       enable row level security;
alter table bank_accounts        enable row level security;
alter table reconciliation_history enable row level security;
alter table login_attempts       enable row level security;
alter table settings             enable row level security;

-- All tables require a valid JWT with role = 'household'
create policy household_access on envelopes
  for all using ((auth.jwt() ->> 'app_role') = 'household');

create policy household_access on transactions
  for all using ((auth.jwt() ->> 'app_role') = 'household');

create policy household_access on envelope_allocations
  for all using ((auth.jwt() ->> 'app_role') = 'household');

create policy household_access on category_rules
  for all using ((auth.jwt() ->> 'app_role') = 'household');

create policy household_access on bank_accounts
  for all using ((auth.jwt() ->> 'app_role') = 'household');

create policy household_access on reconciliation_history
  for all using ((auth.jwt() ->> 'app_role') = 'household');

-- login_attempts: written by Edge Function via service role (bypasses RLS).
-- household users can read their own attempts for display purposes.
create policy household_access on login_attempts
  for select using ((auth.jwt() ->> 'app_role') = 'household');

create policy household_access on settings
  for all using ((auth.jwt() ->> 'app_role') = 'household');


-- ── Default category rules seed ──────────────────────────────────────────
-- 38 default rules covering common Australian merchants.
-- envelope_id references are left null here; wire them after envelopes are created
-- by updating envelope_id where keyword matches your envelope names.
-- These are seeded as source = 'default' with priority = 100.

-- To seed after first login, run the following in the Supabase SQL editor
-- replacing the envelope UUIDs with your actual IDs:
--
-- insert into category_rules (keyword, envelope_id, source, priority) values
--   ('WOOLWORTHS',   '<groceries-uuid>', 'default', 100),
--   ('COLES',        '<groceries-uuid>', 'default', 100),
--   ...
-- See documentation for the full list.
