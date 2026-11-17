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

create temp table fx (k text primary key, v uuid);
create function pg_temp.fx(p_k text) returns uuid language sql as $$ select v from fx where k = p_k $$;

insert into fx values ('stu', pg_temp.mk_user('pes-stu@t.local', 'student'));

-- ---------------------------------------------------------------------
-- 1. auth 이메일이 바뀌면 profiles.email 이 소문자로 따라간다
-- ---------------------------------------------------------------------
update auth.users set email = ' PES-New@T.local ' where id = pg_temp.fx('stu');
select pg_temp.expect_text('auth 이메일 변경 시 profiles.email 소문자 동기화',
  (select email from public.profiles where id = pg_temp.fx('stu')), 'pes-new@t.local');

rollback;
