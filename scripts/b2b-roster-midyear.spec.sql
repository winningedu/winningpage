-- =====================================================================
-- B2B 명단 올리기: 학기 중 적용과 가입 전 학생 명단 SQL 스펙
--
-- 실행: 마이그레이션이 전부 적용된 스택에서
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/b2b-roster-midyear.spec.sql
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
insert into public.tenants (code, name, region, org_type, tier)
  values ('RMAAAAAA', 'rm-a', '서울', '사기업', 'B'),
         ('RMBBBBBB', 'rm-b', '서울', '사기업', 'B');
insert into fx select 'ta', id from public.tenants where code = 'RMAAAAAA';
insert into fx select 'tb', id from public.tenants where code = 'RMBBBBBB';
insert into fx values
  ('s1', pg_temp.mk_user('rm-s1@t.local')), ('s2', pg_temp.mk_user('rm-s2@t.local')),
  ('s3', pg_temp.mk_user('rm-s3@t.local')), ('s4', pg_temp.mk_user('rm-s4@t.local')),
  ('s5', pg_temp.mk_user('rm-s5@t.local')), ('s6', pg_temp.mk_user('rm-s6@t.local')),
  ('actor', pg_temp.mk_user('rm-actor@t.local'));
create function pg_temp.fx(p_k text) returns uuid language sql as $$ select v from fx where k = p_k $$;
create function pg_temp.year(p_tenant text default 'ta') returns integer language sql as $$
  select school_year from public.tenants where id = pg_temp.fx(p_tenant)
$$;
create function pg_temp.cid(p_tenant text, p_grade text, p_name text) returns uuid language sql as $$
  select public.fn_class_ensure(pg_temp.fx(p_tenant), pg_temp.year(p_tenant), p_grade, null, p_name)
$$;
create function pg_temp.enroll(p_student text, p_grade text, p_class text, p_number integer)
returns void language plpgsql as $$
begin
  insert into public.student_enrollments (tenant_id, student_id, school_year, grade, class_id, number)
  values (pg_temp.fx('ta'), pg_temp.fx(p_student), pg_temp.year('ta'), p_grade,
    case when p_class is not null then pg_temp.cid('ta', p_grade, p_class) end, p_number);
end $$;
-- 학급/번호/버전
create function pg_temp.enr_s(p_student text) returns text language sql as $$
  select e.status || '/' || coalesce(e.grade, '-') || '/' || coalesce(c.name, '-') || '/' || coalesce(e.number::text, '-')
    || '/v' || e.version
  from public.student_enrollments e left join public.classes c on c.id = e.class_id
  where e.student_id = pg_temp.fx(p_student) and e.school_year = pg_temp.year('ta')
$$;
create function pg_temp.ver(p_student text) returns integer language sql as $$
  select version from public.student_enrollments where student_id = pg_temp.fx(p_student) and school_year = pg_temp.year('ta')
$$;
create function pg_temp.row_of(p_student text, p_class text, p_number integer, p_version integer) returns jsonb
language sql as $$
  select jsonb_build_object('student_id', pg_temp.fx(p_student), 'class_name', p_class, 'number', p_number, 'version', p_version)
$$;
create temp table y0 as select pg_temp.year('ta') as y;

select pg_temp.enroll('s1', '고1', '1', 1);
select pg_temp.enroll('s2', '고1', '1', 2);
select pg_temp.enroll('s3', '고2', '2', 5);
select pg_temp.enroll('s4', '고2', '2', 6);

-- ---------------------------------------------------------------------
-- fn_roster_midyear
-- ---------------------------------------------------------------------
-- 결과: 바뀐 학생/건너뜀/가입 전 저장/가입 전 건너뜀/가입 전 삭제
create function pg_temp.midyear(p_rows jsonb, p_pending jsonb default '[]') returns text language sql as $$
  select r.updated_count || '/' || r.skipped_count || '/' || r.pending_stored || '/' || r.pending_skipped || '/' || r.pending_deleted
    from public.fn_roster_midyear(pg_temp.fx('ta'), p_rows, p_pending, pg_temp.fx('actor')) r
$$;

