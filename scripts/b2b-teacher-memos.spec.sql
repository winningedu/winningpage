-- =====================================================================
-- B2B 기반 13: 교사 메모 테이블과 메모 보관 기간 SQL 스펙
--
-- 실행: 마이그레이션이 전부 적용된 스택에서
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/b2b-teacher-memos.spec.sql
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
  values ('TMAAAAAA', 'memo-a', '서울', '학교', 'B');
insert into fx select 'ta', id from public.tenants where code = 'TMAAAAAA';
insert into public.tenants (code, name, region, org_type, tier)
  values ('TMBBBBBB', 'memo-b', '서울', '학교', 'B');
insert into fx select 'tb', id from public.tenants where code = 'TMBBBBBB';
insert into fx values
  ('stu', pg_temp.mk_user('memo-stu@t.local')),
  ('grad2', pg_temp.mk_user('memo-g2@t.local')),   -- 2년 전 졸업
  ('grad1', pg_temp.mk_user('memo-g1@t.local')),   -- 1년 하루 전 졸업
  ('grad0', pg_temp.mk_user('memo-g0@t.local')),   -- 1년이 안 됨
  ('back', pg_temp.mk_user('memo-bk@t.local')),    -- 옛 졸업 기록이 있지만 지금 재학 중
  ('regrad', pg_temp.mk_user('memo-rg@t.local')),  -- 같은 기관에서 2년 전과 석 달 전 두 번 졸업
  ('split', pg_temp.mk_user('memo-sp@t.local')),   -- A 에서 2년 전 졸업, B 에서 재학 중
  ('flagged', pg_temp.mk_user('memo-fl@t.local')), -- 졸업 2년 하루, 특이학생과 상담 상태가 있다
  ('flag1', pg_temp.mk_user('memo-f1@t.local')),   -- 졸업 1년 하루, 특이학생과 상담 상태가 있다
  ('adm1', pg_temp.mk_user('memo-ad1@t.local')),
  ('adm2', pg_temp.mk_user('memo-ad2@t.local'));
create function pg_temp.fx(p_k text) returns uuid language sql as $$ select v from fx where k = p_k $$;

insert into public.teachers (tenant_id, name, phone, role, login_id)
  values (pg_temp.fx('ta'), '메모교사', '01099990001', 'homeroom', 'TMAAAAAAK2AAAA');
insert into fx select 'teacher', id from public.teachers where phone = '01099990001';

-- 본사 대행 세션 둘(관리자당 열린 세션은 하나)
insert into public.proxy_sessions (admin_profile_id, tenant_id, reason, expires_at)
  values (pg_temp.fx('adm1'), pg_temp.fx('ta'), 'roster_proxy', now() + interval '8 hours'),
         (pg_temp.fx('adm2'), pg_temp.fx('ta'), 'roster_proxy', now() + interval '8 hours');
insert into fx select 'px1', id from public.proxy_sessions where admin_profile_id = pg_temp.fx('adm1');
insert into fx select 'px2', id from public.proxy_sessions where admin_profile_id = pg_temp.fx('adm2');

create function pg_temp.memo(p_student text, p_body text, p_request uuid default gen_random_uuid(), p_tenant text default 'ta') returns void
language sql as $$
  insert into public.teacher_memos (tenant_id, student_id, author_teacher_id, body, request_id)
  values (pg_temp.fx(p_tenant), pg_temp.fx(p_student), pg_temp.fx('teacher'), p_body, p_request)
$$;
create function pg_temp.pmemo(p_student text, p_session text, p_body text, p_request uuid default gen_random_uuid(), p_tenant text default 'ta') returns void
language sql as $$
  insert into public.teacher_memos (tenant_id, student_id, proxy_session_id, body, request_id)
  values (pg_temp.fx(p_tenant), pg_temp.fx(p_student), pg_temp.fx(p_session), p_body, p_request)
$$;

-- 저장: 본문 검사와 요청 키
select pg_temp.expect_ok('메모 저장', $$select pg_temp.memo('stu', '진로 상담 필요', '00000000-0000-0000-0000-0000000000a1')$$);
select pg_temp.expect_error('빈 본문 거부', $$select pg_temp.memo('stu', '   ')$$, '23514');
select pg_temp.expect_error('2001자 본문 거부', $$select pg_temp.memo('stu', repeat('가', 2001))$$, '23514');
select pg_temp.expect_ok('2000자 본문 허용', $$select pg_temp.memo('stu', repeat('가', 2000))$$);
select pg_temp.expect_error('같은 작성자의 같은 요청 키는 한 줄만',
  $$select pg_temp.memo('stu', '다시 저장', '00000000-0000-0000-0000-0000000000a1')$$, '23505');
