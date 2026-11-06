-- =====================================================================
-- B2B 기반 2: tenants 계약, 기관 정보 컬럼과 기타 소속 유일 인덱스 SQL 스펙 (T2)
--
-- 실행: 마이그레이션이 전부 적용된 스택에서
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/b2b-tenants-contract.spec.sql
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

create function pg_temp.expect_bool(t text, got boolean, want boolean) returns void
language plpgsql as $$
begin
  if got is distinct from want then
    raise exception '[FAIL] %: got %, want %', t, got, want;
  end if;
  raise notice '[PASS] % = %', t, want;
end $$;

-- 테넌트 픽스처. code 는 8자 형식(A-HJ-KM-NP-Z2-9)만 맞으면 된다.
create function pg_temp.mk_tenant(p_code text, p_extra text default '') returns uuid
language plpgsql as $$
declare
  v_id uuid;
begin
  execute format(
    $f$insert into public.tenants (code, name, region, org_type, tier %s)
       values (%L, %L, '서울', '학교', 'B' %s) returning id$f$,
    case when p_extra = '' then '' else ', ' || split_part(p_extra, '=', 1) end,
    p_code, 't2-' || p_code,
    case when p_extra = '' then '' else ', ' || split_part(p_extra, '=', 2) end)
  into v_id;
  return v_id;
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

-- 학년도: KST 기준 (시각 - 2개월) 의 연도. 3월 1일 00:00 KST 에 새 학년도가 시작한다.
select pg_temp.expect_int('2026-03-01 00:00 KST 는 2026학년도',
  public.fn_school_year_kst('2026-03-01 00:00:00+09'), 2026);
select pg_temp.expect_int('2026-02-28 23:59 KST 는 2025학년도',
  public.fn_school_year_kst('2026-02-28 23:59:59+09'), 2025);
select pg_temp.expect_int('2026-01-01 00:00 KST 는 2025학년도',
  public.fn_school_year_kst('2026-01-01 00:00:00+09'), 2025);
select pg_temp.expect_int('2026-12-31 23:59 KST 는 2026학년도',
  public.fn_school_year_kst('2026-12-31 23:59:59+09'), 2026);
-- UTC 로는 2월 28일 15:00 이지만 KST 로는 3월 1일 00:00
select pg_temp.expect_int('UTC 2026-02-28 15:00 은 KST 로 2026학년도',
  public.fn_school_year_kst('2026-02-28 15:00:00+00'), 2026);

-- 새 tenants 행의 기본값
select pg_temp.mk_tenant('T2AAAAAA');
select pg_temp.expect_int('school_year 기본값 = fn_school_year_kst(now())',
  (select school_year from public.tenants where code = 'T2AAAAAA'),
  public.fn_school_year_kst(now()));
select pg_temp.expect_bool('is_catch_all 기본값 false',
  (select is_catch_all from public.tenants where code = 'T2AAAAAA'), false);

-- term_months: 3, 6, null 만 허용
select pg_temp.expect_ok('term_months 3', $$select pg_temp.mk_tenant('T2BBBBBB', 'term_months=3')$$);
select pg_temp.expect_ok('term_months 6', $$select pg_temp.mk_tenant('T2CCCCCC', 'term_months=6')$$);
select pg_temp.expect_ok('term_months null', $$select pg_temp.mk_tenant('T2DDDDDD', 'term_months=null')$$);
select pg_temp.expect_error('term_months 4 거부',
  $$select pg_temp.mk_tenant('T2EEEEEE', 'term_months=4')$$, '23514');

-- mou_status: pending, signed, ended 만 허용
select pg_temp.expect_ok('mou_status signed', $$select pg_temp.mk_tenant('T2FFFFFF', $x$mou_status='signed'$x$)$$);
select pg_temp.expect_error('mou_status 임의 값 거부',
  $$select pg_temp.mk_tenant('T2GGGGGG', $x$mou_status='draft'$x$)$$, '23514');

-- 계약, 기관 정보 컬럼이 있고 nullable
select pg_temp.expect_ok('계약과 기관 정보 컬럼 지정',
  $$update public.tenants set contract_start_date = '2026-03-01', contract_end_date = '2027-02-28',
      grace_ends_on = '2027-03-30', address = 'a', main_phone = 'b', contact_name = 'c',
      contact_phone = 'd', contact_mobile = 'e', contact_email = 'f', homepage = 'g',
      info_confirmed_at = now()
    where code = 'T2AAAAAA'$$);

-- 기타 소속(is_catch_all)은 하나만
select pg_temp.expect_ok('첫 is_catch_all 행', $$select pg_temp.mk_tenant('T2HHHHHH', 'is_catch_all=true')$$);
select pg_temp.expect_error('두 번째 is_catch_all 행 거부',
  $$select pg_temp.mk_tenant('T2JJJJJJ', 'is_catch_all=true')$$, '23505');
