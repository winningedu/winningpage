-- =====================================================================
-- 스쿨멘토 기관 서비스 게이트 SQL 스펙(4번): 기타 소속 막기, 학습진단 기관 소비,
-- 기타에서 소속코드로 옮기기(조회, 이동)
--
-- 실행: 마이그레이션이 전부 적용된 스택에서
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/b2b-tenant-service-gate.spec.sql
--
-- 전체가 한 트랜잭션이고 마지막에 ROLLBACK 한다. 어떤 데이터도 남기지
-- 않는다. 단언 실패는 예외로 터져 psql 이 비정상 종료(ON_ERROR_STOP)한다.
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

create function pg_temp.mk_user(p_email text, p_tenant uuid default null) returns uuid
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
  insert into public.profiles (id, name, role, email, tenant_id, member_type)
  values (v_id, p_email, 'user', p_email, p_tenant, 'student')
  on conflict (id) do update set tenant_id = excluded.tenant_id, member_type = excluded.member_type;
  return v_id;
end $$;

create temp table fx (k text primary key, v uuid);
create function pg_temp.fx(p_k text) returns uuid language sql as $$ select v from fx where k = p_k $$;
create function pg_temp.today() returns date language sql as $$ select (now() at time zone 'Asia/Seoul')::date $$;

-- 이미 있는 기타 기관은 이 스펙 안에서만 내려, 스펙이 만든 기타 기관과 겹치지 않게 한다.
update public.tenants set is_catch_all = false where is_catch_all;

-- 기관과 학생 한 명(같은 키). 코드는 8자 고정 형식.
create function pg_temp.mk_tenant(p_key text, p_code text, p_org_type text default '학교', p_catch_all boolean default false)
returns void language plpgsql as $$
declare
  v_tenant uuid;
begin
  insert into public.tenants (code, name, region, org_type, tier, is_catch_all, contract_start_date)
  values (p_code, 'tsg-' || p_key, '서울', p_org_type, 'B', p_catch_all, pg_temp.today() - 10)
  returning id into v_tenant;
  insert into fx values ('t_' || p_key, v_tenant);
  insert into fx values (p_key, pg_temp.mk_user('tsg-' || p_key || '@t.local', v_tenant));
end $$;

create function pg_temp.setting(p_key text, p_program text, p_monthly integer, p_term integer)
returns void language sql as $$
  insert into public.tenant_service_settings (tenant_id, program_key, monthly_limit, term_limit)
  values (pg_temp.fx('t_' || p_key), p_program, p_monthly, p_term)
$$;

-- ---------------------------------------------------------------------
-- 상태와 소비: 기타 소속은 설정 행이 있어도 catch_all 로 막힌다
-- ---------------------------------------------------------------------
select pg_temp.mk_tenant('etc', 'TGAAAAAA', '기타', true);
select pg_temp.setting('etc', 'selfeval', 5, null);
select pg_temp.mk_tenant('real', 'TGBBBBBB');
select pg_temp.setting('real', 'selfeval', 5, null);

select pg_temp.expect_text('state: 기타 소속은 설정이 있어도 catch_all',
  (select s.allowed || ':' || s.deny_reason from public.fn_tenant_usage_state(pg_temp.fx('etc'), 'selfeval') s), 'false:catch_all');
select pg_temp.expect_text('consume: 기타 소속은 catch_all',
  public.fn_consume_tenant_usage(pg_temp.fx('etc'), 'selfeval', 'selfeval_session', gen_random_uuid()), 'catch_all');
select pg_temp.expect_int('consume: 기타 소속은 기록을 남기지 않는다',
  (select count(*) from public.tenant_usage_events where profile_id = pg_temp.fx('etc')), 0);
select pg_temp.expect_text('state: 일반 기관은 그대로 허용',
  (select s.allowed::text from public.fn_tenant_usage_state(pg_temp.fx('real'), 'selfeval') s), 'true');
select pg_temp.expect_text('consume: 일반 기관은 그대로 consumed',
  public.fn_consume_tenant_usage(pg_temp.fx('real'), 'selfeval', 'selfeval_session', gen_random_uuid()), 'consumed');

