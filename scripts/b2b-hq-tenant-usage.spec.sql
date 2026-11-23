-- =====================================================================
-- 본사 대시보드 서비스 사용량과 한도 SQL 스펙: fn_hq_tenant_usage
-- (분석 grill Q6, 계획 6번 A5)
--
-- 실행: 마이그레이션이 전부 적용된 스택에서
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/b2b-hq-tenant-usage.spec.sql
--
-- 전체가 한 트랜잭션이고 마지막에 ROLLBACK 한다. 어떤 데이터도 남기지
-- 않는다. 단언 실패는 예외로 터져 psql 이 비정상 종료(ON_ERROR_STOP)한다.
-- =====================================================================
begin;

create function pg_temp.expect_int(t text, got bigint, want bigint) returns void
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

create function pg_temp.expect_bool(t text, got boolean, want boolean) returns void
language plpgsql as $$
begin
  if got is distinct from want then
    raise exception '[FAIL] %: got %, want %', t, got, want;
  end if;
  raise notice '[PASS] % = %', t, want;
end $$;

create function pg_temp.today() returns date language sql as $$
  select (now() at time zone 'Asia/Seoul')::date
$$;

create temp table fx (k text primary key, v uuid);
create function pg_temp.fx(p_k text) returns uuid language sql as $$ select v from fx where k = p_k $$;

create function pg_temp.mk_tenant(p_key text, p_code text, p_start date, p_term_months smallint)
returns void language plpgsql as $$
declare
  v_id uuid;
begin
  insert into public.tenants (code, name, region, org_type, tier, school_year,
                              contract_start_date, contract_end_date, term_months)
  values (p_code, 'hqu-' || p_key, '서울', '학교', 'B', 2026, p_start, pg_temp.today() + 200, p_term_months)
  returning id into v_id;
  insert into fx values (p_key, v_id);
end $$;

create function pg_temp.mk_student(p_key text, p_tenant text, p_enroll boolean)
returns void language plpgsql as $$
declare
  v_id uuid := gen_random_uuid();
  v_email text := 'hqu-' || p_key || '@t.local';
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data
  ) values (
    v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    v_email, 'x', now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
  );
  insert into public.profiles (id, name, role, email, member_type, tenant_id)
  values (v_id, 'hqu-' || p_key, 'user', v_email, 'student', pg_temp.fx(p_tenant))
  on conflict (id) do update
    set name = excluded.name, member_type = excluded.member_type, tenant_id = excluded.tenant_id;
  if p_enroll then
    insert into public.student_enrollments (tenant_id, student_id, school_year, grade, status)
    values (pg_temp.fx(p_tenant), v_id, 2026, '고1', 'active');
  end if;
  insert into fx values (p_key, v_id);
end $$;

-- 사용 1회. p_at 은 KST 날짜의 낮 12시다.
create function pg_temp.use(p_key text, p_tenant text, p_program text, p_on date) returns void
language sql as $$
  insert into public.tenant_usage_events (profile_id, tenant_id, program_key, source_kind, source_id, used_at)
  values (pg_temp.fx(p_key), pg_temp.fx(p_tenant), p_program,
          case p_program when 'diagnose' then 'diagnosis_attempt' when 'growth' then 'growth_report'
                         when 'suhaeng' then 'performance_session' when 'inquiry' then 'inquiry_session'
                         else 'selfeval_session' end,
          gen_random_uuid(), (p_on::timestamp + interval '12 hours') at time zone 'Asia/Seoul')
$$;

-- 이번 달 1일과 지난달 마지막 날(이번 학기 안).
create function pg_temp.month_start() returns date language sql as $$
  select date_trunc('month', pg_temp.today())::date
$$;

-- 기관 A: 계약 시작 100일 전, 학기 6개월. 이번 학기 = 시작일부터 6개월(지난달 말도 학기 안).
select pg_temp.mk_tenant('A', 'HQUAAAAA', pg_temp.today() - 100, 6::smallint);
-- 기관 E: 학생이 없다.
select pg_temp.mk_tenant('E', 'HQUEEEEE', pg_temp.today() - 100, 6::smallint);

