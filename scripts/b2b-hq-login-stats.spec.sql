-- =====================================================================
-- 본사 대시보드 로그인 통계 SQL 스펙: fn_hq_login_buckets(DAU, MAU, 기간 묶음, 추정 표시),
-- fn_hq_login_log(로그인 기록 표) (분석 grill Q1, Q7, Q13)
--
-- 실행: 마이그레이션이 전부 적용된 스택에서
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/b2b-hq-login-stats.spec.sql
--
-- 전체가 한 트랜잭션이고 마지막에 ROLLBACK 한다. 날짜는 2001년을 써서 로컬 스택에 쌓인 활동 기록과
-- 겹치지 않게 한다. 단언 실패는 예외로 터져 psql 이 비정상 종료(ON_ERROR_STOP)한다.
-- =====================================================================
begin;

create function pg_temp.expect_bool(t text, got boolean, want boolean) returns void
language plpgsql as $$
begin
  if got is distinct from want then
    raise exception '[FAIL] %: got %, want %', t, got, want;
  end if;
  raise notice '[PASS] % = %', t, want;
end $$;

create function pg_temp.expect_text(t text, got text, want text) returns void
language plpgsql as $$
begin
  if got is distinct from want then
    raise exception '[FAIL] %: got %, want %', t, got, want;
  end if;
  raise notice '[PASS] % = %', t, want;
end $$;

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

create function pg_temp.mk_user(p_email text, p_role text, p_type text) returns uuid
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
  insert into public.profiles (id, name, role, email, member_type)
  values (v_id, p_email, p_role, p_email, p_type)
  on conflict (id) do update set role = excluded.role, member_type = excluded.member_type, name = excluded.name;
  return v_id;
end $$;

create temp table fx (k text primary key, v uuid);
insert into fx values
  ('s1', pg_temp.mk_user('hqs-s1@t.local', 'user', 'student')),
  ('s2', pg_temp.mk_user('hqs-s2@t.local', 'user', 'student')),
  ('p1', pg_temp.mk_user('hqs-p1@t.local', 'user', 'parent')),
  ('qa', pg_temp.mk_user('hqs-qa@t.local', 'user', 'student')),
  ('adm', pg_temp.mk_user('hqs-adm@t.local', 'admin', null));
create function pg_temp.fx(p_k text) returns uuid language sql as $$ select v from fx where k = p_k $$;
insert into public.qa_accounts (profile_id) values (pg_temp.fx('qa'));

insert into public.tenants (code, name, region, org_type, tier) values ('HQSPECAB', '스펙고', '서울', '학교', 'S')
  on conflict do nothing;
update public.profiles set tenant_id = (select id from public.tenants where code = 'HQSPECAB')
 where id = pg_temp.fx('s1');

-- 이 스펙의 기록만 보이도록 로그인 기록을 비운다(트랜잭션 안이라 ROLLBACK 으로 되돌아간다).
delete from public.profile_login_slots;

-- 실측은 2001-03-10 부터. 그 전은 활동 기록으로 추정한다. 15분 칸(slot_start)으로 적는다.
-- 같은 날 같은 회원의 두 번째 칸(s1 03-10 09:15)은 하루 한 명으로만 센다.
insert into public.profile_login_slots (profile_id, slot_start) values
  (pg_temp.fx('s1'), timestamptz '2001-03-10 09:00+09'),
  (pg_temp.fx('s1'), timestamptz '2001-03-10 09:15+09'),
  (pg_temp.fx('s2'), timestamptz '2001-03-10 10:00+09'),
  (pg_temp.fx('p1'), timestamptz '2001-03-11 08:00+09'),
  (pg_temp.fx('s1'), timestamptz '2001-03-12 07:00+09'),
  (pg_temp.fx('qa'), timestamptz '2001-03-12 11:00+09'),
  (pg_temp.fx('adm'), timestamptz '2001-03-12 12:00+09'),
  (pg_temp.fx('s2'), timestamptz '2001-04-02 09:00+09'),
  -- 시간대별 하루 경계 확인용(2001-06): 서울 6/21 00:30, UTC 6/20 15:30, 로스앤젤레스 6/20 08:30
  (pg_temp.fx('p1'), timestamptz '2001-06-20 15:30+00'),
  (pg_temp.fx('s2'), timestamptz '2001-06-30 16:00+00');

