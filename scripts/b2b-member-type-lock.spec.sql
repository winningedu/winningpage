-- =====================================================================
-- 회원 유형 잠금 SQL 스펙: profiles.member_type 은 RPC 밖에서 못 바꾼다
--
-- 실행: 마이그레이션이 전부 적용된 스택(로컬 스크래치 DB 복사본)에서
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/b2b-member-type-lock.spec.sql
--
-- 전체가 한 트랜잭션이고 마지막에 ROLLBACK 한다. 어떤 데이터도 남기지
-- 않는다. 단언 실패는 예외로 터져 psql 이 비정상 종료(ON_ERROR_STOP)한다.
-- =====================================================================
begin;

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
grant execute on function pg_temp.expect_error(text, text, text) to authenticated;
grant execute on function pg_temp.expect_text(text, text, text) to authenticated;
grant execute on function pg_temp.fx(text) to authenticated, service_role;

create function pg_temp.signup_sql(p_email text, p_member_type text, p_school text) returns text
language sql as $$
  select format($f$select public.complete_signup_profile(
    p_name => %1$L, p_username => %1$L, p_phone => '', p_email => %1$L,
    p_region => '', p_school_type => '', p_school_name => %3$L,
    p_member_type => %2$L, p_terms_service_agreed => true, p_privacy_required_agreed => true,
    p_identity_required_agreed => false, p_privacy_optional_agreed => false,
    p_marketing_agreed => false, p_ads_agreed => false, p_guardian_phone => '',
    p_guardian_consent => false, p_identity_request_id => '', p_birth_date => null,
    p_gender => null, p_org_code => '')$f$, p_email, p_member_type, p_school)
$$;
grant execute on function pg_temp.signup_sql(text, text, text) to authenticated;

insert into fx values ('stu', pg_temp.mk_user('mtl-stu@t.local', 'student'));
insert into fx values ('blank', pg_temp.mk_user('mtl-blank@t.local', null));
insert into fx values ('adm', pg_temp.mk_user('mtl-adm@t.local', null));
update public.profiles set role = 'admin' where id = pg_temp.fx('adm');
insert into fx values ('diff', pg_temp.mk_user('mtl-diff@t.local', 'student'));
insert into fx values ('same', pg_temp.mk_user('mtl-same@t.local', 'mentor'));
insert into fx values ('tch', pg_temp.mk_user('mtl-tch@t.local', null));

-- 가입 RPC 호출이 열려 있어야 3번(complete_signup_profile) 을 돌린다.
insert into public.app_settings (key, value) values ('signup_enabled', 'true'::jsonb)
on conflict (key) do update set value = 'true'::jsonb;
update public.app_settings set value = 'false'::jsonb where key = 'require_tenant_on_signup';

-- ---------------------------------------------------------------------
-- 1. 로그인 회원의 직접 UPDATE 는 막힌다
-- ---------------------------------------------------------------------
select pg_temp.as_user(pg_temp.fx('stu'));
set local role authenticated;
select pg_temp.expect_error('본인 member_type 직접 변경 거부',
  format($f$update public.profiles set member_type = 'teacher' where id = %L$f$, pg_temp.fx('stu')),
  'WC102');
select pg_temp.expect_error('본인 member_type 을 null 로 비우는 것도 거부',
  format($f$update public.profiles set member_type = null where id = %L$f$, pg_temp.fx('stu')),
  'WC102');
reset role;
select pg_temp.expect_text('거부 후 값 그대로',
  (select member_type from public.profiles where id = pg_temp.fx('stu')), 'student');

-- ---------------------------------------------------------------------
-- 2. 다른 열 수정은 그대로 된다 (같은 값을 다시 쓰는 것도 변경이 아니다)
-- ---------------------------------------------------------------------
select pg_temp.as_user(pg_temp.fx('stu'));
set local role authenticated;
update public.profiles set school_name = 'mtl-school', member_type = 'student'
 where id = pg_temp.fx('stu');
reset role;
select pg_temp.expect_text('본인 다른 열 수정 통과',
  (select school_name from public.profiles where id = pg_temp.fx('stu')), 'mtl-school');

-- ---------------------------------------------------------------------
-- 3. 합법 경로는 계속 된다
-- ---------------------------------------------------------------------
-- 3a. complete_signup_profile: 이미 행이 있는 회원(ON CONFLICT DO UPDATE 경로)
select pg_temp.as_user(pg_temp.fx('blank'));
set local role authenticated;
select public.complete_signup_profile(
  p_name => 'mtl-blank@t.local', p_username => 'mtl-blank@t.local', p_phone => '',
  p_email => 'mtl-blank@t.local', p_region => '', p_school_type => '', p_school_name => '',
  p_member_type => 'mentor', p_terms_service_agreed => true, p_privacy_required_agreed => true,
  p_identity_required_agreed => false, p_privacy_optional_agreed => false,
  p_marketing_agreed => false, p_ads_agreed => false, p_guardian_phone => '',
  p_guardian_consent => false, p_identity_request_id => '', p_birth_date => null,
  p_gender => null, p_org_code => '');
reset role;
select pg_temp.expect_text('complete_signup_profile 로 member_type 설정',
  (select member_type from public.profiles where id = pg_temp.fx('blank')), 'mentor');

-- 3d. 이미 member_type 이 있는 회원이 다른 유형으로 가입 완료를 다시 부르면 거부
select pg_temp.as_user(pg_temp.fx('diff'));
set local role authenticated;
select pg_temp.expect_error('기존 member_type 과 다른 유형으로 complete_signup_profile 거부',
  pg_temp.signup_sql('mtl-diff@t.local', 'mentor', 'mtl-x'), 'WC102');
reset role;
select pg_temp.expect_text('거부 후 member_type 그대로',
  (select member_type from public.profiles where id = pg_temp.fx('diff')), 'student');

-- 3e. 같은 유형으로 다시 부르는 것(가입 완료 재실행)은 통과하고 다른 열도 갱신된다
select pg_temp.as_user(pg_temp.fx('same'));
set local role authenticated;
select pg_temp.signup_sql('mtl-same@t.local', 'mentor', 'mtl-again') as q \gset
:q ;
reset role;
select pg_temp.expect_text('같은 유형 재호출 시 다른 열 갱신',
  (select school_name || ':' || member_type from public.profiles where id = pg_temp.fx('same')),
  'mtl-again:mentor');

-- 3b. 어드민 세션(is_admin)은 직접 고칠 수 있다
select pg_temp.as_user(pg_temp.fx('adm'));
set local role authenticated;
update public.profiles set member_type = 'parent' where id = pg_temp.fx('stu');
reset role;
select pg_temp.expect_text('어드민 직접 변경 통과',
  (select member_type from public.profiles where id = pg_temp.fx('stu')), 'parent');

-- 3c. service_role 세션(fn_teacher_attach_account, fn_student_signup 이 타는 경로)
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.sub', '', true);
set local role service_role;
update public.profiles set member_type = 'teacher' where id = pg_temp.fx('tch');
reset role;
select pg_temp.expect_text('service_role 직접 변경 통과',
  (select member_type from public.profiles where id = pg_temp.fx('tch')), 'teacher');

rollback;