select pg_temp.expect_text('저장 직후 hidden_at 은 비어 있다',
  (select (hidden_at is null)::text from public.teacher_memos where request_id = '00000000-0000-0000-0000-0000000000a1'), 'true');

-- 본사 대행 메모(결정 63): 작성자는 교사 또는 대행 세션 중 정확히 하나
select pg_temp.expect_ok('대행 세션 메모 저장',
  $$select pg_temp.pmemo('stu', 'px1', '대행 입력', '00000000-0000-0000-0000-0000000000b1')$$);
select pg_temp.expect_error('같은 대행 세션의 같은 요청 키는 한 줄만',
  $$select pg_temp.pmemo('stu', 'px1', '다시', '00000000-0000-0000-0000-0000000000b1')$$, '23505');
select pg_temp.expect_ok('다른 대행 세션은 같은 요청 키를 쓸 수 있다',
  $$select pg_temp.pmemo('stu', 'px2', '다른 세션', '00000000-0000-0000-0000-0000000000b1')$$);
select pg_temp.expect_ok('교사도 같은 요청 키를 쓸 수 있다',
  $$select pg_temp.memo('stu', '교사 입력', '00000000-0000-0000-0000-0000000000b1')$$);
select pg_temp.expect_error('작성자가 둘 다 비면 거부',
  $$insert into public.teacher_memos (tenant_id, student_id, body, request_id)
    values (pg_temp.fx('ta'), pg_temp.fx('stu'), 'x', gen_random_uuid())$$, '23514');
select pg_temp.expect_error('작성자가 둘 다 있으면 거부',
  $$insert into public.teacher_memos (tenant_id, student_id, author_teacher_id, proxy_session_id, body, request_id)
    values (pg_temp.fx('ta'), pg_temp.fx('stu'), pg_temp.fx('teacher'), pg_temp.fx('px1'), 'x', gen_random_uuid())$$, '23514');
select pg_temp.expect_error('메모가 있는 대행 세션 삭제 거부',
  $$delete from public.proxy_sessions where id = pg_temp.fx('px1')$$, '23503');

-- 작성자 교사는 메모가 있으면 지울 수 없다(작성자가 남는다)
select pg_temp.expect_error('메모가 있는 교사 행 삭제 거부',
  $$delete from public.teachers where id = pg_temp.fx('teacher')$$, '23503');

-- 클라이언트 role 은 읽고 쓸 수 없다(학생과 학부모에게 보이지 않는다)
grant execute on function pg_temp.expect_error(text, text, text) to anon, authenticated;
set local role anon;
select pg_temp.expect_error('anon 은 teacher_memos 조회 불가', $$select count(*) from public.teacher_memos$$, '42501');
reset role;
set local role authenticated;
select pg_temp.expect_error('authenticated 는 teacher_memos 조회 불가', $$select count(*) from public.teacher_memos$$, '42501');
select pg_temp.expect_error('authenticated 는 teacher_memos 저장 불가',
  $$insert into public.teacher_memos (tenant_id, student_id, author_teacher_id, body, request_id)
    values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'x', gen_random_uuid())$$, '42501');
reset role;

-- 보관: 졸업 1년이 지난 학생의 메모만 지운다(학적은 2년)
create function pg_temp.enr(p_student text, p_year integer, p_graduated interval) returns void
language sql as $$
  insert into public.student_enrollments (tenant_id, student_id, school_year, status, graduated_at)
  values (pg_temp.fx('ta'), pg_temp.fx(p_student), p_year,
    case when p_graduated is null then 'active' else 'graduated' end,
    case when p_graduated is null then null else now() - p_graduated end)
$$;
select pg_temp.enr('grad2', 2023, interval '2 years');
select pg_temp.enr('grad1', 2024, interval '1 year 1 day');
select pg_temp.enr('grad0', 2025, interval '364 days');
select pg_temp.enr('back', 2020, interval '5 years');
select pg_temp.enr('back', 2026, null);
select pg_temp.enr('stu', 2026, null);
-- 같은 기관에서 두 번 졸업: 메모 기준은 그 기관의 마지막 졸업일(석 달 전)이라 보존
select pg_temp.enr('regrad', 2020, interval '5 years');
select pg_temp.enr('regrad', 2025, interval '3 months');
-- 기관마다 따로: A 는 2년 전 졸업이라 지우고 B 는 재학 중이라 보존
select pg_temp.enr('split', 2023, interval '2 years');
insert into public.student_enrollments (tenant_id, student_id, school_year, status)
  values (pg_temp.fx('tb'), pg_temp.fx('split'), 2026, 'active');
