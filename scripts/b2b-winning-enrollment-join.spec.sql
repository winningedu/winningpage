-- =====================================================================
-- 위닝에듀 소속 가입 학적 SQL 스펙: 위닝 경로(가입 RPC, 소속 코드 입력, 어드민 소속 변경)도
-- 스쿨멘토 선생님 화면이 읽는 student_enrollments 와 맞춘다.
--
-- 실행: 마이그레이션이 전부 적용된 스택에서
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/b2b-winning-enrollment-join.spec.sql
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

create function pg_temp.as_user(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
end $$;

create function pg_temp.mk_user(p_email text, p_member_type text) returns uuid
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
  values (v_id, p_email, 'user', p_email, p_member_type);
  return v_id;
end $$;

create temp table fx (k text primary key, v uuid);
create function pg_temp.fx(p_k text) returns uuid language sql as $$ select v from fx where k = p_k $$;
grant select on fx to authenticated, service_role;
grant execute on function pg_temp.fx(text) to authenticated, service_role;

-- 이 스펙이 만드는 기타 기관과 겹치지 않게, 이미 있는 기타 기관은 스펙 안에서만 내린다.
update public.tenants set is_catch_all = false where is_catch_all;
insert into public.tenants (code, name, region, org_type, tier, contract_start_date)
values ('WEAAAAAA', 'wej-school', '서울', '학교', 'B', current_date - 10);

insert into public.app_settings (key, value) values ('signup_enabled', 'true'::jsonb)
on conflict (key) do update set value = 'true'::jsonb;
update public.app_settings set value = 'false'::jsonb where key = 'require_tenant_on_signup';
-- 사이트 표식: 위닝 프로젝트는 "winning" 이다(스쿨멘토 프로젝트는 "schoolmentor", 11번 케이스).
insert into public.app_settings (key, value) values ('site_key', '"winning"'::jsonb)
on conflict (key) do update set value = '"winning"'::jsonb;

-- 학생 가입: student_profiles.grade 가 있으면 그 학년이 학적 학년의 후보다.
-- 본인 번호 인증(phone_verifications)은 가입 한 번에 한 건씩 소비되므로 호출마다 새로 만든다.
create function pg_temp.mk_signup_student(p_key text, p_grade text) returns void
language plpgsql as $$
declare
  v_uid uuid := pg_temp.mk_user('wej-' || p_key || '@t.local', null);
begin
  if p_grade is not null then
    insert into public.student_profiles (profile_id, grade) values (v_uid, p_grade);
  end if;
  insert into fx values (p_key, v_uid);
end $$;

create function pg_temp.signup_sql(p_key text, p_phone text, p_code text, p_member_type text default 'student')
returns text language plpgsql as $$
begin
  insert into public.phone_verifications (phone, code_hash, purpose, verified_at, expires_at)
  values (p_phone, 'x', 'signup', now(), now() + interval '10 minutes');
  return format($f$select public.complete_signup_profile(
    p_name => %1$L, p_username => %1$L, p_phone => %2$L, p_email => %1$L,
    p_region => '서울', p_school_type => '고등학교', p_school_name => '',
    p_member_type => %4$L, p_terms_service_agreed => true, p_privacy_required_agreed => true,
    p_identity_required_agreed => true, p_privacy_optional_agreed => false,
    p_marketing_agreed => false, p_ads_agreed => false, p_guardian_phone => '',
    p_guardian_consent => false, p_identity_request_id => '', p_birth_date => '2009-01-01',
    p_gender => '남', p_org_code => %3$L)$f$, 'wej-' || p_key || '@t.local', p_phone, p_code, p_member_type);
end $$;
grant execute on function pg_temp.signup_sql(text, text, text, text) to authenticated;

create function pg_temp.enr(p_key text) returns text language sql as $$
  select count(*)::text
      || ':' || coalesce(max(e.grade), 'null')
      || ':' || coalesce(bool_and(e.class_id is null)::text, 'none')
    from public.student_enrollments e where e.student_id = pg_temp.fx(p_key)
$$;
grant execute on function pg_temp.enr(text) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 1. 소속 코드로 가입하면 올해 학급 없는 학적이 하나 생긴다(학년은 student_profiles.grade)
-- ---------------------------------------------------------------------
select pg_temp.mk_signup_student('s1', '고2');
select pg_temp.signup_sql('s1', '01091110001', 'WEAAAAAA') as q \gset
select pg_temp.as_user(pg_temp.fx('s1'));
set local role authenticated;
:q ;
reset role;
select pg_temp.expect_text('소속 코드 가입 = 학적 1건, 학년 고2, 학급 없음', pg_temp.enr('s1'), '1:고2:true');

-- ---------------------------------------------------------------------
-- 2. 가입 완료를 다시 보내도(재시도) 실패하지 않고 학적도 이력도 늘지 않는다
-- ---------------------------------------------------------------------
create function pg_temp.enr_trail(p_key text) returns text language sql as $$
  select (select count(*) from public.student_enrollments where student_id = pg_temp.fx(p_key))::text
      || ':' || (select coalesce(max(version), 0) from public.student_enrollments where student_id = pg_temp.fx(p_key))::text
      || ':' || (select count(*) from public.enrollment_changes where student_id = pg_temp.fx(p_key))::text
$$;
select pg_temp.expect_text('기준: 학적 1, version 1, 이력 1', pg_temp.enr_trail('s1'), '1:1:1');
select pg_temp.signup_sql('s1', '01091110001', 'WEAAAAAA') as q \gset
select pg_temp.as_user(pg_temp.fx('s1'));
set local role authenticated;
:q ;
reset role;
select pg_temp.expect_text('재시도 후에도 학적 1, version 1, 이력 1', pg_temp.enr_trail('s1'), '1:1:1');

-- ---------------------------------------------------------------------
-- 3. 학년이 중1~고3 밖이거나 없으면 학적 학년은 null
-- ---------------------------------------------------------------------
select pg_temp.mk_signup_student('s_nsu', 'N수');
select pg_temp.signup_sql('s_nsu', '01091110002', 'WEAAAAAA') as q \gset
select pg_temp.as_user(pg_temp.fx('s_nsu'));
set local role authenticated;
:q ;
reset role;
select pg_temp.expect_text('N수는 학년 null, 학적 1건', pg_temp.enr('s_nsu'), '1:null:true');

select pg_temp.mk_signup_student('s_none', null);
select pg_temp.signup_sql('s_none', '01091110003', 'WEAAAAAA') as q \gset
select pg_temp.as_user(pg_temp.fx('s_none'));
set local role authenticated;
:q ;
reset role;
select pg_temp.expect_text('student_profiles 가 없으면 학년 null, 학적 1건', pg_temp.enr('s_none'), '1:null:true');

-- ---------------------------------------------------------------------
-- 4. 소속이 없거나 학생이 아니면 학적을 만들지 않는다
-- ---------------------------------------------------------------------
select pg_temp.mk_signup_student('s_free', '고1');
select pg_temp.signup_sql('s_free', '01091110004', '') as q \gset
select pg_temp.as_user(pg_temp.fx('s_free'));
set local role authenticated;
:q ;
reset role;
select pg_temp.expect_text('소속 코드 없이 가입하면 학적 없음', pg_temp.enr('s_free'), '0:null:none');

select pg_temp.mk_signup_student('p1', null);
select pg_temp.signup_sql('p1', '01091110005', 'WEAAAAAA', 'parent') as q \gset
select pg_temp.as_user(pg_temp.fx('p1'));
set local role authenticated;
:q ;
reset role;
select pg_temp.expect_text('학부모는 소속이 있어도 학적 없음', pg_temp.enr('p1'), '0:null:none');

-- ---------------------------------------------------------------------
-- 5. 가입 뒤 소속 코드를 입력하면(fn_set_my_tenant) 학생에게 같은 학적이 생긴다
-- ---------------------------------------------------------------------
select pg_temp.mk_signup_student('c1', '고3');
update public.profiles set member_type = 'student' where id = pg_temp.fx('c1');
select pg_temp.as_user(pg_temp.fx('c1'));
set local role authenticated;
select count(*) as n from public.fn_set_my_tenant('WEAAAAAA') \gset
reset role;
select pg_temp.expect_text('소속 코드 입력 = 반환 1행', :'n', '1');
select pg_temp.expect_text('소속 코드 입력 = 학적 1건, 학년 고3, 학급 없음', pg_temp.enr('c1'), '1:고3:true');

select pg_temp.mk_signup_student('c_par', null);
update public.profiles set member_type = 'parent' where id = pg_temp.fx('c_par');
select pg_temp.as_user(pg_temp.fx('c_par'));
set local role authenticated;
select count(*) as n from public.fn_set_my_tenant('WEAAAAAA') \gset
reset role;
select pg_temp.expect_text('학부모 소속 코드 입력 = 학적 없음', pg_temp.enr('c_par'), '0:null:none');

-- ---------------------------------------------------------------------
-- 6. 어드민이 학생의 소속을 비우면 올해 학적과 대기 신청이 지워진다
-- ---------------------------------------------------------------------
select pg_temp.mk_user('wej-admin@t.local', null) as adm \gset
insert into fx values ('adm', :'adm');
insert into public.admin_resources (key, group_title, label, sort_order, is_active)
  values ('members', '회원 관리', '회원 관리', 100, true)
  on conflict (key) do nothing;
insert into public.admin_members (profile_id, status) values (pg_temp.fx('adm'), 'active');
insert into public.admin_member_permissions (profile_id, resource_key, level)
  values (pg_temp.fx('adm'), 'members', 'edit');

create function pg_temp.unset_sql(p_key text) returns text language sql as $$
  select format('select public.fn_admin_set_profile_tenant(%L, null)', pg_temp.fx(p_key))
$$;
grant execute on function pg_temp.unset_sql(text) to authenticated;

-- s1: 가입으로 학적이 있고 대기 신청이 한 건 있다.
insert into public.enrollment_changes (tenant_id, student_id, school_year, kind, status, to_grade, requested_by)
select e.tenant_id, e.student_id, e.school_year, 'request', 'pending', '고3', e.student_id
  from public.student_enrollments e where e.student_id = pg_temp.fx('s1');
select pg_temp.expect_text('기준: s1 소속 있음, 학적 1, 대기 신청 1',
  (select (tenant_id is not null)::text from public.profiles where id = pg_temp.fx('s1'))
    || ':' || (select count(*) from public.student_enrollments where student_id = pg_temp.fx('s1'))
    || ':' || (select count(*) from public.enrollment_changes where student_id = pg_temp.fx('s1') and status = 'pending'),
  'true:1:1');

select pg_temp.unset_sql('s1') as q \gset
select pg_temp.as_user(pg_temp.fx('adm'));
set local role authenticated;
:q ;
reset role;
select pg_temp.expect_text('소속 해제 = 소속 null, 학적 0, 대기 신청 0',
  (select coalesce(tenant_id::text, 'null') from public.profiles where id = pg_temp.fx('s1'))
    || ':' || (select count(*) from public.student_enrollments where student_id = pg_temp.fx('s1'))
    || ':' || (select count(*) from public.enrollment_changes where student_id = pg_temp.fx('s1') and status = 'pending'),
  'null:0:0');

-- 학생이 아니면(학부모) 소속만 비우고 학적에는 손대지 않는다. 학적이 있다면 그대로 남아야 한다.
update public.profiles set tenant_id = (select id from public.tenants where code = 'WEAAAAAA') where id = pg_temp.fx('c_par');
insert into public.student_enrollments (tenant_id, student_id, school_year, grade, updated_by)
select t.id, pg_temp.fx('c_par'), t.school_year, null, pg_temp.fx('c_par') from public.tenants t where t.code = 'WEAAAAAA';
select format('select public.fn_admin_set_profile_tenant(%L, null)', pg_temp.fx('c_par')) as q \gset
select pg_temp.as_user(pg_temp.fx('adm'));
set local role authenticated;
:q ;
reset role;
select pg_temp.expect_text('학부모 소속 해제 = 소속 null, 학적 그대로 1',
  (select coalesce(tenant_id::text, 'null') from public.profiles where id = pg_temp.fx('c_par'))
    || ':' || (select count(*) from public.student_enrollments where student_id = pg_temp.fx('c_par')),
  'null:1');

-- ---------------------------------------------------------------------
-- 7. 어드민이 학생의 소속을 다른 기관으로 바꾸려 하면 막는다(학적을 함께 옮기는 fn_admin_move_student_tenant 를 쓴다)
-- ---------------------------------------------------------------------
-- 실행하고 SQLSTATE 를 돌려준다(없으면 none). 호출자 권한으로 돈다.
create function pg_temp.try_sql(p_sql text) returns text
language plpgsql as $$
begin
  execute p_sql;
  return 'none';
exception when others then
  return sqlstate;
end $$;
grant execute on function pg_temp.try_sql(text) to authenticated;

insert into public.tenants (code, name, region, org_type, tier, contract_start_date)
values ('WEBBBBBB', 'wej-other', '서울', '학교', 'B', current_date - 10);

-- c1: 소속 WEAAAAAA 와 그 학적이 있다.
select format('select public.fn_admin_set_profile_tenant(%L, %L)', pg_temp.fx('c1'), (select id from public.tenants where code = 'WEBBBBBB')) as q \gset
select pg_temp.as_user(pg_temp.fx('adm'));
set local role authenticated;
select pg_temp.try_sql(:'q') as st \gset
reset role;
select pg_temp.expect_text('올해 학적이 있는 학생을 다른 기관으로 바꾸면 WC100', :'st', 'WC100');
select pg_temp.expect_text('WC100 뒤 소속과 학적이 그대로',
  (select t.code from public.profiles pr join public.tenants t on t.id = pr.tenant_id where pr.id = pg_temp.fx('c1'))
    || ':' || (select string_agg(t.code, ',') from public.student_enrollments e join public.tenants t on t.id = e.tenant_id where e.student_id = pg_temp.fx('c1')),
  'WEAAAAAA:WEAAAAAA');

-- i1: 소속도 학적도 없는 개인 회원 학생. 소속을 정하면 학적이 같이 생긴다.
select pg_temp.mk_signup_student('i1', '고1');
update public.profiles set member_type = 'student' where id = pg_temp.fx('i1');
select format('select public.fn_admin_set_profile_tenant(%L, %L)', pg_temp.fx('i1'), (select id from public.tenants where code = 'WEBBBBBB')) as q \gset
select pg_temp.as_user(pg_temp.fx('adm'));
set local role authenticated;
:q ;
reset role;
select pg_temp.expect_text('개인 회원 학생에게 소속을 정하면 그 기관 학적 1건, 학년 고1',
  (select t.code from public.profiles pr join public.tenants t on t.id = pr.tenant_id where pr.id = pg_temp.fx('i1'))
    || ':' || (select string_agg(t.code, ',') from public.student_enrollments e join public.tenants t on t.id = e.tenant_id where e.student_id = pg_temp.fx('i1'))
    || ':' || pg_temp.enr('i1'),
  'WEBBBBBB:WEBBBBBB:1:고1:true');

-- 학부모에게 소속을 정하면 학적은 만들지 않는다.
select pg_temp.mk_signup_student('p2', null);
update public.profiles set member_type = 'parent' where id = pg_temp.fx('p2');
select format('select public.fn_admin_set_profile_tenant(%L, %L)', pg_temp.fx('p2'), (select id from public.tenants where code = 'WEBBBBBB')) as q \gset
select pg_temp.as_user(pg_temp.fx('adm'));
set local role authenticated;
:q ;
reset role;
select pg_temp.expect_text('학부모에게 소속을 정해도 학적 없음', pg_temp.enr('p2'), '0:null:none');

-- ---------------------------------------------------------------------
-- 8. 소속 해제는 지난 학년도처럼 졸업한 올해 학적 행을 지우지 않고, 지운 활성 학적은 이력으로 남긴다
-- ---------------------------------------------------------------------
select pg_temp.mk_signup_student('g1', null);
update public.profiles set member_type = 'student', tenant_id = (select id from public.tenants where code = 'WEAAAAAA') where id = pg_temp.fx('g1');
insert into public.student_enrollments (tenant_id, student_id, school_year, grade, status, graduated_at, updated_by)
select t.id, pg_temp.fx('g1'), t.school_year, '고3', 'graduated', now(), pg_temp.fx('g1') from public.tenants t where t.code = 'WEAAAAAA';
select pg_temp.unset_sql('g1') as q \gset
select pg_temp.as_user(pg_temp.fx('adm'));
set local role authenticated;
:q ;
reset role;
select pg_temp.expect_text('소속 해제 = 소속 null, 졸업한 올해 학적은 그대로 1',
  (select coalesce(tenant_id::text, 'null') from public.profiles where id = pg_temp.fx('g1'))
    || ':' || (select count(*) from public.student_enrollments where student_id = pg_temp.fx('g1') and status = 'graduated'),
  'null:1');

select pg_temp.mk_signup_student('r1', null);
update public.profiles set member_type = 'student', tenant_id = (select id from public.tenants where code = 'WEAAAAAA') where id = pg_temp.fx('r1');
insert into public.student_enrollments (tenant_id, student_id, school_year, grade, updated_by)
select t.id, pg_temp.fx('r1'), t.school_year, '고2', pg_temp.fx('r1') from public.tenants t where t.code = 'WEAAAAAA';
select pg_temp.unset_sql('r1') as q \gset
select pg_temp.as_user(pg_temp.fx('adm'));
set local role authenticated;
:q ;
reset role;
select pg_temp.expect_text('소속 해제 = 학적 삭제가 이력(admin_direct, applied, 고2에서 비움, 실행한 관리자)으로 남음',
  (select count(*)::text || ':' || coalesce(max(c.from_grade), 'null') || ':' || coalesce(max(c.to_grade), 'null')
      || ':' || bool_and(c.decided_by = pg_temp.fx('adm'))::text
     from public.enrollment_changes c
    where c.student_id = pg_temp.fx('r1') and c.kind = 'admin_direct' and c.status = 'applied'),
  '1:고2:null:true');
select pg_temp.expect_text('소속 해제 = 학적 0', (select count(*) from public.student_enrollments where student_id = pg_temp.fx('r1'))::text, '0');

-- ---------------------------------------------------------------------
-- 9. 가입 RPC와 소속 코드 입력도 올해 학적이 다른 기관에 있으면 WC100, 같은 기관이면 그대로 둔다
-- ---------------------------------------------------------------------
select pg_temp.mk_signup_student('x1', null);
insert into public.student_enrollments (tenant_id, student_id, school_year, grade, updated_by)
select t.id, pg_temp.fx('x1'), t.school_year, '고1', pg_temp.fx('x1') from public.tenants t where t.code = 'WEBBBBBB';
select pg_temp.signup_sql('x1', '01091110011', 'WEAAAAAA') as q \gset
select pg_temp.as_user(pg_temp.fx('x1'));
set local role authenticated;
select pg_temp.try_sql(:'q') as st \gset
reset role;
select pg_temp.expect_text('올해 학적이 다른 기관에 있는 학생이 다른 기관 코드로 가입하면 WC100', :'st', 'WC100');
select pg_temp.expect_text('WC100 뒤 가입 프로필도 학적도 그대로(학적은 WEBBBBBB 한 건)',
  (select count(*) from public.profiles where id = pg_temp.fx('x1') and tenant_id is not null)::text
    || ':' || (select string_agg(t.code, ',') from public.student_enrollments e join public.tenants t on t.id = e.tenant_id where e.student_id = pg_temp.fx('x1')),
  '0:WEBBBBBB');

select pg_temp.mk_signup_student('x2', null);
update public.profiles set member_type = 'student' where id = pg_temp.fx('x2');
insert into public.student_enrollments (tenant_id, student_id, school_year, grade, updated_by)
select t.id, pg_temp.fx('x2'), t.school_year, '고1', pg_temp.fx('x2') from public.tenants t where t.code = 'WEBBBBBB';
select pg_temp.as_user(pg_temp.fx('x2'));
set local role authenticated;
select pg_temp.try_sql($q$select * from public.fn_set_my_tenant('WEAAAAAA')$q$) as st \gset
reset role;
select pg_temp.expect_text('올해 학적이 다른 기관에 있는 학생의 소속 코드 입력은 WC100', :'st', 'WC100');
select pg_temp.expect_text('WC100 뒤 소속 없음, 학적은 WEBBBBBB 한 건',
  (select count(*) from public.profiles where id = pg_temp.fx('x2') and tenant_id is not null)::text
    || ':' || (select string_agg(t.code, ',') from public.student_enrollments e join public.tenants t on t.id = e.tenant_id where e.student_id = pg_temp.fx('x2')),
  '0:WEBBBBBB');

select pg_temp.mk_signup_student('x3', null);
update public.profiles set member_type = 'student' where id = pg_temp.fx('x3');
insert into public.student_enrollments (tenant_id, student_id, school_year, grade, updated_by)
select t.id, pg_temp.fx('x3'), t.school_year, '고1', pg_temp.fx('x3') from public.tenants t where t.code = 'WEAAAAAA';
select pg_temp.as_user(pg_temp.fx('x3'));
set local role authenticated;
select pg_temp.try_sql($q$select * from public.fn_set_my_tenant('WEAAAAAA')$q$) as st \gset
reset role;
select pg_temp.expect_text('같은 기관 올해 학적이 이미 있으면 소속 코드 입력이 성공하고 학적은 그대로 1건', :'st' || ':' || pg_temp.enr('x3'), 'none:1:고1:true');

-- ---------------------------------------------------------------------
-- 10. QA 계정 차단은 학적을 만들기 전에 막는다
-- ---------------------------------------------------------------------
insert into public.app_settings (key, value) values ('qa_account_guard_enabled', 'true'::jsonb)
on conflict (key) do update set value = 'true'::jsonb;
select pg_temp.mk_signup_student('q1', '고2');
update public.profiles set member_type = 'student' where id = pg_temp.fx('q1');
insert into public.qa_accounts (profile_id) values (pg_temp.fx('q1'));
select pg_temp.as_user(pg_temp.fx('q1'));
set local role authenticated;
select pg_temp.try_sql($q$select * from public.fn_set_my_tenant('WEAAAAAA')$q$) as st \gset
reset role;
select pg_temp.expect_text('QA 계정이 QA 구성원 없는 기관 코드를 넣으면 WC103, 소속과 학적 없음',
  :'st' || ':' || (select count(*) from public.profiles where id = pg_temp.fx('q1') and tenant_id is not null) || ':' || pg_temp.enr('q1'),
  'WC103:0:0:null:none');
update public.app_settings set value = 'false'::jsonb where key = 'qa_account_guard_enabled';

-- ---------------------------------------------------------------------
-- 11. 스쿨멘토 프로젝트(site_key = schoolmentor)는 위닝식 학생 가입 RPC 를 막고 학부모는 그대로 둔다
-- ---------------------------------------------------------------------
update public.app_settings set value = '"schoolmentor"'::jsonb where key = 'site_key';

select pg_temp.mk_signup_student('m1', '고2');
select pg_temp.signup_sql('m1', '01091110021', 'WEAAAAAA') as q \gset
select pg_temp.as_user(pg_temp.fx('m1'));
set local role authenticated;
select pg_temp.try_sql(:'q') as st \gset
reset role;
select pg_temp.expect_text('스쿨멘토에서 위닝식 학생 가입 RPC 는 WC107', :'st', 'WC107');
select pg_temp.expect_text('WC107 뒤 회원 유형도 소속도 학적도 없음',
  (select coalesce(member_type, 'null') || ':' || (tenant_id is not null)::text from public.profiles where id = pg_temp.fx('m1'))
    || ':' || pg_temp.enr('m1'),
  'null:false:0:null:none');

select pg_temp.mk_signup_student('m2', null);
select pg_temp.signup_sql('m2', '01091110022', 'WEAAAAAA', 'parent') as q \gset
select pg_temp.as_user(pg_temp.fx('m2'));
set local role authenticated;
select pg_temp.try_sql(:'q') as st \gset
reset role;
select pg_temp.expect_text('스쿨멘토에서도 학부모 가입 RPC 는 그대로 성공하고 학적 없음',
  :'st' || ':' || (select member_type from public.profiles where id = pg_temp.fx('m2')) || ':' || pg_temp.enr('m2'),
  'none:parent:0:null:none');

-- ---------------------------------------------------------------------
-- 12. 표식이 없으면(마이그레이션만 먼저 배포된 상태) 학생 가입은 거절도 학적도 없이 소속만 정한다
-- ---------------------------------------------------------------------
delete from public.app_settings where key = 'site_key';

select pg_temp.mk_signup_student('n1', '고2');
select pg_temp.signup_sql('n1', '01091110023', 'WEAAAAAA') as q \gset
select pg_temp.as_user(pg_temp.fx('n1'));
set local role authenticated;
select pg_temp.try_sql(:'q') as st \gset
reset role;
select pg_temp.expect_text('표식이 없으면 학생 가입은 성공하고 소속만 정해지며 학적 없음',
  :'st' || ':' || (select (tenant_id is not null)::text from public.profiles where id = pg_temp.fx('n1')) || ':' || pg_temp.enr('n1'),
  'none:true:0:null:none');

rollback;