-- 추정용 활동 기록: KST 경계(UTC 15:00 이 KST 다음 날 00:00)
-- 2001-02-28 14:59:59 UTC = KST 2001-02-28 23:59:59, 2001-02-28 15:00 UTC = KST 2001-03-01 00:00
insert into public.diagnosis_attempts (id, profile_id, kind, created_at) values
  (gen_random_uuid(), pg_temp.fx('s1'), 'free', timestamptz '2001-02-28 14:59:59+00'),
  (gen_random_uuid(), pg_temp.fx('s2'), 'free', timestamptz '2001-02-28 15:00:00+00');
insert into public.ai_model_calls (profile_id, kind, service, feature, model, status, created_at, started_at, trace_id, latency_ms) values
  (pg_temp.fx('p1'), 'generate', 'growth', 'spec', 'm', 'ok', timestamptz '2001-03-05 12:00+09', timestamptz '2001-03-05 12:00+09', gen_random_uuid(), 1),
  (null, 'generate', 'growth', 'spec', 'm', 'ok', timestamptz '2001-03-05 12:00+09', timestamptz '2001-03-05 12:00+09', gen_random_uuid(), 1),
  (pg_temp.fx('qa'), 'generate', 'growth', 'spec', 'm', 'ok', timestamptz '2001-03-05 13:00+09', timestamptz '2001-03-05 13:00+09', gen_random_uuid(), 1);
insert into public.growth_profiles (profile_id, survey_saved_at) values
  (pg_temp.fx('s1'), timestamptz '2001-03-05 20:00+09');

-- 일, 주, 달 묶음 결과를 쉽게 꺼내는 도우미
create function pg_temp.bz(p_from date, p_to date, p_grain text, p_mode text, p_inc boolean, p_tz text)
returns table (bucket_start date, bucket_end date, source text, members bigint, by_member_type jsonb)
language sql as $$ select * from public.fn_hq_login_buckets(p_from, p_to, p_grain, p_mode, p_inc, 'all', p_tz) $$;
create function pg_temp.b(p_from date, p_to date, p_grain text, p_mode text, p_inc boolean)
returns table (bucket_start date, bucket_end date, source text, members bigint, by_member_type jsonb)
language sql as $$ select * from pg_temp.bz(p_from, p_to, p_grain, p_mode, p_inc, 'Asia/Seoul') $$;

-- ---------------------------------------------------------------------
-- 일 단위(DAU), KST 경계, 실측과 추정과 기록 없음
-- ---------------------------------------------------------------------
select pg_temp.expect_text('KST 2/28 23:59:59 활동은 2/28 추정 1명',
  (select source || ':' || members from pg_temp.b('2001-02-28', '2001-02-28', 'day', 'calendar', false)), 'estimated:1');
select pg_temp.expect_text('UTC 2/28 15:00 활동은 KST 3/1 로 센다',
  (select source || ':' || members from pg_temp.b('2001-03-01', '2001-03-01', 'day', 'calendar', false)), 'estimated:1');
select pg_temp.expect_text('활동도 로그인 기록도 없는 날은 기록 없음 0',
  (select source || ':' || members from pg_temp.b('2001-03-02', '2001-03-02', 'day', 'calendar', false)), 'none:0');
select pg_temp.expect_text('추정은 여러 원천을 회원별로 한 번만 센다(성장 설문과 AI 호출, profile_id 없는 호출은 뺀다)',
  (select source || ':' || members from pg_temp.b('2001-03-05', '2001-03-05', 'day', 'calendar', false)), 'estimated:2');
select pg_temp.expect_text('첫 실측일 이후는 실측',
  (select source || ':' || members from pg_temp.b('2001-03-10', '2001-03-10', 'day', 'calendar', false)), 'measured:2');
select pg_temp.expect_text('첫 실측일 이후 로그인 0명인 날도 실측 0',
  (select source || ':' || members from pg_temp.b('2001-03-13', '2001-03-13', 'day', 'calendar', false)), 'measured:0');
select pg_temp.expect_text('일 묶음은 기간의 날마다 한 줄이다',
  (select string_agg(bucket_start::text || '=' || bucket_end::text, ',' order by bucket_start)
     from pg_temp.b('2001-03-09', '2001-03-11', 'day', 'calendar', false)),
  '2001-03-09=2001-03-09,2001-03-10=2001-03-10,2001-03-11=2001-03-11');