insert into public.tenant_service_settings (tenant_id, program_key, enabled, monthly_limit, term_limit) values
  (pg_temp.fx('A'), 'diagnose', true, 2, 3),
  (pg_temp.fx('A'), 'growth', true, null, 1),
  (pg_temp.fx('A'), 'inquiry', false, 5, 5),
  (pg_temp.fx('A'), 'target', true, 1, 1);

select pg_temp.mk_student('s1', 'A', true);
select pg_temp.mk_student('s2', 'A', false);
select pg_temp.mk_student('s3', 'A', true);
select pg_temp.mk_student('s_qa', 'A', true);
insert into public.qa_accounts (profile_id) values (pg_temp.fx('s_qa'));
-- 학생별 조정: s3 의 학습진단 월 한도는 1회.
insert into public.student_usage_overrides (profile_id, program_key, monthly_limit, updated_by)
values (pg_temp.fx('s3'), 'diagnose', 1, pg_temp.fx('s1'));

-- 학습진단: s1 이번 달 2 + 지난달 1, s2 이번 달 1 + 학기 전 1, s3 이번 달 1, QA 이번 달 2.
select pg_temp.use('s1', 'A', 'diagnose', pg_temp.month_start());
select pg_temp.use('s1', 'A', 'diagnose', pg_temp.today());
select pg_temp.use('s1', 'A', 'diagnose', pg_temp.month_start() - 1);
select pg_temp.use('s2', 'A', 'diagnose', pg_temp.today());
select pg_temp.use('s2', 'A', 'diagnose', pg_temp.today() - 101);
select pg_temp.use('s3', 'A', 'diagnose', pg_temp.today());
select pg_temp.use('s_qa', 'A', 'diagnose', pg_temp.today());
select pg_temp.use('s_qa', 'A', 'diagnose', pg_temp.today());
-- 성장설계: s2 지난달 1(학기 한도 1 소진, 월 한도 없음).
select pg_temp.use('s2', 'A', 'growth', pg_temp.month_start() - 1);
-- 목표관리(target)는 결과에 나오지 않는다.
select pg_temp.use('s1', 'A', 'target', pg_temp.today());

create temp table u_default as select * from public.fn_hq_tenant_usage(false);
create temp table u_all as select * from public.fn_hq_tenant_usage(true);
create function pg_temp.u(p_tenant text, p_program text) returns u_default language sql as $$
  select * from u_default where tenant_id = pg_temp.fx(p_tenant) and program_key = p_program
$$;
create function pg_temp.ua(p_tenant text, p_program text) returns u_all language sql as $$
  select * from u_all where tenant_id = pg_temp.fx(p_tenant) and program_key = p_program
$$;

-- ---------------------------------------------------------------------
-- 이번 달과 이번 학기 쓴 횟수, 한도 다 쓴 학생 수(Q6). 한도는 학생 단위(학생별 조정 반영).
-- ---------------------------------------------------------------------
select pg_temp.expect_int('학습진단 이번 달 쓴 횟수: s1 2 + s2 1 + s3 1',
  (pg_temp.u('A', 'diagnose')).month_used, 4);
select pg_temp.expect_int('학습진단 이번 학기 쓴 횟수: 지난달 사용은 넣고 학기 전 사용은 뺀다',
  (pg_temp.u('A', 'diagnose')).term_used, 5);
select pg_temp.expect_int('학습진단 이번 달 한도 다 쓴 학생: s1(2/2), s3(조정 한도 1/1)',
  (pg_temp.u('A', 'diagnose')).month_capped_students, 2);
select pg_temp.expect_int('학습진단 이번 학기 한도 다 쓴 학생: s1(3/3)',
  (pg_temp.u('A', 'diagnose')).term_capped_students, 1);