select pg_temp.expect_text('midyear: s1 은 3반 9번으로, 가입 전 2줄 저장 1줄 건너뜀(반 없음)',
  pg_temp.midyear(
    jsonb_build_array(pg_temp.row_of('s1', '3', 9, pg_temp.ver('s1'))),
    jsonb_build_array(
      jsonb_build_object('name', '미가입1', 'grade', '고1', 'class_name', '3', 'number', 1),
      jsonb_build_object('name', '미가입2', 'grade', '고2', 'class_name', '2'),
      jsonb_build_object('name', '미가입3', 'grade', '고2'))),
  '1/0/2/1/0');
select pg_temp.expect_text('midyear: 학년은 그대로, 반과 번호만 바뀌고 version 이 오른다',
  pg_temp.enr_s('s1'), 'active/고1/3/9/v2');
select pg_temp.expect_text('midyear: 명단에 없는 학생은 그대로',
  pg_temp.enr_s('s2'), 'active/고1/1/2/v1');
select pg_temp.expect_int('midyear: 기관 학년도는 그대로',
  pg_temp.year('ta'), (select y from y0));
select pg_temp.expect_text('midyear: 이력은 admin_direct, 반이 바뀌었으니 class_change',
  (select c.kind || '/' || c.reason || '/' || c.status || '/' || c.from_number || '/' || c.to_number
     from public.enrollment_changes c where c.student_id = pg_temp.fx('s1') and c.kind = 'admin_direct'),
  'admin_direct/class_change/applied/1/9');
select pg_temp.expect_int('midyear: 가입 전 명단 2줄이 학급과 함께 저장된다',
  (select count(*) from public.roster_pending_students p
     join public.classes c on c.id = p.class_id and c.tenant_id = p.tenant_id
    where p.tenant_id = pg_temp.fx('ta') and p.school_year = pg_temp.year('ta')), 2);

-- 다시 불러도 된다(몇 번이든): 같은 값은 건너뛰고, 올린 학급(3반)의 가입 전 줄만 새 줄로 바뀐다
select pg_temp.expect_text('midyear: 같은 명단을 다시 올리면 바뀐 학생 0, 건너뜀 1, 3반 가입 전 1줄 삭제 후 새 줄 저장',
  pg_temp.midyear(
    jsonb_build_array(pg_temp.row_of('s1', '3', 9, pg_temp.ver('s1'))),
    jsonb_build_array(jsonb_build_object('name', '미가입9', 'grade', '고1', 'class_name', '3', 'number', 3))),
  '0/1/1/0/1');
select pg_temp.expect_text('midyear: 올리지 않은 2반의 가입 전 줄은 남고 3반 줄만 바뀐다',
  (select string_agg(name, ',' order by name) from public.roster_pending_students where tenant_id = pg_temp.fx('ta')), '미가입2,미가입9');

-- 번호 맞바꾸기(같은 학급 안에서 1,2 를 서로)
select pg_temp.expect_text('midyear: 학급 안에서 번호를 맞바꿔도 된다',
  pg_temp.midyear(jsonb_build_array(
    pg_temp.row_of('s3', '2', 6, pg_temp.ver('s3')),
    pg_temp.row_of('s4', '2', 5, pg_temp.ver('s4')))),
  '2/0/0/0/1');
select pg_temp.expect_text('midyear: 맞바꾼 s3', pg_temp.enr_s('s3'), 'active/고2/2/6/v2');
select pg_temp.expect_text('midyear: 맞바꾼 s4', pg_temp.enr_s('s4'), 'active/고2/2/5/v2');
select pg_temp.expect_text('midyear: 번호만 바뀌면 이력 reason 은 number_change',
  (select c.reason from public.enrollment_changes c where c.student_id = pg_temp.fx('s3') and c.kind = 'admin_direct'),
  'number_change');

-- 충돌
select pg_temp.expect_error('midyear: 명단 밖 학생이 쓰는 번호는 WC077',
  format($f$select * from public.fn_roster_midyear(%L, %L::jsonb, '[]', %L)$f$,
    pg_temp.fx('ta'), jsonb_build_array(pg_temp.row_of('s2', '3', 9, pg_temp.ver('s2'))), pg_temp.fx('actor')), 'WC077');