-- ---------------------------------------------------------------------
-- 선생님 계정(public.teachers.profile_id 로 이어진 계정)은 설정이 켜진 기관이어도 teacher 로 막힌다(가장 먼저 본다)
-- ---------------------------------------------------------------------
select pg_temp.mk_user('tsg-teacher@t.local', pg_temp.fx('t_real')) as teacher_id \gset
update public.profiles set member_type = 'teacher' where id = :'teacher_id'::uuid;
insert into public.teachers (tenant_id, name, phone, role, login_id, profile_id)
select pg_temp.fx('t_real'), 'TSG교사', '01055550001', 'homeroom', t.code || 'AAAAAA', :'teacher_id'::uuid
  from public.tenants t where t.id = pg_temp.fx('t_real');

select pg_temp.expect_text('state: 선생님 계정은 설정이 켜져 있어도 teacher',
  (select s.allowed || ':' || s.deny_reason from public.fn_tenant_usage_state(:'teacher_id'::uuid, 'selfeval') s), 'false:teacher');
select pg_temp.expect_text('consume: 선생님 계정은 teacher',
  public.fn_consume_tenant_usage(:'teacher_id'::uuid, 'selfeval', 'selfeval_session', gen_random_uuid()), 'teacher');
select pg_temp.expect_int('consume: 선생님 계정은 기록을 남기지 않는다',
  (select count(*) from public.tenant_usage_events where profile_id = :'teacher_id'::uuid), 0);
-- member_type 은 클라이언트가 고칠 수 있는 열이라 판정에 쓰지 않는다. teachers 행만 본다.
update public.profiles set member_type = 'student' where id = :'teacher_id'::uuid;
select pg_temp.expect_text('state: member_type 을 student 로 바꿔도 선생님은 teacher',
  (select s.allowed || ':' || s.deny_reason from public.fn_tenant_usage_state(:'teacher_id'::uuid, 'selfeval') s), 'false:teacher');
update public.profiles set member_type = null where id = :'teacher_id'::uuid;
select pg_temp.expect_text('consume: member_type 이 null 이어도 선생님은 teacher',
  public.fn_consume_tenant_usage(:'teacher_id'::uuid, 'selfeval', 'selfeval_session', gen_random_uuid()), 'teacher');
update public.teachers set deleted_at = now() where profile_id = :'teacher_id'::uuid;
select pg_temp.expect_text('state: 삭제한 선생님도 teacher',
  (select s.allowed || ':' || s.deny_reason from public.fn_tenant_usage_state(:'teacher_id'::uuid, 'selfeval') s), 'false:teacher');
select pg_temp.expect_text('state: teachers 행이 없는 member_type=teacher 는 막지 않는다',
  (select s.allowed::text from public.fn_tenant_usage_state(
     (select pg_temp.mk_user('tsg-fake@t.local', pg_temp.fx('t_real'))), 'selfeval') s), 'true');
select pg_temp.expect_text('state: 같은 기관의 학생은 그대로 허용',
  (select s.allowed::text from public.fn_tenant_usage_state(pg_temp.fx('real'), 'selfeval') s), 'true');

-- ---------------------------------------------------------------------
-- fn_consume_tenant_diagnosis: 학습진단 제출 1건을 기관 한도로 센다(무료 1회 없음)
-- ---------------------------------------------------------------------
select pg_temp.mk_tenant('dg', 'TGCCCCCC');
select pg_temp.setting('dg', 'diagnose', 2, null);
select pg_temp.mk_user('tsg-dg-other@t.local', pg_temp.fx('t_dg')) as other_id \gset
create temp table att as select gen_random_uuid() as id;

select pg_temp.expect_text('diagnosis: 첫 제출은 consumed',
  public.fn_consume_tenant_diagnosis((select id from att), pg_temp.fx('dg')), 'consumed');
select pg_temp.expect_text('diagnosis: 시도 행은 kind tenant 로 한 줄',
  (select a.kind || ':' || a.profile_id::text = 'tenant:' || pg_temp.fx('dg')::text from public.diagnosis_attempts a where a.id = (select id from att))::text, 'true');
