-- B2B 기반 6: 접근 로그 확장. 교사 콘솔의 조회, 변경, 대행을 기존 admin_access_logs 에 남긴다.
-- 컬럼은 모두 null 이거나 기본값이 있고 CHECK 는 넓히기만 하므로 기존 본사 행과 위닝 사이트 동작은 바뀌지 않는다.
-- super 조회 정책은 그대로다. 위닝 관리자 본인 insert 정책은 예전 본사 행만 넣게 좁힌다(아래).
-- 콘솔 행은 service_role 이 넣는다.
-- proxy_session_id 의 FK 는 proxy_sessions 를 만드는 다음 마이그레이션(b2b_proxy_sessions)에서 건다.

alter table public.admin_access_logs
  add column tenant_id uuid references public.tenants (id) on delete set null,
  add column actor_kind text
    constraint admin_access_logs_actor_kind_check
    check (actor_kind in ('hq', 'teacher', 'school_admin', 'hq_proxy')),
  add column actor_login_id text,
  add column teacher_id uuid references public.teachers (id) on delete set null,
  add column proxy_session_id uuid,
  add column meta jsonb not null default '{}';

alter table public.admin_access_logs
  alter column actor_email drop not null,
  alter column reason drop not null;

-- 본사 행(actor_kind 없음)은 예전처럼 사유가 필수다. btrim(null) 은 null 이라 coalesce 로 막는다.
alter table public.admin_access_logs
  drop constraint admin_access_logs_reason_not_blank,
  add constraint admin_access_logs_reason_required
    check (actor_kind is not null or coalesce(btrim(reason) <> '', false)),
  add constraint admin_access_logs_actor_present
    check (actor_email is not null or actor_login_id is not null),
  drop constraint admin_access_logs_action_check,
  add constraint admin_access_logs_action_check
    check (action in ('download', 'unmask', 'view', 'report_view', 'update', 'export',
      'account_issue', 'account_reissue', 'account_status', 'account_delete', 'password_set',
      'teacher_import', 'proxy_start', 'proxy_end', 'settings_change', 'member_purge'));

create index admin_access_logs_tenant_created_idx
  on public.admin_access_logs (tenant_id, created_at desc);
create index admin_access_logs_target_created_idx
  on public.admin_access_logs (target_id, created_at desc);

comment on column public.admin_access_logs.tenant_id is '콘솔 행의 소속 기관. 기관이 지워져도 행은 남는다.';
comment on column public.admin_access_logs.actor_kind is 'hq(본사 직접 작업, 대행 세션 없음), teacher(담임), school_admin(학교 관리자), hq_proxy(본사 대행 세션). null 이면 기존 본사 행이라 reason 이 필수다.';
comment on column public.admin_access_logs.actor_login_id is '교사 로그인 아이디 스냅샷. 계정이 지워져도 남는다.';
comment on column public.admin_access_logs.meta is '변경 전후 값 등 부가 정보. 임시 비밀번호나 전화번호 원문은 넣지 않는다.';

-- 위닝 관리자가 브라우저에서 직접 넣는 예전 본사 행은 B2B 컬럼이 모두 비어 있어야 한다.
-- 그렇지 않으면 본사 계정이 교사나 학교 관리자 이름으로 콘솔 행을 위조할 수 있다.
drop policy "admin access log self insert" on public.admin_access_logs;
create policy "admin access log self insert" on public.admin_access_logs
  for insert to authenticated
  with check (
    profile_id = auth.uid()
    and public.is_winning_admin()
    and actor_kind is null
    and teacher_id is null
    and proxy_session_id is null
    and tenant_id is null
  );

-- 열람 화면용 뷰: 기존 컬럼 뒤에 기관 코드, 행위자 종류, 로그인 아이디, 대행 여부를 붙인다.
create or replace view public.admin_access_log_entries with (security_invoker = on) as
select
  l.id,
  l.created_at,
  l.action,
  l.resource_key,
  l.reason,
  l.row_count,
  l.target_id,
  l.actor_email,
  coalesce(p.name, '(탈퇴 계정)') as actor_name,
  t.code as tenant_code,
  l.actor_kind,
  l.actor_login_id,
  coalesce(l.proxy_session_id is not null or l.actor_kind = 'hq_proxy', false) as is_proxy
from public.admin_access_logs l
left join public.profiles p on p.id = l.profile_id
left join public.tenants t on t.id = l.tenant_id;
