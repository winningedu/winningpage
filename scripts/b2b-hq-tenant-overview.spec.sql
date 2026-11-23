-- =====================================================================
-- 본사 대시보드 기관 현황 SQL 스펙: fn_hq_tenant_students, fn_hq_tenant_overview
-- (분석 grill Q5, Q9, 계획 4번 A1 A2 A3 A4, 계획 5번 시범기간 결정 117)
--
-- 실행: 마이그레이션이 전부 적용된 스택에서
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/b2b-hq-tenant-overview.spec.sql
--
-- 전체가 한 트랜잭션이고 마지막에 ROLLBACK 한다. 어떤 데이터도 남기지
-- 않는다. 단언 실패는 예외로 터져 psql 이 비정상 종료(ON_ERROR_STOP)한다.
-- =====================================================================
begin;

create function pg_temp.expect_int(t text, got bigint, want bigint) returns void
language plpgsql as $$
begin
  if got is distinct from want then
    raise exception '[FAIL] %: got %, want %', t, got, want;
  end if;
  raise notice '[PASS] % = %', t, want;
end $$;

create function pg_temp.expect_text(t text, got text, want text) returns void
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

create function pg_temp.today() returns date language sql as $$
  select (now() at time zone 'Asia/Seoul')::date
$$;

create temp table fx (k text primary key, v uuid);
create function pg_temp.fx(p_k text) returns uuid language sql as $$ select v from fx where k = p_k $$;

create function pg_temp.mk_tenant(p_key text, p_code text, p_start date, p_end date, p_grace date)
returns void language plpgsql as $$
declare
  v_id uuid;
begin
  insert into public.tenants (code, name, region, org_type, tier, school_year,
                              contract_start_date, contract_end_date, grace_ends_on)
  values (p_code, 'hqo-' || p_key, '서울', '학교', 'B', 2026, p_start, p_end, p_grace)
  returning id into v_id;
  insert into fx values (p_key, v_id);
end $$;

create function pg_temp.mk_user(p_key text, p_tenant uuid, p_member_type text, p_name text default null)
returns uuid language plpgsql as $$
declare
  v_id uuid := gen_random_uuid();
  v_email text := 'hqo-' || p_key || '@t.local';
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data
  ) values (
    v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    v_email, 'x', now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
  );
  insert into public.profiles (id, name, role, email, member_type, tenant_id)
  values (v_id, coalesce(p_name, 'hqo-' || p_key), 'user', v_email, p_member_type, p_tenant)
  on conflict (id) do update
    set name = excluded.name, member_type = excluded.member_type, tenant_id = excluded.tenant_id;
  insert into fx values (p_key, v_id);
  return v_id;
end $$;

create function pg_temp.enroll(p_key text, p_tenant text, p_year smallint, p_status text) returns void
language sql as $$
  insert into public.student_enrollments (tenant_id, student_id, school_year, grade, status, graduated_at)
  values (pg_temp.fx(p_tenant), pg_temp.fx(p_key), p_year, '고1', p_status,
          case when p_status = 'graduated' then now() end)
$$;

-- 유예 기본 일수를 30일로 고정한다(로컬 DB 값과 무관하게).
insert into public.app_settings (key, value) values ('contract_grace_days', '30'::jsonb)
  on conflict (key) do update set value = excluded.value;

