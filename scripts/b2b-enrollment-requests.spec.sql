-- =====================================================================
-- B2B 기반 9 (B): 학적 변경 신청과 결정 SQL 스펙 (T19)
--
-- 실행: 마이그레이션이 전부 적용된 스택에서
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/b2b-enrollment-requests.spec.sql
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



create function pg_temp.mk_user(p_email text, p_role text default 'user') returns uuid
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
  values (v_id, p_email, p_role, p_email)
  on conflict (id) do update set role = excluded.role;
  insert into public.student_profiles (profile_id, grade) values (v_id, '고1')
  on conflict (profile_id) do nothing;
  return v_id;
end $$;

create temp table fx (k text primary key, v uuid);
insert into public.tenants (code, name, region, org_type, tier)
  values ('R9AAAAAA', 't19-a', '서울', '학교', 'B'),
         ('R9BBBBBB', 't19-b', '서울', '학교', 'B');
insert into fx select 'ta', id from public.tenants where code = 'R9AAAAAA';
insert into fx select 'tb', id from public.tenants where code = 'R9BBBBBB';
insert into fx values
  ('s1', pg_temp.mk_user('t19-s1@t.local')), ('s2', pg_temp.mk_user('t19-s2@t.local')),
  ('s3', pg_temp.mk_user('t19-s3@t.local')), ('s4', pg_temp.mk_user('t19-s4@t.local')),
  ('s5', pg_temp.mk_user('t19-s5@t.local')), ('s6', pg_temp.mk_user('t19-s6@t.local')),
  ('hr1', pg_temp.mk_user('t19-hr1@t.local')), ('hr2', pg_temp.mk_user('t19-hr2@t.local')),
  ('hrb', pg_temp.mk_user('t19-hrb@t.local')), ('adm', pg_temp.mk_user('t19-adm@t.local')),
  ('hq', pg_temp.mk_user('t19-hq@t.local', 'admin')),
  ('s7', pg_temp.mk_user('t19-s7@t.local'));
create function pg_temp.fx(p_k text) returns uuid language sql as $$ select v from fx where k = p_k $$;
create function pg_temp.year() returns integer language sql as $$
  select school_year from public.tenants where code = 'R9AAAAAA'
$$;

-- 교사 계정 만들기: 담당 학급(담임)을 붙이고 profile 을 연결한다.
create function pg_temp.mk_teacher(p_key text, p_tenant text, p_role text, p_phone text, p_classes jsonb)
returns void language plpgsql as $$
declare
  v_id uuid;
begin
  select r.teacher_id into v_id from public.fn_teacher_register(
    pg_temp.fx(p_tenant), p_key, p_phone, p_role, p_classes, pg_temp.fx('hq')) r;
  update public.teachers set profile_id = pg_temp.fx(p_key) where id = v_id;
end $$;
select pg_temp.mk_teacher('hr1', 'ta', 'homeroom', '01011110001', '[{"grade":"고1","name":"1"}]');
select pg_temp.mk_teacher('hr2', 'ta', 'homeroom', '01011110002', '[{"grade":"고1","name":"2"}]');
select pg_temp.mk_teacher('hrb', 'tb', 'homeroom', '01011110003', '[{"grade":"고1","name":"1"}]');
select pg_temp.mk_teacher('adm', 'ta', 'school_admin', '01011110004', '[]');

-- 학급: 1반(담임 hr1), 2반(담임 hr2), 3반(담임 없음)
create function pg_temp.cid(p_tenant text, p_grade text, p_name text) returns uuid language sql as $$
  select public.fn_class_ensure(pg_temp.fx(p_tenant), pg_temp.year(), p_grade, null, p_name)
$$;
create function pg_temp.enroll(p_student text, p_class text, p_number integer, p_grade text default '고1')
returns void language plpgsql as $$
begin
  insert into public.student_enrollments (tenant_id, student_id, school_year, grade, class_id, number)
  values (pg_temp.fx('ta'), pg_temp.fx(p_student), pg_temp.year(), p_grade,
    case when p_class is not null then pg_temp.cid('ta', p_grade, p_class) end, p_number);
end $$;
select pg_temp.enroll('s7', '2', 20);
select pg_temp.enroll('s1', '1', 1);
select pg_temp.enroll('s2', '1', 2);
select pg_temp.enroll('s3', '1', 3);
select pg_temp.enroll('s4', '2', 4);
select pg_temp.enroll('s5', null, null);

-- 로그인한 학생(auth.uid())으로 신청한다.
create function pg_temp.req(p_student text, p_grade text, p_group text, p_class text, p_number integer)
returns uuid language plpgsql as $$
declare
  v_id uuid;
