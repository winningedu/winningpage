-- =====================================================================
-- B2B 기반 11: 기관 이용 한도(설정, 개별 조정, 사용 기록)와 상태, 소비 함수 SQL 스펙 (T22)
--
-- 실행: 마이그레이션이 전부 적용된 스택에서
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/b2b-usage-limits.spec.sql
--
-- 전체가 한 트랜잭션이고 마지막에 ROLLBACK 한다. 어떤 데이터도 남기지
-- 않는다. 단언 실패는 예외로 터져 psql 이 비정상 종료(ON_ERROR_STOP)한다.
-- =====================================================================
-- =====================================================================
begin;

create function pg_temp.expect_ok(t text, p_sql text) returns void
language plpgsql as $$
begin
  execute p_sql;
  raise notice '[PASS] % 성공', t;
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

create function pg_temp.expect_text(t text, got text, want text) returns void
language plpgsql as $$
begin
  if got is distinct from want then
    raise exception '[FAIL] %: got %, want %', t, got, want;
  end if;
  raise notice '[PASS] % = %', t, want;
end $$;

create function pg_temp.expect_int(t text, got bigint, want bigint) returns void
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



create function pg_temp.mk_user(p_email text, p_tenant uuid default null, p_role text default 'user') returns uuid
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
  values (v_id, p_email, p_role, p_email, p_tenant)
  on conflict (id) do update set role = excluded.role, tenant_id = excluded.tenant_id;
  return v_id;
end $$;

create temp table fx (k text primary key, v uuid);
create function pg_temp.fx(p_k text) returns uuid language sql as $$ select v from fx where k = p_k $$;
create function pg_temp.today() returns date language sql as $$ select (now() at time zone 'Asia/Seoul')::date $$;

-- 기관과 학생 한 명(같은 키). 계약 시작일과 기간(개월)은 시나리오마다 다르다.
create function pg_temp.mk_tenant(p_key text, p_code text, p_start date, p_term smallint, p_end date default null)
returns void language plpgsql as $$
declare
  v_tenant uuid;
begin
  insert into public.tenants (code, name, region, org_type, tier, contract_start_date, term_months, contract_end_date)
  values (p_code, 't22-' || p_key, '서울', '학교', 'B', p_start, p_term, p_end)
  returning id into v_tenant;
  insert into fx values ('t_' || p_key, v_tenant);
  insert into fx values (p_key, pg_temp.mk_user('t22-' || p_key || '@t.local', v_tenant));
end $$;

-- 서비스 설정 한 줄
create function pg_temp.setting(p_key text, p_program text, p_monthly integer, p_term integer,
  p_enabled boolean default true, p_starts date default null, p_ends date default null)
returns void language sql as $$
  insert into public.tenant_service_settings (tenant_id, program_key, enabled, starts_on, ends_on, monthly_limit, term_limit)
  values (pg_temp.fx('t_' || p_key), p_program, p_enabled, p_starts, p_ends, p_monthly, p_term)
$$;

-- 소비 호출. source_id 는 호출마다 새로 만든다(p_source 를 주면 그 값).
create function pg_temp.use(p_key text, p_program text, p_kind text, p_source uuid default null) returns text
language sql as $$
  select public.fn_consume_tenant_usage(pg_temp.fx(p_key), p_program, p_kind, coalesce(p_source, gen_random_uuid()))
$$;

