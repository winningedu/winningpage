-- =====================================================================
-- 기관 시범기간 SQL 스펙: tenants.trial_start_date, trial_end_date, fn_tenant_usage_state 기간 판정
-- (dev-decisions 결정 117, 분석 grill Q8, 계획 5번)
--
-- 실행: 마이그레이션이 전부 적용된 스택에서
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/b2b-tenant-trial.spec.sql
--
-- 전체가 한 트랜잭션이고 마지막에 ROLLBACK 한다. 어떤 데이터도 남기지
-- 않는다. 단언 실패는 예외로 터져 psql 이 비정상 종료(ON_ERROR_STOP)한다.
-- =====================================================================
begin;

create function pg_temp.expect_text(t text, got text, want text) returns void
language plpgsql as $$
begin
  if got is distinct from want then
    raise exception '[FAIL] %: got %, want %', t, got, want;
  end if;
  raise notice '[PASS] % = %', t, want;
end $$;

create function pg_temp.expect_bool(t text, got boolean, want boolean) returns void
language plpgsql as $$
begin
  if got is distinct from want then
    raise exception '[FAIL] %: got %, want %', t, got, want;
  end if;
  raise notice '[PASS] % = %', t, want;
end $$;

-- 주어진 SQL 이 want 로 지정한 SQLSTATE 로 실패하는지 단언한다.
create function pg_temp.expect_error(t text, p_sql text, want text) returns void
language plpgsql as $$
declare
  v_state text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    if v_state is distinct from want then
      raise exception '[FAIL] %: sqlstate %, want %', t, v_state, want;
    end if;
    raise notice '[PASS] % = %', t, want;
    return;
  end;
  raise exception '[FAIL] %: 예외가 나지 않았다, want %', t, want;
end $$;

create temp table fx (k text primary key, v uuid);
create function pg_temp.fx(p_k text) returns uuid language sql as $$ select v from fx where k = p_k $$;
create function pg_temp.today() returns date language sql as $$ select (now() at time zone 'Asia/Seoul')::date $$;

create function pg_temp.mk_user(p_email text, p_tenant uuid) returns uuid
language plpgsql as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data
  ) values (
    v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    p_email, 'x', now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
  );
  insert into public.profiles (id, name, role, email, tenant_id)
  values (v_id, p_email, 'user', p_email, p_tenant)
  on conflict (id) do update set tenant_id = excluded.tenant_id;
  return v_id;
end $$;

-- 기관과 학생 한 명(같은 키), 자기평가 설정 한 줄(켜짐, 한도 없음).
create function pg_temp.mk(p_key text, p_code text,
  p_contract_start date, p_contract_end date, p_grace date,
  p_trial_start date, p_trial_end date)
returns void language plpgsql as $$
declare
  v_tenant uuid;
begin
  insert into public.tenants (code, name, region, org_type, tier,
                              contract_start_date, contract_end_date, grace_ends_on,
                              trial_start_date, trial_end_date)
  values (p_code, 'trial-' || p_key, '서울', '학교', 'B',
          p_contract_start, p_contract_end, p_grace, p_trial_start, p_trial_end)
  returning id into v_tenant;
  insert into fx values ('t_' || p_key, v_tenant);
  insert into fx values (p_key, pg_temp.mk_user('trial-' || p_key || '@t.local', v_tenant));
  insert into public.tenant_service_settings (tenant_id, program_key, enabled)
  values (v_tenant, 'selfeval', true);
end $$;

create function pg_temp.reason(p_key text) returns text language sql as $$
  select coalesce(s.deny_reason, 'allowed') from public.fn_tenant_usage_state(pg_temp.fx(p_key), 'selfeval') s
$$;

-- 유예 기본 일수가 없게 고정한다(로컬 DB 값과 무관하게). 유예는 grace_ends_on 으로만 만든다.
delete from public.app_settings where key = 'contract_grace_days';

-- ---------------------------------------------------------------------
-- 계약일이 없는 기관: 시범기간이 기관 기간이다
-- ---------------------------------------------------------------------
select pg_temp.mk('n_before', 'TRAAAAAA', null, null, null, pg_temp.today() + 1, pg_temp.today() + 10);
select pg_temp.mk('n_first', 'TRBBBBBB', null, null, null, pg_temp.today(), pg_temp.today() + 10);
select pg_temp.mk('n_inside', 'TRCCCCCC', null, null, null, pg_temp.today() - 5, pg_temp.today() + 5);
select pg_temp.mk('n_last', 'TRDDDDDD', null, null, null, pg_temp.today() - 10, pg_temp.today());
select pg_temp.mk('n_after', 'TREEEEEE', null, null, null, pg_temp.today() - 10, pg_temp.today() - 1);
select pg_temp.mk('n_none', 'TRFFFFFF', null, null, null, null, null);

