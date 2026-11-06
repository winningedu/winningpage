-- =====================================================================
-- B2B 기반 12: 보관 기간 정리 함수 SQL 스펙 (T23)
--
-- 실행: 마이그레이션이 전부 적용된 스택에서
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/b2b-retention-purge.spec.sql
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
insert into public.tenants (code, name, region, org_type, tier)
  values ('RPAAAAAA', 't23-a', '서울', '학교', 'B');
insert into fx select 'ta', id from public.tenants where code = 'RPAAAAAA';
insert into fx values
  ('old', pg_temp.mk_user('t23-old@t.local')),       -- 3년 전 졸업
  ('edge_out', pg_temp.mk_user('t23-eo@t.local')),   -- 2년 하루 전 졸업
  ('edge_in', pg_temp.mk_user('t23-ei@t.local')),    -- 2년 하루 안 됨
  ('recent', pg_temp.mk_user('t23-rc@t.local')),     -- 1년 전 졸업
  ('back', pg_temp.mk_user('t23-bk@t.local')),       -- 옛 졸업 기록이 있지만 지금 재학 중
  ('active', pg_temp.mk_user('t23-ac@t.local'));
create function pg_temp.fx(p_k text) returns uuid language sql as $$ select v from fx where k = p_k $$;

create function pg_temp.enr(p_student text, p_year integer, p_graduated interval) returns void
language sql as $$
  insert into public.student_enrollments (tenant_id, student_id, school_year, status, graduated_at)
  values (pg_temp.fx('ta'), pg_temp.fx(p_student), p_year,
    case when p_graduated is null then 'active' else 'graduated' end,
    case when p_graduated is null then null else now() - p_graduated end)
$$;
create function pg_temp.chg(p_student text, p_year integer) returns void
language sql as $$
  insert into public.enrollment_changes (tenant_id, student_id, school_year, kind, status)
  values (pg_temp.fx('ta'), pg_temp.fx(p_student), p_year, 'rollover', 'applied')
$$;

select pg_temp.enr('old', 2022, interval '3 years');
select pg_temp.enr('old', 2021, interval '4 years');
select pg_temp.chg('old', 2022);
select pg_temp.enr('edge_out', 2023, interval '2 years 1 day');
select pg_temp.chg('edge_out', 2023);
select pg_temp.enr('edge_in', 2023, interval '1 year 364 days');
select pg_temp.chg('edge_in', 2023);
select pg_temp.enr('recent', 2025, interval '1 year');
select pg_temp.chg('recent', 2025);
select pg_temp.enr('back', 2020, interval '5 years');
select pg_temp.enr('back', 2026, null);
select pg_temp.chg('back', 2020);
select pg_temp.enr('active', 2026, null);
select pg_temp.chg('active', 2026);

create function pg_temp.log(p_action text, p_age interval) returns void
language sql as $$
  insert into public.admin_access_logs (actor_login_id, actor_kind, action, resource_key, tenant_id, created_at, target_id)
  values ('t23-spec', 'teacher', p_action, 't23.spec', pg_temp.fx('ta'), now() - p_age,
    pg_temp.fx('ta'))
$$;
select pg_temp.log('view', interval '3 years');
select pg_temp.log('update', interval '25 months');
select pg_temp.log('view', interval '1 year 6 months');
select pg_temp.log('member_purge', interval '13 months');
select pg_temp.log('member_purge', interval '6 months');
select pg_temp.log('view', interval '1 day');
-- 본사 행(actor_kind 없음)은 이 함수의 대상이 아니다. 3년 지나도 남는다.
insert into public.admin_access_logs (actor_email, action, resource_key, reason, created_at)
  values ('t23-hq@t.local', 'download', 't23.hq', 't23 legacy hq', now() - interval '3 years');

-- 기관마다 따로(결정 64): 한 기관의 졸업이 2년 지났어도 다른 기관의 학적, 이력, 특이학생, 상담 상태는 지우지 않는다.
insert into public.tenants (code, name, region, org_type, tier)
  values ('RPBBBBBB', 't23-b', '서울', '학교', 'B');
