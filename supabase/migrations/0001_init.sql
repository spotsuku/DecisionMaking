-- DECISION MAKING — 初期スキーマ(設計書 3章 / 付録B)
-- 方針: イベントソーシング寄りのハイブリッド。
--   * decisions は高速表示用スナップショット(現在値)
--   * decision_versions / audit_events は不変の正本
--   * 「AIがそう判断した」(algorithm_runs)と「ユーザーが確定した」(decision_versions)を分離

-- ---------------------------------------------------------------- 型

create type decision_state as enum (
  'DRAFT','DIAGNOSING','GATHERING','READY','COMMITTED','IN_ACTION','REVIEW','REVISED','CLOSED'
);
create type readiness_verdict as enum ('THINK','RESEARCH','ASK','TEST','BET');
create type forecast_type as enum ('POSITIVE','BASELINE','NEGATIVE');
create type action_role as enum ('ADVANCE','MITIGATE','EXIT_PREP');
create type action_status as enum ('PENDING','STARTED','COMPLETED','BLOCKED','CANCELLED');
create type outcome_class as enum ('GOOD','MIXED','BAD','UNKNOWN');
create type attribution as enum ('SELF','EXTERNAL','MIXED');
create type evidence_type as enum ('FACT','HYPOTHESIS','OPINION');
create type risk_level as enum ('NORMAL','HIGH','EMERGENCY');
create type blocker_code as enum (
  'EMOTION_AVOIDANCE','RESPONSIBILITY_AVOIDANCE','OPPORTUNITY_LOSS_PARALYSIS',
  'SELF_JUSTIFICATION','APPROVAL_SEEKING'
);

-- ---------------------------------------------------------------- Identity

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  locale text not null default 'ja',
  timezone text not null default 'Asia/Tokyo',
  coaching_tone text not null default 'DIRECT',
  consent_version text,
  created_at timestamptz not null default now()
);

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null default 'FREE',           -- FREE / PRO
  status text not null default 'active',
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- Decision

create table decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  title text not null,
  domain text not null default 'WORK',
  status decision_state not null default 'DRAFT',
  current_version_no int not null default 0,
  due_at timestamptz,
  review_at timestamptz,
  risk_level risk_level not null default 'NORMAL',
  hidden boolean not null default false,        -- 画面削除は非表示(3.8)
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table decision_versions (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null references decisions(id),
  version_no int not null,
  question text not null,
  owner_role text not null default '',
  authority_scope text not null default '',
  selected_option_id uuid,
  rationale text not null default '',
  confidence numeric(4,3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  state decision_state not null default 'DRAFT',
  committed_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (decision_id, version_no)
);

-- 共有: 明示許可メンバーのみ(3.7)
create table decision_members (
  decision_id uuid not null references decisions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'VIEWER',
  created_at timestamptz not null default now(),
  primary key (decision_id, user_id)
);

-- ---------------------------------------------------------------- Reasoning

create table decision_questions (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references decision_versions(id),
  question_code text not null,
  text text not null,
  purpose text not null default '',
  sequence_no int not null,
  algorithm_run_id uuid
);

create table decision_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references decision_questions(id),
  answer_text text not null,
  answer_json jsonb,
  submitted_at timestamptz not null default now(),
  client_event_id text,                          -- 冪等キー(7.2)
  unique (question_id, client_event_id)
);

create table blocker_assessments (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references decision_versions(id),
  blocker_code blocker_code not null,
  score numeric(4,3) not null,
  confidence numeric(4,3) not null,
  evidence_refs uuid[] not null,                 -- 根拠IDのない推定は保存しない(6.3)
  status text not null default 'CANDIDATE',
  algorithm_version text not null,
  created_at timestamptz not null default now(),
  check (cardinality(evidence_refs) > 0)
);