select pg_temp.expect_text('회원 유형별 인원',
  (select by_member_type::text from pg_temp.b('2001-03-10', '2001-03-11', 'day', 'calendar', false)
    where bucket_start = '2001-03-11'), '{"parent": 1}');

-- ---------------------------------------------------------------------
-- 기본 제외(QA, 본사 관리자)와 포함 스위치
-- ---------------------------------------------------------------------
select pg_temp.expect_text('3/12 기본은 QA, 관리자를 빼고 1명',
  (select members::text from pg_temp.b('2001-03-12', '2001-03-12', 'day', 'calendar', false)), '1');
select pg_temp.expect_text('포함 스위치를 켜면 3명',
  (select members::text from pg_temp.b('2001-03-12', '2001-03-12', 'day', 'calendar', true)), '3');
select pg_temp.expect_text('포함하면 유형 없는 관리자는 none 키로 센다',
  (select by_member_type::text from pg_temp.b('2001-03-12', '2001-03-12', 'day', 'calendar', true)),
  '{"none": 1, "student": 2}');
select pg_temp.expect_text('추정도 QA 를 빼고 포함 스위치로 센다',
  (select members::text from pg_temp.b('2001-03-05', '2001-03-05', 'day', 'calendar', true)), '3');

-- ---------------------------------------------------------------------
-- 주 묶음: 월요일 시작, 기간 양 끝은 잘라 낸다
-- ---------------------------------------------------------------------
-- 2001-03-05 는 월요일, 2001-03-12 도 월요일
select pg_temp.expect_text('주 묶음은 월요일 시작이고 기간 끝에서 자른다',
  (select string_agg(bucket_start::text || '=' || bucket_end::text || ':' || source || ':' || members, ',' order by bucket_start)
     from pg_temp.b('2001-03-07', '2001-03-13', 'week', 'calendar', false)),
  '2001-03-07=2001-03-11:estimated:3,2001-03-12=2001-03-13:measured:1');

-- ---------------------------------------------------------------------
-- 달 묶음: 달력 기준과 최근 30일 기준(Q7)
-- ---------------------------------------------------------------------
select pg_temp.expect_text('달력 기준은 달마다 한 줄, 첫 실측일이 걸친 달은 추정',
  (select string_agg(bucket_start::text || '=' || bucket_end::text || ':' || source || ':' || members, ',' order by bucket_start)
     from pg_temp.b('2001-02-15', '2001-04-30', 'month', 'calendar', false)),
  '2001-02-15=2001-02-28:estimated:1,2001-03-01=2001-03-31:estimated:3,2001-04-01=2001-04-30:measured:1');
select pg_temp.expect_text('최근 30일 기준은 끝날에서 30일씩 거슬러 묶고 시작일에서 자른다',
  (select string_agg(bucket_start::text || '=' || bucket_end::text || ':' || source || ':' || members, ',' order by bucket_start)
     from pg_temp.b('2001-02-20', '2001-04-10', 'month', 'rolling30', false)),
  '2001-02-20=2001-03-11:estimated:3,2001-03-12=2001-04-10:measured:2');
select pg_temp.expect_text('최근 30일 기준에서 기간이 30일이면 한 줄',
  (select string_agg(bucket_start::text || '=' || bucket_end::text, ',')
     from pg_temp.b('2001-03-12', '2001-04-10', 'month', 'rolling30', false)),
  '2001-03-12=2001-04-10');

-- ---------------------------------------------------------------------
-- 시간대 인자: 같은 기록도 보는 사람의 시간대에 따라 하루가 달라진다
-- ---------------------------------------------------------------------
select pg_temp.expect_text('2001-06-20 15:30 UTC 칸은 서울에서 6/21, UTC 와 로스앤젤레스에서 6/20 로 센다',
  (select string_agg(tz || ':' || d || '=' || members, ',' order by tz, d) from (
     select 'seoul' tz, bucket_start::text d, members from pg_temp.bz('2001-06-19', '2001-06-21', 'day', 'calendar', false, 'Asia/Seoul')
     union all select 'utc', bucket_start::text, members from pg_temp.bz('2001-06-19', '2001-06-21', 'day', 'calendar', false, 'UTC')
     union all select 'la', bucket_start::text, members from pg_temp.bz('2001-06-19', '2001-06-21', 'day', 'calendar', false, 'America/Los_Angeles')) x
    where members > 0),
  'la:2001-06-20=1,seoul:2001-06-21=1,utc:2001-06-20=1');