select pg_temp.expect_text('midyear: WC077 이면 전체가 되돌려져 s2 는 그대로',
  pg_temp.enr_s('s2'), 'active/고1/1/2/v1');
select pg_temp.expect_error('midyear: version 이 다르면 WC078',
  format($f$select * from public.fn_roster_midyear(%L, %L::jsonb, '[]', %L)$f$,
    pg_temp.fx('ta'), jsonb_build_array(pg_temp.row_of('s2', '1', 7, pg_temp.ver('s2') + 5)), pg_temp.fx('actor')), 'WC078');
select pg_temp.expect_error('midyear: 없는 기관은 거부',
  $$select * from public.fn_roster_midyear(gen_random_uuid(), '[]', '[]', gen_random_uuid())$$, 'P0002');

-- 다른 기관의 학생은 건드리지 않는다(건너뜀)
select pg_temp.expect_text('midyear: 다른 기관 학생 줄은 건너뛴다',
  (select r.updated_count || '/' || r.skipped_count
     from public.fn_roster_midyear(pg_temp.fx('tb'), jsonb_build_array(pg_temp.row_of('s2', '1', 7, 1)), '[]', pg_temp.fx('actor')) r),
  '0/1');

-- 부분 올리기는 다른 학급의 가입 전 줄을 지우지 않는다(2반만 올렸으니 2반 줄만 사라지고 3반 줄은 남는다)
select pg_temp.expect_text('midyear: 2반만 올리면 2반 가입 전 줄만 지워지고 3반 줄은 남는다',
  (select string_agg(name, ',' order by name) from public.roster_pending_students where tenant_id = pg_temp.fx('ta')), '미가입9');

-- 가입하면 가입 전 줄이 지워지고, 학적이 사라져도 돌아오지 않는다(트리거)
select * from public.fn_roster_pending_replace(pg_temp.fx('ta'), pg_temp.year('ta'),
  jsonb_build_array(
    jsonb_build_object('name', 'rm-s5@t.local', 'grade', '고1', 'class_name', '8'),
    jsonb_build_object('name', 'rm-s6@t.local', 'grade', '고1', 'class_name', '9', 'number', 5)),
  pg_temp.fx('actor'), (select array_agg(id) from public.classes where tenant_id = pg_temp.fx('ta') and name in ('8', '9')));
select pg_temp.enroll('s5', '고1', '8', 3);
select pg_temp.expect_int('trigger: 같은 반에 같은 이름이 가입하면 번호 없는 가입 전 줄이 지워진다',
  (select count(*) from public.roster_pending_students where tenant_id = pg_temp.fx('ta') and name = 'rm-s5@t.local'), 0);
select pg_temp.enroll('s6', '고1', '9', 6);
select pg_temp.expect_int('trigger: 번호가 다르면 번호 있는 가입 전 줄은 남는다',
  (select count(*) from public.roster_pending_students where tenant_id = pg_temp.fx('ta') and name = 'rm-s6@t.local'), 1);
update public.student_enrollments set number = 5
 where student_id = pg_temp.fx('s6') and school_year = pg_temp.year('ta');
select pg_temp.expect_int('trigger: 번호가 같아지면 지워진다',
  (select count(*) from public.roster_pending_students where tenant_id = pg_temp.fx('ta') and name = 'rm-s6@t.local'), 0);
delete from public.student_enrollments where student_id in (pg_temp.fx('s5'), pg_temp.fx('s6'));
select pg_temp.expect_int('trigger: 학적이 사라져도 가입 전 줄은 돌아오지 않는다',
  (select count(*) from public.roster_pending_students where tenant_id = pg_temp.fx('ta') and name in ('rm-s5@t.local', 'rm-s6@t.local')), 0);

-- 한도: 줄 수 3000, 이름 50자
select pg_temp.expect_error('limit: 가입 전 줄이 3000 을 넘으면 거부',
  format($f$select * from public.fn_roster_pending_replace(%L, %s, %L::jsonb, %L)$f$,
    pg_temp.fx('ta'), pg_temp.year('ta'), (select jsonb_agg('{}'::jsonb) from generate_series(1, 3001)), pg_temp.fx('actor')), '54000');
