-- =====================================================================
-- 자기평가서 v4.2 기반 스키마 SQL 스펙
--
-- 실행: 마이그레이션이 전부 적용된 스택에서
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/selfeval-v42-foundation.spec.sql
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

-- 픽스처: 학생 1명, 세션 1개, 활동 기록 2개
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data)
  values ('00000000-0000-0000-0000-0000000042a1', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'sev42-a@t.local', 'x', now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000042a2', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'sev42-b@t.local', 'x', now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);
insert into public.profiles (id, name, role, email)
  values ('00000000-0000-0000-0000-0000000042a1', 'sev42-a', 'user', 'sev42-a@t.local'),
  ('00000000-0000-0000-0000-0000000042a2', 'sev42-b', 'user', 'sev42-b@t.local')
  on conflict (id) do nothing;
insert into public.selfeval_sessions (id, profile_id)
  values ('00000000-0000-0000-0000-0000000042b1', '00000000-0000-0000-0000-0000000042a1');
insert into public.activity_records (id, profile_id, source_program, status)
  values ('00000000-0000-0000-0000-0000000042c1', '00000000-0000-0000-0000-0000000042a1', 'manual', 'draft'),
  ('00000000-0000-0000-0000-0000000042c2', '00000000-0000-0000-0000-0000000042a1', 'manual', 'draft');

-- ---------------------------------------------------------------------
-- A. activity_records 새 컬럼(명세 No.141, 146)
-- ---------------------------------------------------------------------
select pg_temp.expect_text('기존 행은 새 컬럼이 전부 null',
  (select (submitted_at is null and record_status is null and summary is null and reflection is null
           and parent_record_id is null and course_name is null and entry_kind is null)::text
     from public.activity_records where id = '00000000-0000-0000-0000-0000000042c1'), 'true');
select pg_temp.expect_ok('새 컬럼 값 저장',
  $$update public.activity_records
       set submitted_at = now(), record_status = 'in_progress', summary = '요약', reflection = '소감',
           parent_record_id = '00000000-0000-0000-0000-0000000042c2', course_name = '수학', entry_kind = 'deep'
     where id = '00000000-0000-0000-0000-0000000042c1'$$);
select pg_temp.expect_error('record_status 허용 밖 값 거부',
  $$update public.activity_records set record_status = 'done' where id = '00000000-0000-0000-0000-0000000042c1'$$, '23514');
select pg_temp.expect_error('entry_kind 허용 밖 값 거부',
  $$update public.activity_records set entry_kind = 'self' where id = '00000000-0000-0000-0000-0000000042c1'$$, '23514');
select pg_temp.expect_ok('상위 기록 삭제 시 parent_record_id 는 null 로',
  $$delete from public.activity_records where id = '00000000-0000-0000-0000-0000000042c2'$$);
select pg_temp.expect_text('parent_record_id set null',
  (select (parent_record_id is null)::text from public.activity_records where id = '00000000-0000-0000-0000-0000000042c1'), 'true');
insert into public.activity_records (id, profile_id, source_program, status)
  values ('00000000-0000-0000-0000-0000000042c2', '00000000-0000-0000-0000-0000000042a1', 'manual', 'draft');

-- ---------------------------------------------------------------------
-- B. selfeval_manual_logs(명세 No.159, 160, 188)
-- ---------------------------------------------------------------------
select pg_temp.expect_ok('manual_logs 기본값 insert',
  $$insert into public.selfeval_manual_logs (id, session_id, text)
    values ('00000000-0000-0000-0000-0000000042d1', '00000000-0000-0000-0000-0000000042b1', '기록')$$);
select pg_temp.expect_text('manual_logs 기본값 ocr/confirmed/included',
  (select ocr::text || confirmed::text || included::text || (written_at is null)::text || (belongs_to is null)::text
     from public.selfeval_manual_logs where id = '00000000-0000-0000-0000-0000000042d1'), 'falsefalsetruetruetrue');
select pg_temp.expect_error('manual_logs 빈 text 거부',
  $$insert into public.selfeval_manual_logs (session_id, text) values ('00000000-0000-0000-0000-0000000042b1', '')$$, '23514');
select pg_temp.expect_error('manual_logs 301자 text 거부',
  $$insert into public.selfeval_manual_logs (session_id, text) values ('00000000-0000-0000-0000-0000000042b1', repeat('가', 301))$$, '23514');
select pg_temp.expect_ok('manual_logs 300자 text 허용',
  $$insert into public.selfeval_manual_logs (session_id, text) values ('00000000-0000-0000-0000-0000000042b1', repeat('가', 300))$$);
select pg_temp.expect_ok('manual_logs belongs_to 연결',
  $$update public.selfeval_manual_logs set belongs_to = '00000000-0000-0000-0000-0000000042c1' where id = '00000000-0000-0000-0000-0000000042d1'$$);
select pg_temp.expect_ok('활동 기록 삭제 시 belongs_to 는 null 로',
  $$delete from public.activity_records where id = '00000000-0000-0000-0000-0000000042c2'$$);

-- ---------------------------------------------------------------------
-- C. selfeval_record_links(명세 No.175-186, 194)
-- ---------------------------------------------------------------------
insert into public.activity_records (id, profile_id, source_program, status)
  values ('00000000-0000-0000-0000-0000000042c2', '00000000-0000-0000-0000-0000000042a1', 'manual', 'draft');
select pg_temp.expect_ok('record_links insert',
  $$insert into public.selfeval_record_links (id, session_id, from_record_id, to_record_id, link_type, strength, source)
    values ('00000000-0000-0000-0000-0000000042e1', '00000000-0000-0000-0000-0000000042b1',
            '00000000-0000-0000-0000-0000000042c1', '00000000-0000-0000-0000-0000000042c2', 'deepen', 'explicit', 'model')$$);
select pg_temp.expect_text('record_links 기본값 confirmed/deleted',
  (select confirmed::text || deleted::text from public.selfeval_record_links where id = '00000000-0000-0000-0000-0000000042e1'), 'falsefalse');
select pg_temp.expect_error('record_links 같은 쌍 중복 거부',
  $$insert into public.selfeval_record_links (session_id, from_record_id, to_record_id, link_type, strength, source)
    values ('00000000-0000-0000-0000-0000000042b1', '00000000-0000-0000-0000-0000000042c1',
            '00000000-0000-0000-0000-0000000042c2', 'inherit', 'implicit', 'student')$$, '23505');
select pg_temp.expect_error('record_links 자기 자신 연결 거부',
  $$insert into public.selfeval_record_links (session_id, from_record_id, to_record_id, link_type, strength, source)
    values ('00000000-0000-0000-0000-0000000042b1', '00000000-0000-0000-0000-0000000042c1',
            '00000000-0000-0000-0000-0000000042c1', 'inherit', 'implicit', 'student')$$, '23514');
select pg_temp.expect_error('record_links 허용 밖 link_type 거부',
  $$insert into public.selfeval_record_links (session_id, from_record_id, to_record_id, link_type, strength, source)
    values ('00000000-0000-0000-0000-0000000042b1', '00000000-0000-0000-0000-0000000042c2',
            '00000000-0000-0000-0000-0000000042c1', 'other', 'implicit', 'student')$$, '23514');
select pg_temp.expect_error('record_links 허용 밖 strength 거부',
  $$insert into public.selfeval_record_links (session_id, from_record_id, to_record_id, link_type, strength, source)
    values ('00000000-0000-0000-0000-0000000042b1', '00000000-0000-0000-0000-0000000042c2',
            '00000000-0000-0000-0000-0000000042c1', 'inherit', 'weak', 'student')$$, '23514');
select pg_temp.expect_error('record_links 허용 밖 source 거부',
  $$insert into public.selfeval_record_links (session_id, from_record_id, to_record_id, link_type, strength, source)
    values ('00000000-0000-0000-0000-0000000042b1', '00000000-0000-0000-0000-0000000042c2',
            '00000000-0000-0000-0000-0000000042c1', 'inherit', 'implicit', 'system')$$, '23514');
select pg_temp.expect_ok('record_links 역방향 쌍은 별개 행',
  $$insert into public.selfeval_record_links (session_id, from_record_id, to_record_id, link_type, strength, source)
    select '00000000-0000-0000-0000-0000000042b1', '00000000-0000-0000-0000-0000000042c2',
           '00000000-0000-0000-0000-0000000042c1', t, 'implicit', 'student'
      from (values ('inherit')) as v(t)$$);

-- ---------------------------------------------------------------------
-- D. selfeval_report_views(명세 No.133, 173)
-- ---------------------------------------------------------------------
select pg_temp.expect_ok('report_views insert 기본값',
  $$insert into public.selfeval_report_views (session_id, final_revision, status)
    values ('00000000-0000-0000-0000-0000000042b1', 1, 'ready')$$);
select pg_temp.expect_text('report_views 기본값 payload/tag_map/attempts',
  (select payload::text || tag_map::text || attempts::text from public.selfeval_report_views
    where session_id = '00000000-0000-0000-0000-0000000042b1'), '{}{}0');
select pg_temp.expect_error('report_views 세션당 1행',
  $$insert into public.selfeval_report_views (session_id, final_revision, status)
    values ('00000000-0000-0000-0000-0000000042b1', 2, 'ready')$$, '23505');
select pg_temp.expect_error('report_views 허용 밖 status 거부',
  $$update public.selfeval_report_views set status = 'pending'$$, '23514');

-- ---------------------------------------------------------------------
-- E. student_profiles.service_tier(명세 No.135)
-- ---------------------------------------------------------------------
insert into public.student_profiles (profile_id) values ('00000000-0000-0000-0000-0000000042a1');
select pg_temp.expect_text('service_tier 기본 null',
  (select coalesce(service_tier, 'null') from public.student_profiles
    where profile_id = '00000000-0000-0000-0000-0000000042a1'), 'null');
select pg_temp.expect_ok('service_tier standard 허용',
  $$update public.student_profiles set service_tier = 'standard' where profile_id = '00000000-0000-0000-0000-0000000042a1'$$);
select pg_temp.expect_error('service_tier 허용 밖 값 거부',
  $$update public.student_profiles set service_tier = 'premium' where profile_id = '00000000-0000-0000-0000-0000000042a1'$$, '23514');

-- ---------------------------------------------------------------------
-- F. RLS: 세션 소유자만 읽고 쓰기는 service_role 만(명세 No.159-194)
-- ---------------------------------------------------------------------
create function pg_temp.visible_count() returns text
language sql as $$
  select (select count(*) from public.selfeval_manual_logs)::text || '/'
      || (select count(*) from public.selfeval_record_links)::text || '/'
      || (select count(*) from public.selfeval_report_views)::text
$$;
grant execute on function pg_temp.expect_ok(text, text) to authenticated, anon;
grant execute on function pg_temp.expect_error(text, text, text) to authenticated, anon;
grant execute on function pg_temp.expect_text(text, text, text) to authenticated, anon;
grant execute on function pg_temp.visible_count() to authenticated, anon;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000042a1', true);
select pg_temp.expect_text('소유자는 세션의 세 표를 읽는다', pg_temp.visible_count(), '2/2/1');
select pg_temp.expect_error('소유자도 manual_logs 를 쓸 수 없다',
  $$insert into public.selfeval_manual_logs (session_id, text) values ('00000000-0000-0000-0000-0000000042b1', 'x')$$, '42501');
select pg_temp.expect_error('소유자도 record_links 를 지울 수 없다',
  $$delete from public.selfeval_record_links$$, '42501');
select pg_temp.expect_error('소유자도 report_views 를 고칠 수 없다',
  $$update public.selfeval_report_views set attempts = 9$$, '42501');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000042a2', true);
select pg_temp.expect_text('다른 학생은 아무것도 읽지 못한다', pg_temp.visible_count(), '0/0/0');
reset role;

set local role anon;
select pg_temp.expect_error('anon 은 manual_logs 를 읽을 수 없다',
  $$select count(*) from public.selfeval_manual_logs$$, '42501');
reset role;

-- ---------------------------------------------------------------------
-- G. fn_selfeval_claim_step 의 link 단계(명세 No.174, 17)
-- ---------------------------------------------------------------------
select pg_temp.expect_text('link: 기본 입력 전(current_step 0)은 순서 거부',
  public.fn_selfeval_claim_step('00000000-0000-0000-0000-0000000042b1', '00000000-0000-0000-0000-0000000042a1', 'link')::text,
  '{"kind": "order", "currentStep": 0}');
update public.selfeval_sessions set current_step = 1 where id = '00000000-0000-0000-0000-0000000042b1';
select pg_temp.expect_text('link: 활동 선택 단계(current_step 1)에서 선점',
  public.fn_selfeval_claim_step('00000000-0000-0000-0000-0000000042b1', '00000000-0000-0000-0000-0000000042a1', 'link')::text,
  '{"kind": "claimed", "attempts": 1}');
select pg_temp.expect_text('link: 선점 중이면 running',
  public.fn_selfeval_claim_step('00000000-0000-0000-0000-0000000042b1', '00000000-0000-0000-0000-0000000042a1', 'link')::text,
  '{"kind": "running"}');
select pg_temp.expect_text('link: 단계 상태에 attempts 가 쌓인다',
  (select step_state -> 'steps' -> 'link' ->> 'attempts' from public.selfeval_sessions
    where id = '00000000-0000-0000-0000-0000000042b1'), '1');
update public.selfeval_sessions
   set step_state = jsonb_set(step_state, '{steps,link,attempts}', '10')
 where id = '00000000-0000-0000-0000-0000000042b1';
update public.selfeval_sessions
   set step_state = jsonb_set(step_state, '{steps,link,status}', '"failed"')
 where id = '00000000-0000-0000-0000-0000000042b1';
select pg_temp.expect_text('link: 시도 상한 10 에서 exhausted',
  public.fn_selfeval_claim_step('00000000-0000-0000-0000-0000000042b1', '00000000-0000-0000-0000-0000000042a1', 'link')::text,
  '{"kind": "exhausted", "attempts": 10}');
select pg_temp.expect_error('report 단계는 아직 허용하지 않는다',
  $$select public.fn_selfeval_claim_step('00000000-0000-0000-0000-0000000042b1', '00000000-0000-0000-0000-0000000042a1', 'report')$$, '22023');
select pg_temp.expect_text('analyze 순서 가드는 그대로(current_step 1 이면 order)',
  public.fn_selfeval_claim_step('00000000-0000-0000-0000-0000000042b1', '00000000-0000-0000-0000-0000000042a1', 'analyze')::text,
  '{"kind": "order", "currentStep": 1}');

-- ---------------------------------------------------------------------
-- H. fn_delete_account 가 새 표를 지운다(명세 No.95)
-- ---------------------------------------------------------------------
select pg_temp.expect_text('회원탈퇴: 주문 이력이 없으면 deleted',
  public.fn_delete_account('00000000-0000-0000-0000-0000000042a1'), 'deleted');
select pg_temp.expect_text('회원탈퇴: 새 표 3개와 세션이 남지 않는다',
  (select (select count(*) from public.selfeval_manual_logs)::text || '/'
       || (select count(*) from public.selfeval_record_links)::text || '/'
       || (select count(*) from public.selfeval_report_views)::text || '/'
       || (select count(*) from public.selfeval_sessions
            where profile_id = '00000000-0000-0000-0000-0000000042a1')::text), '0/0/0/0');

do $$ begin raise notice '=== selfeval-v42-foundation.spec: 전체 통과 ==='; end $$;

rollback;