-- 기관: A 는 학생, 선생님 규칙을 보는 기관이고 나머지는 계약 상태만 본다.
select pg_temp.mk_tenant('A', 'HQAAAAAA', pg_temp.today() - 100, pg_temp.today() + 200, null);
select pg_temp.mk_tenant('B', 'HQBBBBBB', null, null, null);
update public.tenants set school_year = 2027 where id = pg_temp.fx('B');
select pg_temp.mk_tenant('none', 'HQCCCCCC', null, null, null);
select pg_temp.mk_tenant('upcoming', 'HQDDDDDD', pg_temp.today() + 5, pg_temp.today() + 200, null);
select pg_temp.mk_tenant('active', 'HQEEEEEE', pg_temp.today() - 10, pg_temp.today() + 31, null);
select pg_temp.mk_tenant('open', 'HQFFFFFF', pg_temp.today() - 10, null, null);
select pg_temp.mk_tenant('soon30', 'HQGGGGGG', pg_temp.today() - 100, pg_temp.today() + 30, null);
select pg_temp.mk_tenant('soon0', 'HQHHHHHH', pg_temp.today() - 100, pg_temp.today(), null);
select pg_temp.mk_tenant('grace_default', 'HQJJJJJJ', pg_temp.today() - 100, pg_temp.today() - 10, null);
select pg_temp.mk_tenant('grace_set', 'HQKKKKKK', pg_temp.today() - 100, pg_temp.today() - 40, pg_temp.today() + 1);
select pg_temp.mk_tenant('expired', 'HQMMMMMM', pg_temp.today() - 100, pg_temp.today() - 31, null);
select pg_temp.mk_tenant('expired_set', 'HQNNNNNN', pg_temp.today() - 100, pg_temp.today() - 3, pg_temp.today() - 1);
-- 시범기간(결정 117): 계약 기간 안(active, ending_soon)이 아니고 오늘이 시범기간 안이면 trial.
select pg_temp.mk_tenant('trial_none', 'HQQQQQQQ', null, null, null);
select pg_temp.mk_tenant('trial_up', 'HQRRRRRR', pg_temp.today() + 5, pg_temp.today() + 200, null);
select pg_temp.mk_tenant('trial_active', 'HQSSSSSS', pg_temp.today() - 10, pg_temp.today() + 100, null);
select pg_temp.mk_tenant('trial_soon', 'HQTTTTTT', pg_temp.today() - 100, pg_temp.today() + 3, null);
select pg_temp.mk_tenant('trial_grace', 'HQUUUUUU', pg_temp.today() - 100, pg_temp.today() - 3, null);
select pg_temp.mk_tenant('trial_last', 'HQVVVVVV', null, null, null);
select pg_temp.mk_tenant('trial_over', 'HQWWWWWW', null, null, null);
select pg_temp.mk_tenant('trial_later', 'HQXXXXXX', null, null, null);
update public.tenants set trial_start_date = pg_temp.today() - 3, trial_end_date = pg_temp.today() + 3
 where id in (pg_temp.fx('trial_none'), pg_temp.fx('trial_up'), pg_temp.fx('trial_active'),
              pg_temp.fx('trial_soon'), pg_temp.fx('trial_grace'));
update public.tenants set trial_start_date = pg_temp.today() - 3, trial_end_date = pg_temp.today()
 where id = pg_temp.fx('trial_last');
update public.tenants set trial_start_date = pg_temp.today() - 10, trial_end_date = pg_temp.today() - 1
 where id = pg_temp.fx('trial_over');
update public.tenants set trial_start_date = pg_temp.today() + 1, trial_end_date = pg_temp.today() + 10
 where id = pg_temp.fx('trial_later');

-- 기타 소속(is_catch_all)은 전체에서 하나뿐이라 없을 때만 만든다.
insert into public.tenants (code, name, region, org_type, tier, is_catch_all)
select 'HQPPPPPP', 'hqo-etc', '서울', '기타', 'B', true
 where not exists (select 1 from public.tenants where is_catch_all);

-- 학생(Q9): A 의 학년도는 2026.
select pg_temp.mk_user('s_enrolled', pg_temp.fx('A'), 'student');
select pg_temp.enroll('s_enrolled', 'A', 2026::smallint, 'active');
select pg_temp.mk_user('s_unknown', pg_temp.fx('A'), 'student');
select pg_temp.mk_user('s_grad', pg_temp.fx('A'), 'student');
select pg_temp.enroll('s_grad', 'A', 2026::smallint, 'graduated');
select pg_temp.mk_user('s_old_year', pg_temp.fx('A'), 'student');
select pg_temp.enroll('s_old_year', 'A', 2025::smallint, 'active');
select pg_temp.mk_user('s_deleted', pg_temp.fx('A'), 'student', '삭제된 학생');
select pg_temp.mk_user('s_parent', pg_temp.fx('A'), 'parent');
select pg_temp.mk_user('s_qa', pg_temp.fx('A'), 'student');
select pg_temp.enroll('s_qa', 'A', 2026::smallint, 'active');
insert into public.qa_accounts (profile_id) values (pg_temp.fx('s_qa'));
select pg_temp.mk_user('s_admin', pg_temp.fx('A'), 'student');
insert into public.admin_members (profile_id, status) values (pg_temp.fx('s_admin'), 'active');
-- profiles.tenant_id 는 A 로 남았지만 올해 학적은 B 에 있다(졸업, 이동 뒤 tenant_id 가 안 지워진 경우).
select pg_temp.mk_user('s_moved', pg_temp.fx('A'), 'student');
select pg_temp.enroll('s_moved', 'B', 2027::smallint, 'active');