select pg_temp.expect_text('달 묶음도 시간대로 갈린다: 6/30 16:00 UTC 는 서울 7월, UTC 6월',
  (select string_agg(bucket_start::text || ':' || source || ':' || members, ',' order by bucket_start)
     from pg_temp.bz('2001-06-01', '2001-07-31', 'month', 'calendar', false, 'Asia/Seoul')),
  '2001-06-01:measured:1,2001-07-01:measured:1');
select pg_temp.expect_text('같은 기간을 UTC 로 보면 6월 2명, 7월 0명',
  (select string_agg(bucket_start::text || ':' || source || ':' || members, ',' order by bucket_start)
     from pg_temp.bz('2001-06-01', '2001-07-31', 'month', 'calendar', false, 'UTC')),
  '2001-06-01:measured:2,2001-07-01:measured:0');
select pg_temp.expect_text('추정 경로도 보는 사람 시간대를 쓴다: UTC 로 보면 2/28 15:00 UTC 활동이 2/28',
  (select source || ':' || members from pg_temp.bz('2001-02-28', '2001-02-28', 'day', 'calendar', false, 'UTC')), 'estimated:2');
select pg_temp.expect_text('같은 활동을 서울로 보면 2/28 은 1명',
  (select source || ':' || members from pg_temp.bz('2001-02-28', '2001-02-28', 'day', 'calendar', false, 'Asia/Seoul')), 'estimated:1');
select pg_temp.expect_error('모르는 시간대는 거부',
  $$select * from public.fn_hq_login_buckets('2001-03-01', '2001-03-02', 'day', 'calendar', false, 'all', 'KST')$$, '22023');

-- ---------------------------------------------------------------------
-- 입력 검사와 권한
-- ---------------------------------------------------------------------
select pg_temp.expect_error('시작일이 종료일보다 늦으면 거부',
  $$select * from public.fn_hq_login_buckets('2001-03-02', '2001-03-01', 'day', 'calendar', false, 'all', 'Asia/Seoul')$$, '22023');
select pg_temp.expect_error('모르는 묶음 단위는 거부',
  $$select * from public.fn_hq_login_buckets('2001-03-01', '2001-03-02', 'year', 'calendar', false, 'all', 'Asia/Seoul')$$, '22023');
select pg_temp.expect_error('모르는 MAU 기준은 거부',
  $$select * from public.fn_hq_login_buckets('2001-03-01', '2001-03-02', 'month', 'weekly', false, 'all', 'Asia/Seoul')$$, '22023');
select pg_temp.expect_error('날짜가 비면 거부',
  $$select * from public.fn_hq_login_buckets(null, '2001-03-02', 'day', 'calendar', false, 'all', 'Asia/Seoul')$$, '22023');

-- ---------------------------------------------------------------------
-- fn_hq_login_log: 로그인 기록 표(Q13). 최근 날짜, 늦게 처음 들어온 순, 쪽 나눔
-- ---------------------------------------------------------------------
select pg_temp.expect_text('기간 안 기록을 최근 순으로, 전체 건수와 함께',
  (select string_agg(login_date::text || ' ' || name || ' ' || coalesce(member_type, '-') || ' ' || total_count, ',' order by login_date desc, first_seen_at desc)
     from public.fn_hq_login_log('2001-03-10', '2001-03-12', false, 50, 0, 'Asia/Seoul')),
  '2001-03-12 hqs-s1@t.local student 4,2001-03-11 hqs-p1@t.local parent 4,2001-03-10 hqs-s2@t.local student 4,2001-03-10 hqs-s1@t.local student 4');
select pg_temp.expect_text('돌려주는 순서 자체가 최근 날짜, 늦게 처음 들어온 순이다',
  (select string_agg(name, ',') from public.fn_hq_login_log('2001-03-10', '2001-03-10', false, 50, 0, 'Asia/Seoul')),
  'hqs-s2@t.local,hqs-s1@t.local');
select pg_temp.expect_text('쪽 나눔은 limit, offset 을 따르고 전체 건수는 그대로',
  (select string_agg(name || ' ' || total_count, ',') from public.fn_hq_login_log('2001-03-10', '2001-03-12', false, 2, 1, 'Asia/Seoul')),
  'hqs-p1@t.local 4,hqs-s2@t.local 4');
