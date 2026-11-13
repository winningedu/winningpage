-- B2B 다학년 학급: 학원(org_type 이 학교가 아닌 기관)의 학급은 학년이 섞여도 된다. classes.grade 가 null 이면 다학년이다.
-- 학생의 학년은 언제나 실제 값이다(student_enrollments.grade 는 그대로 null 이 아니면 6개 값, 학급이 있으면 null 불가).
-- 학교는 학년 없는 학급을 만들 수 없다. 새 테이블은 없다.
--
-- 이 마이그레이션이 약하게 만드는 한 가지: 학급과 학생의 학년이 같아야 한다는 규칙을 선언형 FK 에서 트리거로 옮긴다
-- (학급 학년이 null 이면 아무 학년이나 받아야 해서 FK 로는 표현할 수 없다). 트리거는 학급 학년을 잠그지 않고 읽으므로
-- 학급 학년을 바꿀 수 없게(불변) 해서 경쟁 상태를 막는다. 기관, 학년도 짝은 3열 FK 가 그대로 지킨다.

alter table public.classes alter column grade drop not null;
alter table public.classes add constraint classes_id_tenant_year_key unique (id, tenant_id, school_year);

alter table public.student_enrollments
  add constraint student_enrollments_class_tenant_year_fkey
    foreign key (class_id, tenant_id, school_year) references public.classes (id, tenant_id, school_year),
  drop constraint student_enrollments_class_id_tenant_id_school_year_grade_fkey;

alter table public.roster_pending_students
  alter column grade drop not null,
  add constraint roster_pending_students_class_tenant_year_fkey
    foreign key (class_id, tenant_id, school_year) references public.classes (id, tenant_id, school_year),
  drop constraint roster_pending_students_class_id_tenant_id_school_year_gra_fkey;

comment on column public.classes.grade is '학급 학년. null 이면 다학년(학원만). 만든 뒤에는 바꿀 수 없다.';
comment on column public.roster_pending_students.grade is '가입 전 학생의 학년. 다학년 학급의 줄은 null 일 수 있다.';

-- 학급 보호: 기관은 바꿀 수 없고, 학년도 바꿀 수 없다(학년 일치를 지키는 트리거가 학급 학년을 잠그지 않고 읽는다).
-- 학년 없는 학급은 학교에서 만들 수 없다.
create or replace function public.fn_classes_lock_tenant()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' then
    if new.tenant_id is distinct from old.tenant_id then
      raise exception 'classes.tenant_id is immutable' using errcode = 'check_violation';
    end if;
    if new.grade is distinct from old.grade then
      raise exception 'classes.grade is immutable' using errcode = 'check_violation';
    end if;
  elsif new.grade is null
        and exists (select 1 from public.tenants t where t.id = new.tenant_id and t.org_type = '학교') then
    raise exception 'school classes must have a grade' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create or replace trigger trg_classes_lock_tenant
  before insert or update of tenant_id, grade on public.classes
  for each row execute function public.fn_classes_lock_tenant();

revoke all on function public.fn_classes_lock_tenant() from public, anon, authenticated;

-- 학급과 학생의 학년 일치. 학급 학년이 null(다학년)이면 어떤 학년도 받고, 아니면 학생 학년과 같아야 한다.
-- 학적과 가입 전 명단 모두에 건다. FK 위반과 같은 23503 을 던져 콘솔의 INVALID_CLASS 매핑을 그대로 쓴다.
create function public.fn_class_grade_match()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_grade text;
begin
  if new.class_id is not null then
    select c.grade into v_grade from public.classes c where c.id = new.class_id;
    if v_grade is not null and v_grade is distinct from new.grade then
      raise exception 'class grade does not match the student grade' using errcode = 'foreign_key_violation';
    end if;
  end if;
  return null;
end;
$$;

create trigger trg_student_enrollments_class_grade_match
  after insert or update of class_id, grade on public.student_enrollments
  for each row execute function public.fn_class_grade_match();
create trigger trg_roster_pending_students_class_grade_match
  after insert or update of class_id, grade on public.roster_pending_students
  for each row execute function public.fn_class_grade_match();

revoke all on function public.fn_class_grade_match() from public, anon, authenticated;