select pg_temp.expect_int('diagnosis: 사용 기록은 한 줄',
  (select count(*) from public.tenant_usage_events where source_kind = 'diagnosis_attempt' and source_id = (select id from att)), 1);
select pg_temp.expect_text('diagnosis: 같은 시도 재호출은 already_recorded',
  public.fn_consume_tenant_diagnosis((select id from att), pg_temp.fx('dg')), 'already_recorded');
select pg_temp.expect_int('diagnosis: 재호출은 기록을 늘리지 않는다',
  (select count(*) from public.tenant_usage_events where profile_id = pg_temp.fx('dg')), 1);
select pg_temp.expect_text('diagnosis: 남의 시도 id 는 attempt_conflict',
  public.fn_consume_tenant_diagnosis((select id from att), :'other_id'::uuid), 'attempt_conflict');
select pg_temp.expect_int('diagnosis: attempt_conflict 는 기록을 남기지 않는다',
  (select count(*) from public.tenant_usage_events where profile_id = :'other_id'::uuid), 0);

-- 사용 기록만 있고 시도 행이 없는 시도(중간에 끊긴 경우)는 already_consumed 로 시도 행을 채운다
create temp table att2 as select gen_random_uuid() as id;
insert into public.tenant_usage_events (profile_id, tenant_id, program_key, source_kind, source_id)
  values (pg_temp.fx('dg'), pg_temp.fx('t_dg'), 'diagnose', 'diagnosis_attempt', (select id from att2));
select pg_temp.expect_text('diagnosis: 기록만 있는 시도는 already_consumed',
  public.fn_consume_tenant_diagnosis((select id from att2), pg_temp.fx('dg')), 'already_consumed');
select pg_temp.expect_int('diagnosis: already_consumed 도 시도 행을 남긴다',
  (select count(*) from public.diagnosis_attempts where id = (select id from att2) and kind = 'tenant'), 1);

-- 월 2회가 찼다: 새 시도는 month_cap, 시도 행이 생기지 않는다
create temp table att3 as select gen_random_uuid() as id;
select pg_temp.expect_text('diagnosis: 한도가 차면 month_cap',
  public.fn_consume_tenant_diagnosis((select id from att3), pg_temp.fx('dg')), 'month_cap');
select pg_temp.expect_int('diagnosis: month_cap 은 시도 행을 남기지 않는다',
  (select count(*) from public.diagnosis_attempts where id = (select id from att3)), 0);
select pg_temp.expect_text('diagnosis: 기타 소속은 catch_all',
  public.fn_consume_tenant_diagnosis(gen_random_uuid(), pg_temp.fx('etc')), 'catch_all');

-- ---------------------------------------------------------------------
-- fn_catch_all_tenant_lookup: 기타 소속 학생의 소속코드 조회
-- ---------------------------------------------------------------------
select pg_temp.mk_tenant('lk', 'TGDDDDDD', '기관');

select pg_temp.expect_error('lookup: 일반 기관 학생은 WC098',
  format('select * from public.fn_catch_all_tenant_lookup(%L, %L)', pg_temp.fx('real'), 'TGDDDDDD'), 'WC098');
select pg_temp.expect_text('lookup: 맞는 코드는 기관 이름과 종류',
  (select l.name || ':' || l.org_type from public.fn_catch_all_tenant_lookup(pg_temp.fx('etc'), 'tgdddddd') l), 'tsg-lk:기관');
select pg_temp.expect_int('lookup: 맞는 코드는 실패 기록을 남기지 않는다',
  (select count(*) from public.tenant_code_attempts where user_id = pg_temp.fx('etc')), 0);
select pg_temp.expect_int('lookup: 없는 코드는 0행',
  (select count(*) from public.fn_catch_all_tenant_lookup(pg_temp.fx('etc'), 'TGZZZZZZ')), 0);
select pg_temp.expect_int('lookup: 없는 코드는 실패 기록을 남긴다',
  (select count(*) from public.tenant_code_attempts where user_id = pg_temp.fx('etc')), 1);
select pg_temp.expect_int('lookup: 기타 자신의 코드는 0행',
  (select count(*) from public.fn_catch_all_tenant_lookup(pg_temp.fx('etc'), 'TGAAAAAA')), 0);