select pg_temp.expect_int('성장설계: 월 한도가 없으면 이번 달 한도 다 쓴 학생은 0',
  (pg_temp.u('A', 'growth')).month_capped_students, 0);
select pg_temp.expect_int('성장설계: 지난달 사용도 이번 학기 한도를 채운다',
  (pg_temp.u('A', 'growth')).term_capped_students, 1);
select pg_temp.expect_int('성장설계 이번 달 쓴 횟수 0',
  (pg_temp.u('A', 'growth')).month_used, 0);

-- 기관 설정 값과 제공 여부
select pg_temp.expect_text('학습진단 기관 설정: 제공, 월 2, 학기 3',
  (select concat_ws('/', o.provided::text, o.month_limit, o.term_limit) from u_default o
    where o.tenant_id = pg_temp.fx('A') and o.program_key = 'diagnose'), 'true/2/3');
select pg_temp.expect_bool('설정 행이 없는 서비스(수행평가)는 제공 안 함',
  (pg_temp.u('A', 'suhaeng')).provided, false);
select pg_temp.expect_bool('꺼 둔 서비스(심화탐구)는 제공 안 함',
  (pg_temp.u('A', 'inquiry')).provided, false);
select pg_temp.expect_text('이번 학기 끝(다음 학기 시작일) = 계약 시작 + 6개월',
  (pg_temp.u('A', 'diagnose')).term_resets_on::text, ((pg_temp.today() - 100) + interval '6 months')::date::text);

-- ---------------------------------------------------------------------
-- 범위: 기관마다 5개 서비스(목표관리 제외), 학생이 없어도 행이 있다. 기타 소속은 뺀다.
-- ---------------------------------------------------------------------
select pg_temp.expect_text('서비스는 학습진단, 성장설계, 수행평가, 심화탐구, 자기평가 순서',
  (select string_agg(o.program_key, ',' order by o.ord) from (
     select u.program_key, row_number() over () as ord from u_default u where u.tenant_id = pg_temp.fx('A')) o),
  'diagnose,growth,suhaeng,inquiry,selfeval');
select pg_temp.expect_text('학생이 없는 기관도 5행, 모두 0',
  (select count(*)::text || '/' || sum(o.month_used + o.term_used + o.month_capped_students + o.term_capped_students)::text
     from u_default o where o.tenant_id = pg_temp.fx('E')), '5/0');
select pg_temp.expect_bool('기타 소속(is_catch_all) 기관은 나오지 않는다',
  not exists (select 1 from u_default o join public.tenants t on t.id = o.tenant_id where t.is_catch_all), true);

-- ---------------------------------------------------------------------
-- 기본 제외(Q3): QA 계정은 빼고 포함 스위치를 켜면 센다.
-- ---------------------------------------------------------------------
select pg_temp.expect_int('포함 스위치: QA 학생 이번 달 2회가 더해진다',
  (pg_temp.ua('A', 'diagnose')).month_used, 6);
select pg_temp.expect_int('포함 스위치: QA 학생(2/2)도 이번 달 한도 다 쓴 학생',
  (pg_temp.ua('A', 'diagnose')).month_capped_students, 3);

-- ---------------------------------------------------------------------
-- 권한
-- ---------------------------------------------------------------------
select pg_temp.expect_bool('security definer',
  (select prosecdef from pg_proc where oid = 'public.fn_hq_tenant_usage(boolean)'::regprocedure), true);
select pg_temp.expect_bool('anon, authenticated 는 실행할 수 없다',
  not has_function_privilege('anon', 'public.fn_hq_tenant_usage(boolean)', 'execute')
  and not has_function_privilege('authenticated', 'public.fn_hq_tenant_usage(boolean)', 'execute'), true);
select pg_temp.expect_bool('service_role 은 실행할 수 있다',
  has_function_privilege('service_role', 'public.fn_hq_tenant_usage(boolean)', 'execute'), true);

do $$ begin raise notice '=== b2b-hq-tenant-usage.spec: 전체 통과 ==='; end $$;

rollback;
