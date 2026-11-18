-- =====================================================================
-- 수행평가 최종본 활동 기록 승격 SQL 스펙: finalize_performance_submission
-- 이 새 최종본을 확정할 때 activity_records 에 한 행을 올린다
--
-- 실행: 마이그레이션이 전부 적용된 스택(로컬 스크래치 DB 복사본)에서
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/b2b-performance-activity-record.spec.sql
--
-- 전체가 한 트랜잭션이고 마지막에 ROLLBACK 한다. 어떤 데이터도 남기지
-- 않는다. 단언 실패는 예외로 터져 psql 이 비정상 종료(ON_ERROR_STOP)한다.
-- =====================================================================
begin;

create function pg_temp.expect_text(t text, got text, want text) returns void
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
  insert into public.profiles (id, name, role, email, member_type)
  values (v_id, p_email, 'user', p_email, 'student');
  return v_id;
end $$;

-- 세션, 주제(선택), 제출본, 평가 리포트를 한 벌 만든다. 키는 k 로 찾는다.
create temp table fx (k text primary key, profile_id uuid, session_id uuid, submission_id uuid);
grant select on fx to service_role;

create function pg_temp.mk_case(p_k text, p_grade text, p_semester text, p_with_topic boolean)
returns void language plpgsql as $$
declare
  v_profile uuid := pg_temp.mk_user(p_k || '@t.local');
  v_session uuid := gen_random_uuid();
  v_topic   uuid := gen_random_uuid();
  v_sub     uuid := gen_random_uuid();
begin
  insert into public.performance_sessions
    (id, profile_id, status, grade_label, semester, subject_group, subject, career_goal)
  values
    (v_session, v_profile, 'in_progress', p_grade, p_semester, '과학', '생명과학', '연구원');
  insert into public.performance_topics (id, session_id, idx, title)
  values (v_topic, v_session, 1, '세포 호흡 효율 탐구');
  if p_with_topic then
    update public.performance_sessions set selected_topic_id = v_topic where id = v_session;
  end if;
  insert into public.performance_submissions (id, session_id, fields)
  values (v_sub, v_session, '{}'::jsonb);
  insert into public.performance_reports (session_id, submission_id, report_type, sections)
  values (v_session, v_sub, 'evaluation', '{}'::jsonb);
  insert into fx values (p_k, v_profile, v_session, v_sub);
end $$;

create function pg_temp.fin(p_k text) returns text
language sql as $$
  select (public.finalize_performance_submission(
    f.session_id, f.profile_id, f.submission_id, 'confirm', '{}'::jsonb
  ) ->> 'status')
  from fx f where f.k = p_k
$$;
grant execute on function pg_temp.fin(text) to service_role;

create function pg_temp.cnt(p_k text) returns text
language sql as $$
  select count(*)::text from public.activity_records a, fx f
   where f.k = p_k and a.source_program = 'performance' and a.source_ref_id = f.session_id
$$;

create function pg_temp.col(p_k text, p_col text) returns text
language plpgsql as $$
declare v text;
begin
  execute format(
    'select a.%I::text from public.activity_records a, fx f
      where f.k = %L and a.source_program = ''performance'' and a.source_ref_id = f.session_id',
    p_col, p_k) into v;
  return v;
end $$;

select pg_temp.mk_case('base', '고2', '1학기', true);
select pg_temp.mk_case('sem2', '고1', '2학기', true);
select pg_temp.mk_case('bad', '중3', '여름학기', true);
select pg_temp.mk_case('notopic', '고3', '1학기', false);

-- 서버는 service_role 로만 호출한다(EXECUTE 는 service_role 에만 있다).
set local role service_role;
create temp table st (k text primary key, v text);
grant all on st to service_role;
insert into st select k, pg_temp.fin(k) from fx;
reset role;

-- 1. 새 최종본 확정은 활동 기록 한 행을 만든다
select pg_temp.expect_text('확정 결과', (select v from st where k = 'base'), 'finalized');
select pg_temp.expect_text('행 1개', pg_temp.cnt('base'), '1');
select pg_temp.expect_text('profile_id', pg_temp.col('base', 'profile_id'),
  (select profile_id::text from fx where k = 'base'));
select pg_temp.expect_text('status', pg_temp.col('base', 'status'), 'confirmed');
select pg_temp.expect_text('grade_label', pg_temp.col('base', 'grade_label'), '고2');
select pg_temp.expect_text('semester', pg_temp.col('base', 'semester'), '1');
select pg_temp.expect_text('subject_group 은 상수 교과', pg_temp.col('base', 'subject_group'), '교과');
select pg_temp.expect_text('subject', pg_temp.col('base', 'subject'), '생명과학');
select pg_temp.expect_text('topic 은 선택한 주제 제목', pg_temp.col('base', 'topic'), '세포 호흡 효율 탐구');
select pg_temp.expect_text('concept 비어 있음', pg_temp.col('base', 'concept'), null);
select pg_temp.expect_text('limitation 비어 있음', pg_temp.col('base', 'limitation'), null);
select pg_temp.expect_text('confirmed_at 있음', (pg_temp.col('base', 'confirmed_at') is not null)::text, 'true');

-- 2. 같은 제출본 재확정은 already_final 이고 행은 늘지 않는다
set local role service_role;
update st set v = pg_temp.fin('base') where k = 'base';
reset role;
select pg_temp.expect_text('재확정 결과', (select v from st where k = 'base'), 'already_final');
select pg_temp.expect_text('재확정 후에도 행 1개', pg_temp.cnt('base'), '1');

-- 3. 2학기는 semester 2
select pg_temp.expect_text('2학기 확정', (select v from st where k = 'sem2'), 'finalized');
select pg_temp.expect_text('2학기 semester', pg_temp.col('sem2', 'semester'), '2');
select pg_temp.expect_text('고1 grade_label', pg_temp.col('sem2', 'grade_label'), '고1');

-- 4. 허용 밖 학년과 학기는 NULL 로 두고 확정은 성공한다
select pg_temp.expect_text('허용 밖 값도 확정', (select v from st where k = 'bad'), 'finalized');
select pg_temp.expect_text('허용 밖 grade_label 은 NULL', pg_temp.col('bad', 'grade_label'), null);
select pg_temp.expect_text('허용 밖 semester 는 NULL', pg_temp.col('bad', 'semester'), null);
select pg_temp.expect_text('허용 밖 값이어도 행 1개', pg_temp.cnt('bad'), '1');

-- 5. 선택한 주제가 없으면 topic 은 NULL
select pg_temp.expect_text('주제 없음 확정', (select v from st where k = 'notopic'), 'finalized');
select pg_temp.expect_text('주제 없음 topic NULL', pg_temp.col('notopic', 'topic'), null);
select pg_temp.expect_text('주제 없음 행 1개', pg_temp.cnt('notopic'), '1');

rollback;
