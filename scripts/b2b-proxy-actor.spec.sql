-- =====================================================================
-- B2B 기반 7: 본사 대행 세션과 콘솔 행위자 조회 SQL 스펙 (T10)
--
-- 실행: 마이그레이션이 전부 적용된 스택에서
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/b2b-proxy-actor.spec.sql
--
-- 전체가 한 트랜잭션이고 마지막에 ROLLBACK 한다. 어떤 데이터도 남기지
-- 않는다. 단언 실패는 예외로 터져 psql 이 비정상 종료(ON_ERROR_STOP)한다.
-- =====================================================================
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


create function pg_temp.mk_user(p_email text, p_role text default 'user') returns uuid
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
  values (v_id, p_email, p_role, p_email)
  on conflict (id) do update set role = excluded.role;
  return v_id;
end $$;

create temp table fx (k text primary key, v uuid);
insert into public.tenants (code, name, region, org_type, tier)
  values ('T7AAAAAA', 't10-a', '서울', '학교', 'B'), ('T7BBBBBB', 't10-b', '서울', '학교', 'B');
insert into fx select 'ta', id from public.tenants where code = 'T7AAAAAA';
insert into fx select 'tb', id from public.tenants where code = 'T7BBBBBB';
insert into fx values
  ('admin1', pg_temp.mk_user('t10-admin1@t.local', 'admin')),
  ('admin2', pg_temp.mk_user('t10-admin2@t.local', 'admin')),
  ('plain', pg_temp.mk_user('t10-plain@t.local', 'user'));
create function pg_temp.fx(p_k text) returns uuid language sql as $$ select v from fx where k = p_k $$;

-- 행위자를 "kind/기관코드/교사있음/반수/대행있음/비번변경" 문자열로 본다.
create function pg_temp.actor_s(p_profile uuid) returns text language sql as $$
  select a.kind || '/' || coalesce((select code from public.tenants where id = a.tenant_id), '-')
    || '/' || (a.teacher_id is not null) || '/' || coalesce(cardinality(a.class_ids), 0)
    || '/' || (a.proxy_session_id is not null) || '/' || coalesce(a.must_change_password::text, '-')
  from public.fn_console_actor(p_profile) a
$$;

-- ---------------------------------------------------------------------
-- 대행 시작: 8시간, 이미 열린 세션은 replaced 로 닫힌다
-- ---------------------------------------------------------------------
create temp table sess (k text primary key, v uuid);
insert into sess values ('s1', public.fn_proxy_start(pg_temp.fx('admin1'), pg_temp.fx('ta'), 'admin_absent'));
select pg_temp.expect_bool('start: expires_at = started_at + 8시간',
  (select expires_at = started_at + interval '8 hours' and ended_at is null
     from public.proxy_sessions where id = (select v from sess where k = 's1')), true);
select pg_temp.expect_text('활성 대행은 hq_proxy 로 기관과 세션을 돌려준다',
  pg_temp.actor_s(pg_temp.fx('admin1')), 'hq_proxy/T7AAAAAA/false/0/true/false');

insert into sess values ('s2', public.fn_proxy_start(pg_temp.fx('admin1'), pg_temp.fx('tb'), 'roster_proxy'));
select pg_temp.expect_text('두 번째 start 는 첫 세션을 replaced 로 닫는다',
  (select end_reason from public.proxy_sessions where id = (select v from sess where k = 's1')), 'replaced');
select pg_temp.expect_int('열린 세션은 관리자당 하나',
  (select count(*) from public.proxy_sessions
    where admin_profile_id = pg_temp.fx('admin1') and ended_at is null), 1);
select pg_temp.expect_text('새 세션 기관으로 바뀐다',
  pg_temp.actor_s(pg_temp.fx('admin1')), 'hq_proxy/T7BBBBBB/false/0/true/false');

-- 만료된 세션은 행위자 없음, 다음 start 가 expired 로 닫는다
update public.proxy_sessions
   set started_at = now() - interval '9 hours', expires_at = now() - interval '1 hour'
 where id = (select v from sess where k = 's2');
select pg_temp.expect_text('만료된 대행은 none', pg_temp.actor_s(pg_temp.fx('admin1')), 'none/-/false/0/false/-');
insert into sess values ('s3', public.fn_proxy_start(pg_temp.fx('admin1'), pg_temp.fx('ta'), 'incident_support'));
select pg_temp.expect_text('만료된 열린 세션은 expired 로 닫힌다',
  (select end_reason from public.proxy_sessions where id = (select v from sess where k = 's2')), 'expired');

