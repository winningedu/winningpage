-- 본사 통계 공통 기반(분석 grill Q1, Q3, Q13). 스키마만 바꾼다(판정 함수 1개, 새 테이블 1개, 정리 함수 교체).
--
-- 1. fn_hq_stat_included: 본사 통계 함수가 회원 한 명을 셀지 정한다. 기본 제외는 우리가 만든 QA 계정(qa_accounts)과
--    본사 관리자(admin_members 행이 있거나 profiles.role 이 admin)뿐이고 직원 개인 계정은 센다.
--    qa_accounts 는 테이블을 직접 읽는다. fn_is_qa_account 는 같은 테이블을 보지만 TS 의 isQaAccount 는 QA 차단 스위치가
--    꺼져 있으면 false 라서 통계에 쓰면 QA 계정이 섞인다. admin_members 는 상태(초대, 활성, 정지)를 보지 않는다.
--    화면의 "QA, 관리자 계정 포함" 스위치가 p_include_internal 이고, 켜면 모두 센다.
--    security invoker 인 SQL 한 줄짜리라 security definer 통계 함수 안에서 펼쳐져 행마다 함수 호출이 생기지 않는다.
-- 2. profile_login_days: 회원별 KST 하루 1행 로그인 기록(DAU, MAU 실측). /api/session-check 가 service_role 로
--    insert ... on conflict do nothing 한다. 기간 조회는 (kst_date, profile_id) 인덱스를 쓴다.
--    RLS 를 켜고 정책 없이 anon, authenticated 권한을 모두 회수한다. 본사 화면은 서버 라우트로만 읽는다.
-- 3. fn_purge_b2b_retention: 2년이 지난 로그인 기록을 지운다(접근 로그와 같은 2년). 반환 열이 늘어 함수를 새로 만든다.

create function public.fn_hq_stat_included(p_profile_id uuid, p_include_internal boolean)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select p_include_internal
      or not (
        exists (select 1 from public.qa_accounts q where q.profile_id = p_profile_id)
        or exists (select 1 from public.admin_members m where m.profile_id = p_profile_id)
        or exists (select 1 from public.profiles p where p.id = p_profile_id and p.role = 'admin')
      );
$$;

comment on function public.fn_hq_stat_included(uuid, boolean) is
  '본사 통계에서 이 회원을 세면 true. 기본 제외는 qa_accounts, admin_members(상태 무관), profiles.role admin. p_include_internal 이 true 면 모두 센다.';

revoke all on function public.fn_hq_stat_included(uuid, boolean) from public, anon, authenticated;
grant execute on function public.fn_hq_stat_included(uuid, boolean) to service_role;

create table public.profile_login_days (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kst_date date not null,
  first_seen_at timestamptz not null default now(),
  primary key (profile_id, kst_date)
);

create index profile_login_days_date_idx on public.profile_login_days (kst_date, profile_id);

alter table public.profile_login_days enable row level security;
revoke all on table public.profile_login_days from anon, authenticated;
grant all on table public.profile_login_days to service_role;

-- 새 테이블은 QA 본사 관리자 쓰기 차단 트리거가 자동으로 붙지 않는다(20261110040330_qa_account_guard.sql).
create trigger trg_qa_admin_write_block
  before insert or update or delete on public.profile_login_days
  for each statement execute function public.fn_block_qa_admin_write();

comment on table public.profile_login_days is
  '회원별 KST 하루 1행 로그인 기록. /api/session-check 가 적는다. 2년이 지나면 fn_purge_b2b_retention 이 지운다.';
comment on column public.profile_login_days.kst_date is '그 회원이 로그인 상태로 앱을 쓴 KST 날짜.';
comment on column public.profile_login_days.first_seen_at is '그날 처음 적힌 시각.';

-- 보관 기간 정리 함수에 로그인 기록을 더한다(20261105101207_b2b_teacher_memos.sql 의 본문에 마지막 삭제 하나를 붙인다).
drop function public.fn_purge_b2b_retention();

create function public.fn_purge_b2b_retention()
returns table (
  enrollment_changes_deleted bigint,
  enrollments_deleted bigint,
  access_logs_deleted bigint,
  memos_deleted bigint,
  student_flags_deleted bigint,
  counsel_statuses_deleted bigint,
  login_days_deleted bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenants uuid[];
  v_students uuid[];
  v_changes bigint;
  v_enrollments bigint;
  v_logs bigint;
  v_memos bigint;
  v_flags bigint;
  v_counsel bigint;
  v_login_days bigint;
begin
  delete from public.teacher_memos m
   using (
     select e.tenant_id, e.student_id
       from public.student_enrollments e
      where e.status = 'graduated'
      group by e.tenant_id, e.student_id
     having max(e.graduated_at) < now() - interval '1 year'
        and not exists (
          select 1 from public.student_enrollments a
           where a.tenant_id = e.tenant_id and a.student_id = e.student_id and a.status = 'active'
        )
   ) g
   where m.tenant_id = g.tenant_id and m.student_id = g.student_id;
  get diagnostics v_memos = row_count;

  select coalesce(array_agg(g.tenant_id), '{}'), coalesce(array_agg(g.student_id), '{}')
    into v_tenants, v_students
    from (
      select e.tenant_id, e.student_id
        from public.student_enrollments e
       where e.status = 'graduated'
       group by e.tenant_id, e.student_id
      having max(e.graduated_at) < now() - interval '2 years'
         and not exists (
           select 1 from public.student_enrollments a
            where a.tenant_id = e.tenant_id and a.student_id = e.student_id and a.status = 'active'
         )
    ) g;

  delete from public.student_flags f
   where (f.tenant_id, f.student_id) in (select * from unnest(v_tenants, v_students));
  get diagnostics v_flags = row_count;

  delete from public.counsel_statuses c
   where (c.tenant_id, c.student_id) in (select * from unnest(v_tenants, v_students));
  get diagnostics v_counsel = row_count;

  delete from public.enrollment_changes c
   where (c.tenant_id, c.student_id) in (select * from unnest(v_tenants, v_students));
  get diagnostics v_changes = row_count;

  delete from public.student_enrollments e
   where (e.tenant_id, e.student_id) in (select * from unnest(v_tenants, v_students));
  get diagnostics v_enrollments = row_count;

  delete from public.admin_access_logs l
   where l.actor_kind is not null
     and ((l.action = 'member_purge' and l.created_at < now() - interval '1 year')
       or (l.action <> 'member_purge' and l.created_at < now() - interval '2 years'));
  get diagnostics v_logs = row_count;

  delete from public.profile_login_days d
   where d.kst_date < ((now() at time zone 'Asia/Seoul')::date - interval '2 years')::date;
  get diagnostics v_login_days = row_count;

  return query select v_changes, v_enrollments, v_logs, v_memos, v_flags, v_counsel, v_login_days;
end;
$$;

revoke all on function public.fn_purge_b2b_retention() from public, anon, authenticated;
grant execute on function public.fn_purge_b2b_retention() to service_role;