-- 같은 입력이면 같은 학급 id 를 돌려주는 find-or-create. 학교는 그룹을 쓰지 않고 학년도 꼭 있어야 한다.
-- p_grade 가 null 이면 다학년 학급이다(학원만). 학원에서 학생이 실제 학년과 학급 이름을 보내면,
-- 같은 기관, 학년도, 그룹, 이름의 다학년 학급이 이미 있을 때 그 학급을 먼저 돌려준다(학생이 다학년 학급에 들어가는 길).
create or replace function public.fn_class_ensure(
  p_tenant_id uuid,
  p_school_year integer,
  p_grade text,
  p_group_id uuid,
  p_raw_name text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org_type text;
  v_name text;
  v_id uuid;
begin
  select org_type into v_org_type from public.tenants where id = p_tenant_id;
  if v_org_type is null then
    raise exception 'tenant not found' using errcode = 'no_data_found';
  end if;
  if v_org_type = '학교' and p_group_id is not null then
    raise exception 'school classes have no group' using errcode = 'invalid_parameter_value';
  end if;
  if v_org_type = '학교' and p_grade is null then
    raise exception 'school classes must have a grade' using errcode = 'invalid_parameter_value';
  end if;
  v_name := public.fn_normalize_class_name(v_org_type, p_raw_name);
  if v_name = '' then
    raise exception 'invalid class name' using errcode = 'invalid_parameter_value';
  end if;

  if p_grade is not null and v_org_type <> '학교' then
    select id into v_id from public.classes
    where tenant_id = p_tenant_id and school_year = p_school_year and grade is null
      and group_id is not distinct from p_group_id and lower(name) = lower(v_name);
    if v_id is not null then
      return v_id;
    end if;
  end if;

  insert into public.classes (tenant_id, school_year, grade, group_id, name)
  values (p_tenant_id, p_school_year, p_grade, p_group_id, v_name)
  on conflict (tenant_id, school_year, grade, group_id, lower(name)) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.classes
    where tenant_id = p_tenant_id and school_year = p_school_year and grade is not distinct from p_grade
      and group_id is not distinct from p_group_id and lower(name) = lower(v_name);
  end if;
  return v_id;
end;
$$;

-- 학년도 넘기기에 다학년 줄을 더한다. p_rows 의 {student_id, class_name, group_id?, number?, mixed?} 에서
-- mixed 가 true 면 그 줄의 학급은 다학년 학급이다(학원만, 학교는 fn_class_ensure 가 22023 으로 막는다).
-- 학생은 언제나 자기 학년을 한 학년 올리거나 졸업한다. 학급은 새 학년도에 줄이 있을 때만 만들어진다.
create or replace function public.fn_school_year_rollover(
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

  -- 다학년 줄의 학급을 먼저 만든다. 그러면 줄 순서와 상관없이, 같은 그룹과 이름의 학년 줄도 fn_class_ensure 의
  -- 이름 우선 규칙으로 그 다학년 학급에 들어가 한 학급이 학년 학급과 다학년 학급으로 갈라지지 않는다.
  perform public.fn_class_ensure(p_tenant, p_to_year, null, d.group_id, d.class_name)
    from (
      select distinct x.group_id, x.class_name
        from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb))
             as x(student_id uuid, group_id uuid, class_name text, number smallint, mixed boolean)
       where coalesce(x.mixed, false) and nullif(btrim(x.class_name), '') is not null
    ) d;

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
      select public.fn_class_ensure(
               p_tenant, p_to_year, case when coalesce(x.mixed, false) then null else v_next end, x.group_id, x.class_name),
             x.number
        into v_class, v_number
        from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb))
             as x(student_id uuid, group_id uuid, class_name text, number smallint, mixed boolean)
       where x.student_id = v_e.student_id and nullif(btrim(x.class_name), '') is not null
       limit 1;

      begin
        insert into public.student_enrollments (tenant_id, student_id, school_year, grade, class_id, number, updated_by)
        values (p_tenant, v_e.student_id, p_to_year, v_next, v_class, v_number, p_actor);
      exception when unique_violation then
        get stacked diagnostics v_constraint = constraint_name;
        if v_constraint = 'student_enrollments_class_number_idx' then
          perform public.fn_raise_number_taken(v_class, v_number);
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
