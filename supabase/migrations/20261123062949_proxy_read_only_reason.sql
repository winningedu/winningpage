-- 본사 대행 사유에 읽기 전용(read_only)을 4번째로 더한다(스쿨멘토 결정 116).
-- 읽기 전용 대행은 teacherConsoleProxy view 권한으로도 열리고, 다른 사유는 지금처럼 edit 권한이 있어야 한다(분석 grill Q10).
-- 쓰기 차단(POST, PUT, PATCH, DELETE 403)은 API 공통 처리부가 proxy_sessions.reason 으로 한다.
-- fn_console_actor 의 반환 모양은 바꾸지 않는다(7개 SQL 함수가 그대로 읽는다).

alter table public.proxy_sessions
  drop constraint proxy_sessions_reason_check,
  add constraint proxy_sessions_reason_check
    check (reason in ('admin_absent', 'roster_proxy', 'incident_support', 'read_only'));

create or replace function public.fn_console_actor(p_profile_id uuid)
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

  -- 읽기 전용 사유는 view 권한으로도, 다른 사유는 edit 권한이 있어야 대행이다.
  select s.* into v_session
    from public.proxy_sessions s
    join public.profiles p on p.id = s.admin_profile_id and p.role = 'admin'
   where s.admin_profile_id = p_profile_id and s.ended_at is null and s.expires_at > now()
     and exists (
       select 1 from public.fn_admin_effective_permissions(p_profile_id) ep
        where ep.resource_key = 'teacherConsoleProxy'
          and (ep.level = 'edit' or (s.reason = 'read_only' and ep.level = 'view')));

  if found then
    return query select
      'hq_proxy'::text, v_session.tenant_id, null::uuid, '{}'::uuid[], v_session.id, false;
    return;
  end if;

  return query select 'none'::text, null::uuid, null::uuid, '{}'::uuid[], null::uuid, null::boolean;
end;
$$;