select pg_temp.expect_text('계약 없음, 시범 시작 전이면 outside_period', pg_temp.reason('n_before'), 'outside_period');
select pg_temp.expect_text('계약 없음, 시범 첫날이면 열린다', pg_temp.reason('n_first'), 'allowed');
select pg_temp.expect_text('계약 없음, 시범기간 안이면 열린다', pg_temp.reason('n_inside'), 'allowed');
select pg_temp.expect_text('계약 없음, 시범 마지막 날까지 열린다', pg_temp.reason('n_last'), 'allowed');
select pg_temp.expect_text('계약 없음, 시범 종료 다음 날부터 outside_period(자동 종료)', pg_temp.reason('n_after'), 'outside_period');
select pg_temp.expect_text('계약도 시범도 없으면 예전처럼 열린다', pg_temp.reason('n_none'), 'allowed');

-- ---------------------------------------------------------------------
-- 계약일이 있는 기관: 시범기간 안에서만 기간 판정을 건너뛴다
-- ---------------------------------------------------------------------
select pg_temp.mk('c_up_in', 'TRGGGGGG', pg_temp.today() + 5, pg_temp.today() + 200, null, pg_temp.today() - 2, pg_temp.today() + 4);
select pg_temp.mk('c_up_after', 'TRHHHHHH', pg_temp.today() + 5, pg_temp.today() + 200, null, pg_temp.today() - 10, pg_temp.today() - 1);
select pg_temp.mk('c_up_none', 'TRJJJJJJ', pg_temp.today() + 5, pg_temp.today() + 200, null, null, null);
select pg_temp.mk('c_exp_in', 'TRKKKKKK', pg_temp.today() - 200, pg_temp.today() - 60, pg_temp.today() - 50, pg_temp.today() - 1, pg_temp.today() + 1);
select pg_temp.mk('c_exp_after', 'TRMMMMMM', pg_temp.today() - 200, pg_temp.today() - 60, pg_temp.today() - 50, pg_temp.today() - 20, pg_temp.today() - 1);
select pg_temp.mk('c_grace_in', 'TRNNNNNN', pg_temp.today() - 200, pg_temp.today() - 3, pg_temp.today() + 5, pg_temp.today() - 1, pg_temp.today() + 1);
select pg_temp.mk('c_grace_none', 'TRPPPPPP', pg_temp.today() - 200, pg_temp.today() - 3, pg_temp.today() + 5, null, null);
select pg_temp.mk('c_active_after', 'TRQQQQQQ', pg_temp.today() - 10, pg_temp.today() + 100, null, pg_temp.today() - 30, pg_temp.today() - 11);

select pg_temp.expect_text('계약 시작 전, 시범기간 안이면 열린다', pg_temp.reason('c_up_in'), 'allowed');
select pg_temp.expect_text('계약 시작 전, 시범이 끝났으면 outside_period', pg_temp.reason('c_up_after'), 'outside_period');
select pg_temp.expect_text('계약 시작 전, 시범 없으면 예전처럼 outside_period', pg_temp.reason('c_up_none'), 'outside_period');
select pg_temp.expect_text('계약과 유예가 끝났어도 시범기간 안이면 열린다', pg_temp.reason('c_exp_in'), 'allowed');
select pg_temp.expect_text('계약과 유예가 끝나고 시범도 끝났으면 outside_period', pg_temp.reason('c_exp_after'), 'outside_period');
select pg_temp.expect_text('유예 중이어도 시범기간 안이면 열린다', pg_temp.reason('c_grace_in'), 'allowed');
select pg_temp.expect_text('유예 중, 시범 없으면 예전처럼 grace', pg_temp.reason('c_grace_none'), 'grace');
select pg_temp.expect_text('계약 중이면 지난 시범과 상관없이 열린다', pg_temp.reason('c_active_after'), 'allowed');

-- ---------------------------------------------------------------------
-- 시범기간에도 그대로 보는 것: 설정 꺼짐, 한도. 서비스 기간(starts_on, ends_on)은 건너뛴다.
-- ---------------------------------------------------------------------
select pg_temp.mk('s_off', 'TRRRRRRR', null, null, null, pg_temp.today() - 1, pg_temp.today() + 1);
update public.tenant_service_settings set enabled = false where tenant_id = pg_temp.fx('t_s_off');
select pg_temp.expect_text('시범기간이어도 설정이 꺼져 있으면 disabled', pg_temp.reason('s_off'), 'disabled');

