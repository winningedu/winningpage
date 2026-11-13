set local lock_timeout = '5s';

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

-- 학급 만들기(fn_class_ensure)를 줄 세우는 잠금은 이름마다가 아니라 (기관, 학년도) 당 하나이고, 명단 적용이 이미 쓰는
-- fn_roster_pending_lock 과 같은 키다. 명단 적용은 이 잠금을 먼저 잡고 그 안에서 학급을 만들 때 다시 잡아도 막히지 않으며,
-- 학생 가입과 교사 등록은 명단 적용이 끝나길 기다린다. 이름마다 잠그면 교사 등록이 [1반, 2반] 과 [2반, 1반] 순서로
-- 겹칠 때 교착하고, 3000 줄 적용이 잠금을 수천 개 잡아 공유 잠금 표를 채울 수 있다.
--
-- 잠그는 순서(교착 검토). 모두 이 잠금(L)을 쓰고, 한 트랜잭션 안에서 L 은 같은 키로 다시 잡을 뿐이다.
--   학생 가입(fn_enrollment_join): 기관 행 공유 잠금 -> L(현재 학년도) -> 학적 행
--   학기 중 적용(fn_roster_midyear): L(현재 학년도) -> 기관 행 공유 잠금 -> 학적 행(학생 id 순) -> 학급 만들기(L 다시)
--   넘기기(fn_roster_rollover -> fn_school_year_rollover): L(다음 학년도) -> 기관 행 갱신 -> 학적 행(id 순) -> 학급 만들기(L 다시)
--   교사 등록과 담당 변경(fn_teacher_register, fn_assignment_set): 교사 행 -> L(학급마다 같은 키로 한 번씩)
-- 잠금 대기는 어떤 함수도 lock_timeout 으로 끊지 않는다. 파일 맨 위의 set local 은 이 마이그레이션을 돌리는 동안만 적용된다.
-- 기다리는 쪽은 API 역할의 statement_timeout(8초)이 57014 로 끊고, API 가 다시 시도하라는 409 로 바꾼다.
-- 교착할 수 있는 경우는 둘이고, 어느 쪽이든 교착 감지기가 한 쪽을 40P01 로 끊으면 API 가 다시 시도하라는 409 로 바꾼다.
-- (1) 명단 적용은 enrollment_changes.decided_teacher_id 외래키 때문에 실행한 교사의 교사 행에 KEY SHARE 잠금을 잡는다.
-- 그래서 명단 적용과 같은 교사의 담당 변경이나 등록(교사 행을 잠근 뒤 L)이 서로 기다려 교착할 수 있다. 한 쪽은 409 로 다시 시도한다.
-- (2) 학생의 기관 이동과 학기 중 적용은 학생의 profiles 행에서 교착할 수 있다. 이동은 profiles 행을 잠근 뒤 학적 행을 지우고,
-- 적용은 학적 행을 잠근 뒤 profiles 행의 KEY SHARE 를 기다린다. 200번 중 10번 실측했고, 한 쪽은 성공한다.
-- 학년도 경계에서 넘기기, 가입, 학기 중 적용이 한꺼번에 겹치는 세 갈래 경우는 교착하지 않는다(520번 실측 중 0번).
-- 기관의 유형(org_type)을 학교로 바꿀 때 다학년 학급이 남아 있는지는 막지 않는다.