select pg_temp.expect_error('limit: 학적 줄이 3000 을 넘으면 거부',
  format($f$select * from public.fn_roster_midyear(%L, %L::jsonb, '[]', %L)$f$,
    pg_temp.fx('ta'), (select jsonb_agg('{}'::jsonb) from generate_series(1, 3001)), pg_temp.fx('actor')), '54000');
select pg_temp.expect_error('limit: 이름이 50자를 넘으면 거부(CHECK)',
  format($f$select * from public.fn_roster_pending_replace(%L, %s, %L::jsonb, %L)$f$,
    pg_temp.fx('ta'), pg_temp.year('ta'),
    jsonb_build_array(jsonb_build_object('name', repeat('가', 51), 'grade', '고1', 'class_name', '3')), pg_temp.fx('actor')), '23514');

-- ---------------------------------------------------------------------
-- fn_roster_rollover: 넘기기와 가입 전 명단이 같은 트랜잭션
-- ---------------------------------------------------------------------
select pg_temp.expect_text('rollover: 학년도가 오르고 가입 전 1줄이 새 학년도로 저장된다',
  (select r.promoted_count || '/' || r.pending_stored || '/' || r.pending_skipped || '/' || r.pending_deleted
     from public.fn_roster_rollover(pg_temp.fx('ta'), (select y + 1 from y0), '[]',
       jsonb_build_array(jsonb_build_object('name', '새미가입', 'grade', '고2', 'class_name', '4', 'number', 1)),
       pg_temp.fx('actor')) r),
  '4/1/0/1');
select pg_temp.expect_text('rollover: 이전 학년도 가입 전 줄은 지워지고 새 학년도 줄만 남는다(보존 기간)',
  (select string_agg(name || '@' || school_year, ',' order by school_year) from public.roster_pending_students
    where tenant_id = pg_temp.fx('ta')), '새미가입@' || (select y + 1 from y0));

-- 그 사이 다른 관리자가 넘기기를 끝냈다면(졸업, 진급 0) 가입 전 명단은 건드리지 않는다
select pg_temp.expect_text('rollover: 이미 끝난 넘기기를 다시 부르면 0 건이고 가입 전 명단은 그대로',
  (select r.graduated_count || '/' || r.promoted_count || '/' || r.pending_stored || '/' || r.pending_skipped || '/' || r.pending_deleted
     from public.fn_roster_rollover(pg_temp.fx('ta'), (select y + 1 from y0), '[]',
       jsonb_build_array(jsonb_build_object('name', '덮어쓰기', 'grade', '고2', 'class_name', '4', 'number', 2)),
       pg_temp.fx('actor')) r),
  '0/0/0/0/0');
select pg_temp.expect_text('rollover: 이미 끝난 넘기기 뒤에도 기존 가입 전 줄이 남는다',
  (select string_agg(name, ',' order by name) from public.roster_pending_students where tenant_id = pg_temp.fx('ta')),
  '새미가입');

-- ---------------------------------------------------------------------
-- 권한: 표는 정책이 없고 함수는 service_role 만
-- ---------------------------------------------------------------------
grant execute on function pg_temp.expect_error(text, text, text) to anon, authenticated;
set local role authenticated;
select pg_temp.expect_error('authenticated 는 roster_pending_students 를 읽을 수 없다',
  $$select * from public.roster_pending_students$$, '42501');
select pg_temp.expect_error('authenticated 는 fn_roster_midyear 실행 불가',
  $$select * from public.fn_roster_midyear(gen_random_uuid(), '[]', '[]', gen_random_uuid())$$, '42501');
reset role;
set local role anon;
select pg_temp.expect_error('anon 은 fn_roster_rollover 실행 불가',
  $$select * from public.fn_roster_rollover(gen_random_uuid(), 2030, '[]', '[]', gen_random_uuid())$$, '42501');
select pg_temp.expect_error('anon 은 fn_roster_pending_replace 실행 불가',
  $$select * from public.fn_roster_pending_replace(gen_random_uuid(), 2030, '[]', gen_random_uuid())$$, '42501');
reset role;

do $$ begin raise notice '=== b2b-roster-midyear.spec: 전체 통과 ==='; end $$;

rollback;
