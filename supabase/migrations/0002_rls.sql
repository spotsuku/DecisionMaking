-- 行レベルセキュリティ。
--
-- 扱う内容が「本人が誰にも言えていない迷い」そのものなので、
-- アプリの実装ミスでは漏れない層(DB)で本人以外を遮断する。
--
-- 追記のみのテーブルは UPDATE / DELETE ポリシーを作らない。
-- ポリシーが無い操作は RLS 下では常に拒否されるので、
-- 設計書 INV-01「決断の履歴は改変できない」がDBの権限として成立する。

alter table public.profiles enable row level security;
create policy p_select on public.profiles for select using (auth.uid() = id);
create policy p_insert on public.profiles for insert with check (auth.uid() = id);
create policy p_update on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

alter table public.usage_periods enable row level security;
create policy u_select on public.usage_periods for select using (auth.uid() = user_id);

alter table public.ai_calls enable row level security;
create policy a_select on public.ai_calls for select using (auth.uid() = user_id);

alter table public.decisions enable row level security;
create policy dec_sel on public.decisions for select using (auth.uid() = user_id);
create policy dec_ins on public.decisions for insert with check (auth.uid() = user_id);
create policy dec_upd on public.decisions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy dec_del on public.decisions for delete using (auth.uid() = user_id);

alter table public.options enable row level security;
create policy opt_sel on public.options for select using (auth.uid() = user_id);
create policy opt_ins on public.options for insert with check (auth.uid() = user_id);
create policy opt_upd on public.options for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy opt_del on public.options for delete using (auth.uid() = user_id);

alter table public.criteria enable row level security;
create policy cri_sel on public.criteria for select using (auth.uid() = user_id);
create policy cri_ins on public.criteria for insert with check (auth.uid() = user_id);
create policy cri_upd on public.criteria for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy cri_del on public.criteria for delete using (auth.uid() = user_id);

alter table public.option_scores enable row level security;
create policy opt_sel on public.option_scores for select using (auth.uid() = user_id);
create policy opt_ins on public.option_scores for insert with check (auth.uid() = user_id);
create policy opt_upd on public.option_scores for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy opt_del on public.option_scores for delete using (auth.uid() = user_id);

alter table public.actions enable row level security;
create policy act_sel on public.actions for select using (auth.uid() = user_id);
create policy act_ins on public.actions for insert with check (auth.uid() = user_id);
create policy act_upd on public.actions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy act_del on public.actions for delete using (auth.uid() = user_id);

alter table public.journal_entries enable row level security;
create policy jou_sel on public.journal_entries for select using (auth.uid() = user_id);
create policy jou_ins on public.journal_entries for insert with check (auth.uid() = user_id);
create policy jou_upd on public.journal_entries for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy jou_del on public.journal_entries for delete using (auth.uid() = user_id);

alter table public.commitments enable row level security;
create policy com_sel on public.commitments for select using (auth.uid() = user_id);
create policy com_ins on public.commitments for insert with check (auth.uid() = user_id);
create policy com_upd on public.commitments for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy com_del on public.commitments for delete using (auth.uid() = user_id);

alter table public.decision_versions enable row level security;
create policy dv_sel on public.decision_versions for select using (auth.uid() = user_id);
create policy dv_ins on public.decision_versions for insert with check (auth.uid() = user_id);
-- 確定(committed_at)が入った版はもう変更できない。変更したいときは新しい版を作る
create policy dv_upd on public.decision_versions for update
  using (auth.uid() = user_id and committed_at is null)
  with check (auth.uid() = user_id);
create policy dv_del on public.decision_versions for delete
  using (auth.uid() = user_id and committed_at is null);

-- 追記のみ。update / delete のポリシーを作らないので、RLS下では拒否される(INV-01)
alter table public.diagnostic_questions enable row level security;
create policy dq_sel on public.diagnostic_questions for select using (auth.uid() = user_id);
create policy dq_ins on public.diagnostic_questions for insert with check (auth.uid() = user_id);

-- 追記のみ。update / delete のポリシーを作らないので、RLS下では拒否される(INV-01)
alter table public.diagnostic_answers enable row level security;
create policy da_sel on public.diagnostic_answers for select using (auth.uid() = user_id);
create policy da_ins on public.diagnostic_answers for insert with check (auth.uid() = user_id);

-- 追記のみ。update / delete のポリシーを作らないので、RLS下では拒否される(INV-01)
alter table public.blocker_assessments enable row level security;
create policy ba_sel on public.blocker_assessments for select using (auth.uid() = user_id);
create policy ba_ins on public.blocker_assessments for insert with check (auth.uid() = user_id);

-- 追記のみ。update / delete のポリシーを作らないので、RLS下では拒否される(INV-01)
alter table public.readiness_checks enable row level security;
create policy rc_sel on public.readiness_checks for select using (auth.uid() = user_id);
create policy rc_ins on public.readiness_checks for insert with check (auth.uid() = user_id);

-- 追記のみ。update / delete のポリシーを作らないので、RLS下では拒否される(INV-01)
alter table public.evidence_items enable row level security;
create policy ei_sel on public.evidence_items for select using (auth.uid() = user_id);
create policy ei_ins on public.evidence_items for insert with check (auth.uid() = user_id);

-- 追記のみ。update / delete のポリシーを作らないので、RLS下では拒否される(INV-01)
alter table public.forecasts enable row level security;
create policy f_sel on public.forecasts for select using (auth.uid() = user_id);
create policy f_ins on public.forecasts for insert with check (auth.uid() = user_id);

-- 追記のみ。update / delete のポリシーを作らないので、RLS下では拒否される(INV-01)
alter table public.action_events enable row level security;
create policy ae_sel on public.action_events for select using (auth.uid() = user_id);
create policy ae_ins on public.action_events for insert with check (auth.uid() = user_id);

-- 追記のみ。update / delete のポリシーを作らないので、RLS下では拒否される(INV-01)
alter table public.outcomes enable row level security;
create policy o_sel on public.outcomes for select using (auth.uid() = user_id);
create policy o_ins on public.outcomes for insert with check (auth.uid() = user_id);

-- 追記のみ。update / delete のポリシーを作らないので、RLS下では拒否される(INV-01)
alter table public.reflections enable row level security;
create policy r_sel on public.reflections for select using (auth.uid() = user_id);
create policy r_ins on public.reflections for insert with check (auth.uid() = user_id);

-- 追記のみ。update / delete のポリシーを作らないので、RLS下では拒否される(INV-01)
alter table public.decision_changes enable row level security;
create policy dc_sel on public.decision_changes for select using (auth.uid() = user_id);
create policy dc_ins on public.decision_changes for insert with check (auth.uid() = user_id);

-- 追記のみ。update / delete のポリシーを作らないので、RLS下では拒否される(INV-01)
alter table public.audit_events enable row level security;
create policy ae_sel on public.audit_events for select using (auth.uid() = user_id);
create policy ae_ins on public.audit_events for insert with check (auth.uid() = user_id);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
