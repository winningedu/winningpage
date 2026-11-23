-- =====================================================================
-- UTC 이관 U-schoolyear: 학년도를 기관 시간대로 판정하는 fn_school_year SQL 스펙
--
-- 실행: scripts/run-unit-spec 류 러너가 마이그레이션과 함께 한 트랜잭션으로 돌린다.
-- 전체가 한 트랜잭션이고 마지막에 ROLLBACK 한다. 단언 실패는 예외로 터진다.
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

-- 서울 기관: 2026-02-28T16:00Z 는 현지 3월 1일 01:00 이라 2026학년도다.
select pg_temp.expect_int('서울은 2/28 16:00Z 에 2026학년도',
  public.fn_school_year('2026-02-28 16:00:00+00', 'Asia/Seoul'), 2026);
-- 로스앤젤레스 기관: 같은 순간이 현지 2월 28일 08:00 이라 2025학년도다.
select pg_temp.expect_int('로스앤젤레스는 같은 순간에 2025학년도',
  public.fn_school_year('2026-02-28 16:00:00+00', 'America/Los_Angeles'), 2025);
select pg_temp.expect_int('로스앤젤레스는 현지 3/1 00:00 에 2026학년도',
  public.fn_school_year('2026-03-01 08:00:00+00', 'America/Los_Angeles'), 2026);

-- 서울 기준은 fn_school_year_kst 와 2월과 3월 경계 전후에서 같다.
do $$
declare
  v_ts timestamptz;
begin
  for v_ts in
    select g from generate_series(
      '2025-02-27 00:00:00+00'::timestamptz, '2027-03-02 00:00:00+00'::timestamptz, interval '30 minutes') g
  loop
    if public.fn_school_year(v_ts, 'Asia/Seoul') is distinct from public.fn_school_year_kst(v_ts) then
      raise exception '[FAIL] 서울 학년도가 kst 함수와 다르다: %', v_ts;
    end if;
  end loop;
  raise notice '[PASS] 서울 fn_school_year = fn_school_year_kst';
end $$;

-- 새 기관의 학년도 기본값은 기본 시간대(Asia/Seoul) 기준이다.
insert into public.tenants (code, name, region, org_type, tier)
values ('U5AAAAAA', 'u-school-year', '서울', '학원', 'B');
select pg_temp.expect_int('school_year 기본값 = 서울 기준 현재 학년도',
  (select school_year from public.tenants where code = 'U5AAAAAA'),
  public.fn_school_year(now(), 'Asia/Seoul'));

-- fn_create_tenant 는 새 기관의 시간대로 school_year 를 채운다.
do $$
declare
  v_uid uuid := gen_random_uuid();
  v_role uuid;
  v_row public.tenants;
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data
  ) values (
    v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'usy-admin@t.local', 'x', now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);
  insert into public.profiles (id, name, role, email, member_type)
  values (v_uid, 'usy-admin', 'user', 'usy-admin@t.local', 'teacher')
  on conflict (id) do nothing;
  select id into v_role from public.admin_roles where is_super limit 1;
  insert into public.admin_members (profile_id, status, role_id) values (v_uid, 'active', v_role);
  perform set_config('request.jwt.claim.sub', v_uid::text, true);
  v_row := public.fn_create_tenant('u-school-year-2', '서울', '학원', 'B');
  if v_row.school_year is distinct from public.fn_school_year(now(), v_row.time_zone) then
    raise exception '[FAIL] fn_create_tenant school_year %, want %',
      v_row.school_year, public.fn_school_year(now(), v_row.time_zone);
  end if;
  raise notice '[PASS] fn_create_tenant school_year = 기관 시간대 기준';
end $$;

do $$ begin raise notice '=== utc-school-year.spec: 전체 통과 ==='; end $$;

rollback;
