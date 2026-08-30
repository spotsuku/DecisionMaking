-- 不変履歴の強制(INV-01)と Commit トランザクション関数(7.1 / 4.6)

-- ---------------------------------------------------------------- 不変トリガー

-- 確定済み decision_versions の UPDATE / DELETE を拒否する。
-- 変更は decision_changes を伴う新versionとしてのみ表現できる(INV-01, INV-03)。
create or replace function forbid_committed_version_mutation()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.committed_at is not null then
      raise exception 'committed decision_versions are immutable (INV-01)';
    end if;
    return old;
  end if;
  if old.committed_at is not null then
    raise exception 'committed decision_versions are immutable (INV-01)';
  end if;
  return new;
end $$;

create trigger decision_versions_immutable
  before update or delete on decision_versions
  for each row execute function forbid_committed_version_mutation();

-- 凍結済み予測は変更不可(3.4: 結果観測前に凍結し、後知恵を作らない)
create or replace function forbid_frozen_forecast_mutation()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.frozen_at is not null then
      raise exception 'frozen forecasts are immutable';
    end if;
    return old;
  end if;
  if old.frozen_at is not null then
    raise exception 'frozen forecasts are immutable';
  end if;
  return new;
end $$;

create trigger forecasts_immutable
  before update or delete on forecasts
  for each row execute function forbid_frozen_forecast_mutation();

-- 監査ログは追記のみ(管理者操作も追記 11.1)
create or replace function forbid_mutation()
returns trigger language plpgsql as $$
begin
  raise exception '% is append-only', tg_table_name;
end $$;

create trigger audit_events_append_only
  before update or delete on audit_events
  for each row execute function forbid_mutation();

create trigger action_events_append_only
  before update or delete on action_events
  for each row execute function forbid_mutation();

create trigger decision_changes_append_only
  before update or delete on decision_changes
  for each row execute function forbid_mutation();

-- ---------------------------------------------------------------- Commit関数(7.1)

-- 決断成立ルール(4.6)を検証し、原子的に COMMITTED へ遷移する。
-- BEGIN/COMMIT は関数呼び出し自体のトランザクションに含まれる。
create or replace function commit_decision(
  p_decision_id uuid,
  p_version_id uuid,
  p_selected_option_id uuid,
  p_rationale text,
  p_confidence numeric,
  p_accepted_tradeoff text,
  p_loss_limit text,
  p_stop_condition text,
  p_review_at timestamptz,
  p_action_text text,
  p_action_due_at timestamptz,
  p_user_confirmed boolean
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_positive_count int;
  v_negative_count int;
  v_negative_no_loss int;
  v_unrejected int;
  v_action_id uuid;
begin
  -- 行ロック(7.1: lock decisions row)
  perform 1 from decisions
    where id = p_decision_id and user_id = v_user
    for update;
  if not found then
    raise exception 'decision not found or not owned';
  end if;

  perform 1 from decision_versions
    where id = p_version_id and decision_id = p_decision_id and committed_at is null;
  if not found then
    raise exception 'version not found or already committed';
  end if;

  -- INV-05: 本人確定
  if not p_user_confirmed then
    raise exception 'commit requires explicit user confirmation (INV-05)';
  end if;
  -- Choice
  if p_selected_option_id is null then
    raise exception 'commit requires a selected option';
  end if;
  select count(*) into v_unrejected from options
    where version_id = p_version_id and active and id <> p_selected_option_id
      and (rejected_reason is null or length(trim(rejected_reason)) = 0);
  if v_unrejected > 0 then
    raise exception 'all rejected options need a rejected_reason';
  end if;
  -- 両面予測(INV-02 / 4.7)
  select count(*) into v_positive_count from forecasts
    where version_id = p_version_id and forecast_type = 'POSITIVE'
      and length(trim(outcome_statement)) > 0 and frozen_at is null;
  if v_positive_count = 0 then
    raise exception 'commit requires at least one POSITIVE forecast';
  end if;
  select count(*) into v_negative_count from forecasts
    where version_id = p_version_id and forecast_type = 'NEGATIVE'
      and length(trim(outcome_statement)) > 0 and frozen_at is null;
  if v_negative_count = 0 then
    raise exception 'commit requires at least one NEGATIVE forecast';
  end if;
  select count(*) into v_negative_no_loss from forecasts
    where version_id = p_version_id and forecast_type = 'NEGATIVE' and frozen_at is null
      and (loss_limit is not null and length(trim(loss_limit)) > 0);
  if v_negative_no_loss = 0 then
    raise exception 'NEGATIVE forecast requires a loss_limit';
  end if;
  -- Tradeoff / Action / Review
  if p_accepted_tradeoff is null or length(trim(p_accepted_tradeoff)) = 0 then
    raise exception 'commit requires accepted_tradeoff';
  end if;
  if p_action_text is null or length(trim(p_action_text)) = 0 or p_action_due_at is null then
    raise exception 'commit requires a smallest external ADVANCE action with due_at';
  end if;
  if p_review_at is null then
    raise exception 'commit requires review_at';
  end if;

  -- version凍結
  update decision_versions set
    selected_option_id = p_selected_option_id,
    rationale = coalesce(p_rationale, ''),
    confidence = p_confidence,
    state = 'COMMITTED',
    committed_at = now()
  where id = p_version_id;

  -- 予測凍結
  update forecasts set frozen_at = now()
    where version_id = p_version_id and frozen_at is null;

  -- commitment
  insert into commitments (version_id, accepted_tradeoff, accepted_downside_forecast_id,
                           loss_limit, stop_condition, review_at, user_confirmed_at)
  values (
    p_version_id, p_accepted_tradeoff,
    (select id from forecasts where version_id = p_version_id and forecast_type = 'NEGATIVE' limit 1),
    coalesce(p_loss_limit, ''), coalesce(p_stop_condition, ''), p_review_at, now()
  );

  -- 最小行動
  insert into actions (version_id, text, action_role, option_id, owner_id, due_at)
  values (p_version_id, p_action_text, 'ADVANCE', p_selected_option_id, v_user, p_action_due_at)
  returning id into v_action_id;
  insert into action_events (action_id, event_type, note) values (v_action_id, 'CREATED', '');

  -- スナップショット更新 + 監査
  update decisions set
    status = 'COMMITTED',
    review_at = p_review_at,
    current_version_no = (select version_no from decision_versions where id = p_version_id)
  where id = p_decision_id;

  insert into audit_events (user_id, entity_type, entity_id, event_type)
  values (v_user, 'decision', p_decision_id, 'COMMITTED');

  return p_version_id;
end $$;

-- decision_versions の UPDATE を commit_decision 経由(未確定行)に限定したい場合は
-- カラム権限・RLSと合わせて運用する。トリガーが確定後の改変は常に拒否する。