select pg_temp.expect_ok('lookup: 실패를 10회까지 채운다', $$
  select public.fn_catch_all_tenant_lookup(pg_temp.fx('etc'), 'TGZZZZZ' || n) from generate_series(1, 9) n
$$);
select pg_temp.expect_error('lookup: 11번째 시도는 WC068(맞는 코드도 막는다)',
  format('select * from public.fn_catch_all_tenant_lookup(%L, %L)', pg_temp.fx('etc'), 'TGDDDDDD'), 'WC068');

-- ---------------------------------------------------------------------
-- fn_catch_all_join_tenant: 기타에서 소속코드로 옮기기(성공)
-- ---------------------------------------------------------------------
select pg_temp.mk_tenant('js', 'TGFFFFFF');
select pg_temp.mk_tenant('ja', 'TGGGGGGG', '기관');
insert into public.class_groups (tenant_id, name) values (pg_temp.fx('t_ja'), '심화반');

-- 기타 소속 학생: 전화번호, 학년, 기타 학적 행(가입 때와 같다)과 대기 중인 반 변경 신청 한 건
create function pg_temp.mk_cj(p_key text, p_phone text) returns void language plpgsql as $$
declare
  v_uid uuid := pg_temp.mk_user('tsg-' || p_key || '@t.local', pg_temp.fx('t_etc'));
  v_year smallint;
begin
  update public.profiles set phone = p_phone where id = v_uid;
  insert into public.student_profiles (profile_id, grade) values (v_uid, '고1');
  perform public.fn_enrollment_join(v_uid, pg_temp.fx('t_etc'), '고1', null, null, null);
  select school_year into v_year from public.tenants where id = pg_temp.fx('t_etc');
  insert into public.enrollment_changes (tenant_id, student_id, school_year, kind, status, to_grade, requested_by)
  values (pg_temp.fx('t_etc'), v_uid, v_year, 'request', 'pending', '고2', v_uid);
  insert into fx values (p_key, v_uid);
end $$;

select pg_temp.mk_cj('cj1', '010-7000-0001');
select pg_temp.expect_text('join: 학교로 옮기면 기관 이름과 학적 id 를 돌려준다',
  (select j.tenant_name || ':' || (j.enrollment_id is not null)::text
     from public.fn_catch_all_join_tenant(pg_temp.fx('cj1'), 'tgffffff', '고2', null, '3반', 7::smallint) j), 'tsg-js:true');
select pg_temp.expect_text('join: 소속이 바뀌고 학교는 school_name 을 채운다',
  (select (tenant_id = pg_temp.fx('t_js'))::text || ':' || coalesce(school_name, '-') from public.profiles where id = pg_temp.fx('cj1')), 'true:tsg-js');
select pg_temp.expect_int('join: 기타 학적 행이 지워진다',
  (select count(*) from public.student_enrollments where student_id = pg_temp.fx('cj1') and tenant_id = pg_temp.fx('t_etc')), 0);
select pg_temp.expect_text('join: 대상 기관 학적에 학년, 반(정규화된 이름), 번호가 들어간다',
  (select e.grade || ':' || c.name || ':' || e.number
     from public.student_enrollments e join public.classes c on c.id = e.class_id
    where e.student_id = pg_temp.fx('cj1') and e.tenant_id = pg_temp.fx('t_js')), '고2:3:7');
select pg_temp.expect_text('join: student_profiles 학년이 맞춰진다',
  (select grade from public.student_profiles where profile_id = pg_temp.fx('cj1')), '고2');
select pg_temp.expect_int('join: 대상 기관에 signup 적용 이력이 남는다',
  (select count(*) from public.enrollment_changes
    where student_id = pg_temp.fx('cj1') and tenant_id = pg_temp.fx('t_js') and kind = 'signup' and status = 'applied'), 1);
select pg_temp.expect_text('join: 기타의 대기 신청은 소속 변경 사유로 rejected',
  (select c.status || ':' || c.reject_reason from public.enrollment_changes c
    where c.student_id = pg_temp.fx('cj1') and c.tenant_id = pg_temp.fx('t_etc') and c.kind = 'request'), 'rejected:소속 변경');

