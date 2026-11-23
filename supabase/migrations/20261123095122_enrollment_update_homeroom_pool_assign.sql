-- 담임의 미배정(풀) 학생 배정. fn_enrollment_update 에서 p_allowed_class_ids 가 있어도 현재 학급이 비어 있는 행은
-- pool_assign 이고 옮겨 갈 학급이 담당 학급 목록 안일 때만 허용한다. 그 밖의 본문은 원본과 같다.

-- 학적 수정(담임 수정, 관리자 직접, 풀 배정). 학년, 학급, 번호를 한 번에 새 값으로 바꾼다.
-- p_expected_version 이 현재 version 과 다르면 WC078(다른 분이 먼저 바꿈), 학적이 없으면 WC081,
-- 같은 번호는 WC077. 학급이 다른 기관, 학년도, 학년이면 복합 FK 가 막는다(23503).
-- p_apply_year 가 null 이면 기관의 올해. 올해나 다음 해만 고칠 수 있고 그 밖은 22023(P16).
-- 다음 해 행이 없으면 만든다(올해 학적이 있는 같은 기관의 학생만, version 은 비교하지 않는다).
-- 올해 행의 학년이 바뀌면 student_profiles.grade 도 맞춘다.
-- 적용 이력을 enrollment_changes 에 남기고, 행위자가 대행 중인 본사 관리자거나 교사면
-- 대행 세션과 교사 id 도 같이 남긴다.
-- 기관 범위: 행을 잠근 뒤 p_tenant 가 학적의 기관과 다르면 WC081(다른 기관의 학생은 없는 것처럼 숨긴다).
-- p_allowed_class_ids 가 null 이 아니면(담임) 학적의 현재 학급과 옮겨 갈 학급(null 이 아니면)이 모두
-- 그 목록에 있어야 하고, 아니면 WC081 이다. 단 현재 학급이 비어 있는 풀 학생은 p_kind 가 pool_assign 이고
-- 옮겨 갈 학급이 그 목록 안에 있을 때만 담임도 배정할 수 있다.
create or replace function public.fn_enrollment_update(
  p_student uuid,
  p_expected_version integer,
  p_to_grade text,
  p_to_class_id uuid,
  p_to_number smallint,
  p_kind text,
  p_reason text,
  p_apply_year integer,
  p_actor uuid,
  p_tenant uuid,
  p_allowed_class_ids uuid[] default null
)
returns table (enrollment_id uuid, version integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_old public.student_enrollments;
  v_new public.student_enrollments;
  v_current_year integer;
  v_year integer;
  v_cur public.student_enrollments;
  v_teacher uuid;
  v_proxy uuid;
  v_constraint text;
begin
  if p_kind is null or p_kind not in ('homeroom_edit', 'admin_direct', 'pool_assign') then
    raise exception 'invalid enrollment update kind' using errcode = 'invalid_parameter_value';
  end if;

  -- 담임은 학급을 담당 학급 안으로만 옮긴다(다른 교사의 학급으로 보내는 길을 막는다).
  if p_allowed_class_ids is not null and p_to_class_id is not null
     and p_to_class_id <> all (p_allowed_class_ids) then
    raise exception 'enrollment not found' using errcode = 'WC081';
  end if;

  -- 기관 행을 공유 잠금으로 읽어 학년도 넘기기와 겹치지 않게 한다.
  select t.school_year into v_current_year from public.tenants t where t.id = p_tenant for share;
  if v_current_year is null then
    raise exception 'enrollment not found' using errcode = 'WC081';
  end if;
  v_year := coalesce(p_apply_year, v_current_year);
  if v_year not in (v_current_year, v_current_year + 1) then
    raise exception 'apply year must be the current or the next school year' using errcode = 'invalid_parameter_value';
  end if;

  select e.* into v_old
    from public.student_enrollments e
   where e.student_id = p_student and e.tenant_id = p_tenant and e.school_year = v_year
     for update;
  if not found then
    -- 다음 해 행이 없으면 만든다. 올해 학적이 있고(담임이면 담당 학급) 같은 기관의 학생만.
    if v_year = v_current_year + 1 then
      select e.* into v_cur from public.student_enrollments e
       where e.student_id = p_student and e.tenant_id = p_tenant and e.school_year = v_current_year
         for update;
      if found
         and (p_allowed_class_ids is null
              or (v_cur.class_id is not null and v_cur.class_id = any (p_allowed_class_ids))) then
        begin
          insert into public.student_enrollments (tenant_id, student_id, school_year, grade, class_id, number, updated_by)
          values (p_tenant, p_student, v_year, p_to_grade, p_to_class_id, p_to_number, p_actor)
          returning * into v_new;
        exception when unique_violation then
          get stacked diagnostics v_constraint = constraint_name;
          if v_constraint = 'student_enrollments_class_number_idx' then
            perform public.fn_raise_number_taken(p_to_class_id, p_to_number);
          end if;
          raise exception 'enrollment was changed by someone else' using errcode = 'WC078';
        end;
        select a.teacher_id, a.proxy_session_id into v_teacher, v_proxy from public.fn_console_actor(p_actor) a;
        insert into public.enrollment_changes (
          tenant_id, student_id, school_year, kind, status,
          to_grade, to_class_id, to_number,
          reason, requested_by, decided_by, decided_teacher_id, proxy_session_id, decided_at
        ) values (
          p_tenant, p_student, v_year, p_kind, 'applied',
          v_new.grade, v_new.class_id, v_new.number,
          p_reason, p_actor, p_actor, v_teacher, v_proxy, now()
        );
        return query select v_new.id, v_new.version;
        return;
      end if;
    end if;
    raise exception 'enrollment not found' using errcode = 'WC081';
  end if;
  if p_allowed_class_ids is not null
     and (case
            when v_old.class_id is null then
              not (p_kind = 'pool_assign' and p_to_class_id is not null
                   and p_to_class_id = any (p_allowed_class_ids))
            else v_old.class_id <> all (p_allowed_class_ids)
          end) then
    raise exception 'enrollment not found' using errcode = 'WC081';
  end if;
  if v_old.version <> p_expected_version then
    raise exception 'enrollment was changed by someone else' using errcode = 'WC078';
  end if;

  begin
    update public.student_enrollments e
       set grade = p_to_grade, class_id = p_to_class_id, number = p_to_number,
           version = e.version + 1, updated_at = now(), updated_by = p_actor
     where e.id = v_old.id
    returning * into v_new;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'student_enrollments_class_number_idx' then
      perform public.fn_raise_number_taken(p_to_class_id, p_to_number);
    end if;
    raise;
  end;

  if v_new.school_year = v_current_year and p_to_grade is not null then
    update public.student_profiles sp set grade = p_to_grade, updated_at = now()
     where sp.profile_id = p_student and sp.grade is distinct from p_to_grade;
  end if;

  select a.teacher_id, a.proxy_session_id into v_teacher, v_proxy from public.fn_console_actor(p_actor) a;

  insert into public.enrollment_changes (
    tenant_id, student_id, school_year, kind, status,
    from_grade, from_class_id, from_number, to_grade, to_class_id, to_number,
    reason, base_version, requested_by, decided_by, decided_teacher_id, proxy_session_id, decided_at
  ) values (
    v_old.tenant_id, p_student, v_old.school_year, p_kind, 'applied',
    v_old.grade, v_old.class_id, v_old.number, v_new.grade, v_new.class_id, v_new.number,
    p_reason, p_expected_version, p_actor, p_actor, v_teacher, v_proxy, now()
  );

  return query select v_new.id, v_new.version;
end;
$$;

revoke all on function public.fn_enrollment_update(uuid, integer, text, uuid, smallint, text, text, integer, uuid, uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.fn_enrollment_update(uuid, integer, text, uuid, smallint, text, text, integer, uuid, uuid, uuid[])
  to service_role;
