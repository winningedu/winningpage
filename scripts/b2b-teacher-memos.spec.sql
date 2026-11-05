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
insert into fx values
  ('stu', pg_temp.mk_user('memo-stu@t.local')),
  ('grad2', pg_temp.mk_user('memo-g2@t.local')),   -- 2년 전 졸업
  ('grad1', pg_temp.mk_user('memo-g1@t.local')),   -- 1년 하루 전 졸업
  ('grad0', pg_temp.mk_user('memo-g0@t.local')),   -- 1년이 안 됨
  ('back', pg_temp.mk_user('memo-bk@t.local'));    -- 옛 졸업 기록이 있지만 지금 재학 중
create function pg_temp.fx(p_k text) returns uuid language sql as $$ select v from fx where k = p_k $$;

insert into public.teachers (tenant_id, name, phone, role, login_id)
  values (pg_temp.fx('ta'), '메모교사', '01099990001', 'homeroom', 'TMAAAAAAK0AAAA');
insert into fx select 'teacher', id from public.teachers where phone = '01099990001';

create function pg_temp.memo(p_student text, p_body text, p_request uuid default gen_random_uuid()) returns void
language sql as $$
  insert into public.teacher_memos (tenant_id, student_id, author_teacher_id, body, request_id)
  values (pg_temp.fx('ta'), pg_temp.fx(p_student), pg_temp.fx('teacher'), p_body, p_request)
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
select pg_temp.memo('grad2', '2년 전 졸업');
select pg_temp.memo('grad1', '1년 하루 전 졸업');
select pg_temp.memo('grad0', '1년 안 된 졸업');
select pg_temp.memo('back', '옛 졸업 기록이 있지만 재학 중');

create temp table purge_result as select * from public.fn_purge_b2b_retention();
create function pg_temp.memo_n(p_student text) returns bigint language sql as $$
  select count(*) from public.teacher_memos where student_id = pg_temp.fx(p_student)
$$;
select pg_temp.expect_int('졸업 2년 메모 삭제', pg_temp.memo_n('grad2'), 0);
select pg_temp.expect_int('졸업 1년 하루 메모 삭제', pg_temp.memo_n('grad1'), 0);
select pg_temp.expect_int('졸업 1년 안 된 메모 보존', pg_temp.memo_n('grad0'), 1);
select pg_temp.expect_int('재학 중이면 옛 졸업 기록이 있어도 메모 보존', pg_temp.memo_n('back'), 1);
select pg_temp.expect_int('재학생 메모 보존', pg_temp.memo_n('stu'), 2);
select pg_temp.expect_int('졸업 1년 하루 학적은 2년 전까지 보존',
  (select count(*) from public.student_enrollments where student_id = pg_temp.fx('grad1')), 1);
select pg_temp.expect_bool('반환 건수', (select memos_deleted >= 2 from purge_result), true);
select pg_temp.expect_int('재실행은 메모를 지우지 않는다', (select memos_deleted from public.fn_purge_b2b_retention()), 0);

do $$ begin raise notice '=== b2b-teacher-memos.spec: 전체 통과 ==='; end $$;

rollback;