-- 이번 명단의 가입 전 줄 중 다학년 학급을 만들어야 하는 (그룹, 반 이름): 이름, 반이 있고 mixed 이며 학년은 없거나
-- 여섯 학년 중 하나인 줄. fn_roster_pending_replace 가 저장하는 줄과 같은 조건이라 건너뛸 줄은 학급을 남기지 않는다.
create function public.fn_roster_mixed_pending_targets(p_pending jsonb)
returns table (group_id uuid, class_name text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select distinct x.group_id, x.class_name
    from jsonb_to_recordset(coalesce(p_pending, '[]'::jsonb))
         as x(name text, grade text, group_id uuid, class_name text, number smallint, mixed boolean)
   where coalesce(x.mixed, false) and nullif(btrim(x.name), '') is not null
     and nullif(btrim(x.class_name), '') is not null
     and (x.grade is null or x.grade = any (array['중1', '중2', '중3', '고1', '고2', '고3']))
$$;

revoke all on function public.fn_roster_mixed_pending_targets(jsonb) from public, anon, authenticated;
grant execute on function public.fn_roster_mixed_pending_targets(jsonb) to service_role;

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
  -- 이름 우선 규칙이 학년이 아닌 값에 다학년 학급을 돌려주지 않게, 테이블 CHECK 와 같은 오류로 먼저 막는다.
  if p_grade is not null and p_grade <> all (array['중1', '중2', '중3', '고1', '고2', '고3']) then
    raise exception 'invalid class grade' using errcode = 'check_violation';
  end if;
  -- (기관, 학년도) 당 하나의 잠금(명단 적용과 같은 키). 위의 순서 설명 참고.
  perform public.fn_roster_pending_lock(p_tenant_id, p_school_year);

  -- 같은 그룹과 이름의 학년 학급이 이미 있으면 다학년 학급을 만들 수 없다(WC105). 이름 우선 규칙은 다학년이 먼저라서
  -- 둘이 함께 있으면 학년 학급으로 들어갈 길이 막힌다.
  if p_grade is null and exists (
    select 1 from public.classes c
     where c.tenant_id = p_tenant_id and c.school_year = p_school_year and c.grade is not null
       and c.group_id is not distinct from p_group_id and lower(c.name) = lower(v_name)) then
    raise exception 'a graded class with this name already exists' using errcode = 'WC105';
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
-- 학생은 언제나 자기 학년을 한 학년 올리거나 졸업한다. 다학년 학급은 실제로 진급하는 학생의 mixed 줄에 대해서만
-- 만들어진다(졸업하는 학생, 학적이 없거나 이미 새 학년도 행이 있거나 학년이 없는 학생의 줄은 학급을 남기지 않는다).
-- p_pending(가입 전 줄)은 그 줄들의 다학년 학급도 같은 사전 생성에서 만들려고 받는다(없으면 빈 목록). 한 학생은 한 줄만 쓸 수 있다.
drop function public.fn_school_year_rollover(uuid, integer, jsonb, uuid);
create function public.fn_school_year_rollover(
  p_tenant uuid,
  p_to_year integer,
  p_rows jsonb,
  p_actor uuid,
  p_pending jsonb default '[]'::jsonb
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
  if exists (
    select 1 from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as x(student_id uuid)
     where x.student_id is not null group by x.student_id having count(*) > 1) then
    raise exception 'duplicate student_id in roster rows' using errcode = '22023';
  end if;
  -- 잠그는 순서: L(다음 학년도) -> 기관 행 갱신 -> 학적 행. fn_roster_rollover 가 이미 잡았으면 다시 잡을 뿐이다.
  perform public.fn_roster_pending_lock(p_tenant, p_to_year);

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

  -- 열린 신청을 먼저 거절한다. 다른 경로(승인, 본사 이동, 기타 소속 가입)처럼 신청 행을 학적 행보다 먼저 잠근다.
  update public.enrollment_changes c
     set status = 'rejected', reject_reason = '학년도가 바뀌어 신청이 닫혔어요',
         decided_by = p_actor, decided_teacher_id = v_teacher, proxy_session_id = v_proxy, decided_at = now()
   where c.tenant_id = p_tenant and c.status = 'pending';

  -- 이 호출이 건드릴 학적 행을 먼저 잠그고(아래 반복과 같은 id 순) 그 행으로 사전 생성할 학급을 정한다. 그 사이 학년이나
  -- 졸업이나 삭제가 바뀌어 고아 학급이 남거나 학급이 늦게 만들어지는 일이 없다.
  perform 1 from public.student_enrollments e
   where e.tenant_id = p_tenant and e.school_year = p_to_year - 1 and e.status = 'active'
   order by e.id for update;

  -- 진급할 학생의 다학년 줄과 저장할 가입 전 다학년 줄에 대해서만, 다학년 학급을 한 번씩 먼저 만든다. 줄 순서와 상관없이
  -- 같은 그룹과 이름의 학년 줄도 fn_class_ensure 의 이름 우선 규칙으로 그 다학년 학급에 들어가 한 학급이 둘로 갈라지지 않는다.
  perform public.fn_class_ensure(p_tenant, p_to_year, null, d.group_id, d.class_name)
    from (
      select x.group_id, x.class_name
        from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb))
             as x(student_id uuid, group_id uuid, class_name text, number smallint, mixed boolean)
        join public.student_enrollments e
          on e.student_id = x.student_id and e.tenant_id = p_tenant
         and e.school_year = p_to_year - 1 and e.status = 'active' and e.grade is not null
       where coalesce(x.mixed, false) and nullif(btrim(x.class_name), '') is not null
         and not (e.grade = '고3' or (e.grade = '중3' and v_org = '학교'))
         and not exists (select 1 from public.student_enrollments n
                          where n.student_id = e.student_id and n.school_year = p_to_year)
      union
      select t.group_id, t.class_name from public.fn_roster_mixed_pending_targets(p_pending) t
       order by 1 nulls first, 2
    ) d;

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

