-- DECISION MAKING の中核スキーマ。
--
-- 方針:
--   1. 追記のみのテーブル(履歴・監査・回答・行動イベント)は UPDATE/DELETE を許可しない。
--      設計書 INV-01「決断の履歴は改変できない」をDBの権限で担保する。
--   2. すべての行は user_id を持ち、RLS で本人以外に見せない。
--      扱う内容が本人の迷いそのものなので、アプリのバグでは漏れない層に置く。
--   3. 端末のlocalStorageと同じ形をそのまま持つ(idはアプリ側で採番したuuid)。

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------ 利用者と契約

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  plan text not null default 'FREE' check (plan in ('FREE','STANDARD','PRO')),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  -- 従量課金の上限(円/月)。本人が変えられる安全弁
  overage_cap_yen integer not null default 5000 check (overage_cap_yen >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 課金期間ごとの利用実績。締めたあとも残す
create table public.usage_periods (
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  decisions_started integer not null default 0,
  overage_yen integer not null default 0,
  ai_input_tokens bigint not null default 0,
  ai_output_tokens bigint not null default 0,
  primary key (user_id, period_start)
);

-- AI呼び出しの明細。原価の実測と、従量課金の説明責任のために残す
create table public.ai_calls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  decision_id uuid,
  task text not null check (task in ('extract','reply','split')),
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  -- 本文は保存しない。何を書いたかはこのテーブルからは分からない
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- 決断本体

create table public.decisions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  domain text not null,
  status text not null,
  current_version_no integer not null default 1,
  due_at timestamptz,
  review_at timestamptz,
  risk_level text not null default 'NORMAL',
  hidden boolean not null default false,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.decisions (user_id, created_at desc);

create table public.decision_versions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  decision_id uuid not null references public.decisions(id) on delete cascade,
  version_no integer not null,
  question text not null default '',
  owner_role text not null default '',
  authority_scope text not null default '',
  selected_option_id uuid,
  rationale text not null default '',
  confidence numeric,
  state text not null,
  committed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (decision_id, version_no)
);
create index on public.decision_versions (user_id, decision_id);

-- --------------------------------------------------------------- 診断の記録

create table public.diagnostic_questions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  version_id uuid not null references public.decision_versions(id) on delete cascade,
  question_code text not null,
  text text not null,
  purpose text not null default '',
  gap text not null,
  sequence_no integer not null,
  created_at timestamptz not null default now()
);
create index on public.diagnostic_questions (version_id, sequence_no);

create table public.diagnostic_answers (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  version_id uuid not null references public.decision_versions(id) on delete cascade,
  question_id uuid not null references public.diagnostic_questions(id) on delete cascade,
  question_code text not null,
  answer_text text not null default '',
  answer_json jsonb not null default '{}'::jsonb,
  raw_text text,
  skipped boolean not null default false,
  mode text not null default 'FORM' check (mode in ('CHAT','FORM')),
  submitted_at timestamptz not null default now()
);
create index on public.diagnostic_answers (version_id);

create table public.blocker_assessments (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  version_id uuid not null references public.decision_versions(id) on delete cascade,
  blocker_code text not null,
  score numeric not null,
  confidence numeric not null,
  evidence_refs jsonb not null default '[]'::jsonb,
  counter_question text not null default '',
  algorithm_version text not null,
  created_at timestamptz not null default now()
);
create index on public.blocker_assessments (version_id);

create table public.readiness_checks (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  version_id uuid not null references public.decision_versions(id) on delete cascade,
  verdict text not null,
  missing jsonb not null default '[]'::jsonb,
  stop_condition text,
  note text not null default '',
  created_at timestamptz not null default now()
);
create index on public.readiness_checks (version_id);

-- ------------------------------------------------------------------- 材料

create table public.options (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  version_id uuid not null references public.decision_versions(id) on delete cascade,
  label text not null,
  description text not null default '',
  origin text not null default 'USER',
  active boolean not null default true,
  added_reason text not null default '',
  rejected_reason text,
  created_at timestamptz not null default now()
);
create index on public.options (version_id);

create table public.criteria (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  version_id uuid not null references public.decision_versions(id) on delete cascade,
  label text not null,
  weight numeric not null default 1,
  direction text not null default 'MAX',
  created_at timestamptz not null default now()
);
create index on public.criteria (version_id);

create table public.option_scores (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  option_id uuid not null references public.options(id) on delete cascade,
  criterion_id uuid not null references public.criteria(id) on delete cascade,
  score numeric not null,
  unique (option_id, criterion_id)
);

create table public.evidence_items (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  version_id uuid not null references public.decision_versions(id) on delete cascade,
  type text not null,
  statement text not null,
  source_url text,
  reliability text not null default 'MEDIUM',
  observed_at timestamptz not null default now()
);
create index on public.evidence_items (version_id);

-- --------------------------------------------------------- 決断の確定と実行

create table public.forecasts (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  version_id uuid not null references public.decision_versions(id) on delete cascade,
  forecast_type text not null check (forecast_type in ('POSITIVE','NEGATIVE')),
  outcome_statement text not null,
  probability numeric,
  horizon_at timestamptz not null,
  loss_limit text,
  created_at timestamptz not null default now()
);
create index on public.forecasts (version_id);

create table public.commitments (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  version_id uuid not null references public.decision_versions(id) on delete cascade,
  accepted_tradeoff text not null,
  user_confirmed boolean not null default false,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.actions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  decision_id uuid not null references public.decisions(id) on delete cascade,
  version_id uuid not null references public.decision_versions(id) on delete cascade,
  text text not null,
  action_role text not null,
  status text not null default 'PLANNED',
  due_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.actions (user_id, due_at);

create table public.action_events (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  action_id uuid not null references public.actions(id) on delete cascade,
  event_type text not null,
  note text not null default '',
  evidence text,
  created_at timestamptz not null default now()
);
create index on public.action_events (action_id);

-- ------------------------------------------------------- レビューと再決断

create table public.outcomes (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  version_id uuid not null references public.decision_versions(id) on delete cascade,
  forecast_id uuid references public.forecasts(id) on delete set null,
  observed text not null,
  matched boolean,
  observed_at timestamptz not null default now()
);

create table public.reflections (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  version_id uuid not null references public.decision_versions(id) on delete cascade,
  process_quality integer,
  outcome_quality integer,
  attribution text,
  learning text not null default '',
  created_at timestamptz not null default now()
);

create table public.decision_changes (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  decision_id uuid not null references public.decisions(id) on delete cascade,
  from_version_id uuid references public.decision_versions(id) on delete set null,
  to_version_id uuid references public.decision_versions(id) on delete set null,
  new_fact text not null,
  changed_premise text not null,
  reason text not null,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------- 書き出しと監査ログ

create table public.journal_entries (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);
create index on public.journal_entries (user_id, created_at desc);

create table public.audit_events (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  event_type text not null,
  detail text not null default '',
  created_at timestamptz not null default now()
);
create index on public.audit_events (user_id, created_at desc);
