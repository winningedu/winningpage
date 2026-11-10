-- =====================================================================
-- QA 계정 보호 SQL 스펙 2: QA 계정이 실제 기관, 실제 보호자 연결로 넘어가는 RPC 차단 (WC103)
--
-- 실행: 마이그레이션이 전부 적용된 스택에서
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/b2b-qa-account-guard-rpc.spec.sql
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

create function pg_temp.run_as(p_uid uuid, p_sql text) returns void
language plpgsql as $$
begin
  if p_uid is not null then
    perform set_config('request.jwt.claims',
      json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
    set local role authenticated;
  end if;
  execute p_sql;
  reset role;
  perform set_config('request.jwt.claims', '', true);
end $$;

create function pg_temp.expect_ok(t text, p_uid uuid, p_sql text) returns void
language plpgsql as $$
begin
  perform pg_temp.run_as(p_uid, p_sql);
  raise notice '[PASS] % 성공', t;
end $$;

create function pg_temp.expect_error(t text, p_uid uuid, p_sql text, want text) returns void
language plpgsql as $$
declare
  v_state text;
begin
  begin
    perform pg_temp.run_as(p_uid, p_sql);
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    reset role;
    perform set_config('request.jwt.claims', '', true);
    if v_state is distinct from want then
      raise exception '[FAIL] %: sqlstate %, want %', t, v_state, want;
    end if;
    raise notice '[PASS] % = %', t, want;
    return;
  end;
  raise exception '[FAIL] %: 예외가 나지 않았다, want %', t, want;
end $$;

create function pg_temp.mk_user(p_email text, p_member_type text, p_tenant uuid) returns uuid
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
  insert into public.profiles (id, name, role, email, member_type, tenant_id)
  values (v_id, p_email, 'user', p_email, p_member_type, p_tenant)
  on conflict (id) do update set member_type = excluded.member_type, tenant_id = excluded.tenant_id;
  return v_id;
end $$;

create function pg_temp.mk_tenant(p_code text, p_catch_all boolean default false) returns uuid
language plpgsql as $$
declare
  v_id uuid;
begin
  insert into public.tenants (code, name, region, org_type, tier, is_catch_all, contract_start_date)
  values (p_code, 'qrpc-' || p_code, '서울', case when p_catch_all then '기타' else '학교' end, 'B', p_catch_all, current_date - 10)
  returning id into v_id;
  return v_id;
end $$;

create temp table fx (k text primary key, v uuid);
grant select on fx to authenticated;

update public.tenants set is_catch_all = false where is_catch_all;
insert into fx values
  ('t_etc', pg_temp.mk_tenant('QRAAAAAA', true)),
  ('t_real', pg_temp.mk_tenant('QRBBBBBB')),
  ('t_qa', pg_temp.mk_tenant('QRCCCCCC'));
insert into fx values
  ('qa_resident', pg_temp.mk_user('qr-resident@t.local', 'student', (select v from fx where k = 't_qa'))),
  ('qa_s1', pg_temp.mk_user('qr-s1@t.local', 'student', null)),
  ('qa_s2', pg_temp.mk_user('qr-s2@t.local', 'student', null)),
  ('qa_etc1', pg_temp.mk_user('qr-etc1@t.local', 'student', (select v from fx where k = 't_etc'))),
  ('qa_etc2', pg_temp.mk_user('qr-etc2@t.local', 'student', (select v from fx where k = 't_etc'))),
  ('real_s1', pg_temp.mk_user('qr-real-s1@t.local', 'student', null)),
  ('qa_parent', pg_temp.mk_user('qr-qa-parent@t.local', 'parent', null)),
  ('real_parent', pg_temp.mk_user('qr-real-parent@t.local', 'parent', null)),
  ('qa_child', pg_temp.mk_user('qr-qa-child@t.local', 'student', null)),
  ('real_child', pg_temp.mk_user('qr-real-child@t.local', 'student', null)),
  ('real_child2', pg_temp.mk_user('qr-real-child2@t.local', 'student', null));
insert into public.qa_accounts (profile_id)
  select v from fx where k in ('qa_resident', 'qa_s1', 'qa_s2', 'qa_etc1', 'qa_etc2', 'qa_parent', 'qa_child');

-- ---------------------------------------------------------------------
-- 스위치(app_settings.qa_account_guard_enabled)가 없으면 차단이 꺼진다(QA 기간)
-- ---------------------------------------------------------------------
insert into public.student_link_codes (student_id, code)
  select v, case k when 'qa_child' then 'QRQQQQ' when 'real_child' then 'RRRRRR' else 'SSSSSS' end
    from fx where k in ('qa_child', 'real_child', 'real_child2');

select pg_temp.expect_ok('스위치가 없으면 QA 학생이 QA 계정 없는 기관 코드를 넣을 수 있다',
  (select v from fx where k = 'qa_s1'),
  $q$select * from public.fn_set_my_tenant('QRBBBBBB')$q$);
select pg_temp.expect_ok('스위치가 없으면 기타 소속 QA 학생이 QA 계정 없는 기관으로 옮길 수 있다', null,
  format($q$select * from public.fn_catch_all_join_tenant(%L, 'QRBBBBBB', '고2', null, '3반', 6::smallint)$q$,
    (select v from fx where k = 'qa_etc1')));
select pg_temp.expect_ok('스위치가 없으면 QA 학부모가 QA 아닌 자녀를 연결할 수 있다',
  (select v from fx where k = 'qa_parent'),
  $q$select public.request_parent_link('RRRRRR')$q$);

-- 스위치를 켠다(운영 전환). 기관 소속과 연결을 처음 상태로 되돌린 뒤 켜진 상태의 동작을 본다.
update public.profiles set tenant_id = null
 where id = (select v from fx where k = 'qa_s1');
update public.profiles set tenant_id = (select v from fx where k = 't_etc')
 where id = (select v from fx where k = 'qa_etc1');
delete from public.parent_child_links where parent_id = (select v from fx where k = 'qa_parent');
insert into public.app_settings (key, value) values ('qa_account_guard_enabled', 'true'::jsonb);

-- ---------------------------------------------------------------------
-- fn_set_my_tenant: 브라우저 RPC
-- ---------------------------------------------------------------------
select pg_temp.expect_error('QA 학생이 QA 계정이 없는 기관 코드를 넣으면 WC103',
  (select v from fx where k = 'qa_s1'),
  $q$select * from public.fn_set_my_tenant('QRBBBBBB')$q$, 'WC103');
select pg_temp.expect_bool('거절되면 소속이 바뀌지 않는다',
  (select tenant_id is null from public.profiles where id = (select v from fx where k = 'qa_s1')), true);
select pg_temp.expect_ok('QA 학생이 QA 계정이 있는 기관 코드를 넣으면 된다',
  (select v from fx where k = 'qa_s2'),
  $q$select * from public.fn_set_my_tenant('QRCCCCCC')$q$);
select pg_temp.expect_bool('QA 기관으로 소속이 바뀐다',
  (select tenant_id = (select v from fx where k = 't_qa') from public.profiles where id = (select v from fx where k = 'qa_s2')), true);
select pg_temp.expect_ok('일반 학생은 일반 기관 코드를 넣을 수 있다(동작 불변)',
  (select v from fx where k = 'real_s1'),
  $q$select * from public.fn_set_my_tenant('QRBBBBBB')$q$);

-- ---------------------------------------------------------------------
-- fn_catch_all_join_tenant: 서버(service_role)가 부르는 RPC
-- ---------------------------------------------------------------------
select pg_temp.expect_error('기타 소속 QA 학생이 QA 계정이 없는 기관으로 옮기면 WC103', null,
  format($q$select * from public.fn_catch_all_join_tenant(%L, 'QRBBBBBB', '고2', null, '3반', 7::smallint)$q$,
    (select v from fx where k = 'qa_etc1')), 'WC103');
select pg_temp.expect_bool('거절되면 기타 소속이 그대로다',
  (select tenant_id = (select v from fx where k = 't_etc') from public.profiles where id = (select v from fx where k = 'qa_etc1')), true);
select pg_temp.expect_ok('기타 소속 QA 학생이 QA 계정이 있는 기관으로 옮기면 된다', null,
  format($q$select * from public.fn_catch_all_join_tenant(%L, 'QRCCCCCC', '고2', null, '3반', 8::smallint)$q$,
    (select v from fx where k = 'qa_etc2')));

-- ---------------------------------------------------------------------
-- request_parent_link: 연결코드로 자녀 연결
-- ---------------------------------------------------------------------
select pg_temp.expect_error('QA 학부모가 QA 아닌 자녀를 연결하면 WC103',
  (select v from fx where k = 'qa_parent'),
  $q$select public.request_parent_link('RRRRRR')$q$, 'WC103');
select pg_temp.expect_ok('QA 학부모가 QA 자녀를 연결하면 된다',
  (select v from fx where k = 'qa_parent'),
  $q$select public.request_parent_link('QRQQQQ')$q$);
select pg_temp.expect_ok('일반 학부모는 일반 자녀를 연결할 수 있다(동작 불변)',
  (select v from fx where k = 'real_parent'),
  $q$select public.request_parent_link('SSSSSS')$q$);

do $$ begin raise notice '=== b2b-qa-account-guard-rpc.spec: 전체 통과 ==='; end $$;

rollback;