-- 종료
select pg_temp.expect_text('end 는 닫은 세션 id 를 돌려준다',
  public.fn_proxy_end(pg_temp.fx('admin1'))::text, (select v::text from sess where k = 's3'));
select pg_temp.expect_text('end 후 end_reason manual',
  (select end_reason from public.proxy_sessions where id = (select v from sess where k = 's3')), 'manual');
select pg_temp.expect_text('종료된 대행은 none', pg_temp.actor_s(pg_temp.fx('admin1')), 'none/-/false/0/false/-');
select pg_temp.expect_bool('열린 세션이 없을 때 end 는 null',
  public.fn_proxy_end(pg_temp.fx('admin1')) is null, true);

-- 관리자가 아닌 계정은 세션이 있어도 대행이 아니다
insert into public.proxy_sessions (admin_profile_id, tenant_id, reason, expires_at)
  values (pg_temp.fx('plain'), pg_temp.fx('ta'), 'admin_absent', now() + interval '8 hours');
select pg_temp.expect_text('관리자가 아니면 none', pg_temp.actor_s(pg_temp.fx('plain')), 'none/-/false/0/false/-');

-- 테이블 제약
select pg_temp.expect_error('사유 목록 밖 거부',
  $$select public.fn_proxy_start(pg_temp.fx('admin2'), pg_temp.fx('ta'), 'because')$$, '23514');
select pg_temp.expect_error('expires_at 이 8시간이 아니면 거부',
  $$insert into public.proxy_sessions (admin_profile_id, tenant_id, reason, expires_at)
    values (pg_temp.fx('admin2'), pg_temp.fx('ta'), 'admin_absent', now() + interval '7 hours')$$, '23514');
select pg_temp.expect_error('열린 세션 직접 두 개 거부',
  $$insert into public.proxy_sessions (admin_profile_id, tenant_id, reason, expires_at)
    values (pg_temp.fx('plain'), pg_temp.fx('tb'), 'admin_absent', now() + interval '8 hours')$$, '23505');
select pg_temp.expect_error('없는 기관 거부',
  $$select public.fn_proxy_start(pg_temp.fx('admin2'), gen_random_uuid(), 'admin_absent')$$, '23503');

-- 접근 로그의 proxy_session_id 는 실제 세션만 가리킨다
select pg_temp.expect_error('로그의 없는 proxy_session_id 거부',
  $$insert into public.admin_access_logs (actor_email, action, resource_key, actor_kind, proxy_session_id)
    values ('a@a', 'proxy_start', 'students', 'hq_proxy', gen_random_uuid())$$, '23503');
select pg_temp.expect_ok('로그의 실제 proxy_session_id 통과',
  format($f$insert into public.admin_access_logs (actor_email, action, resource_key, actor_kind, proxy_session_id)
    values ('a@a', 'proxy_start', 'students', 'hq_proxy', %L)$f$, (select v from sess where k = 's3')));

-- ---------------------------------------------------------------------
-- 교사 행위자
-- ---------------------------------------------------------------------
create function pg_temp.mk_class(p_year_offset integer, p_name text) returns uuid
language sql as $$
  select public.fn_class_ensure(pg_temp.fx('ta'),
    ((select school_year from public.tenants where code = 'T7AAAAAA') + p_year_offset)::smallint,
    '중1', null, p_name)
$$;

create function pg_temp.mk_teacher(p_phone text, p_role text, p_user text) returns uuid
language plpgsql as $$
declare
  v_id uuid;
  v_profile uuid := pg_temp.mk_user(p_user);
begin
  insert into public.teachers (tenant_id, name, phone, role, login_id, profile_id)
  values (pg_temp.fx('ta'), 'T' || p_phone, p_phone, p_role,
    'T7AAAAAA' || 'AAAA' || translate(right(p_phone, 2), '0123456789', 'ABCDEFGHJK'), v_profile)
  returning id into v_id;
  insert into fx values ('p' || p_phone, v_profile), ('t' || p_phone, v_id);
  return v_id;
end $$;

select pg_temp.mk_teacher('01010000001', 'homeroom', 't10-h1@t.local');
select pg_temp.expect_text('담임인데 담당 학급이 없으면 반 0개',
  pg_temp.actor_s(pg_temp.fx('p01010000001')), 'homeroom/T7AAAAAA/true/0/false/false');

insert into public.teacher_class_assignments (teacher_id, tenant_id, class_id, is_primary)
  values (pg_temp.fx('t01010000001'), pg_temp.fx('ta'), pg_temp.mk_class(0, '1'), true);
