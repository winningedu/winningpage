-- =====================================================================
-- profiles.email 동기화 SQL 스펙: auth.users.email 이 바뀌면 profiles.email 이 따라간다
--
-- 실행: 마이그레이션이 전부 적용된 스택(로컬 스크래치 DB 복사본)에서
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/profiles-email-sync.spec.sql
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

create function pg_temp.as_user(p_uid uuid, p_email text) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated', 'email', p_email)::text, true);
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
end $$;

-- JWT 없는 세션(postgres, GoTrue 와 같은 직접 접속)으로 되돌린다.
create function pg_temp.as_none() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

create temp table fx (k text primary key, v uuid);
create function pg_temp.fx(p_k text) returns uuid language sql as $$ select v from fx where k = p_k $$;

insert into fx values ('stu', pg_temp.mk_user('pes-stu@t.local', 'student'));

-- ---------------------------------------------------------------------
-- 1. auth 이메일이 바뀌면 profiles.email 이 소문자로 따라간다
-- ---------------------------------------------------------------------
update auth.users set email = ' PES-New@T.local ' where id = pg_temp.fx('stu');
select pg_temp.expect_text('auth 이메일 변경 시 profiles.email 소문자 동기화',
  (select email from public.profiles where id = pg_temp.fx('stu')), 'pes-new@t.local');

-- ---------------------------------------------------------------------
-- 2. 선생님과 합성 주소는 건너뛴다
-- ---------------------------------------------------------------------
insert into fx values ('tch', pg_temp.mk_user('pes-tch@teacher.schoolmentor.kr', 'teacher'));
update public.profiles set email = null where id = pg_temp.fx('tch');
update auth.users set email = 'pes-tch-real@t.local' where id = pg_temp.fx('tch');
select pg_temp.expect_text('선생님 profiles.email 은 NULL 그대로',
  (select coalesce(email, '(null)') from public.profiles where id = pg_temp.fx('tch')), '(null)');

update auth.users set email = 'pes-syn@teacher.schoolmentor.kr' where id = pg_temp.fx('stu');
select pg_temp.expect_text('합성 주소로 바뀌면 복사하지 않는다',
  (select email from public.profiles where id = pg_temp.fx('stu')), 'pes-new@t.local');

-- ---------------------------------------------------------------------
-- 3. 다른 행과 겹치면 이 행의 복사본만 NULL 로 비우고 auth 변경은 그대로 된다
-- ---------------------------------------------------------------------
insert into fx values ('a', pg_temp.mk_user('pes-a@t.local', 'student'));
insert into fx values ('b', pg_temp.mk_user('pes-b@t.local', 'student'));
update public.profiles set email = 'pes-dup@t.local' where id = pg_temp.fx('a');
update auth.users set email = 'PES-DUP@t.local' where id = pg_temp.fx('b');
select pg_temp.expect_text('중복이면 auth 변경은 반영된다',
  (select email from auth.users where id = pg_temp.fx('b')), 'PES-DUP@t.local');
select pg_temp.expect_text('중복이면 이 행의 복사본은 NULL',
  (select coalesce(email, '(null)') from public.profiles where id = pg_temp.fx('b')), '(null)');
select pg_temp.expect_text('중복 상대 행은 그대로',
  (select email from public.profiles where id = pg_temp.fx('a')), 'pes-dup@t.local');

-- ---------------------------------------------------------------------
-- 4. is_winning_admin 은 id 로만 판정한다
-- ---------------------------------------------------------------------
insert into fx values ('adm', pg_temp.mk_user('pes-adm@t.local', null));
update public.profiles set role = 'admin' where id = pg_temp.fx('adm');

select pg_temp.as_user(pg_temp.fx('adm'), 'pes-adm@t.local');
select pg_temp.expect_text('어드민은 id 로 is_winning_admin 통과',
  public.is_winning_admin()::text, 'true');

-- 비어드민의 JWT 이메일이 어드민 profiles.email 과 같아도 통과하지 못한다.
select pg_temp.as_user(pg_temp.fx('a'), 'PES-ADM@t.local');
select pg_temp.expect_text('어드민 이메일을 가진 비어드민은 is_winning_admin 거부',
  public.is_winning_admin()::text, 'false');
select pg_temp.as_none();

rollback;
