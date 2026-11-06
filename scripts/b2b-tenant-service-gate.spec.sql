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

rollback;
