-- =====================================================================
-- 최근 접속일 profiles.last_seen_at 열과 1회 backfill SQL 스펙 (계획 7a, 결정 105)
--
-- 실행: 마이그레이션이 전부 적용된 스택에서
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/b2b-last-seen.spec.sql
--
-- 전체가 한 트랜잭션이고 마지막에 ROLLBACK 한다. 어떤 데이터도 남기지
-- 않는다. 단언 실패는 예외로 터져 psql 이 비정상 종료(ON_ERROR_STOP)한다.
-- =====================================================================
begin;

create function pg_temp.expect_bool(t text, got boolean, want boolean) returns void
language plpgsql as $$
begin
  if got is distinct from want then
    raise exception '[FAIL] %: got %, want %', t, got, want;
  end if;
  raise notice '[PASS] % = %', t, want;
end $$;

create function pg_temp.mk_user(p_email text, p_last_sign_in timestamptz) returns uuid
language plpgsql as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    created_at, updated_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data
  ) values (
    v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    p_email, 'x', now(), now(), p_last_sign_in,
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
  );
  insert into public.profiles (id, name, role, email, member_type)
  values (v_id, p_email, 'user', p_email, 'student')
  on conflict (id) do nothing;
  return v_id;
end $$;

create temp table fx (k text primary key, v uuid);
insert into fx values
  ('signed', pg_temp.mk_user('ls-signed@t.local', timestamptz '2026-10-01 00:00:00+00')),
  ('never', pg_temp.mk_user('ls-never@t.local', null)),
  ('stamped', pg_temp.mk_user('ls-stamped@t.local', timestamptz '2026-10-01 00:00:00+00'));

-- 열이 있고 nullable 이다
select pg_temp.expect_bool('last_seen_at 은 nullable timestamptz',
  exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'last_seen_at'
      and data_type = 'timestamp with time zone' and is_nullable = 'YES'),
  true);

-- 새 프로필은 비어 있다
select pg_temp.expect_bool('새 프로필의 last_seen_at 은 null',
  (select last_seen_at is null from public.profiles p join fx on fx.v = p.id where fx.k = 'signed'),
  true);

-- 이미 앱이 적은 값은 backfill 이 덮지 않는다
update public.profiles set last_seen_at = timestamptz '2026-11-05 00:00:00+00'
  where id = (select v from fx where k = 'stamped');

-- backfill: supabase/data/20261109070000_profiles_last_seen_at_backfill.sql 과 같은 문장
update public.profiles p set last_seen_at = u.last_sign_in_at
  from auth.users u
  where u.id = p.id and p.last_seen_at is null and u.last_sign_in_at is not null;

select pg_temp.expect_bool('backfill 은 Auth 마지막 로그인 시각을 채운다',
  (select p.last_seen_at = timestamptz '2026-10-01 00:00:00+00'
     from public.profiles p join fx on fx.v = p.id where fx.k = 'signed'),
  true);
select pg_temp.expect_bool('로그인 기록이 없으면 null 그대로',
  (select p.last_seen_at is null from public.profiles p join fx on fx.v = p.id where fx.k = 'never'),
  true);
select pg_temp.expect_bool('이미 값이 있으면 덮지 않는다',
  (select p.last_seen_at = timestamptz '2026-11-05 00:00:00+00'
     from public.profiles p join fx on fx.v = p.id where fx.k = 'stamped'),
  true);

-- 재실행해도 아무것도 바뀌지 않는다
update public.profiles set last_seen_at = timestamptz '2026-11-08 00:00:00+00'
  where id = (select v from fx where k = 'signed');
update public.profiles p set last_seen_at = u.last_sign_in_at
  from auth.users u
  where u.id = p.id and p.last_seen_at is null and u.last_sign_in_at is not null;
select pg_temp.expect_bool('backfill 재실행은 값을 바꾸지 않는다',
  (select p.last_seen_at = timestamptz '2026-11-08 00:00:00+00'
     from public.profiles p join fx on fx.v = p.id where fx.k = 'signed'),
  true);

-- 클라이언트(authenticated)는 자기 last_seen_at 을 고칠 수 없다
update public.profiles set last_seen_at = timestamptz '2026-11-01 00:00:00+00'
  where id = (select v from fx where k = 'stamped');
grant select on fx to authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', (select v from fx where k = 'stamped'), 'role', 'authenticated')::text, true);
set local role authenticated;
update public.profiles set last_seen_at = timestamptz '2099-01-01 00:00:00+00'
  where id = (select v from fx where k = 'stamped');
reset role;
select pg_temp.expect_bool('authenticated 의 last_seen_at 직접 수정은 무시된다',
  (select p.last_seen_at = timestamptz '2026-11-01 00:00:00+00'
     from public.profiles p join fx on fx.v = p.id where fx.k = 'stamped'),
  true);

-- service_role 의 수정은 반영된다
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
update public.profiles set last_seen_at = timestamptz '2026-11-09 00:00:00+00'
  where id = (select v from fx where k = 'stamped');
select pg_temp.expect_bool('service_role 은 last_seen_at 을 적을 수 있다',
  (select p.last_seen_at = timestamptz '2026-11-09 00:00:00+00'
     from public.profiles p join fx on fx.v = p.id where fx.k = 'stamped'),
  true);
select set_config('request.jwt.claims', '', true);

do $$ begin raise notice '=== b2b-last-seen.spec: 전체 통과 ==='; end $$;

rollback;
