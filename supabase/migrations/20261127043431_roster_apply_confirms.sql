-- 명단 적용이 "확인 필요" 학생을 확인한다(2026-11-27 사용자 결정).
-- 1) 학기 중 명단 적용(fn_roster_midyear)에서 학생 줄이 지금 반, 번호와 같으면 배치는 그대로 두고 확인한다.
--    줄은 미리보기가 이름으로 찾은 student_id 를 싣으므로 학생은 id 로 맞춘다. 자리가 다르면 배치를 바꾸고
--    fn_enrollment_confirm_reset 트리거가 확인한다(이력은 지금처럼 admin_direct).
-- 2) 가입 전 명단 저장(fn_roster_pending_replace, 학기 중 적용과 학년도 넘기기가 함께 쓴다)에서 저장한 줄이
--    이미 그 반에 있는 학생과 fn_roster_pending_claim 과 같은 조건으로 맞으면 그 줄을 지우고, 학생이 확인 필요면 확인한다.
-- 확인은 모두 enrollment_changes 에 kind confirm 으로 남기고, 이미 확인된 학생은 다시 건드리지 않아 같은 명단을
-- 다시 적용하면 아무것도 바뀌지 않는다. 학년도 넘기기는 새 학년도 학적을 확인된 상태로 만들므로 따로 고칠 것이 없다.

