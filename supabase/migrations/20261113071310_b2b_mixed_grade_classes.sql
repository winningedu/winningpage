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