begin
  perform set_config('request.jwt.claim.sub', pg_temp.fx(p_student)::text, true);
  select public.fn_request_enrollment_change(p_grade, p_group, p_class, p_number::smallint) into v_id;
  return v_id;
end $$;
create function pg_temp.enr_s(p_student text) returns text language sql as $$
  select coalesce(e.grade, '-') || '/' || coalesce(c.name, '-') || '/' || coalesce(e.number::text, '-')
    || '/v' || e.version
  from public.student_enrollments e left join public.classes c on c.id = e.class_id
  where e.student_id = pg_temp.fx(p_student) and e.school_year = pg_temp.year()
$$;

-- ---------------------------------------------------------------------
-- fn_request_enrollment_change: 학생 본인의 신청
-- ---------------------------------------------------------------------
create temp table rq (k text primary key, v uuid);
insert into rq values ('s1', pg_temp.req('s1', '고1', null, '2', 5));
select pg_temp.expect_text('request: pending 신청 한 건이 생기고 base_version 이 담긴다',
  (select status || '/' || kind || '/' || base_version || '/' || to_number || '/' || to_grade
     from public.enrollment_changes where id = (select v from rq where k = 's1')), 'pending/request/1/5/고1');

select pg_temp.expect_text('request: 신청 시점의 이전 값이 담긴다',
  (select from_class_id = pg_temp.cid('ta', '고1', '1') and from_number = 1 and requested_by = pg_temp.fx('s1')
     and school_year = pg_temp.year() and tenant_id = pg_temp.fx('ta') and to_class_id = pg_temp.cid('ta', '고1', '2')
     from public.enrollment_changes where id = (select v from rq where k = 's1'))::text, 'true');
-- 번호만 바꾸는 신청: 학급과 학년은 지금 값을 그대로 쓴다(null 로 지우지 않는다).
insert into rq values ('s7', pg_temp.req('s7', null, null, null, 21));
select pg_temp.expect_text('request: 번호만 신청하면 학급을 유지한다',
  (select (to_class_id = pg_temp.cid('ta', '고1', '2') and to_grade = '고1')::text
     from public.enrollment_changes where id = (select v from rq where k = 's7')), 'true');
select pg_temp.expect_error('request: 두 번째 열린 신청 거부(WC082)',
  $$select pg_temp.req('s1', '고1', null, '3', 6)$$, 'WC082');
select pg_temp.expect_int('request: 거부되면 신청은 하나뿐',
  (select count(*) from public.enrollment_changes where student_id = pg_temp.fx('s1') and kind = 'request'), 1);
select pg_temp.expect_ok('request: 학년을 비우면 지금 학년으로 풀 학생도 신청',
  $$select pg_temp.req('s5', null, null, '2', 7)$$);
select pg_temp.expect_text('request: 학년 기본값',
  (select to_grade from public.enrollment_changes where student_id = pg_temp.fx('s5')), '고1');
select pg_temp.expect_error('request: 등록되지 않은 그룹 거부(WC080)',
  $$select pg_temp.req('s2', '고1', '없는반', '2', 8)$$, 'WC080');
select pg_temp.expect_error('request: 학적 없는 학생 거부(WC081)',
  $$select pg_temp.req('s6', '고1', null, '2', 8)$$, 'WC081');
select pg_temp.expect_error('request: 로그인하지 않으면 거부(42501)',
  $$select public.fn_request_enrollment_change('고1', null, '2', 1::smallint) from (select set_config('request.jwt.claim.sub', '', true)) x$$, '42501');

-- ---------------------------------------------------------------------
-- fn_decide_enrollment_change: 승인자 검사, version 검사, 적용 또는 거절
-- ---------------------------------------------------------------------
create function pg_temp.decide(p_change uuid, p_approve boolean, p_actor text, p_reason text default null)
returns text language sql as $$
  select public.fn_decide_enrollment_change(p_change, p_approve, p_reason, pg_temp.fx(p_actor))
$$;

select pg_temp.expect_text('decide: 번호만 신청을 승인해도 학급은 그대로',
  pg_temp.decide((select v from rq where k = 's7'), true, 'hr2'), 'applied');
select pg_temp.expect_text('decide: 번호만 바뀐다', pg_temp.enr_s('s7'), '고1/2/21/v2');
-- s1 은 2반으로 신청했고 2반 담임은 hr2
select pg_temp.expect_text('decide: 도착 학급 담임이 승인하면 applied',
  pg_temp.decide((select v from rq where k = 's1'), true, 'hr2'), 'applied');
