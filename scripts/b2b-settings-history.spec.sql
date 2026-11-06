-- =====================================================================
-- B2B 기반 11: 설정 변경 이력 트리거 SQL 스펙 (사 #164, #166)
--
-- 실행: 마이그레이션이 전부 적용된 스택에서
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/b2b-settings-history.spec.sql
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

create function pg_temp.expect_bool(t text, got boolean, want boolean) returns void
language plpgsql as $$
begin
  if got is distinct from want then
    raise exception '[FAIL] %: got %, want %', t, got, want;
  end if;
  raise notice '[PASS] % = %', t, want;
end $$;

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
  values (v_id, p_email, 'user', p_email)
  on conflict (id) do nothing;
  return v_id;
end $$;

create temp table fx (k text primary key, v uuid);
insert into public.tenants (code, name, region, org_type, tier, contract_start_date, contract_end_date)
  values ('SHAAAAAA', 'sh-a', '서울', '학교', 'B', current_date - 10, current_date + 100);
insert into fx select 'ta', id from public.tenants where code = 'SHAAAAAA';
insert into fx values
  ('hq', pg_temp.mk_user('sh-hq@t.local')),
  ('stu', pg_temp.mk_user('sh-stu@t.local'));
update public.profiles set tenant_id = (select v from fx where k = 'ta') where id = (select v from fx where k = 'stu');
create function pg_temp.fx(p_k text) returns uuid language sql as $$ select v from fx where k = p_k $$;

-- 마지막 로그 한 줄을 "action/종류/기관있음/행위자/대상" 로 본다.
create function pg_temp.log_n(p_resource text) returns bigint language sql as $$
  select count(*) from public.admin_access_logs where resource_key = p_resource and action = 'settings_change'
$$;
create function pg_temp.last_meta(p_resource text) returns jsonb language sql as $$
  select meta from public.admin_access_logs where resource_key = p_resource and action = 'settings_change'
   order by created_at desc, id desc limit 1
$$;

-- 본사 관리자로 로그인한 상태(auth.uid())
select set_config('request.jwt.claim.sub', pg_temp.fx('hq')::text, true);

-- 기관 서비스 설정
insert into public.tenant_service_settings (tenant_id, program_key, enabled, monthly_limit, term_limit)
  values (pg_temp.fx('ta'), 'selfeval', true, 3, null);
select pg_temp.expect_int('설정 insert 는 이력 1건', pg_temp.log_n('tenant_service_settings'), 1);
select pg_temp.expect_text('insert 이력: 행위자, 기관, 서비스, 이후 값',
  (select profile_id::text = pg_temp.fx('hq')::text and actor_email = 'sh-hq@t.local' and actor_kind = 'hq'
          and tenant_id = pg_temp.fx('ta') and target_id = pg_temp.fx('ta')
          and meta ->> 'program_key' = 'selfeval' and meta -> 'before' ->> 'monthly_limit' is null
          and (meta -> 'after' ->> 'monthly_limit')::int = 3 and (meta -> 'after' ->> 'enabled')::boolean
     from public.admin_access_logs where resource_key = 'tenant_service_settings')::text, 'true');

update public.tenant_service_settings set monthly_limit = 5, updated_by = pg_temp.fx('hq')
 where tenant_id = pg_temp.fx('ta') and program_key = 'selfeval';
select pg_temp.expect_int('설정 update 는 이력 1건 더', pg_temp.log_n('tenant_service_settings'), 2);
select pg_temp.expect_text('update 이력: 바뀐 값만 이전, 이후로 남는다',
  (pg_temp.last_meta('tenant_service_settings') -> 'before')::text || '/' || (pg_temp.last_meta('tenant_service_settings') -> 'after')::text,
  '{"monthly_limit": 3}/{"monthly_limit": 5}');

update public.tenant_service_settings set updated_at = now() + interval '1 second'
 where tenant_id = pg_temp.fx('ta') and program_key = 'selfeval';
select pg_temp.expect_int('값이 같으면(updated_at 만 바뀜) 이력을 남기지 않는다', pg_temp.log_n('tenant_service_settings'), 2);

delete from public.tenant_service_settings where tenant_id = pg_temp.fx('ta') and program_key = 'selfeval';
select pg_temp.expect_bool('delete 이력: 이후 값이 비어 있다',
  (pg_temp.last_meta('tenant_service_settings') -> 'after' ->> 'enabled') is null
    and (pg_temp.last_meta('tenant_service_settings') -> 'before' ->> 'monthly_limit')::int = 5, true);

-- 학생별 조정
insert into public.student_usage_overrides (profile_id, program_key, monthly_limit, term_limit, updated_by)
  values (pg_temp.fx('stu'), 'suhaeng', 4, 20, pg_temp.fx('hq'));
update public.student_usage_overrides set monthly_limit = 6 where profile_id = pg_temp.fx('stu') and program_key = 'suhaeng';
select pg_temp.expect_int('학생별 조정 insert, update 이력 2건', pg_temp.log_n('student_usage_overrides'), 2);
select pg_temp.expect_text('학생별 이력: 대상 학생, 기관, 이전과 이후 값',
  (select (target_id = pg_temp.fx('stu') and tenant_id = pg_temp.fx('ta') and profile_id = pg_temp.fx('hq')
           and meta ->> 'program_key' = 'suhaeng'
           and (meta -> 'before' ->> 'monthly_limit')::int = 4 and (meta -> 'after' ->> 'monthly_limit')::int = 6)::text
     from public.admin_access_logs where resource_key = 'student_usage_overrides'
     order by created_at desc, id desc limit 1), 'true');

-- 기관 계약 컬럼
update public.tenants set contract_end_date = current_date + 200, grace_ends_on = current_date + 230
 where id = pg_temp.fx('ta');
select pg_temp.expect_int('계약 컬럼 변경은 이력 1건', pg_temp.log_n('tenants'), 1);
select pg_temp.expect_text('계약 이력: 바뀐 컬럼의 이전, 이후',
  ((pg_temp.last_meta('tenants') -> 'before' ->> 'contract_end_date')::date = current_date + 100
   and (pg_temp.last_meta('tenants') -> 'after' ->> 'grace_ends_on')::date = current_date + 230
   and (pg_temp.last_meta('tenants') -> 'before' ->> 'grace_ends_on') is null)::text, 'true');
update public.tenants set name = 'sh-a2' where id = pg_temp.fx('ta');
select pg_temp.expect_int('계약과 무관한 컬럼 변경은 이력을 남기지 않는다', pg_temp.log_n('tenants'), 1);
update public.tenants set school_year = school_year where id = pg_temp.fx('ta');
select pg_temp.expect_int('학년도 같은 컬럼도 남기지 않는다', pg_temp.log_n('tenants'), 1);

-- 로그인 없이(service_role 데이터 작업) 바꾸면 행위자는 system
select set_config('request.jwt.claim.sub', '', true);
update public.tenants set mou_status = 'signed' where id = pg_temp.fx('ta');
select pg_temp.expect_text('로그인 없는 변경은 system 로 남는다',
  (select (profile_id is null and actor_login_id = 'system' and actor_kind = 'hq')::text
     from public.admin_access_logs where resource_key = 'tenants' order by created_at desc, id desc limit 1), 'true');

do $$ begin raise notice '=== b2b-settings-history.spec: 전체 통과 ==='; end $$;

rollback;