select pg_temp.expect_text('join: 거절한 신청에 결정자로 학생 본인이 남는다',
  (select (c.decided_by = pg_temp.fx('cj1'))::text from public.enrollment_changes c
    where c.student_id = pg_temp.fx('cj1') and c.tenant_id = pg_temp.fx('t_etc') and c.kind = 'request'), 'true');

-- 학원: 그룹을 받고 번호는 선택, school_name 은 비운다
select pg_temp.mk_cj('cj2', '010-7000-0002');
select pg_temp.expect_ok('join: 학원은 그룹을 주고 번호 없이 옮긴다', $$
  select * from public.fn_catch_all_join_tenant(pg_temp.fx('cj2'), 'TGGGGGGG', '고1', '심화반', 'A반', null)
$$);
select pg_temp.expect_text('join: 학원은 school_name 을 비운다',
  (select coalesce(school_name, '-') from public.profiles where id = pg_temp.fx('cj2')), '-');
select pg_temp.expect_text('join: 학원 학적은 그룹 학급이고 번호가 없다',
  (select g.name || ':' || coalesce(e.number::text, '-')
     from public.student_enrollments e join public.classes c on c.id = e.class_id
     join public.class_groups g on g.id = c.group_id
    where e.student_id = pg_temp.fx('cj2')), '심화반:-');

-- 본사가 기관 이동으로 소속만 기타로 옮겨 올해 학적 행이 다른 기관(real)에 남은 학생. 반이 있어도 없어도 옮길 수 있다.
create function pg_temp.mk_stale(p_key text, p_phone text, p_with_class boolean) returns void language plpgsql as $$
declare
  v_year smallint;
  v_class uuid;
begin
  perform pg_temp.mk_cj(p_key, p_phone);
  select school_year into v_year from public.tenants where id = pg_temp.fx('t_real');
  if p_with_class then
    v_class := public.fn_class_ensure(pg_temp.fx('t_real'), v_year, '고1', null, '1반');
  end if;
  update public.student_enrollments
     set tenant_id = pg_temp.fx('t_real'), class_id = v_class, school_year = v_year
   where student_id = pg_temp.fx(p_key);
end $$;

select pg_temp.mk_stale('st1', '010-7000-0011', true);
select pg_temp.expect_ok('join: 올해 학적 행이 다른 기관에 반과 함께 남아 있어도 옮긴다',
  format('select * from public.fn_catch_all_join_tenant(%L, %L, %L, null, %L, null)', pg_temp.fx('st1'), 'TGFFFFFF', '고2', '2반'));
select pg_temp.expect_text('join: 남아 있던 다른 기관 학적은 지워지고 대상 기관에 하나만 있다',
  (select count(*) filter (where tenant_id = pg_temp.fx('t_js'))::text || ':' || count(*) filter (where tenant_id <> pg_temp.fx('t_js'))::text
     from public.student_enrollments where student_id = pg_temp.fx('st1')), '1:0');
select pg_temp.mk_stale('st2', '010-7000-0012', false);
select pg_temp.expect_ok('join: 올해 학적 행이 다른 기관에 반 없이 남아 있어도 옮긴다',
  format('select * from public.fn_catch_all_join_tenant(%L, %L, %L, null, %L, null)', pg_temp.fx('st2'), 'TGFFFFFF', '고2', '2반'));
select pg_temp.expect_int('join: 반 없이 남아 있던 다른 기관 학적도 지워진다',
  (select count(*) from public.student_enrollments where student_id = pg_temp.fx('st2') and tenant_id <> pg_temp.fx('t_js')), 0);

-- ---------------------------------------------------------------------
-- fn_catch_all_join_tenant: 실패는 아무것도 바꾸지 않는다
-- ---------------------------------------------------------------------
create function pg_temp.join_call(p_key text, p_code text, p_group text, p_class text, p_number smallint)
returns text language sql as $$
  select format('select * from public.fn_catch_all_join_tenant(%L, %L, %L, %L, %L, %L)',
    pg_temp.fx(p_key), p_code, '고2', p_group, p_class, p_number)
$$;