select pg_temp.enr('flagged', 2023, interval '2 years 1 day');
select pg_temp.enr('flag1', 2024, interval '1 year 1 day');
select pg_temp.memo('grad2', '2년 전 졸업');
select pg_temp.memo('grad1', '1년 하루 전 졸업');
select pg_temp.memo('grad0', '1년 안 된 졸업');
select pg_temp.memo('back', '옛 졸업 기록이 있지만 재학 중');
select pg_temp.memo('regrad', '두 번 졸업, 마지막은 석 달 전');
select pg_temp.memo('split', 'A 기관 메모');
select pg_temp.memo('split', 'B 기관 메모', gen_random_uuid(), 'tb');
select pg_temp.pmemo('grad1', 'px1', '대행 메모도 같은 기준');
select pg_temp.pmemo('grad0', 'px1', '1년 안 된 대행 메모');
insert into public.student_flags (tenant_id, student_id) values
  (pg_temp.fx('ta'), pg_temp.fx('flagged')), (pg_temp.fx('ta'), pg_temp.fx('flag1')), (pg_temp.fx('ta'), pg_temp.fx('stu'));
insert into public.counsel_statuses (tenant_id, student_id, school_year, status) values
  (pg_temp.fx('ta'), pg_temp.fx('flagged'), 2023, 'done'), (pg_temp.fx('ta'), pg_temp.fx('flag1'), 2024, 'done'),
  (pg_temp.fx('ta'), pg_temp.fx('stu'), 2026, 'needed');

create temp table purge_result as select * from public.fn_purge_b2b_retention();
create function pg_temp.memo_n(p_student text, p_tenant text default 'ta') returns bigint language sql as $$
  select count(*) from public.teacher_memos where student_id = pg_temp.fx(p_student) and tenant_id = pg_temp.fx(p_tenant)
$$;
select pg_temp.expect_int('졸업 2년 메모 삭제', pg_temp.memo_n('grad2'), 0);
select pg_temp.expect_int('졸업 1년 하루 메모와 대행 메모 삭제', pg_temp.memo_n('grad1'), 0);
select pg_temp.expect_int('졸업 1년 안 된 메모 보존(교사 메모와 대행 메모)', pg_temp.memo_n('grad0'), 2);
select pg_temp.expect_int('재학 중이면 옛 졸업 기록이 있어도 메모 보존', pg_temp.memo_n('back'), 1);
select pg_temp.expect_int('재학생 메모 보존', pg_temp.memo_n('stu'), 5);
select pg_temp.expect_int('마지막 졸업일이 1년 안이면 옛 졸업 기록이 있어도 메모 보존', pg_temp.memo_n('regrad'), 1);
select pg_temp.expect_int('A 기관은 졸업 2년이라 메모 삭제', pg_temp.memo_n('split'), 0);
select pg_temp.expect_int('B 기관은 재학 중이라 메모 보존', pg_temp.memo_n('split', 'tb'), 1);
select pg_temp.expect_int('졸업 1년 하루 학적은 2년 전까지 보존',
  (select count(*) from public.student_enrollments where student_id = pg_temp.fx('grad1')), 1);
select pg_temp.expect_int('졸업 2년 하루 학적은 삭제',
  (select count(*) from public.student_enrollments where student_id = pg_temp.fx('flagged')), 0);
select pg_temp.expect_int('졸업 2년 하루 특이학생 지정은 학적과 같이 삭제',
  (select count(*) from public.student_flags where student_id = pg_temp.fx('flagged')), 0);
select pg_temp.expect_int('졸업 2년 하루 상담 상태는 학적과 같이 삭제',
  (select count(*) from public.counsel_statuses where student_id = pg_temp.fx('flagged')), 0);
select pg_temp.expect_int('졸업 1년 하루 특이학생 지정은 보존',
  (select count(*) from public.student_flags where student_id = pg_temp.fx('flag1')), 1);
select pg_temp.expect_int('졸업 1년 하루 상담 상태는 보존',
  (select count(*) from public.counsel_statuses where student_id = pg_temp.fx('flag1')), 1);
select pg_temp.expect_int('재학생 특이학생 지정과 상담 상태는 보존',
  (select count(*) from public.student_flags where student_id = pg_temp.fx('stu'))
  + (select count(*) from public.counsel_statuses where student_id = pg_temp.fx('stu')), 2);
select pg_temp.expect_bool('반환 건수', (select memos_deleted >= 4 and student_flags_deleted >= 1 and counsel_statuses_deleted >= 1 from purge_result), true);
select pg_temp.expect_int('재실행은 지울 것이 없다',
  (select memos_deleted + student_flags_deleted + counsel_statuses_deleted from public.fn_purge_b2b_retention()), 0);

do $$ begin raise notice '=== b2b-teacher-memos.spec: 전체 통과 ==='; end $$;

rollback;