revoke all on function public.fn_school_year_rollover(uuid, integer, jsonb, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.fn_school_year_rollover(uuid, integer, jsonb, uuid, jsonb) to service_role;

-- 학기 중 명단 적용과 가입 전 명단에 다학년 줄을 더한다. 줄의 mixed 가 true 면 그 줄의 학급은 다학년 학급이다(학원만).
-- 학생의 학년은 건드리지 않는다. 가입 전 줄은 다학년 학급이면 grade 가 null 일 수 있다(줄에 실제 학년이 있으면 그대로).
-- 학년을 정하지 못한 줄은 mixed 가 아니면 지금처럼 건너뛴다.
create or replace function public.fn_roster_pending_replace(
  p_tenant uuid,
  p_year integer,
  p_rows jsonb,
  p_actor uuid,
  p_classes uuid[] default '{}'
)
returns table (stored_count integer, skipped_count integer, deleted_count integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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

  return query select v_stored, v_skipped, v_deleted;
end;
$$;

create or replace function public.fn_roster_midyear(
  p_tenant uuid,
  p_rows jsonb,
  p_pending jsonb,
  p_actor uuid
)
returns table (
  updated_count integer,
  skipped_count integer,
  pending_stored integer,
  pending_skipped integer,
  pending_deleted integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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

-- 학년도 넘기기와 가입 전 명단. fn_school_year_rollover 에 가입 전 줄을 같이 넘겨 그 줄의 다학년 학급도 학적 줄과 같은
-- 사전 생성에서 만든다.
create or replace function public.fn_roster_rollover(
  p_tenant uuid,
  p_to_year integer,
  p_rows jsonb,
  p_pending jsonb,
  p_actor uuid
)
returns table (
  graduated_count integer,
  promoted_count integer,
  skipped_count integer,
  assigned_count integer,
  pending_stored integer,
  pending_skipped integer,
  pending_deleted integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_r record;
  v_stored integer := 0;
  v_skipped integer := 0;
  v_deleted integer := 0;
begin
  if jsonb_array_length(coalesce(p_rows, '[]'::jsonb)) > 3000
     or jsonb_array_length(coalesce(p_pending, '[]'::jsonb)) > 3000 then
    raise exception 'too many roster rows' using errcode = '54000';
  end if;
  -- 같은 학년도 키로 가입 전 명단을 만지는 호출끼리 줄 세운다. 이 키는 학기 중 적용(넘기기 전 학년도)과 다르므로
  -- 넘기기와 학기 중 적용의 순서는 기관 행 잠금(넘기기의 갱신, 적용의 FOR SHARE)이 정한다.
  perform public.fn_roster_pending_lock(p_tenant, p_to_year);

  select * into v_r from public.fn_school_year_rollover(p_tenant, p_to_year, p_rows, p_actor, p_pending);

  -- 넘기기가 아무것도 하지 않았으면(다른 관리자가 이미 끝냄) 가입 전 명단은 건드리지 않는다.
  if v_r.graduated_count + v_r.promoted_count > 0 then
    select s.stored_count, s.skipped_count, s.deleted_count into v_stored, v_skipped, v_deleted
      from public.fn_roster_pending_replace(
        p_tenant, p_to_year, p_pending, p_actor,
        coalesce((
          select array_agg(distinct e.class_id)
            from public.student_enrollments e
            join jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as x(student_id uuid) on x.student_id = e.student_id
           where e.tenant_id = p_tenant and e.school_year = p_to_year and e.class_id is not null
        ), '{}')
      ) s;
  end if;

  return query select v_r.graduated_count, v_r.promoted_count, v_r.skipped_count, v_r.assigned_count,
                      v_stored, v_skipped, v_deleted;
end;
$$;

-- 학생의 학적 변경 신청: 학급 이름을 보낼 때 학년이 없으면 거부하고(다학년 학급이 만들어지지 않게),
-- 학급 이름 없이 학년만 바꾸면 지금 학급이 다학년일 때 그 학급을 유지한다.
create or replace function public.fn_request_enrollment_change(
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
    -- 학년 null 은 다학년 학급을 뜻하므로, 학생은 항상 실제 학년으로만 학급을 신청할 수 있다.
    if v_grade is null then
      raise exception 'grade required for a class' using errcode = 'not_null_violation';
    end if;
    v_class := public.fn_class_ensure(v_enr.tenant_id, v_enr.school_year, v_grade, v_group, p_to_class_name);
  elsif v_grade is not distinct from v_enr.grade
        or exists (select 1 from public.classes c where c.id = v_enr.class_id and c.grade is null) then
    -- 학급은 학년에 속하므로 학년이 바뀌면 비우지만, 다학년 학급은 학생의 학년이 바뀌어도 유지한다.
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