-- 확인 필요 학적 하나를 확인하고 이력을 남긴다. 이미 확인됐거나 없으면 false. 부르는 쪽이 학적 행을 잠근 채로 부른다.
create or replace function public.fn_enrollment_mark_confirmed(p_enrollment uuid, p_actor uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
#variable_conflict use_column
declare
  v_old public.student_enrollments;
  v_new public.student_enrollments;
  v_teacher uuid;
  v_proxy uuid;
begin
  select e.* into v_old from public.student_enrollments e
   where e.id = p_enrollment and e.needs_confirm for update;
  if not found then
    return false;
  end if;

  update public.student_enrollments e
     set needs_confirm = false, version = e.version + 1, updated_at = now(), updated_by = p_actor
   where e.id = v_old.id
  returning * into v_new;

  select a.teacher_id, a.proxy_session_id into v_teacher, v_proxy from public.fn_console_actor(p_actor) a;

  insert into public.enrollment_changes (
    tenant_id, student_id, school_year, kind, status,
    from_grade, from_class_id, from_number, to_grade, to_class_id, to_number,
    base_version, requested_by, decided_by, decided_teacher_id, proxy_session_id, decided_at
  ) values (
    v_old.tenant_id, v_old.student_id, v_old.school_year, 'confirm', 'applied',
    v_old.grade, v_old.class_id, v_old.number, v_new.grade, v_new.class_id, v_new.number,
    v_old.version, p_actor, p_actor, v_teacher, v_proxy, now()
  );
  return true;
end;
$$;

revoke all on function public.fn_enrollment_mark_confirmed(uuid, uuid) from public, anon, authenticated;
grant execute on function public.fn_enrollment_mark_confirmed(uuid, uuid) to service_role;

CREATE OR REPLACE FUNCTION "public"."fn_roster_midyear"("p_tenant" "uuid", "p_rows" "jsonb", "p_pending" "jsonb", "p_actor" "uuid") RETURNS TABLE("updated_count" integer, "skipped_count" integer, "pending_stored" integer, "pending_skipped" integer, "pending_deleted" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
#variable_conflict use_column
declare
  v_year integer;
  v_org text;
  v_teacher uuid;
  v_proxy uuid;
  v_r record;
  v_e public.student_enrollments;
  v_old public.student_enrollments;
  v_new public.student_enrollments;
  v_class uuid;
  v_plan jsonb := '{}'::jsonb;
  v_item record;
  v_updated integer := 0;
  v_skipped integer := 0;
  v_stored integer;
  v_pending_skipped integer;
  v_deleted integer;
  v_constraint text;
begin
  if jsonb_array_length(coalesce(p_rows, '[]'::jsonb)) > 3000
     or jsonb_array_length(coalesce(p_pending, '[]'::jsonb)) > 3000 then
    raise exception 'too many roster rows' using errcode = '54000';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as x(student_id uuid)
     where x.student_id is not null group by x.student_id having count(*) > 1) then
    raise exception 'duplicate student_id in roster rows' using errcode = '22023';
  end if;

  -- 잠그는 순서: L(현재 학년도) -> 기관 행 공유 잠금 -> 학적 행(학생 id 순). L 은 학급 만들기(fn_class_ensure)도 쓰는
  -- (기관, 학년도) 당 하나의 잠금이라 같은 호출 안에서는 다시 잡을 뿐이다. 넘기기와의 순서는 아래 기관 행 잠금이 정한다.
  select t.school_year into v_year from public.tenants t where t.id = p_tenant;
  if v_year is null then
    raise exception 'tenant not found' using errcode = 'no_data_found';
  end if;
  perform public.fn_roster_pending_lock(p_tenant, v_year);
  -- 기다리는 사이 학년도가 넘어갔으면 잠근 학년도가 맞지 않으니 다시 시도하게 한다.
  if (select t.school_year from public.tenants t where t.id = p_tenant for share) is distinct from v_year then
    raise exception 'school year changed, retry' using errcode = '40001';
  end if;

  select a.teacher_id, a.proxy_session_id into v_teacher, v_proxy from public.fn_console_actor(p_actor) a;

  -- 이 호출이 건드릴 학적 행을 먼저 잠그고(아래 반복과 같은 학생 id 순) 그 행으로 사전 생성할 학급을 정한다. 그 사이 학년 변경,
  -- 졸업, 삭제가 끼어들어 고아 학급이 남거나 학급이 늦게 만들어지는 일이 없다. 버전 검사는 아래 반복이 그대로 한다.
  perform 1 from public.student_enrollments e
   where e.tenant_id = p_tenant and e.school_year = v_year and e.status = 'active'
     and e.student_id in (
       select x.student_id from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as x(student_id uuid))
   order by e.student_id for update;

  -- 바뀔 수 있는 학생(재학 학적이 있고 학년이 있는 학생)의 다학년 줄과 저장할 가입 전 다학년 줄에 대해서만, 다학년 학급을
  -- 한 번씩 먼저 만든다. 줄 순서와 상관없이 같은 그룹과 이름의 학년 줄도 fn_class_ensure 의 이름 우선 규칙으로 그 다학년
  -- 학급에 들어간다(학교는 22023). 학적이 없는 학생 id 나 건너뛸 줄은 학급을 남기지 않는다.
  perform public.fn_class_ensure(p_tenant, v_year, null, d.group_id, d.class_name)
    from (
      select x.group_id, x.class_name
        from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb))
             as x(student_id uuid, group_id uuid, class_name text, number smallint, version integer, mixed boolean)
        join public.student_enrollments e
          on e.student_id = x.student_id and e.tenant_id = p_tenant and e.school_year = v_year
         and e.status = 'active' and e.grade is not null
       where coalesce(x.mixed, false) and nullif(btrim(x.class_name), '') is not null
      union
      select t.group_id, t.class_name from public.fn_roster_mixed_pending_targets(p_pending) t
       order by 1 nulls first, 2
    ) d;

  for v_r in
    select x.student_id, x.group_id, x.class_name, x.number, x.version, coalesce(x.mixed, false) as mixed
      from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb))
           as x(student_id uuid, group_id uuid, class_name text, number smallint, version integer, mixed boolean)
     order by x.student_id
  loop
    select * into v_e from public.student_enrollments e
     where e.student_id = v_r.student_id and e.tenant_id = p_tenant and e.school_year = v_year
       and e.status = 'active'
       for update;
    if not found or v_e.grade is null or v_plan ? v_e.id::text then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    if v_e.version is distinct from v_r.version then
      raise exception 'enrollment was changed by someone else' using errcode = 'WC078';
    end if;

    v_class := public.fn_class_ensure(
      p_tenant, v_year, case when v_r.mixed then null else v_e.grade end, v_r.group_id, v_r.class_name);
    if v_class is not distinct from v_e.class_id and v_r.number is not distinct from v_e.number then
      -- 명단이 학생이 적은 자리와 같으면 배치는 그대로 두고 확인만 한다(이미 확인됐으면 아무것도 하지 않는다).
      if v_e.needs_confirm then
        perform public.fn_enrollment_mark_confirmed(v_e.id, p_actor);
      end if;
      v_skipped := v_skipped + 1;
      continue;
    end if;

    if v_e.number is not null then
      update public.student_enrollments e set number = null where e.id = v_e.id;
    end if;
    v_plan := v_plan || jsonb_build_object(
      v_e.id::text,
      jsonb_build_object('class_id', v_class, 'number', v_r.number, 'old', to_jsonb(v_e))
    );
  end loop;

  for v_item in select j.key, j.value from jsonb_each(v_plan) j order by j.key loop
    v_old := jsonb_populate_record(null::public.student_enrollments, v_item.value -> 'old');
    begin
      update public.student_enrollments e
         set class_id = (v_item.value ->> 'class_id')::uuid,
             number = (v_item.value ->> 'number')::smallint,
             version = e.version + 1, updated_at = now(), updated_by = p_actor
       where e.id = v_old.id
      returning * into v_new;
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'student_enrollments_class_number_idx' then
        perform public.fn_raise_number_taken((v_item.value ->> 'class_id')::uuid, (v_item.value ->> 'number')::smallint);
      end if;
      raise;
    end;

    insert into public.enrollment_changes (
      tenant_id, student_id, school_year, kind, status,
      from_grade, from_class_id, from_number, to_grade, to_class_id, to_number,
      reason, base_version, requested_by, decided_by, decided_teacher_id, proxy_session_id, decided_at
    ) values (
      p_tenant, v_old.student_id, v_year, 'admin_direct', 'applied',
      v_old.grade, v_old.class_id, v_old.number, v_new.grade, v_new.class_id, v_new.number,
      case when v_old.class_id is not distinct from v_new.class_id then 'number_change' else 'class_change' end,
      v_old.version, p_actor, p_actor, v_teacher, v_proxy, now()
    );
    v_updated := v_updated + 1;
  end loop;

  -- 이번 명단에 나온 학생의 학급(바뀌지 않은 학생 포함)과 가입 전 줄의 학급만 가입 전 명단에서 바꾼다.
  select s.stored_count, s.skipped_count, s.deleted_count into v_stored, v_pending_skipped, v_deleted
    from public.fn_roster_pending_replace(
      p_tenant, v_year, p_pending, p_actor,
      coalesce((
        select array_agg(distinct e.class_id)
          from public.student_enrollments e
          join jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as x(student_id uuid) on x.student_id = e.student_id
         where e.tenant_id = p_tenant and e.school_year = v_year and e.class_id is not null
      ), '{}')
    ) s;

  return query select v_updated, v_skipped, v_stored, v_pending_skipped, v_deleted;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."fn_roster_pending_replace"("p_tenant" "uuid", "p_year" integer, "p_rows" "jsonb", "p_actor" "uuid", "p_classes" "uuid"[] DEFAULT '{}'::"uuid"[]) RETURNS TABLE("stored_count" integer, "skipped_count" integer, "deleted_count" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
#variable_conflict use_column
declare
  c_grades constant text[] := array['중1', '중2', '중3', '고1', '고2', '고3'];
  v_r record;
  v_class uuid;
  v_valid jsonb := '[]'::jsonb;
  v_classes uuid[] := coalesce(p_classes, '{}');
  v_stored integer := 0;
  v_skipped integer := 0;
  v_deleted integer;
  v_m record;
  v_used_enrollments uuid[] := '{}';
  v_used_rows uuid[] := '{}';
begin
  if jsonb_array_length(coalesce(p_rows, '[]'::jsonb)) > 3000 then
    raise exception 'too many roster rows' using errcode = '54000';
  end if;
  perform public.fn_roster_pending_lock(p_tenant, p_year);

  -- 저장할 수 있는 다학년 줄(fn_roster_mixed_pending_targets)의 학급만 한 번씩 먼저 만든다(줄 순서와 상관없이 같은 학급으로
  -- 모으려고. 학교는 22023). 건너뛸 줄은 학급을 남기지 않는다. 호출한 쪽이 이미 만들었으면 찾기만 한다.
  perform public.fn_class_ensure(p_tenant, p_year, null, d.group_id, d.class_name)
    from (
      select t.group_id, t.class_name from public.fn_roster_mixed_pending_targets(p_rows) t
       order by 1 nulls first, 2
    ) d;

  for v_r in
    select x.name, x.grade, x.group_id, x.class_name, x.number, coalesce(x.mixed, false) as mixed
      from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb))
           as x(name text, grade text, group_id uuid, class_name text, number smallint, mixed boolean)
  loop
    if nullif(btrim(v_r.name), '') is null
       or (v_r.grade is null and not v_r.mixed)
       or (v_r.grade is not null and v_r.grade <> all (c_grades))
       or nullif(btrim(v_r.class_name), '') is null then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_class := public.fn_class_ensure(
      p_tenant, p_year, case when v_r.mixed then null else v_r.grade end, v_r.group_id, v_r.class_name);
    v_classes := array_append(v_classes, v_class);
    v_valid := v_valid || jsonb_build_object(
      'name', btrim(v_r.name), 'grade', v_r.grade, 'class_id', v_class, 'number', v_r.number);
    v_stored := v_stored + 1;
  end loop;

  delete from public.roster_pending_students p
   where p.tenant_id = p_tenant
     and ((p.school_year = p_year and p.class_id = any (v_classes)) or p.school_year < p_year);
  get diagnostics v_deleted = row_count;

  insert into public.roster_pending_students (tenant_id, school_year, name, grade, class_id, number, created_by)
  select p_tenant, p_year, x.name, x.grade, x.class_id, x.number, p_actor
    from jsonb_to_recordset(v_valid) as x(name text, grade text, class_id uuid, number smallint);

  -- 방금 저장한 줄이 이미 그 반에 있는 학생과 맞으면(fn_roster_pending_claim 과 같은 조건: 이름, 반, 번호가 비었거나 같음)
  -- 가입 때와 같게 그 줄을 지운다. 맞은 학생이 확인 필요면 확인한다. 한 줄은 한 학생만, 한 학생은 한 줄만 쓴다.
  -- 미리보기는 가입 학생의 이름을 가입 전 줄로 만들지 않으므로, 미리보기 뒤에 가입한 학생이 여기서 맞는다.
  for v_m in
    select p.id as pending_id, e.id as enrollment_id, e.needs_confirm
      from public.roster_pending_students p
      join public.student_enrollments e
        on e.tenant_id = p.tenant_id and e.school_year = p.school_year and e.class_id = p.class_id
       and e.status = 'active' and (p.number is null or p.number = e.number)
      join public.profiles pr on pr.id = e.student_id and btrim(pr.name) = p.name
     where p.tenant_id = p_tenant and p.school_year = p_year and p.class_id = any (v_classes)
     order by e.needs_confirm desc, e.student_id, p.number nulls last, p.id
  loop
    continue when v_m.enrollment_id = any (v_used_enrollments) or v_m.pending_id = any (v_used_rows);
    delete from public.roster_pending_students p where p.id = v_m.pending_id;
    v_used_rows := array_append(v_used_rows, v_m.pending_id);
    v_used_enrollments := array_append(v_used_enrollments, v_m.enrollment_id);
    if v_m.needs_confirm then
      perform public.fn_enrollment_mark_confirmed(v_m.enrollment_id, p_actor);
    end if;
  end loop;

  return query select v_stored, v_skipped, v_deleted;
end;
$$;
