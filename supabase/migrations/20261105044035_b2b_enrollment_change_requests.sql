-- B2B 기반 9 (B): 학생의 학적 변경 신청과 승인자의 결정.
-- 새 함수만 더한다. 위닝 사이트 DB 동작은 바뀌지 않는다.
--
-- 에러 코드(9A 의 WC077 번호 사용 중, WC078 version 불일치, WC080 없는 그룹, WC081 학적 없음 에 이어서):
-- WC094 학생이 아닌 계정(9A 의 fn_enrollment_join 과 같다), WC082 이미 열린 신청이 있음, WC083 신청이 없거나 이미 결정됨, WC084 승인자가 아님, WC085 거절 사유 없음.

-- 학생 본인(auth.uid())의 신청. 올해 학적이 있는 재학생만, 학생당 열린 신청은 하나(WC082).
-- 그룹 이름은 대소문자와 앞뒤 공백을 무시하고 찾고 없으면 WC080. 학급은 fn_class_ensure 로 필요할 때 만든다.
-- 학년을 비우면 지금 학년을 쓴다. 학급과 번호를 비우면 지금 값을 유지한다(학년이 그대로일 때만 학급을 유지한다,
-- 학급은 학년에 속하므로). 번호 중복은 승인할 때 검사한다.
-- 신청 시점의 학적 version 을 base_version 으로 남겨 승인 때 충돌을 알아챈다.
create function public.fn_request_enrollment_change(
  p_to_grade text,
  p_to_group_name text,
  p_to_class_name text,
  p_to_number smallint
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_enr public.student_enrollments;
  v_year integer;
  v_grade text;
  v_group uuid;
  v_class uuid;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not exists (select 1 from public.profiles pr where pr.id = v_uid and pr.member_type = 'student') then
    raise exception 'not a student account' using errcode = 'WC094';
  end if;

  select e.* into v_enr
    from public.student_enrollments e
    join public.tenants t on t.id = e.tenant_id and t.school_year = e.school_year
   where e.student_id = v_uid and e.status = 'active';
  if not found then
    raise exception 'enrollment not found' using errcode = 'WC081';
  end if;

  v_grade := coalesce(p_to_grade, v_enr.grade);

  if nullif(btrim(p_to_group_name), '') is not null then
    select g.id into v_group from public.class_groups g
     where g.tenant_id = v_enr.tenant_id and lower(g.name) = lower(btrim(p_to_group_name)) and g.deleted_at is null;
    if v_group is null then
      raise exception 'class group not registered' using errcode = 'WC080';
    end if;
  end if;

  if nullif(btrim(p_to_class_name), '') is not null then
    v_class := public.fn_class_ensure(v_enr.tenant_id, v_enr.school_year, v_grade, v_group, p_to_class_name);
  elsif v_grade is not distinct from v_enr.grade then
    v_class := v_enr.class_id;
  end if;

  begin
    insert into public.enrollment_changes (
      tenant_id, student_id, school_year, kind, status,
      from_grade, from_class_id, from_number, to_grade, to_class_id, to_number,
      base_version, requested_by
    ) values (
      v_enr.tenant_id, v_uid, v_enr.school_year, 'request', 'pending',
      v_enr.grade, v_enr.class_id, v_enr.number, v_grade, v_class, coalesce(p_to_number, v_enr.number),
      v_enr.version, v_uid
    )
    returning id into v_id;
  exception when unique_violation then
    raise exception 'a request is already pending' using errcode = 'WC082';
  end;

  return v_id;
end;
$$;

revoke all on function public.fn_request_enrollment_change(text, text, text, smallint) from public, anon;
grant execute on function public.fn_request_enrollment_change(text, text, text, smallint) to authenticated;

-- 신청 결정. 승인자(P15): 도착 학급에 담임이 있으면 그 담임, 없으면 같은 기관의 학교 관리자나 본사 대행.
-- 다른 기관이거나 승인자가 아니면 WC084. 이미 결정됐거나 없는 신청은 WC083.
-- 승인: 신청 때 본 학적 version(base_version)이 그대로여야 한다. 그 사이 학적이 바뀌었거나 학년도가 넘어갔으면
-- WC078. 번호가 이미 쓰이면 WC077. 둘 다 예외라서 신청은 pending 으로 남는다.
-- 승인하면 학적 학년, 학급, 번호를 바꾸고 version 을 올리며 student_profiles.grade 도 맞춘다.
-- 거절: 사유가 비면 WC085. 신청 행에 결정자, 교사, 대행 세션, 시각을 남긴다. 결과 status 를 돌려준다.
create function public.fn_decide_enrollment_change(
  p_change_id uuid,
  p_approve boolean,
  p_reject_reason text,
  p_actor uuid
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_chg public.enrollment_changes;
  v_enr public.student_enrollments;
  v_actor record;
  v_year integer;
  v_has_homeroom boolean;
  v_allowed boolean;
  v_constraint text;
  v_status text;
begin
  select * into v_chg from public.enrollment_changes c
   where c.id = p_change_id and c.kind = 'request' for update;
  if not found or v_chg.status <> 'pending' then
    raise exception 'request not found or already decided' using errcode = 'WC083';
  end if;

  select a.* into v_actor from public.fn_console_actor(p_actor) a;
  if v_actor.tenant_id is distinct from v_chg.tenant_id then
    raise exception 'not an approver for this request' using errcode = 'WC084';
  end if;

  v_has_homeroom := v_chg.to_class_id is not null and exists (
    select 1 from public.teacher_class_assignments a
      join public.teachers t on t.id = a.teacher_id and t.status = 'active' and t.deleted_at is null
     where a.class_id = v_chg.to_class_id);
  if v_has_homeroom then
    v_allowed := v_actor.kind = 'homeroom' and v_chg.to_class_id = any (v_actor.class_ids);
  else
    v_allowed := v_actor.kind in ('school_admin', 'hq_proxy');
  end if;
  if not v_allowed then
    raise exception 'not an approver for this request' using errcode = 'WC084';
  end if;

  if p_approve then
    select e.* into v_enr from public.student_enrollments e
     where e.student_id = v_chg.student_id and e.school_year = v_chg.school_year and e.status = 'active'
       for update;
    if not found then
      raise exception 'enrollment not found' using errcode = 'WC081';
    end if;
    select t.school_year into v_year from public.tenants t where t.id = v_chg.tenant_id;
    if v_enr.version is distinct from v_chg.base_version or v_year <> v_chg.school_year then
      raise exception 'enrollment was changed by someone else' using errcode = 'WC078';
    end if;

    begin
      update public.student_enrollments e
         set grade = v_chg.to_grade, class_id = v_chg.to_class_id, number = v_chg.to_number,
             version = e.version + 1, updated_at = now(), updated_by = p_actor
       where e.id = v_enr.id;
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'student_enrollments_class_number_idx' then
        raise exception 'class number already taken' using errcode = 'WC077';
      end if;
      raise;
    end;

    if v_chg.to_grade is not null then
      update public.student_profiles sp set grade = v_chg.to_grade, updated_at = now()
       where sp.profile_id = v_chg.student_id and sp.grade is distinct from v_chg.to_grade;
    end if;
    v_status := 'applied';
  else
    if nullif(btrim(p_reject_reason), '') is null then
      raise exception 'reject reason required' using errcode = 'WC085';
    end if;
    v_status := 'rejected';
  end if;

  update public.enrollment_changes c
     set status = v_status,
         reject_reason = case when v_status = 'rejected' then btrim(p_reject_reason) end,
         decided_by = p_actor, decided_teacher_id = v_actor.teacher_id,
         proxy_session_id = v_actor.proxy_session_id, decided_at = now()
   where c.id = v_chg.id;

  return v_status;
end;
$$;

revoke all on function public.fn_decide_enrollment_change(uuid, boolean, text, uuid) from public, anon, authenticated;
grant execute on function public.fn_decide_enrollment_change(uuid, boolean, text, uuid) to service_role;