-- 소속, 기타 학적 행, 대기 신청이 처음 그대로인지 한 줄로 본다
create function pg_temp.untouched(p_key text) returns text language sql as $$
  select (select (tenant_id = pg_temp.fx('t_etc'))::text from public.profiles where id = pg_temp.fx(p_key))
      || ':' || (select count(*) from public.student_enrollments where student_id = pg_temp.fx(p_key) and tenant_id = pg_temp.fx('t_etc'))
      || ':' || (select count(*) from public.enrollment_changes where student_id = pg_temp.fx(p_key) and status = 'pending')
$$;

select pg_temp.mk_cj('cj3', '010-7000-0003');
select pg_temp.expect_text('join 실패 기준: 기타, 학적 1, 대기 신청 1', pg_temp.untouched('cj3'), 'true:1:1');

-- 같은 반 같은 번호(다른 학생이 이미 8번)
select pg_temp.fx('t_js') as t_js \gset
select pg_temp.mk_user('tsg-occupant@t.local', pg_temp.fx('t_js')) as occupant \gset
select public.fn_enrollment_join(:'occupant'::uuid, pg_temp.fx('t_js'), '고2', null, '3반', 8::smallint);
select pg_temp.expect_error('join: 번호가 이미 쓰이면 WC077', pg_temp.join_call('cj3', 'TGFFFFFF', null, '3반', 8::smallint), 'WC077');
select pg_temp.expect_text('join: WC077 이면 아무것도 바뀌지 않는다', pg_temp.untouched('cj3'), 'true:1:1');

-- 대상 기관에 같은 전화번호(숫자 기준)
select pg_temp.mk_user('tsg-samephone@t.local', pg_temp.fx('t_js')) as samephone \gset
update public.profiles set phone = '01070000003' where id = :'samephone'::uuid;
select pg_temp.expect_error('join: 대상 기관에 같은 번호가 있으면 WC096', pg_temp.join_call('cj3', 'TGFFFFFF', null, '4반', 9::smallint), 'WC096');
select pg_temp.expect_text('join: WC096 이면 아무것도 바뀌지 않는다', pg_temp.untouched('cj3'), 'true:1:1');

select pg_temp.expect_error('join: 등록되지 않은 그룹이면 WC080', pg_temp.join_call('cj3', 'TGGGGGGG', '없는그룹', 'A반', null), 'WC080');
select pg_temp.expect_text('join: WC080 이면 아무것도 바뀌지 않는다', pg_temp.untouched('cj3'), 'true:1:1');

select pg_temp.expect_error('join: 기타가 아닌 학생은 WC098', pg_temp.join_call('real', 'TGFFFFFF', null, '3반', 1::smallint), 'WC098');
select pg_temp.expect_text('join: WC098 이면 소속이 그대로',
  (select (tenant_id = pg_temp.fx('t_real'))::text from public.profiles where id = pg_temp.fx('real')), 'true');
select pg_temp.expect_error('join: 한 번 옮긴 학생은 다시 WC098', pg_temp.join_call('cj1', 'TGGGGGGG', null, 'A반', null), 'WC098');

-- 못 찾는 코드와 기타 자신의 코드는 0행, 실패 기록은 남고 10회째 뒤에는 WC068
select pg_temp.expect_int('join: 없는 코드는 0행',
  (select count(*) from public.fn_catch_all_join_tenant(pg_temp.fx('cj3'), 'TGYYYYYY', '고2', null, '3반', 1::smallint)), 0);
select pg_temp.expect_int('join: 기타 자신의 코드는 0행',
  (select count(*) from public.fn_catch_all_join_tenant(pg_temp.fx('cj3'), 'TGAAAAAA', '고2', null, '3반', 1::smallint)), 0);
select pg_temp.expect_int('join: 없는 코드는 실패 기록을 남긴다',
  (select count(*) from public.tenant_code_attempts where user_id = pg_temp.fx('cj3')), 1);
select pg_temp.expect_text('join: 0행이면 아무것도 바뀌지 않는다', pg_temp.untouched('cj3'), 'true:1:1');
select pg_temp.expect_ok('join: 실패를 10회까지 채운다', $$
  select count(*) from (select public.fn_catch_all_join_tenant(pg_temp.fx('cj3'), 'TGXXXXX' || n, '고2', null, '3반', 1::smallint)
                          from generate_series(1, 9) n) q
$$);
select pg_temp.expect_error('join: 11번째 시도는 WC068', pg_temp.join_call('cj3', 'TGFFFFFF', null, '5반', 1::smallint), 'WC068');