select pg_temp.expect_text('소속 기관 이름과 처음 접속 시각',
  (select tenant_name || ' ' || to_char(first_seen_at at time zone 'Asia/Seoul', 'HH24:MI')
     from public.fn_hq_login_log('2001-03-12', '2001-03-12', false, 50, 0, 'Asia/Seoul')), '스펙고 07:00');
select pg_temp.expect_text('포함 스위치를 켜면 QA, 관리자 기록도 보인다',
  (select max(total_count)::text from public.fn_hq_login_log('2001-03-10', '2001-03-12', true, 50, 0, 'Asia/Seoul')), '6');
select pg_temp.expect_text('기간 밖은 비어 있다',
  (select count(*)::text from public.fn_hq_login_log('2001-03-13', '2001-03-31', false, 50, 0, 'Asia/Seoul')), '0');
select pg_temp.expect_text('기록 표는 보는 사람 시간대의 날과 처음 접속 시각(순간)을 돌려준다',
  (select string_agg(tz || ':' || login_date || ' ' || to_char(first_seen_at at time zone 'UTC', 'HH24:MI'), ',' order by tz) from (
     select 'seoul' tz, login_date, first_seen_at from public.fn_hq_login_log('2001-06-19', '2001-06-21', false, 50, 0, 'Asia/Seoul')
     union all select 'utc', login_date, first_seen_at from public.fn_hq_login_log('2001-06-19', '2001-06-21', false, 50, 0, 'UTC')) x),
  'seoul:2001-06-21 15:30,utc:2001-06-20 15:30');
select pg_temp.expect_text('같은 날 두 칸이면 첫 칸 시각 한 줄(s1 서울 3/10 09:00 과 09:15)',
  (select count(*)::text || ' ' || to_char(min(first_seen_at) at time zone 'Asia/Seoul', 'HH24:MI')
     from public.fn_hq_login_log('2001-03-10', '2001-03-10', false, 50, 0, 'Asia/Seoul') where name = 'hqs-s1@t.local'), '1 09:00');
select pg_temp.expect_error('모르는 시간대는 기록 표도 거부',
  $$select * from public.fn_hq_login_log('2001-03-10', '2001-03-12', false, 50, 0, 'KST')$$, '22023');
select pg_temp.expect_error('한 쪽 크기 200 초과는 거부',
  $$select * from public.fn_hq_login_log('2001-03-10', '2001-03-12', false, 201, 0, 'Asia/Seoul')$$, '22023');
select pg_temp.expect_error('음수 offset 은 거부',
  $$select * from public.fn_hq_login_log('2001-03-10', '2001-03-12', false, 50, -1, 'Asia/Seoul')$$, '22023');
select pg_temp.expect_error('기록 표도 시작일이 종료일보다 늦으면 거부',
  $$select * from public.fn_hq_login_log('2001-03-12', '2001-03-10', false, 50, 0, 'Asia/Seoul')$$, '22023');

select pg_temp.expect_bool('두 함수 모두 security definer',
  (select bool_and(prosecdef) from pg_proc
    where oid in ('public.fn_hq_login_buckets(date, date, text, text, boolean, text, text)'::regprocedure,
                  'public.fn_hq_login_log(date, date, boolean, integer, integer, text)'::regprocedure)), true);
select pg_temp.expect_bool('anon, authenticated 는 두 함수를 실행할 수 없다',
  not has_function_privilege('anon', 'public.fn_hq_login_buckets(date, date, text, text, boolean, text, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.fn_hq_login_buckets(date, date, text, text, boolean, text, text)', 'execute')
  and not has_function_privilege('anon', 'public.fn_hq_login_log(date, date, boolean, integer, integer, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.fn_hq_login_log(date, date, boolean, integer, integer, text)', 'execute'), true);
select pg_temp.expect_bool('service_role 은 두 함수를 실행할 수 있다',
  has_function_privilege('service_role', 'public.fn_hq_login_buckets(date, date, text, text, boolean, text, text)', 'execute')
  and has_function_privilege('service_role', 'public.fn_hq_login_log(date, date, boolean, integer, integer, text)', 'execute'), true);

do $$ begin raise notice '=== b2b-hq-login-stats.spec: 전체 통과 ==='; end $$;

rollback;
