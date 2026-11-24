-- 빈 반 삭제(QA 51). 학생 등록, 대기 명단, 담당 배정이 하나도 없는 반만 지운다.
-- 반 행을 먼저 잠가 같은 반에 등록하려는 동시 요청(FK 의 KEY SHARE)을 기다리게 한 뒤,
-- 그 시점의 커밋된 상태로 NOT EXISTS 를 보고 지운다. 지운 반이 없으면 빈 결과를 돌려준다.
-- enrollment_changes 의 from_class_id, to_class_id 는 ON DELETE SET NULL 이라 이력은 남고 반 연결만 비워진다.
create or replace function public.fn_class_delete(p_class_id uuid, p_tenant uuid)
returns table (id uuid, grade text, name text)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  perform 1 from public.classes c where c.id = p_class_id and c.tenant_id = p_tenant for update;
  return query
    delete from public.classes c
     where c.id = p_class_id
       and c.tenant_id = p_tenant
       and not exists (select 1 from public.student_enrollments e where e.class_id = c.id)
       and not exists (select 1 from public.roster_pending_students p where p.class_id = c.id)
       and not exists (select 1 from public.teacher_class_assignments a where a.class_id = c.id)
    returning c.id, c.grade, c.name;
end;
$$;

revoke all on function public.fn_class_delete(uuid,uuid) from public, anon, authenticated;
grant execute on function public.fn_class_delete(uuid,uuid) to service_role;