create table readiness_assessments (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references decision_versions(id),
  verdict readiness_verdict not null,
  missing_gaps text[] not null default '{}',
  stop_condition text,
  note text not null default '',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- Choice

create table options (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references decision_versions(id),
  label text not null,
  description text not null default '',
  origin text not null default 'USER',
  active boolean not null default true,
  added_reason text not null default '',
  rejected_reason text,
  created_at timestamptz not null default now()
);

alter table decision_versions
  add constraint fk_selected_option foreign key (selected_option_id) references options(id);

create table criteria (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references decision_versions(id),
  label text not null,
  definition text not null default '',
  weight int not null default 3 check (weight between 1 and 5),
  minimum_threshold text not null default '',
  source text not null default 'USER',
  created_at timestamptz not null default now()
);

create table option_scores (
  option_id uuid not null references options(id),
  criterion_id uuid not null references criteria(id),
  score int not null check (score between 1 and 5),
  uncertainty numeric(4,3) not null default 0,
  rationale text not null default '',
  evidence_ids uuid[] not null default '{}',
  primary key (option_id, criterion_id)
);

create table evidence_items (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references decision_versions(id),
  type evidence_type not null,
  statement text not null,
  source_url text,
  reliability text not null default 'MEDIUM',
  observed_at timestamptz not null default now(),
  expires_at timestamptz
);

-- ---------------------------------------------------------------- Commitment

create table forecasts (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references decision_versions(id),
  forecast_type forecast_type not null,
  outcome_statement text not null,
  probability numeric(4,3) check (probability is null or (probability > 0 and probability < 1)),
  metric text,
  expected_value numeric,
  lower_bound numeric,
  upper_bound numeric,
  horizon_at timestamptz not null,
  assumption text,
  leading_indicator text,
  loss_limit text,                                -- NEGATIVE用
  frozen_at timestamptz                           -- committed時に凍結(3.4)
);

create table commitments (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null unique references decision_versions(id),
  accepted_tradeoff text not null,
  accepted_downside_forecast_id uuid references forecasts(id),
  loss_limit text not null default '',
  stop_condition text not null default '',
  review_at timestamptz not null,
  user_confirmed_at timestamptz not null          -- INV-05
);

create table actions (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references decision_versions(id),
  text text not null,
  action_role action_role not null,
  option_id uuid references options(id),          -- Drift検知用: どの案へ向かう行動か
  owner_id uuid references auth.users(id),
  due_at timestamptz not null,
  status action_status not null default 'PENDING',
  completion_evidence text,
  created_at timestamptz not null default now()
);

create table action_events (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null references actions(id),
  event_type text not null,
  occurred_at timestamptz not null default now(),
  note text not null default '',
  source text not null default 'USER',
  client_event_id text,
  unique (action_id, client_event_id)             -- 冪等(3.7 / 7.2)
);

-- ---------------------------------------------------------------- Learning

create table outcomes (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references decision_versions(id),
  observed_at timestamptz not null default now(),
  result_summary text not null,
  outcome_class outcome_class not null,
  attribution attribution not null default 'MIXED',
  external_factors text not null default '',
  evidence_ids uuid[] not null default '{}'
);

create table reflections (
  id uuid primary key default gen_random_uuid(),
  outcome_id uuid not null references outcomes(id),
  prediction_gap text not null default '',
  decision_error text not null default '',
  execution_error text not null default '',
  environment_change text not null default '',
  learning text not null,
  authored_at timestamptz not null default now()
);

create table decision_changes (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null references decisions(id),
  from_version_id uuid not null references decision_versions(id),
  to_version_id uuid not null references decision_versions(id),
  trigger text not null,
  new_evidence text not null,                     -- INV-03: 変化した事実
  prior_result_acknowledged boolean not null,     -- INV-03: 結果の受容
  changed_assumption text not null,
  changed_at timestamptz not null default now(),
  check (prior_result_acknowledged),              -- 受容なしの変更行は作れない
  check (length(trim(new_evidence)) > 0),
  check (length(trim(changed_assumption)) > 0)
);

-- ---------------------------------------------------------------- AI / Audit

create table prompt_versions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  semver text not null,
  schema_version text not null,
  template_hash text not null,
  active_from timestamptz not null default now(),
  retired_at timestamptz,
  unique (name, semver)
);

create table algorithm_runs (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references decision_versions(id),
  stage text not null,
  input_hash text not null,                       -- 本文は保存しない(11章)
  model text not null,
  prompt_version_id uuid references prompt_versions(id),
  output_json jsonb not null,
  confidence numeric(4,3),
  latency_ms int,
  created_at timestamptz not null default now()
);

create index algorithm_runs_cache_idx on algorithm_runs (input_hash, stage, prompt_version_id);

create table audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  entity_type text not null,
  entity_id uuid not null,
  event_type text not null,
  payload_hash text,                              -- 本文ログ禁止: hash/カテゴリのみ(11.1)
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- Index(3.7)

create index decisions_user_status_due_idx on decisions (user_id, status, due_at);
create index decision_versions_decision_idx on decision_versions (decision_id, version_no desc);
create index actions_owner_status_due_idx on actions (owner_id, status, due_at);
create index algorithm_runs_version_idx on algorithm_runs (version_id, stage, created_at desc);
create index answers_question_idx on decision_answers (question_id);
create index outcomes_version_idx on outcomes (version_id);