select pg_temp.mk('s_cap', 'TRSSSSSS', null, null, null, pg_temp.today() - 1, pg_temp.today() + 1);
update public.tenant_service_settings set monthly_limit = 1 where tenant_id = pg_temp.fx('t_s_cap');
insert into public.tenant_usage_events (profile_id, tenant_id, program_key, source_kind, source_id)
values (pg_temp.fx('s_cap'), pg_temp.fx('t_s_cap'), 'selfeval', 'selfeval_session', gen_random_uuid());
select pg_temp.expect_text('시범기간이어도 월 한도는 그대로 month_cap', pg_temp.reason('s_cap'), 'month_cap');

select pg_temp.mk('s_svc_ended', 'TRTTTTTT', pg_temp.today() - 100, pg_temp.today() + 100, null, pg_temp.today() - 1, pg_temp.today() + 1);
update public.tenant_service_settings set starts_on = pg_temp.today() - 90, ends_on = pg_temp.today() - 30
 where tenant_id = pg_temp.fx('t_s_svc_ended');
select pg_temp.expect_text('서비스 기간이 끝났어도 시범기간 안이면 열린다', pg_temp.reason('s_svc_ended'), 'allowed');
update public.tenants set trial_start_date = null, trial_end_date = null where id = pg_temp.fx('t_s_svc_ended');
select pg_temp.expect_text('시범을 지우면 서비스 기간대로 outside_period', pg_temp.reason('s_svc_ended'), 'outside_period');

-- ---------------------------------------------------------------------
-- 칼럼 제약: 둘 다 비우거나 둘 다 채운다, 시작일 <= 종료일
-- ---------------------------------------------------------------------
select pg_temp.expect_error('시작일이 종료일보다 늦으면 거부',
  format('update public.tenants set trial_start_date = %L, trial_end_date = %L where id = %L',
         pg_temp.today() + 2, pg_temp.today() + 1, pg_temp.fx('t_n_none')), '23514');
select pg_temp.expect_error('시작일만 있으면 거부',
  format('update public.tenants set trial_start_date = %L where id = %L', pg_temp.today(), pg_temp.fx('t_n_none')), '23514');
select pg_temp.expect_error('종료일만 있으면 거부',
  format('update public.tenants set trial_end_date = %L where id = %L', pg_temp.today(), pg_temp.fx('t_n_none')), '23514');
update public.tenants set trial_start_date = pg_temp.today(), trial_end_date = pg_temp.today() where id = pg_temp.fx('t_n_none');
select pg_temp.expect_text('시작일과 종료일이 같은 하루 시범은 받는다', pg_temp.reason('n_none'), 'allowed');

-- ---------------------------------------------------------------------
-- 변경 기록: 기존 기관 계약 변경 기록(settings_change)에 함께 남는다
-- ---------------------------------------------------------------------
update public.tenants set trial_end_date = pg_temp.today() + 7 where id = pg_temp.fx('t_n_none');
select pg_temp.expect_text('시범 종료일 변경이 settings_change 로 남는다(이전 값, 새 값)',
  (select (l.meta -> 'before' ->> 'trial_end_date') || '/' || (l.meta -> 'after' ->> 'trial_end_date')
     from public.admin_access_logs l
    where l.action = 'settings_change' and l.resource_key = 'tenants' and l.target_id = pg_temp.fx('t_n_none')
    order by l.created_at desc limit 1),
  pg_temp.today()::text || '/' || (pg_temp.today() + 7)::text);
select pg_temp.expect_bool('바뀌지 않은 시범 시작일은 기록에 없다',
  (select not (l.meta -> 'after' ? 'trial_start_date')
     from public.admin_access_logs l
    where l.action = 'settings_change' and l.resource_key = 'tenants' and l.target_id = pg_temp.fx('t_n_none')
    order by l.created_at desc limit 1), true);

-- ---------------------------------------------------------------------
-- 시그니처와 권한은 그대로
-- ---------------------------------------------------------------------
select pg_temp.expect_bool('fn_tenant_usage_state 는 security definer 그대로',
  (select prosecdef from pg_proc where oid = 'public.fn_tenant_usage_state(uuid, text)'::regprocedure), true);
select pg_temp.expect_bool('anon, authenticated 는 fn_tenant_usage_state 를 실행할 수 없다',
  not has_function_privilege('anon', 'public.fn_tenant_usage_state(uuid, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.fn_tenant_usage_state(uuid, text)', 'execute'), true);

do $$ begin raise notice '=== b2b-tenant-trial.spec: 전체 통과 ==='; end $$;

rollback;
