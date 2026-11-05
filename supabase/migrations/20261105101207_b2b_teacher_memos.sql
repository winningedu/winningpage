-- B2B 기반 13: 교사 메모(W9 개인종합코칭). 스키마만 바꾼다(새 테이블 1개, 정리 함수 교체).
-- 학생과 학부모에게는 보이지 않는다(교 #61, 결정 3): RLS 를 켜고 정책 없이 anon, authenticated 권한을 모두 회수하고
-- service_role 만 읽고 쓴다. 열람 범위(작성자와 학생의 현재 담임, 학교 관리자는 자기 메모만)는 콘솔 라우트가 정한다.
-- 작성자는 계정이 지워져도 남도록 teachers 행을 가리키되 지우지 못하게 막는다(사 #141, teachers 는 삭제 표시만 한다).
-- 본사 대행 중에는 교사 행이 없어 작성자를 대행 세션으로 남긴다(결정 63, 결정 10). 작성자는 교사 또는 대행 세션 중 정확히 하나이고
-- 대행 세션도 메모가 있으면 지우지 못한다.
-- 삭제는 작성자 본인만 화면에서 숨기는 것이라 hidden_at 만 채우고 행은 남긴다(교 #61, 결정 3).
-- request_id 는 같은 작성자(교사 또는 대행 세션)의 같은 저장 요청이 두 번 와도 한 줄만 남기는 키다.

create table public.teacher_memos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  author_teacher_id uuid references public.teachers (id) on delete restrict,
  proxy_session_id uuid references public.proxy_sessions (id) on delete restrict,
  body text not null check (btrim(body) <> '' and char_length(body) <= 2000),
  request_id uuid not null,
  created_at timestamptz not null default now(),
  hidden_at timestamptz,
  constraint teacher_memos_one_author check ((author_teacher_id is null) <> (proxy_session_id is null)),
  constraint teacher_memos_author_request_key unique (author_teacher_id, request_id),
  constraint teacher_memos_proxy_request_key unique (proxy_session_id, request_id)
);

create index teacher_memos_student_created_idx
  on public.teacher_memos (tenant_id, student_id, created_at desc);

alter table public.teacher_memos enable row level security;
revoke all on table public.teacher_memos from anon, authenticated;
grant all on table public.teacher_memos to service_role;

comment on table public.teacher_memos is '교사 메모. 학생과 학부모에게 보이지 않는다. 그 기관의 마지막 졸업일 1년 뒤 fn_purge_b2b_retention 이 지운다(결정 36, 64).';
comment on column public.teacher_memos.proxy_session_id is '본사 대행 중에 쓴 메모의 대행 세션. author_teacher_id 와 둘 중 정확히 하나만 값이 있다.';
comment on column public.teacher_memos.hidden_at is '작성자가 삭제한 시각. 값이 있으면 목록에서 빼지만 작성자와 시각은 남긴다.';
comment on column public.teacher_memos.request_id is '저장 요청 키(클라이언트가 만든 uuid). 같은 작성자(교사 또는 대행 세션)의 같은 키는 한 줄만 남는다.';

-- 보관 기간 정리 함수에 메모, 특이학생 지정, 상담 상태를 더한다(20261105052237 의 자리표시 주석). 반환 열이 늘어 함수를 새로 만든다.
-- 메모(결정 36, 64): 기관과 학생 한 쌍마다 그 기관의 마지막 졸업일(graduated_at 의 최댓값)이 1년 지났고 그 기관에 재학 중인 학적이 없을 때 지운다.
-- 다른 기관의 학적은 보지 않는다. 학적을 지우기 전에 메모를 먼저 지워야 졸업 시각을 읽을 수 있다.
-- 학적과 변경 이력은 그대로 졸업 2년이고, 특이학생 지정과 상담 상태는 학적과 같은 기관과 학생 한 쌍을 같이 지운다(결정 64).
-- 학적 쪽도 기관과 학생 한 쌍마다 그 기관의 마지막 졸업일이 2년 지났고 그 기관에 재학 중인 학적이 없을 때만 그 기관의 행을 지운다.
-- 상담 상태 테이블은 다음 마이그레이션(b2b_counsel_statuses)에서 만든다. plpgsql 본문은 실행할 때 테이블을 찾는다.
drop function public.fn_purge_b2b_retention();

create function public.fn_purge_b2b_retention()
returns table (
  enrollment_changes_deleted bigint,
  enrollments_deleted bigint,
  access_logs_deleted bigint,
  memos_deleted bigint,
  student_flags_deleted bigint,
  counsel_statuses_deleted bigint
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

  return query select v_changes, v_enrollments, v_logs, v_memos, v_flags, v_counsel;
end;
$$;

revoke all on function public.fn_purge_b2b_retention() from public, anon, authenticated;
grant execute on function public.fn_purge_b2b_retention() to service_role;
