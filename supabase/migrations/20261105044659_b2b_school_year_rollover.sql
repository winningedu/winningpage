-- B2B 기반 10: 학년도 넘기기와 그룹 삭제.
-- 새 함수만 더한다. 위닝 사이트 DB 동작은 바뀌지 않는다.
--
-- 에러 코드(9B 의 WC082 에서 WC085 에 이어서): WC086 학급에 재학생이 있어 그룹을 지울 수 없음,
-- WC087 그룹이 없음. 번호 중복은 9A 의 WC077 을 쓴다.

-- 학년도 넘기기(P11, P12). tenants.school_year 를 p_to_year - 1 에서 p_to_year 로 한 번만 올린다(compare-and-set).
-- 이미 넘어갔거나 학년도가 이어지지 않으면 아무것도 바꾸지 않고 0 을 돌려준다(두 번째 호출은 효과 없음).
-- 지난 학년도의 재학생을 정리한다.
--   고3 은 항상 졸업, 중3 은 학교(org_type)면 졸업하고 아니면 고1 로 진급, 나머지는 한 학년 올린다.
--   졸업은 지난 학년도 행을 graduated 로 바꾸고, 진급은 새 학년도 행을 만든다(학급 없음).
--   p_rows 의 {student_id, class_name, group_id?, number?} 가 있으면 진급하는 학생을 그 학급과 번호에 배정한다.
--   졸업하는 학생의 행은 무시한다. 이미 새 학년도 행이 있거나 학년이 없는 학생은 건너뛴다.
-- 학생 한 명마다 student_profiles.grade 와 enrollment_changes(rollover) 이력을 같은 트랜잭션에서 맞춘다.
-- 학년도가 바뀌면 지난 학년도 기준의 열린 신청은 거절 처리해 학생이 새로 신청할 수 있게 한다.
-- 번호가 겹치면 WC077 이고 전체가 되돌려진다.
create function public.fn_school_year_rollover(
  p_tenant uuid,
  p_to_year integer,
  p_rows jsonb,
  p_actor uuid
)
returns table (graduated_count integer, promoted_count integer, skipped_count integer, assigned_count integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  c_grades constant text[] := array['중1', '중2', '중3', '고1', '고2', '고3'];
  v_org text;
  v_teacher uuid;
  v_proxy uuid;
  v_e public.student_enrollments;
  v_next text;
  v_class uuid;
  v_number smallint;
  v_graduated integer := 0;
  v_promoted integer := 0;
  v_skipped integer := 0;
  v_assigned integer := 0;
  v_constraint text;
begin
  update public.tenants t set school_year = p_to_year
   where t.id = p_tenant and t.school_year = p_to_year - 1
  returning t.org_type into v_org;
  if not found then
    if not exists (select 1 from public.tenants t where t.id = p_tenant) then
      raise exception 'tenant not found' using errcode = 'no_data_found';
    end if;
    return query select 0, 0, 0, 0;
    return;
  end if;

  select a.teacher_id, a.proxy_session_id into v_teacher, v_proxy from public.fn_console_actor(p_actor) a;

  update public.enrollment_changes c
     set status = 'rejected', reject_reason = '학년도가 바뀌어 신청이 닫혔어요',
         decided_by = p_actor, decided_teacher_id = v_teacher, proxy_session_id = v_proxy, decided_at = now()
   where c.tenant_id = p_tenant and c.status = 'pending';

  for v_e in
    select * from public.student_enrollments e
     where e.tenant_id = p_tenant and e.school_year = p_to_year - 1 and e.status = 'active'
     order by e.id for update
  loop
    if v_e.grade is null or exists (
      select 1 from public.student_enrollments n where n.student_id = v_e.student_id and n.school_year = p_to_year
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    if v_e.grade = '고3' or (v_e.grade = '중3' and v_org = '학교') then
      update public.student_enrollments e
         set status = 'graduated', graduated_at = now(),
             version = e.version + 1, updated_at = now(), updated_by = p_actor
       where e.id = v_e.id;
      insert into public.enrollment_changes (
        tenant_id, student_id, school_year, kind, status, from_grade, from_class_id, from_number,
        reason, base_version, requested_by, decided_by, decided_teacher_id, proxy_session_id, decided_at
      ) values (
        p_tenant, v_e.student_id, p_to_year, 'rollover', 'applied', v_e.grade, v_e.class_id, v_e.number,
        'promotion', v_e.version, p_actor, p_actor, v_teacher, v_proxy, now()
      );
      v_graduated := v_graduated + 1;
    else
      v_next := case when v_e.grade = '중3' then '고1' else c_grades[array_position(c_grades, v_e.grade) + 1] end;

      v_class := null;
      v_number := null;
      select public.fn_class_ensure(p_tenant, p_to_year, v_next, x.group_id, x.class_name), x.number
        into v_class, v_number
        from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb))
             as x(student_id uuid, group_id uuid, class_name text, number smallint)
       where x.student_id = v_e.student_id and nullif(btrim(x.class_name), '') is not null
       limit 1;

      begin
        insert into public.student_enrollments (tenant_id, student_id, school_year, grade, class_id, number, updated_by)
        values (p_tenant, v_e.student_id, p_to_year, v_next, v_class, v_number, p_actor);
      exception when unique_violation then
        get stacked diagnostics v_constraint = constraint_name;
        if v_constraint = 'student_enrollments_class_number_idx' then
          raise exception 'class number already taken' using errcode = 'WC077';
        end if;
        raise;
      end;

      update public.student_profiles sp set grade = v_next, updated_at = now()
       where sp.profile_id = v_e.student_id and sp.grade is distinct from v_next;

      insert into public.enrollment_changes (
        tenant_id, student_id, school_year, kind, status, from_grade, from_class_id, from_number,
        to_grade, to_class_id, to_number,
        reason, base_version, requested_by, decided_by, decided_teacher_id, proxy_session_id, decided_at
      ) values (
        p_tenant, v_e.student_id, p_to_year, 'rollover', 'applied', v_e.grade, v_e.class_id, v_e.number,
        v_next, v_class, v_number,
        'promotion', v_e.version, p_actor, p_actor, v_teacher, v_proxy, now()
      );
      v_promoted := v_promoted + 1;
      if v_class is not null then
        v_assigned := v_assigned + 1;
      end if;
    end if;
  end loop;

  return query select v_graduated, v_promoted, v_skipped, v_assigned;
end;
$$;

revoke all on function public.fn_school_year_rollover(uuid, integer, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.fn_school_year_rollover(uuid, integer, jsonb, uuid) to service_role;