-- 선생님: 활성 2명(계정 없음, 계정 있음), 삭제 1, 비활성 1, QA 1.
select pg_temp.mk_user('t_account', pg_temp.fx('A'), 'teacher');
select pg_temp.mk_user('t_qa_account', pg_temp.fx('A'), 'teacher');
insert into public.qa_accounts (profile_id) values (pg_temp.fx('t_qa_account'));
insert into public.teachers (tenant_id, name, phone, role) values
  (pg_temp.fx('A'), '김활성', '01077770001', 'homeroom');
insert into public.teachers (tenant_id, name, phone, role, login_id, profile_id) values
  (pg_temp.fx('A'), '이계정', '01077770002', 'homeroom', 'HQAAAAAABCDEFG', pg_temp.fx('t_account')),
  (pg_temp.fx('A'), '최큐에이', '01077770005', 'homeroom', 'HQAAAAAABCDEFH', pg_temp.fx('t_qa_account'));
insert into public.teachers (tenant_id, name, phone, role, deleted_at) values
  (pg_temp.fx('A'), '박삭제', '01077770003', 'homeroom', now());
insert into public.teachers (tenant_id, name, phone, role, status) values
  (pg_temp.fx('A'), '정비활성', '01077770004', 'homeroom', 'inactive');

-- 마지막 활동 순간(A4): last_seen_at 과 profile_login_slots 중 늦은 순간.
update public.profiles set last_seen_at = ((pg_temp.today() - 5)::timestamp + interval '10 hours') at time zone 'Asia/Seoul'
 where id = pg_temp.fx('s_enrolled');
update public.profiles set last_seen_at = ((pg_temp.today() - 4)::timestamp + interval '23 hours 30 minutes') at time zone 'Asia/Seoul'
 where id = pg_temp.fx('t_account');
insert into public.profile_login_slots (profile_id, slot_start) values
  (pg_temp.fx('s_unknown'), ((pg_temp.today() - 3)::timestamp + interval '14 hours 15 minutes') at time zone 'Asia/Seoul'),
  (pg_temp.fx('s_unknown'), ((pg_temp.today() - 7)::timestamp + interval '9 hours') at time zone 'Asia/Seoul'),
  (pg_temp.fx('s_qa'), ((pg_temp.today() - 1)::timestamp + interval '8 hours 45 minutes') at time zone 'Asia/Seoul'),
  (pg_temp.fx('s_grad'), now() + interval '1 day');

create temp table ov_default as select * from public.fn_hq_tenant_overview(false);
create temp table ov_all as select * from public.fn_hq_tenant_overview(true);
create function pg_temp.ov(p_key text) returns ov_default language sql as $$
  select * from ov_default where tenant_id = pg_temp.fx(p_key)
$$;
create function pg_temp.ova(p_key text) returns ov_all language sql as $$
  select * from ov_all where tenant_id = pg_temp.fx(p_key)
$$;

-- ---------------------------------------------------------------------
-- 학생 수(Q9): 올해 활성 학적 또는 (학적이 하나도 없고 tenant_id 가 그 기관이며 이름이 '삭제된 학생'이 아님)
-- ---------------------------------------------------------------------
select pg_temp.expect_int('A 학생 수: 올해 활성 학적 1 + 학적 없는 학생 1',
  (pg_temp.ov('A')).student_count, 2);
select pg_temp.expect_int('A 학년, 반 미상(학적 없는 학생) 수',
  (pg_temp.ov('A')).student_without_enrollment_count, 1);
select pg_temp.expect_int('B 학생 수: tenant_id 가 A 로 남은 학생도 올해 학적이 있는 B 에서 센다',
  (pg_temp.ov('B')).student_count, 1);
select pg_temp.expect_bool('졸업, 작년 학적, 삭제된 학생, 학부모, 다른 기관 학적 학생은 A 학생 목록에 없다',
  not exists (select 1 from public.fn_hq_tenant_students(false) s
               where s.tenant_id = pg_temp.fx('A')
                 and s.profile_id in (pg_temp.fx('s_grad'), pg_temp.fx('s_old_year'), pg_temp.fx('s_deleted'),
                                      pg_temp.fx('s_parent'), pg_temp.fx('s_moved'))), true);