select pg_temp.expect_text('decide: 학적이 바뀌고 version 이 오른다', pg_temp.enr_s('s1'), '고1/2/5/v2');
select pg_temp.expect_text('decide: 신청 행이 결정 정보를 가진다',
  (select status || '/' || (decided_by = pg_temp.fx('hr2')) || '/' || (decided_teacher_id is not null)
       || '/' || (decided_at is not null)
     from public.enrollment_changes where id = (select v from rq where k = 's1')), 'applied/true/true/true');


-- 번호가 이미 쓰이면 승인 실패, 신청은 pending 으로 남는다(s1 이 2반 5번이 됐다)
insert into rq values ('s2', pg_temp.req('s2', '고1', null, '2', 5));
select pg_temp.expect_error('decide: 이미 쓰인 번호로 승인하면 WC077',
  $$select pg_temp.decide((select v from rq where k = 's2'), true, 'hr2')$$, 'WC077');
select pg_temp.expect_text('decide: 번호 충돌이면 신청은 pending, 학적은 그대로',
  (select status from public.enrollment_changes where id = (select v from rq where k = 's2'))
  || '/' || pg_temp.enr_s('s2'), 'pending/고1/1/2/v1');

-- 거절은 사유가 있어야 하고, 학생이 사유를 읽는다
select pg_temp.expect_error('decide: 사유 없는 거절은 WC085',
  $$select pg_temp.decide((select v from rq where k = 's2'), false, 'hr2')$$, 'WC085');
select pg_temp.expect_error('decide: 공백 사유 거절은 WC085',
  $$select pg_temp.decide((select v from rq where k = 's2'), false, 'hr2', '  ')$$, 'WC085');
select pg_temp.expect_text('decide: 사유와 함께 거절하면 rejected',
  pg_temp.decide((select v from rq where k = 's2'), false, 'hr2', '번호가 겹쳐요'), 'rejected');
select pg_temp.expect_text('decide: 거절하면 학적은 그대로', pg_temp.enr_s('s2'), '고1/1/2/v1');
grant execute on function pg_temp.expect_text(text, text, text) to authenticated;
select set_config('request.jwt.claim.sub', pg_temp.fx('s2')::text, true);
set local role authenticated;
select pg_temp.expect_text('decide: 학생이 본인 거절 사유를 읽는다',
  (select reject_reason from public.enrollment_changes where kind = 'request'), '번호가 겹쳐요');
reset role;
select pg_temp.expect_ok('decide: 거절 뒤에는 다시 신청할 수 있다',
  $$select pg_temp.req('s2', '고1', null, '2', 9)$$);

-- 승인자: 담임이 있는 학급이면 그 담임만, 없으면 학교 관리자(본사 대행 포함)
-- s5 는 2반(담임 hr2)으로 신청 중
insert into rq values ('s5', (select id from public.enrollment_changes where student_id = pg_temp.fx('s5') and status = 'pending'));
select pg_temp.expect_error('approver: 다른 반 담임은 승인 불가(WC084)',
  $$select pg_temp.decide((select v from rq where k = 's5'), true, 'hr1')$$, 'WC084');
select pg_temp.expect_error('approver: 담임이 있는 학급은 학교 관리자도 승인 불가(WC084)',
  $$select pg_temp.decide((select v from rq where k = 's5'), true, 'adm')$$, 'WC084');
select pg_temp.expect_error('approver: 다른 기관 교사는 승인 불가(WC084)',
  $$select pg_temp.decide((select v from rq where k = 's5'), true, 'hrb')$$, 'WC084');
select pg_temp.expect_error('approver: 대행 중이 아닌 본사 관리자는 승인 불가(WC084)',
  $$select pg_temp.decide((select v from rq where k = 's5'), true, 'hq')$$, 'WC084');
select pg_temp.expect_error('approver: 학생 본인은 승인 불가(WC084)',
  $$select pg_temp.decide((select v from rq where k = 's5'), true, 's5')$$, 'WC084');
select pg_temp.expect_text('approver: 거부되면 신청은 pending',
  (select status from public.enrollment_changes where id = (select v from rq where k = 's5')), 'pending');
select pg_temp.expect_text('approver: 담임 hr2 가 승인', pg_temp.decide((select v from rq where k = 's5'), true, 'hr2'), 'applied');
select pg_temp.expect_error('decide: 이미 결정된 신청은 WC083',
  $$select pg_temp.decide((select v from rq where k = 's5'), true, 'hr2')$$, 'WC083');
select pg_temp.expect_error('decide: 없는 신청은 WC083',
  $$select pg_temp.decide(gen_random_uuid(), true, 'hr2')$$, 'WC083');