insert into fx select 'tb', id from public.tenants where code = 'RPBBBBBB';
insert into fx values
  ('sp_grad', pg_temp.mk_user('t23-spg@t.local')),   -- A 3년 전 졸업, B 한 달 전 졸업
  ('sp_act', pg_temp.mk_user('t23-spa@t.local'));    -- A 3년 전 졸업, B 재학 중
create function pg_temp.split_rows(p_student text, p_tenant text) returns void
language plpgsql as $$
begin
  insert into public.enrollment_changes (tenant_id, student_id, school_year, kind, status)
  values (pg_temp.fx(p_tenant), pg_temp.fx(p_student), 2026, 'rollover', 'applied');
  insert into public.student_flags (tenant_id, student_id) values (pg_temp.fx(p_tenant), pg_temp.fx(p_student));
  insert into public.counsel_statuses (tenant_id, student_id, school_year, status)
  values (pg_temp.fx(p_tenant), pg_temp.fx(p_student), 2026, 'done');
end $$;
select pg_temp.enr('sp_grad', 2022, interval '3 years');
select pg_temp.enr('sp_act', 2022, interval '3 years');
insert into public.student_enrollments (tenant_id, student_id, school_year, status, graduated_at) values
  (pg_temp.fx('tb'), pg_temp.fx('sp_grad'), 2026, 'graduated', now() - interval '1 month');
insert into public.student_enrollments (tenant_id, student_id, school_year, status) values
  (pg_temp.fx('tb'), pg_temp.fx('sp_act'), 2026, 'active');
select pg_temp.split_rows('sp_grad', 'ta');
select pg_temp.split_rows('sp_grad', 'tb');
select pg_temp.split_rows('sp_act', 'ta');
select pg_temp.split_rows('sp_act', 'tb');

create temp table purge_result as select * from public.fn_purge_b2b_retention();

create function pg_temp.enr_n(p_student text) returns bigint language sql as $$
  select count(*) from public.student_enrollments where student_id = pg_temp.fx(p_student)
$$;
create function pg_temp.chg_n(p_student text) returns bigint language sql as $$
  select count(*) from public.enrollment_changes where student_id = pg_temp.fx(p_student)
$$;
create function pg_temp.logs_n(p_action text, p_age_min interval, p_age_max interval) returns bigint
language sql as $$
  select count(*) from public.admin_access_logs
   where actor_login_id = 't23-spec' and action = p_action
     and created_at <= now() - p_age_min and created_at > now() - p_age_max
$$;

-- 졸업 2년이 지난 학생: 학적 이력과 학적이 모두 사라진다(모든 학년도).
select pg_temp.expect_int('3년 전 졸업생 학적', pg_temp.enr_n('old'), 0);
select pg_temp.expect_int('3년 전 졸업생 이력', pg_temp.chg_n('old'), 0);
select pg_temp.expect_int('2년 하루 지난 졸업생 학적', pg_temp.enr_n('edge_out'), 0);
select pg_temp.expect_int('2년 하루 지난 졸업생 이력', pg_temp.chg_n('edge_out'), 0);
-- 2년이 안 됐거나 재학 중이면 남는다.
select pg_temp.expect_int('2년 안 된 졸업생 학적', pg_temp.enr_n('edge_in'), 1);
select pg_temp.expect_int('2년 안 된 졸업생 이력', pg_temp.chg_n('edge_in'), 1);
select pg_temp.expect_int('1년 전 졸업생 학적', pg_temp.enr_n('recent'), 1);
select pg_temp.expect_int('1년 전 졸업생 이력', pg_temp.chg_n('recent'), 1);
select pg_temp.expect_int('옛 졸업 기록이 있어도 재학 중이면 학적 보존', pg_temp.enr_n('back'), 2);
select pg_temp.expect_int('옛 졸업 기록이 있어도 재학 중이면 이력 보존', pg_temp.chg_n('back'), 1);
select pg_temp.expect_int('재학생 학적', pg_temp.enr_n('active'), 1);
select pg_temp.expect_int('재학생 이력', pg_temp.chg_n('active'), 1);

