-- QA 계정 보호 1: QA 계정 목록과 QA 본사 관리자의 브라우저 쓰기 차단.
--
-- 운영 DB(스쿨멘토)에는 QA 점검용 계정이 있다. qa_accounts 에 올라간 계정이 실제 운영에 닿는
-- 일을 하지 못하게 막는 첫 단계다. 이 마이그레이션은 스키마만 담는다. qa_accounts 행은 데이터 SQL 로 넣는다.
-- 위닝 DB 에서는 qa_accounts 가 비어 있어 아래 함수가 항상 false 를 돌려주고 동작이 달라지지 않는다.
--
-- WC104: QA 본사 관리자가 브라우저(authenticated JWT)로 public 테이블에 INSERT, UPDATE, DELETE 를 시도함.
-- 서버 라우트는 service_role 이라 auth.uid() 가 null 이어서 이 트리거를 타지 않는다. 라우트는 코드에서 막는다.

create table if not exists public.qa_accounts (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.qa_accounts is
  'QA 점검용 계정 목록. service_role 만 읽고 쓴다(RLS 켬, 정책 없음). 위닝 DB 에서는 비어 있다.';

alter table public.qa_accounts enable row level security;
revoke all on table public.qa_accounts from anon, authenticated;
grant all on table public.qa_accounts to service_role;

create or replace function public.fn_is_qa_account(p_profile_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.qa_accounts q where q.profile_id = p_profile_id);
$$;

comment on function public.fn_is_qa_account(uuid) is
  'qa_accounts 에 있는 계정이면 true. 인자가 null 이면 false. 서버 라우트(service_role)는 인자를 명시해서 부른다.';

revoke execute on function public.fn_is_qa_account(uuid) from public, anon;
grant execute on function public.fn_is_qa_account(uuid) to authenticated, service_role;

-- auth.uid() 가 있고(브라우저 세션) QA 계정이며 관리자이면 쓰기를 막는다.
-- 순서가 중요하다: JWT 없는 호출(postgres, service_role)은 첫 조건에서 바로 끝나고, QA 가 아닌 계정은 qa_accounts 조회 한 번으로 끝난다.
create or replace function public.fn_block_qa_admin_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null
     and public.fn_is_qa_account()
     and (public.is_admin() or public.fn_is_active_admin()) then
    raise exception 'QA 계정이라 이 기능은 작동하지 않아요.' using errcode = 'WC104';
  end if;
  return null;
end $$;

comment on function public.fn_block_qa_admin_write() is
  'QA 본사 관리자의 브라우저 쓰기 차단(WC104). 문 단위 BEFORE INSERT OR UPDATE OR DELETE 트리거 함수. service_role 과 postgres 롤(auth.uid() 가 null)은 통과.';

-- qa_accounts 를 뺀 모든 public 테이블에 건다. 관리자 화면이 열릴 때만으로 브라우저가 적는 테이블은 없어서(접속일은
-- /api/session-check 가 service_role 로 적는다) 제외할 테이블이 없다. 개인정보 반출 사유 기록(admin_access_logs)도 쓰기라 막힌다.
-- 이후에 만드는 테이블은 자동으로 붙지 않는다. scripts/b2b-qa-account-guard.spec.sql 이 빠진 테이블을 CI 에서 잡는다.
do $$
declare
  v_table text;
begin
  for v_table in
    select t.tablename from pg_tables t
     where t.schemaname = 'public' and t.tablename <> 'qa_accounts'
  loop
    execute format(
      'create or replace trigger trg_qa_admin_write_block
         before insert or update or delete on public.%I
         for each statement execute function public.fn_block_qa_admin_write()',
      v_table);
  end loop;
end $$;
