CREATE OR REPLACE FUNCTION "public"."fn_teacher_soft_delete"("p_teacher_ids" "uuid"[], "p_actor" "uuid", "p_tenant" "uuid") RETURNS TABLE("teacher_id" "uuid", "profile_id" "uuid", "active_students" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_t public.teachers;
  v_count bigint;
begin
  for v_t in
    select * from public.teachers t where t.id = any (p_teacher_ids) order by t.id for update
  loop
    if p_tenant is null or v_t.tenant_id <> p_tenant then
      raise exception 'teacher not found' using errcode = 'WC088';
    end if;
    if p_actor is not null and v_t.profile_id = p_actor then
      raise exception 'cannot delete own account' using errcode = 'WC108';
    end if;
    if v_t.deleted_at is not null then
      return query select v_t.id, v_t.profile_id, 0::bigint;
      continue;
    end if;

    select count(*) into v_count
      from public.student_enrollments e
      join public.teacher_class_assignments a on a.class_id = e.class_id
     where a.teacher_id = v_t.id and e.status = 'active';

    update public.teachers set deleted_at = now(), deleted_by = p_actor where id = v_t.id;
    delete from public.teacher_class_assignments a where a.teacher_id = v_t.id;

    return query select v_t.id, v_t.profile_id, v_count;
  end loop;
end;
$$;