-- 기관별 판정: 졸업 2년이 지난 기관의 행만 지우고 다른 기관의 행은 남긴다.
create function pg_temp.tenant_rows(p_student text, p_tenant text) returns text language sql as $$
  select (select count(*) from public.student_enrollments where student_id = pg_temp.fx(p_student) and tenant_id = pg_temp.fx(p_tenant))
    || '/' || (select count(*) from public.enrollment_changes where student_id = pg_temp.fx(p_student) and tenant_id = pg_temp.fx(p_tenant))
    || '/' || (select count(*) from public.student_flags where student_id = pg_temp.fx(p_student) and tenant_id = pg_temp.fx(p_tenant))
    || '/' || (select count(*) from public.counsel_statuses where student_id = pg_temp.fx(p_student) and tenant_id = pg_temp.fx(p_tenant))
$$;
select pg_temp.expect_text('A 3년 전 졸업, B 한 달 전 졸업: A 행은 삭제', pg_temp.tenant_rows('sp_grad', 'ta'), '0/0/0/0');
select pg_temp.expect_text('A 3년 전 졸업, B 한 달 전 졸업: B 학적, 이력, 특이학생, 상담 상태 보존', pg_temp.tenant_rows('sp_grad', 'tb'), '1/1/1/1');
select pg_temp.expect_text('A 3년 전 졸업, B 재학 중: A 행은 삭제', pg_temp.tenant_rows('sp_act', 'ta'), '0/0/0/0');
select pg_temp.expect_text('A 3년 전 졸업, B 재학 중: B 학적, 이력, 특이학생, 상담 상태 보존', pg_temp.tenant_rows('sp_act', 'tb'), '1/1/1/1');

-- 접근 로그: 2년이 지난 일반 행, 1년이 지난 member_purge 행만 사라진다.
select pg_temp.expect_int('3년 된 view 삭제', pg_temp.logs_n('view', interval '2 years 1 day', interval '100 years'), 0);
select pg_temp.expect_int('25개월 된 update 삭제', pg_temp.logs_n('update', interval '0', interval '100 years'), 0);
select pg_temp.expect_int('1년 6개월 된 view 보존', pg_temp.logs_n('view', interval '1 year', interval '2 years'), 1);
select pg_temp.expect_int('최근 view 보존', pg_temp.logs_n('view', interval '0', interval '2 days'), 1);
select pg_temp.expect_int('13개월 된 member_purge 삭제', pg_temp.logs_n('member_purge', interval '1 year', interval '100 years'), 0);
select pg_temp.expect_int('6개월 된 member_purge 보존', pg_temp.logs_n('member_purge', interval '0', interval '1 year'), 1);

select pg_temp.expect_int('옛 본사 행은 3년이 지나도 보존',
  (select count(*) from public.admin_access_logs where resource_key = 't23.hq' and actor_kind is null), 1);

-- 반환 건수는 지운 행 수 이상이다(로컬 DB 에 다른 행이 있을 수 있다).
select pg_temp.expect_bool('반환 건수',
  (select enrollments_deleted >= 3 and enrollment_changes_deleted >= 2 and access_logs_deleted >= 3 from purge_result), true);

-- 다시 불러도 같다(지울 것이 없다).
select pg_temp.expect_int('재실행은 아무것도 지우지 않는다',
  (select enrollments_deleted + enrollment_changes_deleted + access_logs_deleted from public.fn_purge_b2b_retention()), 0);