-- 3반은 담임이 없다. 학교 관리자가 승인하고, 학년이 바뀌면 student_profiles.grade 도 맞춘다.
insert into rq values ('s3', pg_temp.req('s3', '고2', null, '3', 1));
select pg_temp.expect_error('approver: 담임 없는 학급은 다른 반 담임이 승인 불가(WC084)',
  $$select pg_temp.decide((select v from rq where k = 's3'), true, 'hr1')$$, 'WC084');
select pg_temp.expect_text('approver: 담임 없는 학급은 학교 관리자가 승인',
  pg_temp.decide((select v from rq where k = 's3'), true, 'adm'), 'applied');
select pg_temp.expect_text('decide: 학년과 학급이 바뀐다', pg_temp.enr_s('s3'), '고2/3/1/v2');
select pg_temp.expect_text('decide: student_profiles.grade 동기화',
  (select grade from public.student_profiles where profile_id = pg_temp.fx('s3')), '고2');

-- 본사 대행 중 승인하면 세션이 남는다
select pg_temp.enroll('s6', null, null);
insert into rq values ('s6', pg_temp.req('s6', '고1', null, '3', 2));
select pg_temp.expect_error('approver: 대행 시작 전 본사 관리자는 승인 불가(WC084)',
  $$select pg_temp.decide((select v from rq where k = 's6'), true, 'hq')$$, 'WC084');
-- 대행은 teacherConsoleProxy edit 권한이 있어야 한다.
insert into public.admin_resources (key, group_title, label, sort_order, is_active)
  values ('teacherConsoleProxy', '서비스 관리', '교사 콘솔 대리 접속', 603, true)
  on conflict (key) do nothing;
insert into public.admin_members (profile_id, status) values (pg_temp.fx('hq'), 'active');
insert into public.admin_member_permissions (profile_id, resource_key, level)
  values (pg_temp.fx('hq'), 'teacherConsoleProxy', 'edit');
select public.fn_proxy_start(pg_temp.fx('hq'), pg_temp.fx('ta'), 'roster_proxy');
select pg_temp.expect_text('approver: 대행 중 본사 관리자가 승인', pg_temp.decide((select v from rq where k = 's6'), true, 'hq'), 'applied');
select pg_temp.expect_bool('decide: 대행 세션이 신청 행에 남는다',
  (select proxy_session_id is not null and decided_teacher_id is null
     from public.enrollment_changes where id = (select v from rq where k = 's6')), true);

-- 그 사이 학적이 바뀌었으면(version 이동) 승인 실패, 신청은 pending 으로 남는다
insert into rq values ('s4', pg_temp.req('s4', '고1', null, '1', 9));
select public.fn_enrollment_update(pg_temp.fx('s4'), 1, '고1', pg_temp.cid('ta', '고1', '2'), 4::smallint,
  'admin_direct', 'number_change', null, pg_temp.fx('adm'), pg_temp.fx('ta'));
select pg_temp.expect_error('decide: 신청 뒤 학적 version 이 바뀌면 승인 실패(WC078)',
  $$select pg_temp.decide((select v from rq where k = 's4'), true, 'hr1')$$, 'WC078');
select pg_temp.expect_text('decide: 충돌이면 신청은 pending, 학적은 그대로',
  (select status from public.enrollment_changes where id = (select v from rq where k = 's4'))
  || '/' || pg_temp.enr_s('s4'), 'pending/고1/2/4/v2');
select pg_temp.expect_text('decide: 충돌 난 신청도 거절할 수 있다',
  pg_temp.decide((select v from rq where k = 's4'), false, 'hr1', '이미 반이 바뀌었어요'), 'rejected');

-- 함수 권한: decide 는 service_role 만, request 는 로그인한 사용자만
grant execute on function pg_temp.expect_error(text, text, text) to anon, authenticated;
set local role anon;
select pg_temp.expect_error('anon 은 fn_request_enrollment_change 실행 불가',
  $$select public.fn_request_enrollment_change('고1', null, '1', null)$$, '42501');
select pg_temp.expect_error('anon 은 fn_decide_enrollment_change 실행 불가',
  $$select public.fn_decide_enrollment_change(gen_random_uuid(), true, null, gen_random_uuid())$$, '42501');
reset role;
set local role authenticated;
select pg_temp.expect_error('authenticated 는 fn_decide_enrollment_change 실행 불가',
  $$select public.fn_decide_enrollment_change(gen_random_uuid(), true, null, gen_random_uuid())$$, '42501');
reset role;

do $$ begin raise notice '=== b2b-enrollment-requests.spec: 전체 통과 ==='; end $$;

rollback;
