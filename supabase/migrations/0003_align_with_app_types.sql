-- スキーマを設計書ではなく、実装済みの型(src/lib/types.ts)に合わせ直す。
--
-- 0001 は設計書3.3から起こしたが、実装は仕様を詰める過程で列構成が変わっていた。
-- 表示も算出もこれらの列を前提にしているので、DB側を実装に寄せる。
-- ズレは tests/schema.test.ts が検出する(送る列が実在するかを実スキーマと突き合わせる)。

alter table public.decisions
  add column close_kind text check (close_kind in ('COMPLETED','WITHDRAWN')),
  add column close_reason text,
  add column close_protected text,
  add column close_learning text;

alter table public.diagnostic_questions drop column created_at;

alter table public.criteria
  add column definition text not null default '',
  add column minimum_threshold text not null default '';
alter table public.criteria drop column direction;

alter table public.option_scores
  add column uncertainty numeric not null default 0,
  add column rationale text not null default '';

alter table public.forecasts
  add column metric text,
  add column assumption text,
  add column leading_indicator text,
  add column frozen_at timestamptz;
alter table public.forecasts drop column created_at;

alter table public.commitments
  add column accepted_downside_forecast_id uuid references public.forecasts(id) on delete set null,
  add column loss_limit text not null default '',
  add column stop_condition text not null default '',
  add column review_at timestamptz,
  add column user_confirmed_at timestamptz;
alter table public.commitments
  drop column user_confirmed, drop column confirmed_at, drop column created_at;

alter table public.actions
  add column option_id uuid references public.options(id) on delete set null,
  add column completion_evidence text;
alter table public.actions drop column updated_at;

alter table public.action_events
  add column occurred_at timestamptz not null default now();
alter table public.action_events drop column created_at, drop column evidence;

alter table public.outcomes
  add column result_summary text not null default '',
  add column outcome_class text not null default '',
  add column attribution text not null default '',
  add column external_factors text not null default '';
alter table public.outcomes drop column observed, drop column matched, drop column forecast_id;

alter table public.reflections
  add column outcome_id uuid references public.outcomes(id) on delete cascade,
  add column prediction_gap text not null default '',
  add column decision_error text not null default '',
  add column execution_error text not null default '',
  add column environment_change text not null default '',
  add column authored_at timestamptz not null default now();
alter table public.reflections
  drop column process_quality, drop column outcome_quality,
  drop column attribution, drop column created_at;

alter table public.decision_changes
  add column trigger text not null default '',
  add column new_evidence text not null default '',
  add column prior_result_acknowledged boolean not null default false,
  add column changed_assumption text not null default '',
  add column changed_at timestamptz not null default now();
alter table public.decision_changes
  drop column new_fact, drop column changed_premise,
  drop column reason, drop column created_at;

alter table public.audit_events rename column created_at to occurred_at;

-- トリガー専用の関数はAPIから直接呼べないようにする(linter警告 0028/0029)
revoke execute on function public.handle_new_user() from anon, authenticated, public;