select pg_temp.expect_ok('is_catch_all false 는 여러 개 가능', $$select pg_temp.mk_tenant('T2KKKKKK', 'is_catch_all=false')$$);

-- 계약 기간 순서와 유예 종료일 검사(M1). 값이 비어 있으면 통과한다.
select pg_temp.expect_error('계약 시작이 종료보다 늦으면 거부',
  $$update public.tenants set contract_start_date = '2027-03-01', contract_end_date = '2027-02-28' where code = 'T2AAAAAA'$$, '23514');
select pg_temp.expect_ok('계약 시작과 종료가 같은 날이어도 통과',
  $$update public.tenants set contract_start_date = '2027-02-28', contract_end_date = '2027-02-28', grace_ends_on = '2027-02-28' where code = 'T2AAAAAA'$$);
select pg_temp.expect_error('유예 종료일이 계약 종료일보다 앞서면 거부',
  $$update public.tenants set contract_end_date = '2027-02-28', grace_ends_on = '2027-02-27' where code = 'T2AAAAAA'$$, '23514');
select pg_temp.expect_ok('종료일이 비어 있으면 시작과 유예는 검사하지 않는다',
  $$update public.tenants set contract_start_date = '2030-01-01', contract_end_date = null, grace_ends_on = '2020-01-01' where code = 'T2AAAAAA'$$);
select pg_temp.expect_ok('시작일이 비어 있어도 통과',
  $$update public.tenants set contract_start_date = null, contract_end_date = '2027-02-28', grace_ends_on = null where code = 'T2AAAAAA'$$);

-- 본사 관리자 화면은 RLS 를 거쳐 tenants 를 바로 고친다. tenants edit 권한이 있어야 하고 변경 이력의 행위자는 그 사람이다.
create function pg_temp.mk_user(p_email text) returns uuid
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
  values (v_id, p_email, 'admin', p_email)
  on conflict (id) do update set role = excluded.role;
  return v_id;
end $$;

create temp table fx (k text primary key, v uuid);
insert into fx values
  ('edit', pg_temp.mk_user('t2-edit@t.local')),
  ('view', pg_temp.mk_user('t2-view@t.local')),
  ('tenant', (select id from public.tenants where code = 'T2AAAAAA'));
create function pg_temp.fx(p_k text) returns uuid language sql as $$ select v from fx where k = p_k $$;

insert into public.admin_resources (key, group_title, label, sort_order, is_active)
  values ('tenants', '회원 관리', '소속 관리', 1, true)
  on conflict (key) do nothing;
insert into public.admin_members (profile_id, status)
  values (pg_temp.fx('edit'), 'active'), (pg_temp.fx('view'), 'active');
delete from public.admin_member_permissions where resource_key = 'tenants'
  and profile_id in (pg_temp.fx('edit'), pg_temp.fx('view'));
insert into public.admin_member_permissions (profile_id, resource_key, level)
  values (pg_temp.fx('edit'), 'tenants', 'edit'), (pg_temp.fx('view'), 'tenants', 'view');

create temp table res (n bigint);
grant all on res, fx to authenticated;

select set_config('request.jwt.claim.sub', pg_temp.fx('edit')::text, true);
set local role authenticated;
with u as (
  update public.tenants set contract_start_date = '2026-03-01', contract_end_date = '2027-02-28',
      grace_ends_on = '2027-03-30', mou_status = 'signed'
    where id = (select v from fx where k = 'tenant') returning 1)
insert into res select count(*) from u;
reset role;
select pg_temp.expect_int('tenants edit 권한이면 계약 컬럼을 바꾼다', (select n from res limit 1), 1);
select pg_temp.expect_bool('변경 이력의 행위자는 그 본사 관리자',
  (select profile_id = pg_temp.fx('edit') and actor_kind = 'hq'
     from public.admin_access_logs where resource_key = 'tenants' and action = 'settings_change'
      and target_id = pg_temp.fx('tenant') order by created_at desc, id desc limit 1), true);

delete from res;
select set_config('request.jwt.claim.sub', pg_temp.fx('view')::text, true);
set local role authenticated;
with u as (
  update public.tenants set mou_status = 'ended'
    where id = (select v from fx where k = 'tenant') returning 1)
insert into res select count(*) from u;
reset role;
select pg_temp.expect_int('tenants view 권한만으로는 0행만 바뀐다', (select n from res limit 1), 0);
select pg_temp.expect_text('권한 없는 시도는 값을 바꾸지 못한다',
  (select mou_status from public.tenants where id = pg_temp.fx('tenant')), 'signed');

do $$ begin raise notice '=== b2b-tenants-contract.spec: 전체 통과 ==='; end $$;

rollback;