insert into public.teacher_class_assignments (teacher_id, tenant_id, class_id)
  values (pg_temp.fx('t01010000001'), pg_temp.fx('ta'), pg_temp.mk_class(0, '2'));
insert into public.teacher_class_assignments (teacher_id, tenant_id, class_id)
  values (pg_temp.fx('t01010000001'), pg_temp.fx('ta'), pg_temp.mk_class(-1, '9'));
select pg_temp.expect_text('담임은 올해 학급 id 만 받는다(작년 학급 제외)',
  pg_temp.actor_s(pg_temp.fx('p01010000001')), 'homeroom/T7AAAAAA/true/2/false/false');
select pg_temp.expect_bool('돌려주는 반 id 가 담당 학급과 같다',
  (select array_agg(c order by c) = (select array_agg(class_id order by class_id)
      from public.teacher_class_assignments a join public.classes cl on cl.id = a.class_id
     where a.teacher_id = pg_temp.fx('t01010000001')
       and cl.school_year = (select school_year from public.tenants where code = 'T7AAAAAA'))
     from public.fn_console_actor(pg_temp.fx('p01010000001')) a, unnest(a.class_ids) c), true);

select pg_temp.mk_teacher('01010000002', 'school_admin', 't10-a1@t.local');
select pg_temp.expect_text('학교 관리자',
  pg_temp.actor_s(pg_temp.fx('p01010000002')), 'school_admin/T7AAAAAA/true/0/false/false');

-- 임시 비밀번호 상태가 그대로 전달된다
update public.teachers set must_change_password = true, temp_password_hash = 'h'
  where id = pg_temp.fx('t01010000001');
select pg_temp.expect_text('must_change_password 반환',
  pg_temp.actor_s(pg_temp.fx('p01010000001')), 'homeroom/T7AAAAAA/true/2/false/true');

-- 비활성, 삭제된 교사는 none
update public.teachers set status = 'inactive' where id = pg_temp.fx('t01010000001');
select pg_temp.expect_text('비활성 교사는 none', pg_temp.actor_s(pg_temp.fx('p01010000001')), 'none/-/false/0/false/-');
update public.teachers set status = 'active', deleted_at = now() where id = pg_temp.fx('t01010000001');
select pg_temp.expect_text('삭제된 교사는 none', pg_temp.actor_s(pg_temp.fx('p01010000001')), 'none/-/false/0/false/-');
select pg_temp.expect_text('교사도 대행도 아닌 계정은 none', pg_temp.actor_s(pg_temp.fx('admin2')), 'none/-/false/0/false/-');
select pg_temp.expect_int('없는 프로필도 한 행(none)을 돌려준다',
  (select count(*) from public.fn_console_actor(gen_random_uuid())), 1);

-- ---------------------------------------------------------------------
-- 클라이언트 role 은 테이블과 함수에 접근할 수 없다
-- ---------------------------------------------------------------------
grant execute on function pg_temp.expect_error(text, text, text) to anon, authenticated;
set local role anon;
select pg_temp.expect_error('anon 은 proxy_sessions 조회 불가', $$select count(*) from public.proxy_sessions$$, '42501');
select pg_temp.expect_error('anon 은 fn_console_actor 실행 불가',
  $$select * from public.fn_console_actor(gen_random_uuid())$$, '42501');
select pg_temp.expect_error('anon 은 fn_proxy_start 실행 불가',
  $$select public.fn_proxy_start(gen_random_uuid(), gen_random_uuid(), 'admin_absent')$$, '42501');
select pg_temp.expect_error('anon 은 fn_proxy_end 실행 불가',
  $$select public.fn_proxy_end(gen_random_uuid())$$, '42501');
reset role;
set local role authenticated;
select pg_temp.expect_error('authenticated 는 proxy_sessions 조회 불가', $$select count(*) from public.proxy_sessions$$, '42501');
select pg_temp.expect_error('authenticated 는 fn_console_actor 실행 불가',
  $$select * from public.fn_console_actor(gen_random_uuid())$$, '42501');
select pg_temp.expect_error('authenticated 는 fn_proxy_start 실행 불가',
  $$select public.fn_proxy_start(gen_random_uuid(), gen_random_uuid(), 'admin_absent')$$, '42501');
select pg_temp.expect_error('authenticated 는 fn_proxy_end 실행 불가',
  $$select public.fn_proxy_end(gen_random_uuid())$$, '42501');
reset role;

do $$ begin raise notice '=== b2b-proxy-actor.spec: 전체 통과 ==='; end $$;

rollback;
