-- =====================================================================
-- B2B 기반 10: 학년도 넘기기와 그룹 삭제 SQL 스펙 (T20)
--
-- 실행: 마이그레이션이 전부 적용된 스택에서
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/b2b-school-year-rollover.spec.sql
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



create function pg_temp.mk_user(p_email text) returns uuid
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
  insert into public.profiles (id, name, role, email)
  values (v_id, p_email, 'user', p_email)
  on conflict (id) do nothing;
  insert into public.student_profiles (profile_id, grade) values (v_id, '고1')
  on conflict (profile_id) do nothing;
  return v_id;
end $$;

create temp table fx (k text primary key, v uuid);
-- ta 는 학교(중3 도 졸업), tc 는 학원(중3 은 고1 로 진급)
insert into public.tenants (code, name, region, org_type, tier)
  values ('RQAAAAAA', 't20-a', '서울', '학교', 'B'),
         ('RQCCCCCC', 't20-c', '서울', '사기업', 'B');
insert into fx select 'ta', id from public.tenants where code = 'RQAAAAAA';
insert into fx select 'tc', id from public.tenants where code = 'RQCCCCCC';
insert into fx values
  ('g3', pg_temp.mk_user('t20-g3@t.local')), ('m3', pg_temp.mk_user('t20-m3@t.local')),
  ('h1', pg_temp.mk_user('t20-h1@t.local')), ('h2', pg_temp.mk_user('t20-h2@t.local')),
  ('nog', pg_temp.mk_user('t20-nog@t.local')), ('pre', pg_temp.mk_user('t20-pre@t.local')),
  ('old', pg_temp.mk_user('t20-old@t.local')), ('req', pg_temp.mk_user('t20-req@t.local')),
  ('c_m3', pg_temp.mk_user('t20-cm3@t.local')),
  ('actor', pg_temp.mk_user('t20-actor@t.local'));
create function pg_temp.fx(p_k text) returns uuid language sql as $$ select v from fx where k = p_k $$;
create function pg_temp.year(p_tenant text default 'ta') returns integer language sql as $$
  select school_year from public.tenants where id = pg_temp.fx(p_tenant)
$$;
create temp table y0 as select pg_temp.year('ta') as y;

create function pg_temp.cid(p_tenant text, p_year integer, p_grade text, p_name text) returns uuid language sql as $$
  select public.fn_class_ensure(pg_temp.fx(p_tenant), p_year, p_grade, null, p_name)
$$;
create function pg_temp.enroll(p_student text, p_tenant text, p_grade text, p_class text, p_number integer,
  p_year integer default null)
returns void language plpgsql as $$
declare
  v_year integer := coalesce(p_year, pg_temp.year(p_tenant));
begin
  insert into public.student_enrollments (tenant_id, student_id, school_year, grade, class_id, number)
  values (pg_temp.fx(p_tenant), pg_temp.fx(p_student), v_year, p_grade,
    case when p_class is not null then pg_temp.cid(p_tenant, v_year, p_grade, p_class) end, p_number);
end $$;

select pg_temp.enroll('g3', 'ta', '고3', '1', 1);
select pg_temp.enroll('m3', 'ta', '중3', '1', 2);
select pg_temp.enroll('h1', 'ta', '고1', '1', 3);
select pg_temp.enroll('h2', 'ta', '고2', '1', 4);
select pg_temp.enroll('nog', 'ta', null, null, null);
select pg_temp.enroll('pre', 'ta', '고1', '1', 5);
select pg_temp.enroll('pre', 'ta', '고2', null, null, (select y + 1 from y0));
select pg_temp.enroll('c_m3', 'tc', '중3', '1', 1);
update public.student_profiles set grade = '중3' where profile_id in (pg_temp.fx('m3'), pg_temp.fx('c_m3'));
update public.student_profiles set grade = '고3' where profile_id = pg_temp.fx('g3');
update public.student_profiles set grade = '고2' where profile_id = pg_temp.fx('h2');

create function pg_temp.enr_s(p_student text, p_year integer) returns text language sql as $$
  select e.status || '/' || coalesce(e.grade, '-') || '/' || coalesce(c.name, '-') || '/' || coalesce(e.number::text, '-')
    || '/v' || e.version || '/' || (e.graduated_at is not null)
  from public.student_enrollments e left join public.classes c on c.id = e.class_id
  where e.student_id = pg_temp.fx(p_student) and e.school_year = p_year
$$;

-- ---------------------------------------------------------------------
-- fn_school_year_rollover
-- ---------------------------------------------------------------------
-- 결과: 졸업, 진급, 건너뜀, 학급 배정 건수. h1 은 ③ 행으로 3반 7번에 배정한다.
create function pg_temp.rollover(p_tenant text, p_rows jsonb default '[]') returns text language sql as $$
  select r.graduated_count || '/' || r.promoted_count || '/' || r.skipped_count || '/' || r.assigned_count
    from public.fn_school_year_rollover(pg_temp.fx(p_tenant), pg_temp.year(p_tenant) + 1, p_rows, pg_temp.fx('actor')) r
$$;

select pg_temp.expect_text('rollover: 졸업 2(고3, 학교 중3), 진급 2, 건너뜀 2(기존 행, 학년 없음), 배정 1',
  pg_temp.rollover('ta', jsonb_build_array(jsonb_build_object(
    'student_id', pg_temp.fx('h1'), 'class_name', '3', 'number', 7))), '2/2/2/1');

select pg_temp.expect_int('rollover: 기관 학년도가 하나 올라간다',
  pg_temp.year('ta'), (select y + 1 from y0));
select pg_temp.expect_text('rollover: 고3 은 졸업하고 graduated_at 이 남는다(지난 학년도 행)',
  pg_temp.enr_s('g3', (select y from y0)), 'graduated/고3/1/1/v2/true');