select pg_temp.expect_bool('학생 목록은 학적 여부를 함께 준다',
  (select bool_and(case s.profile_id when pg_temp.fx('s_unknown') then not s.has_enrollment else s.has_enrollment end)
     from public.fn_hq_tenant_students(false) s where s.tenant_id = pg_temp.fx('A')), true);

-- 기본 제외(Q3): QA 계정과 본사 관리자를 빼고, 포함 스위치를 켜면 센다.
select pg_temp.expect_int('포함 스위치: A 학생 수에 QA(학적 있음)와 관리자(학적 없음)가 더해진다',
  (pg_temp.ova('A')).student_count, 4);
select pg_temp.expect_int('포함 스위치: A 학년, 반 미상 수에 관리자 학생이 더해진다',
  (pg_temp.ova('A')).student_without_enrollment_count, 2);

-- ---------------------------------------------------------------------
-- 선생님 수: 삭제되지 않은 활성 선생님. 계정이 없는 선생님도 센다.
-- ---------------------------------------------------------------------
select pg_temp.expect_int('A 선생님 수: 활성 2명(계정 없음 포함), 삭제, 비활성, QA 는 빼고',
  (pg_temp.ov('A')).teacher_count, 2);
select pg_temp.expect_int('포함 스위치: QA 선생님도 센다',
  (pg_temp.ova('A')).teacher_count, 3);