-- ---------------------------------------------------------------------
-- fn_anonymize_expired_b2b_members: 계약 종료 + 유예 뒤 학생 개인정보 익명화 (사 #162, #176, 사 결정 r16)
-- ---------------------------------------------------------------------
create function pg_temp.today() returns date language sql as $$ select (now() at time zone 'Asia/Seoul')::date $$;

create function pg_temp.mk_tenant(p_k text, p_code text, p_end date, p_grace date) returns void
language plpgsql as $$
begin
  insert into public.tenants (code, name, region, org_type, tier, contract_start_date, contract_end_date, grace_ends_on)
  values (p_code, 't23-' || p_k, '서울', '학교', 'B',
    case when p_end is null then null else p_end - 200 end, p_end, p_grace);
  insert into fx select 'ten_' || p_k, id from public.tenants where code = p_code;
end $$;

-- 학생 하나: 이름, 연락처, 생년월일 등 개인정보를 채워 둔다.
create function pg_temp.mk_member(p_k text, p_tenant text, p_type text, p_n int) returns void
language plpgsql as $$
declare
  v_id uuid := pg_temp.mk_user('t23-m-' || p_k || '@t.local');
begin
  insert into fx values ('m_' || p_k, v_id);
  update public.profiles set
    name = '홍길동' || p_k, phone = '0107000000' || p_n, username = 't23user' || p_k,
    birth_date = date '2010-01-01', gender = '남', landline = '021234567' || p_n,
    address = '서울시', address_detail = '101호', memo = '메모', guardian_phone = '0108000000' || p_n,
    member_type = p_type, tenant_id = pg_temp.fx('ten_' || p_tenant), is_active = true
   where id = v_id;
end $$;

select pg_temp.mk_tenant('ended', 'RPEEEEEE', pg_temp.today() - 40, pg_temp.today() - 10);   -- 유예 종료일이 지남
select pg_temp.mk_tenant('ingrace', 'RPGGGGGG', pg_temp.today() - 10, null);                  -- 유예 안(공통 일수 쓸 때)
select pg_temp.mk_tenant('explicit', 'RPXXXXXX', pg_temp.today() - 100, pg_temp.today() + 5); -- 기관별 유예 종료일이 미래
select pg_temp.mk_tenant('nograce', 'RPNNNNNN', pg_temp.today() - 100, null);                 -- 유예 설정이 어디에도 없음
select pg_temp.mk_tenant('nocontract', 'RPCCCCCC', null, null);                               -- 계약 칸이 비어 있음(위닝 기관)

select pg_temp.mk_member('s1', 'ended', 'student', 1);
select pg_temp.mk_member('s2paid', 'ended', 'student', 2);
select pg_temp.mk_member('s3old', 'ended', 'student', 3);
select pg_temp.mk_member('t1', 'ended', 'teacher', 4);
select pg_temp.mk_member('p1', 'ended', 'parent', 5);
select pg_temp.mk_member('g1', 'ingrace', 'student', 6);
select pg_temp.mk_member('e1', 'explicit', 'student', 7);
select pg_temp.mk_member('n1', 'nograce', 'student', 8);
select pg_temp.mk_member('c1', 'nocontract', 'student', 9);

-- 유료 전환: 지금 유효한 개인 유료 이용권이 있으면 보호한다. 만료됐거나 무료인 이용권은 보호하지 않는다.
insert into public.programs (program_key, name) values ('t23_prog', 't23') on conflict (program_key) do nothing;
insert into public.program_access_grants (profile_id, program_key, granted_by, granted_by_actor, granted_sessions, paid_amount, starts_at, expires_at, granted_months)
select pg_temp.fx('m_s2paid'), 't23_prog', 'qa', null, 5, 10000, now() - interval '10 days', null, null;
insert into public.program_access_grants (profile_id, program_key, granted_by, granted_by_actor, granted_sessions, paid_amount, starts_at, expires_at, granted_months)
select pg_temp.fx('m_s3old'), 't23_prog', 'qa', null, 5, 10000, now() - interval '100 days', now() - interval '50 days', 1;

create temp table anon_result as select * from public.fn_anonymize_expired_b2b_members();

create function pg_temp.pname(p_k text) returns text language sql as $$ select name from public.profiles where id = pg_temp.fx('m_' || p_k) $$;
create function pg_temp.banned(p_k text) returns boolean language sql as $$
  select coalesce(banned_until > now() + interval '10 years', false) from auth.users where id = pg_temp.fx('m_' || p_k) $$;

select pg_temp.expect_text('종료+유예 지난 기관의 학생 이름은 삭제된 학생', pg_temp.pname('s1'), '삭제된 학생');
select pg_temp.expect_bool('학생 연락처와 개인정보가 비워진다',
  (select phone is null and email is null and username is null and birth_date is null and gender is null
      and landline is null and address is null and address_detail is null and memo is null
      and guardian_phone is null and not is_active
     from public.profiles where id = pg_temp.fx('m_s1')), true);
select pg_temp.expect_bool('학생 Auth 계정은 정지된다', pg_temp.banned('s1'), true);
select pg_temp.expect_bool('유효한 개인 유료 이용권이 있는 학생은 보호된다',
  pg_temp.pname('s2paid') = '홍길동s2paid' and not pg_temp.banned('s2paid'), true);
select pg_temp.expect_text('만료된 이용권만 있는 학생은 익명화된다', pg_temp.pname('s3old'), '삭제된 학생');
select pg_temp.expect_text('교사 계정은 그대로 둔다', pg_temp.pname('t1'), '홍길동t1');
select pg_temp.expect_text('학부모 계정은 그대로 둔다', pg_temp.pname('p1'), '홍길동p1');
select pg_temp.expect_text('유예 종료일이 지나기 전 기관은 그대로 둔다(공통 일수 없음)', pg_temp.pname('g1'), '홍길동g1');
select pg_temp.expect_text('기관별 유예 종료일이 미래면 그대로 둔다', pg_temp.pname('e1'), '홍길동e1');
select pg_temp.expect_text('유예 설정이 없으면 지우지 않는다', pg_temp.pname('n1'), '홍길동n1');
select pg_temp.expect_text('계약 칸이 비어 있는 기관(위닝)은 건드리지 않는다', pg_temp.pname('c1'), '홍길동c1');
select pg_temp.expect_bool('반환: 처리 기관 1, 익명화 2, 보호 1',
  (select tenants_processed = 1 and members_anonymized = 2 and members_protected = 1 from anon_result), true);

-- 삭제 로그: 실행 일시, 실행자, 기관, 계약 종료일, 삭제 건수, 제외 건수, 회원번호 목록. 이름과 연락처는 없다.
select pg_temp.expect_int('member_purge 로그는 기관당 한 줄',
  (select count(*) from public.admin_access_logs where action = 'member_purge' and tenant_id = pg_temp.fx('ten_ended')), 1);
select pg_temp.expect_bool('로그에 건수, 계약 종료일, 회원번호 목록이 있다',
  (select l.row_count = 2
      and l.actor_kind is not null and l.actor_login_id is not null
      and (l.meta ->> 'contract_end_date')::date = pg_temp.today() - 40
      and (l.meta ->> 'deleted_count')::int = 2
      and (l.meta ->> 'excluded_count')::int = 1
      and l.meta -> 'member_ids' @> to_jsonb(pg_temp.fx('m_s1')::text)
      and l.meta -> 'member_ids' @> to_jsonb(pg_temp.fx('m_s3old')::text)
      and not (l.meta -> 'member_ids' @> to_jsonb(pg_temp.fx('m_s2paid')::text))
     from public.admin_access_logs l where l.action = 'member_purge' and l.tenant_id = pg_temp.fx('ten_ended')), true);
select pg_temp.expect_bool('로그에 이름과 전화번호가 남지 않는다',
  (select l.meta::text !~ '홍길동|0107' from public.admin_access_logs l
    where l.action = 'member_purge' and l.tenant_id = pg_temp.fx('ten_ended')), true);

select pg_temp.expect_int('재실행은 아무것도 바꾸지 않고 로그도 더하지 않는다',
  (select members_anonymized from public.fn_anonymize_expired_b2b_members()), 0);
select pg_temp.expect_int('재실행 뒤에도 로그는 한 줄',
  (select count(*) from public.admin_access_logs where action = 'member_purge' and tenant_id = pg_temp.fx('ten_ended')), 1);

-- 공통 유예 일수(app_settings.contract_grace_days = 30)를 두면 종료일 + 30일이 지난 기관이 대상이 된다.
insert into public.app_settings (key, value) values ('contract_grace_days', '30'::jsonb)
  on conflict (key) do update set value = '30'::jsonb;
select pg_temp.expect_int('공통 일수 30: 종료 100일 뒤 기관이 처리된다',
  (select members_anonymized from public.fn_anonymize_expired_b2b_members()), 1);
select pg_temp.expect_text('공통 일수로 처리된 기관의 학생', pg_temp.pname('n1'), '삭제된 학생');
select pg_temp.expect_text('종료 10일 뒤(유예 30일 안) 기관은 여전히 그대로', pg_temp.pname('g1'), '홍길동g1');
select pg_temp.expect_text('기관별 유예 종료일이 공통 일수보다 우선한다', pg_temp.pname('e1'), '홍길동e1');
delete from public.app_settings where key = 'contract_grace_days';

-- 본사 수동 실행: 기관 하나만, 유예가 끝난 경우에만, 실행자는 본사 관리자다(사 #162, #176).
select pg_temp.mk_tenant('manA', 'RPMMAAAA', pg_temp.today() - 50, pg_temp.today() - 5);   -- 유예 지남
select pg_temp.mk_tenant('manB', 'RPMMBBBB', pg_temp.today() - 50, pg_temp.today() - 5);   -- 유예 지남(다른 기관)
select pg_temp.mk_tenant('manC', 'RPMMCCCC', pg_temp.today() - 10, pg_temp.today() + 20);  -- 유예 안
select pg_temp.mk_member('ma1', 'manA', 'student', 11);
select pg_temp.mk_member('mb1', 'manB', 'student', 12);
select pg_temp.mk_member('mc1', 'manC', 'student', 13);
create temp table man_not_yet as
  select * from public.fn_anonymize_expired_b2b_members(pg_temp.fx('ten_manC'), pg_temp.fx('m_t1'), 'hq@example.com');
select pg_temp.expect_bool('유예 안 기관을 지정하면 not_yet 과 유예 종료일을 돌려주고 아무것도 지우지 않는다',
  (select not_yet and grace_end = pg_temp.today() + 20 and members_anonymized = 0 from man_not_yet), true);
select pg_temp.expect_text('유예 안 기관의 학생은 그대로', pg_temp.pname('mc1'), '홍길동mc1');
select pg_temp.expect_int('유예 안 기관은 로그도 남지 않는다',
  (select count(*) from public.admin_access_logs where action = 'member_purge' and tenant_id = pg_temp.fx('ten_manC')), 0);

create temp table man_ok as
  select * from public.fn_anonymize_expired_b2b_members(pg_temp.fx('ten_manA'), pg_temp.fx('m_t1'), 'hq@example.com');
select pg_temp.expect_bool('지정한 기관은 처리되고 not_yet 이 아니다',
  (select not not_yet and members_anonymized = 1 and members_protected = 0 and tenants_processed = 1 from man_ok), true);
select pg_temp.expect_text('지정한 기관의 학생은 익명화된다', pg_temp.pname('ma1'), '삭제된 학생');
select pg_temp.expect_text('유예가 지났어도 지정하지 않은 다른 기관은 그대로', pg_temp.pname('mb1'), '홍길동mb1');
select pg_temp.expect_bool('로그의 실행자는 본사 관리자(프로필, 이메일)이고 시스템 아이디가 아니다',
  (select l.actor_kind = 'hq' and l.profile_id = pg_temp.fx('m_t1') and l.actor_email = 'hq@example.com'
      and l.actor_login_id is null
     from public.admin_access_logs l where l.action = 'member_purge' and l.tenant_id = pg_temp.fx('ten_manA')), true);
select pg_temp.expect_bool('실행자를 주지 않은 전체 실행은 시스템 아이디로 남는다',
  (select l.actor_login_id = 'system:b2b-retention-purge' and l.profile_id is null
     from public.admin_access_logs l where l.action = 'member_purge' and l.tenant_id = pg_temp.fx('ten_ended')), true);

-- ---------------------------------------------------------------------
-- 클라이언트 role 차단
-- ---------------------------------------------------------------------
grant execute on function pg_temp.expect_error(text, text, text) to anon, authenticated;
set local role anon;
select pg_temp.expect_error('anon 은 fn_purge_b2b_retention 실행 불가',
  $$select * from public.fn_purge_b2b_retention()$$, '42501');
reset role;
set local role authenticated;
select pg_temp.expect_error('authenticated 는 fn_purge_b2b_retention 실행 불가',
  $$select * from public.fn_purge_b2b_retention()$$, '42501');
reset role;
set local role anon;
select pg_temp.expect_error('anon 은 fn_anonymize_expired_b2b_members 실행 불가',
  $$select * from public.fn_anonymize_expired_b2b_members()$$, '42501');
reset role;
set local role authenticated;
select pg_temp.expect_error('authenticated 는 fn_anonymize_expired_b2b_members 실행 불가',
  $$select * from public.fn_anonymize_expired_b2b_members()$$, '42501');
reset role;

do $$ begin raise notice '=== b2b-retention-purge.spec: 전체 통과 ==='; end $$;

rollback;