select pg_temp.expect_int('rollover: 졸업생은 새 학년도 행이 없다',
  (select count(*) from public.student_enrollments
    where student_id in (pg_temp.fx('g3'), pg_temp.fx('m3')) and school_year = (select y + 1 from y0)), 0);
select pg_temp.expect_text('rollover: 학교의 중3 은 졸업',
  pg_temp.enr_s('m3', (select y from y0)), 'graduated/중3/1/2/v2/true');
select pg_temp.expect_text('rollover: ③ 행이 있으면 새 학급과 번호에 배정(고1 에서 고2)',
  pg_temp.enr_s('h1', (select y + 1 from y0)), 'active/고2/3/7/v1/false');
select pg_temp.expect_text('rollover: ③ 행이 없으면 한 학년 올리고 학급은 비운다',
  pg_temp.enr_s('h2', (select y + 1 from y0)), 'active/고3/-/-/v1/false');
select pg_temp.expect_text('rollover: 지난 학년도 행은 재학 그대로(이력)',
  pg_temp.enr_s('h2', (select y from y0)), 'active/고2/1/4/v1/false');
select pg_temp.expect_text('rollover: 이미 새 학년도 행이 있으면 건드리지 않는다',
  pg_temp.enr_s('pre', (select y + 1 from y0)), 'active/고2/-/-/v1/false');
select pg_temp.expect_text('rollover: 학년 없는 학생은 건너뛴다',
  (select count(*) from public.student_enrollments where student_id = pg_temp.fx('nog') and school_year > (select y from y0))::text, '0');
select pg_temp.expect_text('rollover: student_profiles.grade 도 올라간다',
  (select grade from public.student_profiles where profile_id = pg_temp.fx('h2')), '고3');
select pg_temp.expect_text('rollover: 이력 rollover 가 진급 2, 졸업 2건 남는다',
  (select count(*) filter (where to_grade is not null) || '/' || count(*) filter (where to_grade is null)
     from public.enrollment_changes where kind = 'rollover' and status = 'applied'
      and tenant_id = pg_temp.fx('ta')), '2/2');

-- 두 번째 호출은 아무것도 바꾸지 않는다
select pg_temp.expect_text('rollover: 같은 학년도 두 번째 실행은 0 건',
  (select r.graduated_count || '/' || r.promoted_count || '/' || r.skipped_count || '/' || r.assigned_count
     from public.fn_school_year_rollover(pg_temp.fx('ta'), (select y + 1 from y0), '[]', pg_temp.fx('actor')) r), '0/0/0/0');
select pg_temp.expect_int('rollover: 두 번째 실행 뒤에도 학년도는 그대로',
  pg_temp.year('ta'), (select y + 1 from y0));
select pg_temp.expect_text('rollover: 학년도가 이어지지 않는 요청도 0 건',
  (select r.graduated_count || '/' || r.promoted_count
     from public.fn_school_year_rollover(pg_temp.fx('ta'), (select y + 5 from y0), '[]', pg_temp.fx('actor')) r), '0/0');
select pg_temp.expect_error('rollover: 없는 기관은 거부',
  $$select * from public.fn_school_year_rollover(gen_random_uuid(), 2030, '[]', gen_random_uuid())$$, 'P0002');

-- 학원은 중3 이 고1 로 진급한다
select pg_temp.expect_text('rollover: 학원 중3 은 고1 로 진급',
  pg_temp.rollover('tc'), '0/1/0/0');
select pg_temp.expect_text('rollover: 학원 중3 의 새 행',
  pg_temp.enr_s('c_m3', pg_temp.year('tc')), 'active/고1/-/-/v1/false');

-- 번호가 겹치면 전체가 되돌려지고, 학년도가 넘어가면 열린 신청은 거절된다(td 기관)
insert into public.tenants (code, name, region, org_type, tier) values ('RQDDDDDD', 't20-d', '서울', '학교', 'B');
insert into fx select 'td', id from public.tenants where code = 'RQDDDDDD';
select pg_temp.enroll('old', 'td', '고1', '1', 1);
select pg_temp.enroll('req', 'td', '고1', '1', 2);
insert into public.enrollment_changes (tenant_id, student_id, school_year, kind, status, base_version)
  values (pg_temp.fx('td'), pg_temp.fx('req'), pg_temp.year('td'), 'request', 'pending', 1);
select pg_temp.expect_error('rollover: ③ 행의 번호가 겹치면 WC077',
  $$select pg_temp.rollover('td', jsonb_build_array(
      jsonb_build_object('student_id', pg_temp.fx('old'), 'class_name', '1', 'number', 5),
      jsonb_build_object('student_id', pg_temp.fx('req'), 'class_name', '1', 'number', 5)))$$, 'WC077');
select pg_temp.expect_text('rollover: 실패하면 학년도, 학적, 신청이 그대로',
  (select y::text from (select pg_temp.year('td') as y) q) || '/'
  || (select count(*) from public.student_enrollments where tenant_id = pg_temp.fx('td')) || '/'
  || (select status from public.enrollment_changes where student_id = pg_temp.fx('req')),
  (select y from y0)::text || '/2/pending');
select pg_temp.expect_text('rollover: 번호가 겹치지 않으면 성공', pg_temp.rollover('td'), '0/2/0/0');
select pg_temp.expect_text('rollover: 열린 신청은 사유와 함께 거절된다',
  (select status || '/' || (reject_reason is not null) || '/' || (decided_by = pg_temp.fx('actor'))
     from public.enrollment_changes where student_id = pg_temp.fx('req') and kind = 'request'), 'rejected/true/true');

do $$ begin raise notice '=== b2b-school-year-rollover.spec: 전체 통과 ==='; end $$;

rollback;