-- 지난 기록 만들기: n 개를 p_months_ago 개월 전 15일에 넣는다.
create function pg_temp.backfill(p_key text, p_program text, p_kind text, p_months_ago integer, p_n integer)
returns void language sql as $$
  insert into public.tenant_usage_events (profile_id, tenant_id, program_key, source_kind, source_id, used_at)
  select pg_temp.fx(p_key), pg_temp.fx('t_' || p_key), p_program, p_kind, gen_random_uuid(),
         date_trunc('month', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'
           - make_interval(months => p_months_ago) + interval '14 days'
  from generate_series(1, p_n)
$$;

-- ---------------------------------------------------------------------
-- fn_consume_tenant_usage: 자기평가 월 2회
-- ---------------------------------------------------------------------
select pg_temp.mk_tenant('self', 'RTAAAAAA', pg_temp.today() - 10, 6::smallint);
select pg_temp.setting('self', 'selfeval', 2, null);
select pg_temp.expect_text('consume: 자기평가 첫 번째', pg_temp.use('self', 'selfeval', 'selfeval_session'), 'consumed');
select pg_temp.expect_text('consume: 자기평가 두 번째', pg_temp.use('self', 'selfeval', 'selfeval_session'), 'consumed');
select pg_temp.expect_text('consume: 자기평가 세 번째는 month_cap', pg_temp.use('self', 'selfeval', 'selfeval_session'), 'month_cap');
select pg_temp.expect_int('consume: 거부된 호출은 기록을 남기지 않는다',
  (select count(*) from public.tenant_usage_events where profile_id = pg_temp.fx('self')), 2);

-- 월 한도가 지나면(달이 바뀌면) 다시 쓸 수 있다
update public.tenant_usage_events set used_at = used_at - interval '1 month'
 where profile_id = pg_temp.fx('self');
select pg_temp.expect_text('consume: 지난달 기록은 이번 달 한도에 세지 않는다',
  pg_temp.use('self', 'selfeval', 'selfeval_session'), 'consumed');

-- ---------------------------------------------------------------------
-- 수행평가: 월 최대 10, 학기 24(6개월 학기)
-- ---------------------------------------------------------------------
select pg_temp.mk_tenant('suh', 'RTBBBBBB', ((pg_temp.today() - interval '5 months')::date), 6::smallint);
select pg_temp.setting('suh', 'suhaeng', 10, 24);
select pg_temp.backfill('suh', 'suhaeng', 'performance_session', 0, 9);
select pg_temp.expect_text('consume: 수행평가 이번 달 10번째', pg_temp.use('suh', 'suhaeng', 'performance_session'), 'consumed');
select pg_temp.expect_text('consume: 수행평가 한 달 11번째는 month_cap', pg_temp.use('suh', 'suhaeng', 'performance_session'), 'month_cap');

select pg_temp.mk_tenant('suh2', 'RTCCCCCC', ((pg_temp.today() - interval '5 months')::date), 6::smallint);
select pg_temp.setting('suh2', 'suhaeng', 10, 24);
select pg_temp.backfill('suh2', 'suhaeng', 'performance_session', 1, 8);
select pg_temp.backfill('suh2', 'suhaeng', 'performance_session', 2, 8);
select pg_temp.backfill('suh2', 'suhaeng', 'performance_session', 3, 8);
select pg_temp.expect_text('consume: 수행평가 학기에 24개를 채우면 term_cap(이번 달은 0)',
  pg_temp.use('suh2', 'suhaeng', 'performance_session'), 'term_cap');

-- 학기가 지나면 초기화: 계약 시작 7개월 전, 지난 학기에 24개
select pg_temp.mk_tenant('suh3', 'RTDDDDDD', ((pg_temp.today() - interval '7 months')::date), 6::smallint);
select pg_temp.setting('suh3', 'suhaeng', 10, 24);
select pg_temp.backfill('suh3', 'suhaeng', 'performance_session', 3, 8);
select pg_temp.backfill('suh3', 'suhaeng', 'performance_session', 4, 8);
select pg_temp.backfill('suh3', 'suhaeng', 'performance_session', 5, 8);
select pg_temp.expect_text('consume: 지난 학기 기록은 새 학기에 세지 않는다',
  pg_temp.use('suh3', 'suhaeng', 'performance_session'), 'consumed');
select pg_temp.expect_text('state: 새 학기 사용량 1, 다음 초기화일이 오늘 이후',
  (select s.term_used || '/' || (s.term_resets_on > pg_temp.today())
     from public.fn_tenant_usage_state(pg_temp.fx('suh3'), 'suhaeng') s), '1/true');

-- 분기 운영 기관은 학기 12
select pg_temp.mk_tenant('q', 'RTEEEEEE', ((pg_temp.today() - interval '2 months')::date), 3::smallint);
select pg_temp.setting('q', 'suhaeng', 10, 12);
select pg_temp.backfill('q', 'suhaeng', 'performance_session', 1, 6);
select pg_temp.backfill('q', 'suhaeng', 'performance_session', 2, 6);
select pg_temp.backfill('q', 'suhaeng', 'performance_session', 4, 10);
select pg_temp.expect_text('consume: 분기 기관은 12 에서 term_cap(지난 분기 10개는 제외)',
  pg_temp.use('q', 'suhaeng', 'performance_session'), 'term_cap');

-- 4개월 체험도 학기 한도 24 를 그대로 쓴다
select pg_temp.mk_tenant('trial', 'RTFFFFFF', ((pg_temp.today() - interval '5 months')::date), 6::smallint);
select pg_temp.setting('trial', 'suhaeng', 10, 24, true,
  ((pg_temp.today() - interval '3 months')::date), ((pg_temp.today() + interval '1 month')::date));
select pg_temp.backfill('trial', 'suhaeng', 'performance_session', 3, 8);
select pg_temp.backfill('trial', 'suhaeng', 'performance_session', 2, 8);
select pg_temp.backfill('trial', 'suhaeng', 'performance_session', 1, 7);
select pg_temp.expect_text('consume: 체험 4개월은 24번째까지 허용', pg_temp.use('trial', 'suhaeng', 'performance_session'), 'consumed');
select pg_temp.expect_text('consume: 체험 25번째는 term_cap', pg_temp.use('trial', 'suhaeng', 'performance_session'), 'term_cap');

-- ---------------------------------------------------------------------
-- 멱등: 같은 과제는 한 번만
-- ---------------------------------------------------------------------
select pg_temp.mk_tenant('idem', 'RTGGGGGG', pg_temp.today() - 10, 6::smallint);
select pg_temp.setting('idem', 'selfeval', 2, null);
create temp table src as select gen_random_uuid() as id;
select pg_temp.expect_text('idem: 첫 호출', pg_temp.use('idem', 'selfeval', 'selfeval_session', (select id from src)), 'consumed');
select pg_temp.expect_text('idem: 같은 과제 두 번째는 already_consumed',
  pg_temp.use('idem', 'selfeval', 'selfeval_session', (select id from src)), 'already_consumed');
select pg_temp.expect_int('idem: 기록은 한 줄', (select count(*) from public.tenant_usage_events where source_id = (select id from src)), 1);
select pg_temp.expect_ok('idem: 다른 종류에서는 같은 source_id 도 별개 과제로 센다',
  $$select pg_temp.use('idem', 'selfeval', 'inquiry_session', (select id from src))$$);
select pg_temp.expect_text('idem: 한도에 찬 뒤에도 이미 센 과제는 already_consumed',
  pg_temp.use('idem', 'selfeval', 'selfeval_session', (select id from src)), 'already_consumed');
select pg_temp.expect_error('idem: 기록 테이블은 같은 과제를 두 줄 받지 않는다',
  $$insert into public.tenant_usage_events (profile_id, tenant_id, program_key, source_kind, source_id)
    values (pg_temp.fx('idem'), pg_temp.fx('t_idem'), 'selfeval', 'selfeval_session', (select id from src))$$, '23505');

-- ---------------------------------------------------------------------
-- 학생별 조정이 기관 설정보다 우선
-- ---------------------------------------------------------------------
select pg_temp.mk_tenant('ovr', 'RTHHHHHH', pg_temp.today() - 10, 6::smallint);
insert into fx values ('ovr2', pg_temp.mk_user('t22-ovr2@t.local', pg_temp.fx('t_ovr')));
select pg_temp.setting('ovr', 'selfeval', 2, null);
insert into public.student_usage_overrides (profile_id, program_key, monthly_limit, updated_by)
  values (pg_temp.fx('ovr'), 'selfeval', 4, pg_temp.fx('ovr'));
select pg_temp.use('ovr', 'selfeval', 'selfeval_session');
select pg_temp.use('ovr', 'selfeval', 'selfeval_session');
select pg_temp.expect_text('override: 기관 한도 2 를 넘어 조정값 4 까지', pg_temp.use('ovr', 'selfeval', 'selfeval_session'), 'consumed');
select pg_temp.use('ovr', 'selfeval', 'selfeval_session');
select pg_temp.expect_text('override: 조정값 4 에서 month_cap', pg_temp.use('ovr', 'selfeval', 'selfeval_session'), 'month_cap');
select pg_temp.use('ovr2', 'selfeval', 'selfeval_session');
select pg_temp.use('ovr2', 'selfeval', 'selfeval_session');
select pg_temp.expect_text('override: 조정 없는 같은 기관 학생은 기관 한도 2', pg_temp.use('ovr2', 'selfeval', 'selfeval_session'), 'month_cap');

-- ---------------------------------------------------------------------
-- 꺼짐, 설정 없음, 기간 밖
-- ---------------------------------------------------------------------
select pg_temp.mk_tenant('off', 'RTJJJJJJ', pg_temp.today() - 10, 6::smallint, pg_temp.today() + 100);
select pg_temp.setting('off', 'selfeval', 2, null, false);
select pg_temp.setting('off', 'growth', 1, null, true, pg_temp.today() + 1, null);
select pg_temp.setting('off', 'diagnose', 1, null, true, null, pg_temp.today() - 1);
select pg_temp.setting('off', 'inquiry', 1, null);
select pg_temp.expect_text('disabled: 꺼진 서비스', pg_temp.use('off', 'selfeval', 'selfeval_session'), 'disabled');
select pg_temp.expect_text('disabled: 설정 행이 없는 서비스', pg_temp.use('off', 'suhaeng', 'performance_session'), 'disabled');
select pg_temp.expect_text('outside_period: 서비스 시작 전', pg_temp.use('off', 'growth', 'growth_report'), 'outside_period');
select pg_temp.expect_text('outside_period: 서비스 종료 후', pg_temp.use('off', 'diagnose', 'diagnosis_attempt'), 'outside_period');
select pg_temp.expect_text('period: 서비스 기간이 없으면 기관 계약일(진행 중)을 따른다',
  pg_temp.use('off', 'inquiry', 'inquiry_session'), 'consumed');
select pg_temp.mk_tenant('ended', 'RTKKKKKK', pg_temp.today() - 100, 6::smallint, pg_temp.today() - 1);
select pg_temp.setting('ended', 'inquiry', 5, null);
select pg_temp.expect_text('outside_period: 기관 계약 종료 후', pg_temp.use('ended', 'inquiry', 'inquiry_session'), 'outside_period');
-- 유예기간(사 #160, 결정 r15): 계약 종료 뒤 유예 종료일(없으면 종료일 + app_settings.contract_grace_days) 까지는 grace
update public.tenants set grace_ends_on = pg_temp.today() + 5 where id = pg_temp.fx('t_ended');
select pg_temp.expect_text('grace: 유예 종료일 안이면 grace(아직 막힘, 삭제 전)',
  pg_temp.use('ended', 'inquiry', 'inquiry_session'), 'grace');
select pg_temp.expect_bool('grace: 상태 조회는 허용하지 않는다',
  (select not allowed and deny_reason = 'grace' from public.fn_tenant_usage_state(pg_temp.fx('ended'), 'inquiry')), true);
update public.tenants set grace_ends_on = pg_temp.today() - 1 where id = pg_temp.fx('t_ended');
select pg_temp.expect_text('grace: 유예 종료일이 지났으면 outside_period',
  pg_temp.use('ended', 'inquiry', 'inquiry_session'), 'outside_period');
update public.tenants set grace_ends_on = null where id = pg_temp.fx('t_ended');
insert into public.app_settings (key, value) values ('contract_grace_days', '30'::jsonb)
  on conflict (key) do update set value = '30'::jsonb;
select pg_temp.mk_tenant('ended2', 'RTQQQQQQ', pg_temp.today() - 100, 6::smallint, pg_temp.today() - 10);
select pg_temp.setting('ended2', 'inquiry', 5, null);
select pg_temp.expect_text('grace: 유예 종료일이 없으면 종료일 + 공통 일수(30)까지 grace',
  pg_temp.use('ended2', 'inquiry', 'inquiry_session'), 'grace');
select pg_temp.mk_tenant('ended3', 'RTPPPPPP', pg_temp.today() - 100, 6::smallint, pg_temp.today() - 40);
select pg_temp.setting('ended3', 'inquiry', 5, null);
select pg_temp.expect_text('grace: 종료일 + 30일을 넘기면 outside_period',
  pg_temp.use('ended3', 'inquiry', 'inquiry_session'), 'outside_period');
update public.tenants set grace_ends_on = pg_temp.today() + 3 where id = pg_temp.fx('t_ended3');
select pg_temp.expect_text('grace: 기관별 유예 종료일이 공통 일수보다 우선한다',
  pg_temp.use('ended3', 'inquiry', 'inquiry_session'), 'grace');
select pg_temp.expect_text('grace: 계약 진행 중인 기관은 유예와 무관하다',
  (select coalesce(deny_reason, '-') from public.fn_tenant_usage_state(pg_temp.fx('off'), 'inquiry')), 'month_cap');
delete from public.app_settings where key = 'contract_grace_days';
insert into fx values ('loose', pg_temp.mk_user('t22-loose@t.local'));
select pg_temp.expect_text('disabled: 소속 기관이 없는 학생', pg_temp.use('loose', 'inquiry', 'inquiry_session'), 'disabled');

-- ---------------------------------------------------------------------
-- 한도를 낮추면 남은 횟수 0, 이미 시작한 과제는 이어서 한다
-- ---------------------------------------------------------------------
select pg_temp.mk_tenant('low', 'RTNNNNNN', pg_temp.today() - 10, 6::smallint);
select pg_temp.setting('low', 'selfeval', 2, null);
create temp table lowsrc as select gen_random_uuid() as id;
select pg_temp.use('low', 'selfeval', 'selfeval_session', (select id from lowsrc));
select pg_temp.use('low', 'selfeval', 'selfeval_session');
select pg_temp.expect_text('state: 한도 2 에서 사용 2 이면 남은 0 으로 불허',
  (select s.allowed || '/' || s.month_used || '/' || s.month_limit || '/' || s.month_remaining || '/' || s.deny_reason
     from public.fn_tenant_usage_state(pg_temp.fx('low'), 'selfeval') s), 'false/2/2/0/month_cap');
update public.tenant_service_settings set monthly_limit = 1 where tenant_id = pg_temp.fx('t_low');
select pg_temp.expect_text('state: 한도를 1 로 낮추면 남은 횟수는 음수가 아니라 0',
  (select s.month_remaining::text from public.fn_tenant_usage_state(pg_temp.fx('low'), 'selfeval') s), '0');
select pg_temp.expect_text('state: 시작한 과제는 한도를 낮춰도 이어진다',
  pg_temp.use('low', 'selfeval', 'selfeval_session', (select id from lowsrc)), 'already_consumed');
select pg_temp.expect_text('state: 상한이 없으면 남은 횟수 null 과 허용',
  (select s.allowed || '/' || coalesce(s.term_limit::text, 'null') || '/' || coalesce(s.term_remaining::text, 'null')
     from public.fn_tenant_usage_state(pg_temp.fx('self'), 'selfeval') s where s.allowed is not null), 'true/null/null');

-- ---------------------------------------------------------------------
-- RLS: 본사 기관 관리 권한이 설정을, 서비스이용횟수조정 권한이 학생별 조정을 읽고 쓴다. 학생은 못 읽는다.
-- ---------------------------------------------------------------------
insert into public.admin_resources (key, group_title, label) values
  ('tenants', 't22', '기관'), ('serviceCreditAdjust', 't22', '서비스이용횟수조정')
on conflict (key) do nothing;
insert into fx values
  ('hq_view', pg_temp.mk_user('t22-hqv@t.local', null, 'admin')),
  ('hq_edit', pg_temp.mk_user('t22-hqe@t.local', null, 'admin')),
  ('hq_none', pg_temp.mk_user('t22-hqn@t.local', null, 'admin'));
insert into public.admin_members (profile_id, status) select v, 'active' from fx where k in ('hq_view', 'hq_edit', 'hq_none');
insert into public.admin_member_permissions (profile_id, resource_key, level) values
  (pg_temp.fx('hq_view'), 'tenants', 'view'), (pg_temp.fx('hq_view'), 'serviceCreditAdjust', 'view'),
  (pg_temp.fx('hq_edit'), 'tenants', 'edit'), (pg_temp.fx('hq_edit'), 'serviceCreditAdjust', 'edit');

grant execute on function pg_temp.expect_error(text, text, text) to anon, authenticated;
grant execute on function pg_temp.expect_int(text, bigint, bigint) to authenticated;
grant execute on function pg_temp.expect_ok(text, text) to authenticated;
grant execute on function pg_temp.expect_text(text, text, text) to authenticated;
grant execute on function pg_temp.fx(text) to authenticated;

select set_config('request.jwt.claim.sub', pg_temp.fx('hq_view')::text, true);
set local role authenticated;
select pg_temp.expect_int('rls: tenants view 는 서비스 설정을 읽는다',
  (select count(*) from public.tenant_service_settings where program_key = 'selfeval'), 5);
select pg_temp.expect_int('rls: serviceCreditAdjust view 는 학생별 조정을 읽는다',
  (select count(*) from public.student_usage_overrides), 1);
select pg_temp.expect_ok('rls: tenants view 의 update 는 오류 없이 0행에 적용된다',
  $$update public.tenant_service_settings set monthly_limit = 9$$);
reset role;
select pg_temp.expect_text('rls: view 권한의 update 는 행을 바꾸지 못한다',
  (select count(*) filter (where monthly_limit = 9) from public.tenant_service_settings)::text, '0');

select set_config('request.jwt.claim.sub', pg_temp.fx('hq_edit')::text, true);
set local role authenticated;
select pg_temp.expect_ok('rls: tenants edit 는 서비스 설정을 넣는다',
  $$insert into public.tenant_service_settings (tenant_id, program_key, monthly_limit)
    select id, 'target', 3 from public.tenants where code = 'RTAAAAAA'$$);
select pg_temp.expect_ok('rls: tenants edit 는 서비스 설정을 고친다',
  $$update public.tenant_service_settings set monthly_limit = 4 where program_key = 'target'$$);
select pg_temp.expect_text('rls: 고친 값이 보인다',
  (select monthly_limit::text from public.tenant_service_settings where program_key = 'target'), '4');
select pg_temp.expect_ok('rls: serviceCreditAdjust edit 는 학생별 조정을 넣는다',
  $$insert into public.student_usage_overrides (profile_id, program_key, term_limit, updated_by)
    select id, 'target', 5, id from public.profiles where email = 't22-self@t.local'$$);
select pg_temp.expect_error('rls: 기관 설정 삭제는 허용하지 않는다(42501)',
  $$delete from public.tenant_service_settings$$, '42501');
reset role;

select set_config('request.jwt.claim.sub', pg_temp.fx('hq_none')::text, true);
set local role authenticated;
select pg_temp.expect_int('rls: 권한 없는 관리자는 설정이 0행',
  (select count(*) from public.tenant_service_settings), 0);
select pg_temp.expect_int('rls: 권한 없는 관리자는 조정이 0행',
  (select count(*) from public.student_usage_overrides), 0);
reset role;

select set_config('request.jwt.claim.sub', pg_temp.fx('self')::text, true);
set local role authenticated;
select pg_temp.expect_int('rls: 학생은 서비스 설정이 0행', (select count(*) from public.tenant_service_settings), 0);
select pg_temp.expect_int('rls: 학생은 조정이 0행', (select count(*) from public.student_usage_overrides), 0);
select pg_temp.expect_error('rls: 학생은 사용 기록을 읽지 못한다(42501)',
  $$select count(*) from public.tenant_usage_events$$, '42501');
select pg_temp.expect_error('rls: 학생은 설정을 넣지 못한다',
  $$insert into public.tenant_service_settings (tenant_id, program_key, monthly_limit)
    values (gen_random_uuid(), 'growth', 3)$$, '42501');
-- 학생 본인 상태(fn_my_usage_state)는 자기 값만 본다
select pg_temp.expect_text('my_usage_state: 학생 본인의 자기평가 상태(이번 달 1회, 한도 2)',
  (select s.allowed || '/' || s.month_used || '/' || s.month_limit from public.fn_my_usage_state('selfeval') s), 'true/1/2');
reset role;

-- 함수 권한
set local role anon;
select pg_temp.expect_error('anon 은 fn_tenant_usage_state 실행 불가',
  $$select * from public.fn_tenant_usage_state(gen_random_uuid(), 'selfeval')$$, '42501');
select pg_temp.expect_error('anon 은 fn_consume_tenant_usage 실행 불가',
  $$select public.fn_consume_tenant_usage(gen_random_uuid(), 'selfeval', 'selfeval_session', gen_random_uuid())$$, '42501');
select pg_temp.expect_error('anon 은 fn_my_usage_state 실행 불가',
  $$select * from public.fn_my_usage_state('selfeval')$$, '42501');
reset role;
set local role authenticated;
select pg_temp.expect_error('authenticated 는 fn_tenant_usage_state 실행 불가',
  $$select * from public.fn_tenant_usage_state(gen_random_uuid(), 'selfeval')$$, '42501');
select pg_temp.expect_error('authenticated 는 fn_consume_tenant_usage 실행 불가',
  $$select public.fn_consume_tenant_usage(gen_random_uuid(), 'selfeval', 'selfeval_session', gen_random_uuid())$$, '42501');
reset role;

do $$ begin raise notice '=== b2b-usage-limits.spec: 전체 통과 ==='; end $$;

rollback;
