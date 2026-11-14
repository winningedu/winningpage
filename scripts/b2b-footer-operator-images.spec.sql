-- =====================================================================
-- 푸터 운영기관 이미지(footer_operator_images) RLS SQL 스펙
-- 공개(anon, 일반 로그인)는 노출 행만 읽고 쓰지 못하며, 관리자는 전체를 읽고 쓴다.
--
-- 실행: 마이그레이션이 전부 적용된 스택에서
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/b2b-footer-operator-images.spec.sql
--
-- 전체가 한 트랜잭션이고 마지막에 ROLLBACK 한다. 어떤 데이터도 남기지
-- 않는다. 단언 실패는 예외로 터져 psql 이 비정상 종료(ON_ERROR_STOP)한다.
-- =====================================================================
begin;

create function pg_temp.expect_int(t text, got bigint, want bigint) returns void
language plpgsql as $$
begin
  if got is distinct from want then
    raise exception '[FAIL] %: got %, want %', t, got, want;
  end if;
  raise notice '[PASS] % = %', t, want;
end $$;

-- p_role 로 바꿔 p_uid 의 세션처럼 SQL 을 실행하고, 영향을 받은 행 수(select 는 행 수)를 돌려준다.
create function pg_temp.rows_as(p_role text, p_uid uuid, p_sql text) returns bigint
language plpgsql as $$
declare
  v_count bigint;
begin
  perform set_config('request.jwt.claims',
    case when p_uid is null then '' else json_build_object('sub', p_uid, 'role', p_role)::text end, true);
  execute format('set local role %I', p_role);
  begin
    execute p_sql;
    get diagnostics v_count = row_count;
  exception when others then
    reset role;
    perform set_config('request.jwt.claims', '', true);
    raise;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return v_count;
end $$;

create function pg_temp.expect_error_as(t text, p_role text, p_uid uuid, p_sql text, want text) returns void
language plpgsql as $$
declare
  v_state text;
begin
  begin
    perform pg_temp.rows_as(p_role, p_uid, p_sql);
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

create function pg_temp.mk_user(p_email text, p_role text) returns uuid
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
  values (v_id, p_email, p_role, p_email, case when p_role = 'admin' then null else 'student' end)
  on conflict (id) do update set role = excluded.role;
  return v_id;
end $$;

create temp table fx (k text primary key, v uuid);
grant select on fx to anon, authenticated;
insert into fx values
  ('admin', pg_temp.mk_user('footer-admin@t.local', 'admin')),
  ('student', pg_temp.mk_user('footer-student@t.local', 'user'));

-- 기존 행과 무관하게 세도록 이 스펙이 넣은 행만 title 접두어로 센다
insert into public.footer_operator_images (title, image_url, sort_order, is_active) values
  ('spec-b', 'https://t.local/b.png', 2, true),
  ('spec-a', 'https://t.local/a.png', 1, true),
  ('spec-hidden', 'https://t.local/h.png', 0, false);

select pg_temp.expect_int('anon 은 노출 행 둘만 읽는다', pg_temp.rows_as('anon', null,
  $q$select 1 from public.footer_operator_images where title like 'spec-%'$q$), 2);
select pg_temp.expect_int('anon 은 숨김 행을 읽지 못한다', pg_temp.rows_as('anon', null,
  $q$select 1 from public.footer_operator_images where title = 'spec-hidden'$q$), 0);
select pg_temp.expect_int('일반 로그인 사용자도 노출 행 둘만 읽는다',
  pg_temp.rows_as('authenticated', (select v from fx where k = 'student'),
    $q$select 1 from public.footer_operator_images where title like 'spec-%'$q$), 2);

select pg_temp.expect_error_as('anon 의 INSERT 는 RLS 로 막힌다', 'anon', null,
  $q$insert into public.footer_operator_images (title, image_url) values ('spec-x', 'https://t.local/x.png')$q$, '42501');
select pg_temp.expect_error_as('일반 로그인 사용자의 INSERT 는 RLS 로 막힌다', 'authenticated',
  (select v from fx where k = 'student'),
  $q$insert into public.footer_operator_images (title, image_url) values ('spec-x', 'https://t.local/x.png')$q$, '42501');
select pg_temp.expect_int('일반 로그인 사용자의 UPDATE 는 0행이다',
  pg_temp.rows_as('authenticated', (select v from fx where k = 'student'),
    $q$update public.footer_operator_images set title = 'spec-hacked' where title = 'spec-a'$q$), 0);
select pg_temp.expect_int('일반 로그인 사용자의 DELETE 는 0행이다',
  pg_temp.rows_as('authenticated', (select v from fx where k = 'student'),
    $q$delete from public.footer_operator_images where title like 'spec-%'$q$), 0);
select pg_temp.expect_int('anon 의 UPDATE 는 0행이다', pg_temp.rows_as('anon', null,
  $q$update public.footer_operator_images set title = 'spec-hacked' where title = 'spec-a'$q$), 0);
select pg_temp.expect_int('anon 의 DELETE 는 0행이다', pg_temp.rows_as('anon', null,
  $q$delete from public.footer_operator_images where title like 'spec-%'$q$), 0);
select pg_temp.expect_int('막힌 쓰기 뒤에도 원래 행 셋이 그대로다', (
  select count(*) from public.footer_operator_images where title like 'spec-%'), 3);

select pg_temp.expect_int('관리자는 숨김 행까지 셋을 읽는다',
  pg_temp.rows_as('authenticated', (select v from fx where k = 'admin'),
    $q$select 1 from public.footer_operator_images where title like 'spec-%'$q$), 3);
select pg_temp.expect_int('관리자의 INSERT 가 된다',
  pg_temp.rows_as('authenticated', (select v from fx where k = 'admin'),
    $q$insert into public.footer_operator_images (title, image_url) values ('spec-new', 'https://t.local/n.png')$q$), 1);
select pg_temp.expect_int('관리자 수정 저장처럼 id 를 그대로 되돌려 보내는 UPDATE 가 된다',
  pg_temp.rows_as('authenticated', (select v from fx where k = 'admin'),
    $q$update public.footer_operator_images set id = id, title = 'spec-new2' where title = 'spec-new'$q$), 1);
select pg_temp.expect_int('관리자의 DELETE 가 된다',
  pg_temp.rows_as('authenticated', (select v from fx where k = 'admin'),
    $q$delete from public.footer_operator_images where title = 'spec-new2'$q$), 1);

do $$ begin raise notice '=== b2b-footer-operator-images.spec: 전체 통과 ==='; end $$;

rollback;
