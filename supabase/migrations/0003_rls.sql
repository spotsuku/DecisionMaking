-- Row Level Security(3.7 / 11章)
-- 基本: user_id = auth.uid()。共有は decision_members の明示許可のみ。
-- service role はサーバー処理に限定。

alter table profiles enable row level security;
alter table subscriptions enable row level security;
alter table decisions enable row level security;
alter table decision_versions enable row level security;
alter table decision_members enable row level security;
alter table decision_questions enable row level security;
alter table decision_answers enable row level security;
alter table blocker_assessments enable row level security;
alter table readiness_assessments enable row level security;
alter table options enable row level security;
alter table criteria enable row level security;
alter table option_scores enable row level security;
alter table evidence_items enable row level security;
alter table forecasts enable row level security;
alter table commitments enable row level security;
alter table actions enable row level security;
alter table action_events enable row level security;
alter table outcomes enable row level security;
alter table reflections enable row level security;
alter table decision_changes enable row level security;
alter table algorithm_runs enable row level security;
alter table prompt_versions enable row level security;
alter table audit_events enable row level security;

-- ---------------------------------------------------------------- helper

-- 本人または明示的に許可された共有メンバーか(共有解除で即時失効 3.8)
create or replace function can_access_decision(p_decision_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from decisions d
    where d.id = p_decision_id
      and (d.user_id = auth.uid()
           or exists (select 1 from decision_members m
                      where m.decision_id = d.id and m.user_id = auth.uid()))
  );
$$;

create or replace function can_access_version(p_version_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select can_access_decision(v.decision_id)
  from decision_versions v where v.id = p_version_id;
$$;

-- ---------------------------------------------------------------- policies

create policy profiles_own on profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

create policy subscriptions_own_select on subscriptions
  for select using (user_id = auth.uid());
-- 課金の書込みは Stripe Webhook(service role)のみ。ユーザー向け書込みポリシーは作らない。

create policy decisions_select on decisions
  for select using (user_id = auth.uid()
    or exists (select 1 from decision_members m where m.decision_id = id and m.user_id = auth.uid()));
create policy decisions_insert on decisions
  for insert with check (user_id = auth.uid());
create policy decisions_update on decisions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
-- ユーザー削除は猶予期間後の物理削除(3.8)。オンライン削除ポリシーは作らない。

create policy decision_members_owner on decision_members
  for all using (exists (select 1 from decisions d where d.id = decision_id and d.user_id = auth.uid()))
  with check (exists (select 1 from decisions d where d.id = decision_id and d.user_id = auth.uid()));
create policy decision_members_self_select on decision_members
  for select using (user_id = auth.uid());

create policy decision_versions_select on decision_versions
  for select using (can_access_decision(decision_id));
create policy decision_versions_insert on decision_versions
  for insert with check (
    exists (select 1 from decisions d where d.id = decision_id and d.user_id = auth.uid()));
create policy decision_versions_update on decision_versions
  for update using (
    exists (select 1 from decisions d where d.id = decision_id and d.user_id = auth.uid()));
  -- 確定後の改変は 0002 のトリガーが常に拒否する

-- version配下の子テーブル共通パターン
create policy questions_rw on decision_questions
  for all using (can_access_version(version_id)) with check (can_access_version(version_id));
create policy answers_rw on decision_answers
  for all using (can_access_version((select q.version_id from decision_questions q where q.id = question_id)))
  with check (can_access_version((select q.version_id from decision_questions q where q.id = question_id)));
create policy blockers_rw on blocker_assessments
  for all using (can_access_version(version_id)) with check (can_access_version(version_id));
create policy readiness_rw on readiness_assessments
  for all using (can_access_version(version_id)) with check (can_access_version(version_id));
create policy options_rw on options
  for all using (can_access_version(version_id)) with check (can_access_version(version_id));
create policy criteria_rw on criteria
  for all using (can_access_version(version_id)) with check (can_access_version(version_id));
create policy option_scores_rw on option_scores
  for all using (can_access_version((select o.version_id from options o where o.id = option_id)))
  with check (can_access_version((select o.version_id from options o where o.id = option_id)));
create policy evidence_rw on evidence_items
  for all using (can_access_version(version_id)) with check (can_access_version(version_id));
create policy forecasts_rw on forecasts
  for all using (can_access_version(version_id)) with check (can_access_version(version_id));
create policy commitments_rw on commitments
  for all using (can_access_version(version_id)) with check (can_access_version(version_id));
create policy actions_rw on actions
  for all using (can_access_version(version_id)) with check (can_access_version(version_id));
create policy action_events_rw on action_events
  for all using (can_access_version((select a.version_id from actions a where a.id = action_id)))
  with check (can_access_version((select a.version_id from actions a where a.id = action_id)));
create policy outcomes_rw on outcomes
  for all using (can_access_version(version_id)) with check (can_access_version(version_id));
create policy reflections_rw on reflections
  for all using (can_access_version((select o.version_id from outcomes o where o.id = outcome_id)))
  with check (can_access_version((select o.version_id from outcomes o where o.id = outcome_id)));
create policy changes_select on decision_changes
  for select using (can_access_decision(decision_id));
create policy changes_insert on decision_changes
  for insert with check (
    exists (select 1 from decisions d where d.id = decision_id and d.user_id = auth.uid()));

create policy algorithm_runs_select on algorithm_runs
  for select using (can_access_version(version_id));
-- algorithm_runs の書込みはサーバー(service role)のみ

create policy prompt_versions_read on prompt_versions
  for select using (true);

create policy audit_select_own on audit_events
  for select using (user_id = auth.uid());
-- audit_events の書込みはサーバー(service role)/トリガーのみ