-- 계약이 끝난 기관으로도 옮길 수 있다(98.12), 옮긴 뒤 서비스는 기간 사유로 막힌다
select pg_temp.mk_tenant('je', 'TGHHHHHH');
update public.tenants set contract_end_date = pg_temp.today() - 5 where id = pg_temp.fx('t_je');
select pg_temp.setting('je', 'selfeval', 5, null);
select pg_temp.mk_cj('cj4', '010-7000-0004');
select pg_temp.expect_ok('join: 계약이 끝난 기관으로도 옮긴다', pg_temp.join_call('cj4', 'TGHHHHHH', null, '1반', 1::smallint));
select pg_temp.expect_text('join: 옮긴 뒤 서비스는 outside_period 로 막힌다',
  (select s.deny_reason from public.fn_tenant_usage_state(pg_temp.fx('cj4'), 'selfeval') s), 'outside_period');

-- ---------------------------------------------------------------------
-- 기타 학적 행을 지워도 되는지: student_enrollments.id 를 가리키는 외래키가 없어야 한다(결정 98.11)
-- 생기면 이 스펙이 깨져 fn_catch_all_join_tenant 의 삭제를 다시 따져 보게 된다.
-- ---------------------------------------------------------------------
select pg_temp.expect_int('student_enrollments 를 참조하는 외래키가 없다',
  (select count(*) from pg_constraint where contype = 'f' and confrelid = 'public.student_enrollments'::regclass), 0);

-- ---------------------------------------------------------------------
-- 실패 횟수 제한은 사용자별 잠금 안에서 센다(동시 요청이 같은 횟수를 보고 모두 통과하지 못하게)
-- 잠금은 트랜잭션이 끝날 때까지 잡혀 있으므로 호출 뒤 이 세션이 그 키의 어드바이저리 잠금을 쥐고 있어야 한다.
-- ---------------------------------------------------------------------
select public.fn_tenant_code_resolve_for(pg_temp.fx('real'), 'TGNOPE99');
select pg_temp.expect_int('resolve_for: 사용자별 어드바이저리 잠금(68)을 쥔다',
  (select count(*) from pg_locks l
    where l.locktype = 'advisory' and l.pid = pg_backend_pid() and l.granted
      and ((l.classid::bigint << 32) | l.objid::bigint) = hashtextextended(pg_temp.fx('real')::text, 68)), 1);

-- ---------------------------------------------------------------------
-- 권한: 새 함수는 service_role 만 부른다(anon, authenticated 는 42501)
-- ---------------------------------------------------------------------
create function pg_temp.denied(p_role text, p_call text) returns void language plpgsql as $$
begin
  perform pg_temp.expect_error(p_role || ' 는 ' || split_part(p_call, '(', 1) || ' 를 못 부른다',
    format('set local role %I; select * from %s', p_role, p_call), '42501');
end $$;

select pg_temp.denied(r, c)
  from unnest(array['anon', 'authenticated']) r,
       unnest(array[
         'public.fn_consume_tenant_diagnosis(gen_random_uuid(), gen_random_uuid())',
         'public.fn_tenant_code_resolve_for(gen_random_uuid(), ''X'')',
         'public.fn_catch_all_tenant_lookup(gen_random_uuid(), ''X'')',
         'public.fn_catch_all_join_tenant(gen_random_uuid(), ''X'', ''고1'', null, ''1반'', null)'
       ]) c;
select pg_temp.expect_int('service_role 은 새 함수 4개를 부를 수 있다',
  (select count(*) from unnest(array[
     'public.fn_consume_tenant_diagnosis(uuid, uuid)',
     'public.fn_tenant_code_resolve_for(uuid, text)',
     'public.fn_catch_all_tenant_lookup(uuid, text)',
     'public.fn_catch_all_join_tenant(uuid, text, text, text, text, smallint)'
   ]) f where has_function_privilege('service_role', f, 'execute')), 4);

rollback;
