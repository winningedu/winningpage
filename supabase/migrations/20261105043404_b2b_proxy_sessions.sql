-- B2B 기반 7: 본사 대행 세션, 시작/종료 함수, 콘솔 행위자 조회 함수.
-- 새 테이블은 비어 있고 어디서도 참조하지 않아 위닝 사이트 DB 동작은 바뀌지 않는다.
-- 콘솔 데이터는 service_role API 만 읽고 쓴다. RLS 를 켜고 정책 없이 anon, authenticated 권한을 모두 회수한다.
-- 세션이 살아 있는지는 요청마다 ended_at 과 expires_at 으로 판정한다(크론 없음).

create table public.proxy_sessions (
  id uuid primary key default gen_random_uuid(),
  admin_profile_id uuid not null references public.profiles (id),
  tenant_id uuid not null references public.tenants (id),
  reason text not null check (reason in ('admin_absent', 'roster_proxy', 'incident_support')),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  end_reason text check (end_reason in ('manual', 'expired', 'replaced')),
  constraint proxy_sessions_eight_hours check (expires_at = started_at + interval '8 hours')
);

-- 관리자당 열린 세션은 하나.
create unique index proxy_sessions_open_admin_idx
  on public.proxy_sessions (admin_profile_id) where ended_at is null;
create index proxy_sessions_tenant_started_idx on public.proxy_sessions (tenant_id, started_at desc);

alter table public.proxy_sessions enable row level security;
revoke all on table public.proxy_sessions from anon, authenticated;
grant all on table public.proxy_sessions to service_role;

comment on table public.proxy_sessions is '본사 관리자의 기관 대행 세션(8시간). 활성 = ended_at is null and expires_at > now().';

-- 접근 로그가 대행 세션을 가리킨다(이전 마이그레이션에서 컬럼만 만들었다).
alter table public.admin_access_logs
  add constraint admin_access_logs_proxy_session_id_fkey
  foreign key (proxy_session_id) references public.proxy_sessions (id) on delete set null;

-- 대행 시작. 같은 관리자의 열린 세션은 먼저 닫고(만료됐으면 expired, 아니면 replaced) 새로 연다.
-- 관리자별 advisory lock 으로 같은 관리자의 동시 시작을 한 줄로 세운다.
create function public.fn_proxy_start(p_admin uuid, p_tenant uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('proxy_start:' || p_admin::text, 0));

  update public.proxy_sessions
     set ended_at = least(now(), expires_at),
         end_reason = case when expires_at <= now() then 'expired' else 'replaced' end
   where admin_profile_id = p_admin and ended_at is null;

  insert into public.proxy_sessions (admin_profile_id, tenant_id, reason, expires_at)
  values (p_admin, p_tenant, p_reason, now() + interval '8 hours')
  returning id into v_id;
  return v_id;
end;
$$;

-- 대행 종료. 닫은 세션 id 를 돌려주고, 열린 세션이 없으면 null.
-- 이미 만료된 세션을 닫으면 end_reason 은 expired.
create function public.fn_proxy_end(p_admin uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  update public.proxy_sessions
     set ended_at = least(now(), expires_at),
         end_reason = case when expires_at <= now() then 'expired' else 'manual' end
   where admin_profile_id = p_admin and ended_at is null
  returning id into v_id;
  return v_id;
end;
$$;

-- 콘솔 요청의 행위자. 항상 한 행을 돌려주고 kind 가 'none' 이면 콘솔 권한이 없다.
-- 교사(활성, 삭제되지 않음)가 먼저, 아니면 관리자의 활성 대행 세션. 담당 학급은 기관의 올해 학급만.
create function public.fn_console_actor(p_profile_id uuid)
returns table (
  kind text,
  tenant_id uuid,
  teacher_id uuid,
  class_ids uuid[],
  proxy_session_id uuid,
  must_change_password boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_teacher public.teachers;
  v_session public.proxy_sessions;
begin
  select * into v_teacher
    from public.teachers t
   where t.profile_id = p_profile_id and t.status = 'active' and t.deleted_at is null;

  if found then
    return query select
      v_teacher.role, v_teacher.tenant_id, v_teacher.id,
      coalesce((select array_agg(a.class_id order by a.class_id)
                  from public.teacher_class_assignments a
                  join public.classes c on c.id = a.class_id
                  join public.tenants tn on tn.id = c.tenant_id and tn.school_year = c.school_year
                 where a.teacher_id = v_teacher.id), '{}'::uuid[]),
      null::uuid, v_teacher.must_change_password;
    return;
  end if;

  select s.* into v_session
    from public.proxy_sessions s
    join public.profiles p on p.id = s.admin_profile_id and p.role = 'admin'
   where s.admin_profile_id = p_profile_id and s.ended_at is null and s.expires_at > now();

  if found then
    return query select
      'hq_proxy'::text, v_session.tenant_id, null::uuid, '{}'::uuid[], v_session.id, false;
    return;
  end if;

  return query select 'none'::text, null::uuid, null::uuid, '{}'::uuid[], null::uuid, null::boolean;
end;
$$;

revoke all on function public.fn_proxy_start(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.fn_proxy_start(uuid, uuid, text) to service_role;
revoke all on function public.fn_proxy_end(uuid) from public, anon, authenticated;
grant execute on function public.fn_proxy_end(uuid) to service_role;
revoke all on function public.fn_console_actor(uuid) from public, anon, authenticated;
grant execute on function public.fn_console_actor(uuid) to service_role;