-- ---------------------------------------------------------------------
-- 마지막 활동일(A4)
-- ---------------------------------------------------------------------
create function pg_temp.utc_text(p_ts timestamptz) returns text language sql as $$
  select to_char(p_ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
$$;
create function pg_temp.kst_at(p_day date, p_hm interval) returns timestamptz language sql as $$
  select (p_day::timestamp + p_hm) at time zone 'Asia/Seoul'
$$;

-- s_grad 의 미래 칸은 이 단언 전에 지워 A 의 마지막 활동을 s_unknown 칸으로 둔다.
delete from public.profile_login_slots where profile_id = pg_temp.fx('s_grad');
create temp table ov_default2 as select * from public.fn_hq_tenant_overview(false);
create temp table ov_all2 as select * from public.fn_hq_tenant_overview(true);
select pg_temp.expect_text('A 마지막 활동: last_seen_at 보다 늦은 로그인 칸의 순간',
  pg_temp.utc_text((select last_activity_at from ov_default2 where tenant_id = pg_temp.fx('A'))),
  pg_temp.utc_text(pg_temp.kst_at(pg_temp.today() - 3, interval '14 hours 15 minutes')));
select pg_temp.expect_text('포함 스위치: QA 학생의 로그인 칸이 더 늦다',
  pg_temp.utc_text((select last_activity_at from ov_all2 where tenant_id = pg_temp.fx('A'))),
  pg_temp.utc_text(pg_temp.kst_at(pg_temp.today() - 1, interval '8 hours 45 minutes')));
select pg_temp.expect_text('활동 기록이 없는 기관은 null',
  pg_temp.utc_text((select last_activity_at from ov_default2 where tenant_id = pg_temp.fx('none'))), null);
delete from public.profile_login_slots where profile_id = pg_temp.fx('s_unknown');
select pg_temp.expect_text('로그인 칸이 없으면 선생님 last_seen_at 순간(날짜가 아님)',
  pg_temp.utc_text((select o.last_activity_at from public.fn_hq_tenant_overview(false) o where o.tenant_id = pg_temp.fx('A'))),
  pg_temp.utc_text(pg_temp.kst_at(pg_temp.today() - 4, interval '23 hours 30 minutes')));

-- ---------------------------------------------------------------------
-- 기관 시간대(D1, D3): 시범, 계약 판정은 기관 time_zone 의 오늘로 한다.
-- 키리바시(+14)와 파고파고(-11)는 25시간 차라 오늘 날짜가 항상 다르다. 기본값 KST 로 판정하면 둘 중 하나는 틀린다.
-- ---------------------------------------------------------------------
select pg_temp.mk_tenant('tz_k_in', 'HQKKKKAA', null, null, null);
select pg_temp.mk_tenant('tz_k_out', 'HQKKKKBB', null, null, null);
select pg_temp.mk_tenant('tz_p_in', 'HQKKKKCC', null, null, null);
select pg_temp.mk_tenant('tz_p_out', 'HQKKKKDD', null, null, null);
update public.tenants set time_zone = 'Pacific/Kiritimati',
  trial_start_date = public.fn_local_date(now(), 'Pacific/Kiritimati') - 5,
  trial_end_date = public.fn_local_date(now(), 'Pacific/Kiritimati')
 where id = pg_temp.fx('tz_k_in');
update public.tenants set time_zone = 'Pacific/Kiritimati',
  trial_start_date = public.fn_local_date(now(), 'Pacific/Kiritimati') - 5,
  trial_end_date = public.fn_local_date(now(), 'Pacific/Kiritimati') - 1
 where id = pg_temp.fx('tz_k_out');
update public.tenants set time_zone = 'Pacific/Pago_Pago',
  trial_start_date = public.fn_local_date(now(), 'Pacific/Pago_Pago') - 5,
  trial_end_date = public.fn_local_date(now(), 'Pacific/Pago_Pago')
 where id = pg_temp.fx('tz_p_in');
update public.tenants set time_zone = 'Pacific/Pago_Pago',
  trial_start_date = public.fn_local_date(now(), 'Pacific/Pago_Pago') - 5,
  trial_end_date = public.fn_local_date(now(), 'Pacific/Pago_Pago') - 1
 where id = pg_temp.fx('tz_p_out');
create temp table ov_tz as select * from public.fn_hq_tenant_overview(false);
select pg_temp.expect_text('키리바시 기관, 시범 마지막 날(기관 오늘)이면 trial',
  (select contract_status from ov_tz where tenant_id = pg_temp.fx('tz_k_in')), 'trial');
select pg_temp.expect_text('키리바시 기관, 시범이 어제 끝났으면 none',
  (select contract_status from ov_tz where tenant_id = pg_temp.fx('tz_k_out')), 'none');
select pg_temp.expect_text('파고파고 기관, 시범 마지막 날(기관 오늘)이면 trial',
  (select contract_status from ov_tz where tenant_id = pg_temp.fx('tz_p_in')), 'trial');
select pg_temp.expect_text('파고파고 기관, 시범이 어제 끝났으면 none',
  (select contract_status from ov_tz where tenant_id = pg_temp.fx('tz_p_out')), 'none');
-- now() 는 못 바꾸므로 뉴욕 기관의 고정 순간 판정은 오늘 계산에 쓰는 fn_local_date 로 직접 본다.
select pg_temp.expect_bool('뉴욕 시범 종료 2026-11-30 은 2026-12-01T04:00Z 에 아직 시범 안',
  public.fn_local_date('2026-12-01T04:00:00Z'::timestamptz, 'America/New_York') <= date '2026-11-30', true);
select pg_temp.expect_bool('뉴욕 시범 종료 2026-11-30 은 2026-12-01T05:00Z 에 시범 밖',
  public.fn_local_date('2026-12-01T05:00:00Z'::timestamptz, 'America/New_York') <= date '2026-11-30', false);

-- ---------------------------------------------------------------------
-- 계약 상태(A2): none, upcoming, active, ending_soon(종료일까지 30일 이하), grace, expired
-- 유예 종료일 = coalesce(grace_ends_on, contract_end_date + app_settings.contract_grace_days)
-- ---------------------------------------------------------------------
select pg_temp.expect_text('계약일이 없으면 none', (pg_temp.ov('none')).contract_status, 'none');
select pg_temp.expect_text('시작 전이면 upcoming', (pg_temp.ov('upcoming')).contract_status, 'upcoming');
select pg_temp.expect_text('종료 31일 전이면 active', (pg_temp.ov('active')).contract_status, 'active');
select pg_temp.expect_text('종료일 없이 시작했으면 active', (pg_temp.ov('open')).contract_status, 'active');
select pg_temp.expect_text('종료 30일 전이면 ending_soon', (pg_temp.ov('soon30')).contract_status, 'ending_soon');
select pg_temp.expect_text('종료 당일이면 ending_soon', (pg_temp.ov('soon0')).contract_status, 'ending_soon');
select pg_temp.expect_text('종료 10일 뒤, 유예 기본 30일 안이면 grace', (pg_temp.ov('grace_default')).contract_status, 'grace');
select pg_temp.expect_text('유예 종료일 기본값 = 종료일 + 30일',
  (pg_temp.ov('grace_default')).grace_end::text, (pg_temp.today() + 20)::text);
select pg_temp.expect_text('grace_ends_on 이 있으면 그 날까지 grace', (pg_temp.ov('grace_set')).contract_status, 'grace');
select pg_temp.expect_text('종료 31일 뒤, 기본 유예도 지나면 expired', (pg_temp.ov('expired')).contract_status, 'expired');
select pg_temp.expect_text('grace_ends_on 이 지났으면 기본 일수 안이어도 expired',
  (pg_temp.ov('expired_set')).contract_status, 'expired');
select pg_temp.expect_text('계약 중인 기관의 grace_end 는 종료일 + 기본 일수',
  (pg_temp.ov('active')).grace_end::text, (pg_temp.today() + 61)::text);

-- 시범기간: trial 은 계약 기간 밖에서만 덮는다.
select pg_temp.expect_text('계약 없음, 시범기간 안이면 trial', (pg_temp.ov('trial_none')).contract_status, 'trial');
select pg_temp.expect_text('계약 시작 전, 시범기간 안이면 trial', (pg_temp.ov('trial_up')).contract_status, 'trial');
select pg_temp.expect_text('계약 중이면 시범기간이어도 active', (pg_temp.ov('trial_active')).contract_status, 'active');
select pg_temp.expect_text('종료 임박이면 시범기간이어도 ending_soon', (pg_temp.ov('trial_soon')).contract_status, 'ending_soon');
select pg_temp.expect_text('유예 중이어도 시범기간 안이면 trial', (pg_temp.ov('trial_grace')).contract_status, 'trial');
select pg_temp.expect_text('시범 마지막 날까지 trial', (pg_temp.ov('trial_last')).contract_status, 'trial');
select pg_temp.expect_text('시범이 끝나면 계약 상태로 돌아간다(none)', (pg_temp.ov('trial_over')).contract_status, 'none');
select pg_temp.expect_text('시범 시작 전이면 계약 상태 그대로(none)', (pg_temp.ov('trial_later')).contract_status, 'none');
select pg_temp.expect_text('시범 시작일과 종료일을 함께 준다',
  (pg_temp.ov('trial_none')).trial_start_date::text || '/' || (pg_temp.ov('trial_none')).trial_end_date::text,
  (pg_temp.today() - 3)::text || '/' || (pg_temp.today() + 3)::text);
select pg_temp.expect_text('시범이 없는 기관은 시범 날짜가 null',
  (pg_temp.ov('active')).trial_start_date::text, null);

delete from public.app_settings where key = 'contract_grace_days';
select pg_temp.expect_text('기본 유예 일수가 없고 grace_ends_on 도 없으면 종료 다음 날부터 expired',
  (select o.contract_status from public.fn_hq_tenant_overview(false) o where o.tenant_id = pg_temp.fx('grace_default')),
  'expired');

-- ---------------------------------------------------------------------
-- 범위와 권한
-- ---------------------------------------------------------------------
select pg_temp.expect_bool('기타 소속(is_catch_all) 기관은 나오지 않는다',
  not exists (select 1 from ov_default o join public.tenants t on t.id = o.tenant_id where t.is_catch_all), true);
select pg_temp.expect_text('기관 기본 정보를 함께 준다',
  (select o.name || '/' || o.region || '/' || o.org_type || '/' || o.contract_start_date::text
     from ov_default o where o.tenant_id = pg_temp.fx('A')),
  'hqo-A/서울/학교/' || (pg_temp.today() - 100)::text);
select pg_temp.expect_bool('두 함수는 security definer',
  (select bool_and(prosecdef) from pg_proc
    where oid in ('public.fn_hq_tenant_overview(boolean)'::regprocedure,
                  'public.fn_hq_tenant_students(boolean)'::regprocedure)), true);
select pg_temp.expect_bool('anon, authenticated 는 두 함수를 실행할 수 없다',
  not has_function_privilege('anon', 'public.fn_hq_tenant_overview(boolean)', 'execute')
  and not has_function_privilege('authenticated', 'public.fn_hq_tenant_overview(boolean)', 'execute')
  and not has_function_privilege('anon', 'public.fn_hq_tenant_students(boolean)', 'execute')
  and not has_function_privilege('authenticated', 'public.fn_hq_tenant_students(boolean)', 'execute'), true);
select pg_temp.expect_bool('service_role 은 두 함수를 실행할 수 있다',
  has_function_privilege('service_role', 'public.fn_hq_tenant_overview(boolean)', 'execute')
  and has_function_privilege('service_role', 'public.fn_hq_tenant_students(boolean)', 'execute'), true);

do $$ begin raise notice '=== b2b-hq-tenant-overview.spec: 전체 통과 ==='; end $$;

rollback;
