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
delete from public.profile_login_days;

-- 실측은 2001-03-10 부터. 그 전은 활동 기록으로 추정한다.
insert into public.profile_login_days (profile_id, kst_date, first_seen_at) values
  (pg_temp.fx('s1'), date '2001-03-10', timestamptz '2001-03-10 09:00+09'),
  (pg_temp.fx('s2'), date '2001-03-10', timestamptz '2001-03-10 10:00+09'),
  (pg_temp.fx('p1'), date '2001-03-11', timestamptz '2001-03-11 08:00+09'),
  (pg_temp.fx('s1'), date '2001-03-12', timestamptz '2001-03-12 07:00+09'),
  (pg_temp.fx('qa'), date '2001-03-12', timestamptz '2001-03-12 11:00+09'),
  (pg_temp.fx('adm'), date '2001-03-12', timestamptz '2001-03-12 12:00+09'),
  (pg_temp.fx('s2'), date '2001-04-02', timestamptz '2001-04-02 09:00+09');

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
create function pg_temp.b(p_from date, p_to date, p_grain text, p_mode text, p_inc boolean)
returns table (bucket_start date, bucket_end date, source text, members bigint, by_member_type jsonb)
language sql as $$ select * from public.fn_hq_login_buckets(p_from, p_to, p_grain, p_mode, p_inc, 'all') $$;

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
-- 입력 검사와 권한
-- ---------------------------------------------------------------------
select pg_temp.expect_error('시작일이 종료일보다 늦으면 거부',
  $$select * from public.fn_hq_login_buckets('2001-03-02', '2001-03-01', 'day', 'calendar', false, 'all')$$, '22023');
select pg_temp.expect_error('모르는 묶음 단위는 거부',
  $$select * from public.fn_hq_login_buckets('2001-03-01', '2001-03-02', 'year', 'calendar', false, 'all')$$, '22023');
select pg_temp.expect_error('모르는 MAU 기준은 거부',
  $$select * from public.fn_hq_login_buckets('2001-03-01', '2001-03-02', 'month', 'weekly', false, 'all')$$, '22023');
select pg_temp.expect_error('날짜가 비면 거부',
  $$select * from public.fn_hq_login_buckets(null, '2001-03-02', 'day', 'calendar', false, 'all')$$, '22023');

-- ---------------------------------------------------------------------
-- fn_hq_login_log: 로그인 기록 표(Q13). 최근 날짜, 늦게 처음 들어온 순, 쪽 나눔
-- ---------------------------------------------------------------------
select pg_temp.expect_text('기간 안 기록을 최근 순으로, 전체 건수와 함께',
  (select string_agg(kst_date::text || ' ' || name || ' ' || coalesce(member_type, '-') || ' ' || total_count, ',' order by kst_date desc, first_seen_at desc)
     from public.fn_hq_login_log('2001-03-10', '2001-03-12', false, 50, 0)),
  '2001-03-12 hqs-s1@t.local student 4,2001-03-11 hqs-p1@t.local parent 4,2001-03-10 hqs-s2@t.local student 4,2001-03-10 hqs-s1@t.local student 4');
select pg_temp.expect_text('돌려주는 순서 자체가 최근 날짜, 늦게 처음 들어온 순이다',
  (select string_agg(name, ',') from public.fn_hq_login_log('2001-03-10', '2001-03-10', false, 50, 0)),
  'hqs-s2@t.local,hqs-s1@t.local');
select pg_temp.expect_text('쪽 나눔은 limit, offset 을 따르고 전체 건수는 그대로',
  (select string_agg(name || ' ' || total_count, ',') from public.fn_hq_login_log('2001-03-10', '2001-03-12', false, 2, 1)),
  'hqs-p1@t.local 4,hqs-s2@t.local 4');
select pg_temp.expect_text('소속 기관 이름과 처음 접속 시각',
  (select tenant_name || ' ' || to_char(first_seen_at at time zone 'Asia/Seoul', 'HH24:MI')
     from public.fn_hq_login_log('2001-03-12', '2001-03-12', false, 50, 0)), '스펙고 07:00');
select pg_temp.expect_text('포함 스위치를 켜면 QA, 관리자 기록도 보인다',
  (select max(total_count)::text from public.fn_hq_login_log('2001-03-10', '2001-03-12', true, 50, 0)), '6');
select pg_temp.expect_text('기간 밖은 비어 있다',
  (select count(*)::text from public.fn_hq_login_log('2001-03-13', '2001-03-31', false, 50, 0)), '0');
select pg_temp.expect_error('한 쪽 크기 200 초과는 거부',
  $$select * from public.fn_hq_login_log('2001-03-10', '2001-03-12', false, 201, 0)$$, '22023');
select pg_temp.expect_error('음수 offset 은 거부',
  $$select * from public.fn_hq_login_log('2001-03-10', '2001-03-12', false, 50, -1)$$, '22023');
select pg_temp.expect_error('기록 표도 시작일이 종료일보다 늦으면 거부',
  $$select * from public.fn_hq_login_log('2001-03-12', '2001-03-10', false, 50, 0)$$, '22023');

select pg_temp.expect_bool('두 함수 모두 security definer',
  (select bool_and(prosecdef) from pg_proc
    where oid in ('public.fn_hq_login_buckets(date, date, text, text, boolean, text)'::regprocedure,
                  'public.fn_hq_login_log(date, date, boolean, integer, integer)'::regprocedure)), true);
select pg_temp.expect_bool('anon, authenticated 는 두 함수를 실행할 수 없다',
  not has_function_privilege('anon', 'public.fn_hq_login_buckets(date, date, text, text, boolean, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.fn_hq_login_buckets(date, date, text, text, boolean, text)', 'execute')
  and not has_function_privilege('anon', 'public.fn_hq_login_log(date, date, boolean, integer, integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.fn_hq_login_log(date, date, boolean, integer, integer)', 'execute'), true);
select pg_temp.expect_bool('service_role 은 두 함수를 실행할 수 있다',
  has_function_privilege('service_role', 'public.fn_hq_login_buckets(date, date, text, text, boolean, text)', 'execute')
  and has_function_privilege('service_role', 'public.fn_hq_login_log(date, date, boolean, integer, integer)', 'execute'), true);

do $$ begin raise notice '=== b2b-hq-login-stats.spec: 전체 통과 ==='; end $$;

rollback;
