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

rollback;
