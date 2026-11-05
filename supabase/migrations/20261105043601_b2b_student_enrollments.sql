-- B2B 기반 9 (A): 학적, 학적 변경 이력, 가입/수정 함수, 본인 행 읽기 정책.
-- 새 테이블은 비어 있고 어디서도 참조하지 않아 위닝 사이트 DB 동작은 바뀌지 않는다.
-- 콘솔 데이터는 service_role API 가 읽고 쓴다. 학생 본인은 자기 행을 읽기만 한다(마이페이지, 신청 결과).
--
-- 에러 코드: WC077 번호가 이미 쓰이는 중, WC078 다른 사람이 먼저 바꿈(version 불일치),
-- WC079 이미 학급이 정해진 학적, WC080 등록되지 않은 그룹, WC081 학적 없음.

-- 학적: 학생 한 명의 학년도별 한 행.
create table public.student_enrollments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  student_id uuid not null references public.profiles (id) on delete cascade,
  school_year smallint not null,
  grade text check (grade in ('중1', '중2', '중3', '고1', '고2', '고3')),
  class_id uuid,
  number smallint check (number between 1 and 99),
  status text not null default 'active' check (status in ('active', 'graduated')),
  graduated_at timestamptz,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint student_enrollments_class_needs_grade check (class_id is null or grade is not null),
  constraint student_enrollments_graduated_pair check ((status = 'graduated') = (graduated_at is not null)),
  -- 학급은 같은 기관, 학년도, 학년이어야 한다. class_id 가 null 이면 검사하지 않는다(MATCH SIMPLE).
  foreign key (class_id, tenant_id, school_year, grade)
    references public.classes (id, tenant_id, school_year, grade)
);

create unique index student_enrollments_student_year_idx
  on public.student_enrollments (student_id, school_year);
-- 번호가 null 이면 제외된다.
create unique index student_enrollments_class_number_idx
  on public.student_enrollments (class_id, number) where number is not null;
create index student_enrollments_tenant_year_status_idx
  on public.student_enrollments (tenant_id, school_year, status);
create index student_enrollments_class_idx on public.student_enrollments (class_id);
create index student_enrollments_graduated_idx
  on public.student_enrollments (tenant_id, graduated_at) where status = 'graduated';

-- 학적 변경 이력과 신청을 한 테이블에 둔다.
create table public.enrollment_changes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  student_id uuid not null references public.profiles (id) on delete cascade,
  school_year smallint not null,
  kind text not null check (kind in
    ('signup', 'self_assign', 'request', 'homeroom_edit', 'admin_direct', 'pool_assign', 'rollover')),
  status text not null check (status in ('pending', 'applied', 'rejected')),
  from_grade text,
  from_class_id uuid references public.classes (id) on delete set null,
  from_number smallint,
  to_grade text,
  to_class_id uuid references public.classes (id) on delete set null,
  to_number smallint,
  reason text check (reason in ('auto', 'promotion', 'class_change', 'number_change', 'transfer', 'correction')),
  reject_reason text,
  base_version integer,
  requested_by uuid,
  decided_by uuid,
  decided_teacher_id uuid references public.teachers (id) on delete set null,
  proxy_session_id uuid references public.proxy_sessions (id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  constraint enrollment_changes_reject_reason check (status <> 'rejected' or coalesce(btrim(reject_reason) <> '', false)),
  constraint enrollment_changes_pending_is_request check (status <> 'pending' or kind = 'request')
);

-- 열린 신청은 학생당 하나.
create unique index enrollment_changes_pending_student_idx
  on public.enrollment_changes (student_id) where status = 'pending';
create index enrollment_changes_tenant_status_idx
  on public.enrollment_changes (tenant_id, status, created_at);
create index enrollment_changes_student_created_idx
  on public.enrollment_changes (student_id, created_at);

alter table public.student_enrollments enable row level security;
alter table public.enrollment_changes enable row level security;
revoke all on table public.student_enrollments, public.enrollment_changes from anon, authenticated;
grant select on table public.student_enrollments, public.enrollment_changes to authenticated;
grant all on table public.student_enrollments, public.enrollment_changes to service_role;

create policy student_enrollments_select_own on public.student_enrollments
  for select to authenticated using (student_id = auth.uid());
create policy enrollment_changes_select_own on public.enrollment_changes
  for select to authenticated using (student_id = auth.uid());

comment on table public.student_enrollments is '학생의 학년도별 학적(학급, 번호, 졸업). version 은 동시 수정 감지용. 학생 본인은 읽기만 한다.';
comment on table public.enrollment_changes is '학적 변경 신청과 적용 이력. status pending 은 kind request 만, 학생당 하나.';

-- 가입 또는 스스로 배정. 올해(기관의 school_year) 학적이 없으면 만들고(signup),
-- 있는데 학급이 비어 있으면 학급과 번호를 채운다(self_assign). 이미 학급이 있으면 거부(WC079).
-- 학급은 fn_class_ensure 로 필요할 때 만든다. 그룹 이름은 대소문자와 앞뒤 공백을 무시하고 찾고
-- 없으면 WC080. 같은 학급의 같은 번호는 WC077. 모두 한 트랜잭션이라 실패하면 아무것도 남지 않는다.
-- student_profiles.grade(서비스가 읽는 값)도 같은 트랜잭션에서 맞춘다.
create function public.fn_enrollment_join(
  p_student uuid,
  p_tenant uuid,
  p_grade text,
  p_group_name text,
  p_class_name text,
  p_number smallint
)
returns table (enrollment_id uuid, class_id uuid, version integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_year integer;
  v_group uuid;
  v_class uuid;
  v_old public.student_enrollments;
  v_new public.student_enrollments;
  v_kind text;
  v_constraint text;
begin
  select school_year into v_year from public.tenants where id = p_tenant;
  if v_year is null then
    raise exception 'tenant not found' using errcode = 'no_data_found';
  end if;

  if nullif(btrim(p_group_name), '') is not null then
    select g.id into v_group from public.class_groups g
     where g.tenant_id = p_tenant and lower(g.name) = lower(btrim(p_group_name)) and g.deleted_at is null;
    if v_group is null then
      raise exception 'class group not registered' using errcode = 'WC080';
    end if;
  end if;

  if nullif(btrim(p_class_name), '') is not null then
    v_class := public.fn_class_ensure(p_tenant, v_year, p_grade, v_group, p_class_name);
  end if;

  select * into v_old from public.student_enrollments e
   where e.student_id = p_student and e.school_year = v_year for update;

  begin
    if found then
      if v_old.class_id is not null then
        raise exception 'enrollment already has a class' using errcode = 'WC079';
      end if;
      v_kind := 'self_assign';
      update public.student_enrollments e
         set grade = p_grade, class_id = v_class, number = p_number,
             version = e.version + 1, updated_at = now(), updated_by = p_student
       where e.id = v_old.id
      returning * into v_new;
    else
      v_kind := 'signup';
      insert into public.student_enrollments (tenant_id, student_id, school_year, grade, class_id, number, updated_by)
      values (p_tenant, p_student, v_year, p_grade, v_class, p_number, p_student)
      returning * into v_new;
    end if;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'student_enrollments_class_number_idx' then
      raise exception 'class number already taken' using errcode = 'WC077';
    end if;
    raise exception 'enrollment already exists' using errcode = 'WC079';
  end;

  if p_grade is not null then
    update public.student_profiles sp set grade = p_grade, updated_at = now()
     where sp.profile_id = p_student and sp.grade is distinct from p_grade;
  end if;

  insert into public.enrollment_changes (
    tenant_id, student_id, school_year, kind, status,
    from_grade, from_class_id, from_number, to_grade, to_class_id, to_number,
    reason, base_version, requested_by, decided_at
  ) values (
    p_tenant, p_student, v_year, v_kind, 'applied',
    v_old.grade, v_old.class_id, v_old.number, v_new.grade, v_new.class_id, v_new.number,
    'auto', v_old.version, p_student, now()
  );

  return query select v_new.id, v_new.class_id, v_new.version;
end;
$$;

-- 학적 수정(담임 수정, 관리자 직접, 풀 배정). 학년, 학급, 번호를 한 번에 새 값으로 바꾼다.
-- p_expected_version 이 현재 version 과 다르면 WC078(다른 분이 먼저 바꿈), 학적이 없으면 WC081,
-- 같은 번호는 WC077. 학급이 다른 기관, 학년도, 학년이면 복합 FK 가 막는다(23503).
-- p_apply_year 가 null 이면 기관의 올해. 올해나 다음 해만 고칠 수 있고 그 밖은 22023(P16).
-- 다음 해 행이 없으면 만든다(올해 학적이 있는 같은 기관의 학생만, version 은 비교하지 않는다).
-- 올해 행의 학년이 바뀌면 student_profiles.grade 도 맞춘다.
-- 적용 이력을 enrollment_changes 에 남기고, 행위자가 대행 중인 본사 관리자거나 교사면
-- 대행 세션과 교사 id 도 같이 남긴다.
-- 기관 범위: 행을 잠근 뒤 p_tenant 가 학적의 기관과 다르면 WC081(다른 기관의 학생은 없는 것처럼 숨긴다).
-- p_allowed_class_ids 가 null 이 아니면(담임) 학적의 현재 학급이 그 목록에 있어야 하고, 아니면 WC081 이다.
create function public.fn_enrollment_update(
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
            raise exception 'class number already taken' using errcode = 'WC077';
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
     and (v_old.class_id is null or v_old.class_id <> all (p_allowed_class_ids)) then
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
      raise exception 'class number already taken' using errcode = 'WC077';
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

revoke all on function public.fn_enrollment_join(uuid, uuid, text, text, text, smallint) from public, anon, authenticated;
grant execute on function public.fn_enrollment_join(uuid, uuid, text, text, text, smallint) to service_role;
revoke all on function public.fn_enrollment_update(uuid, integer, text, uuid, smallint, text, text, integer, uuid, uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.fn_enrollment_update(uuid, integer, text, uuid, smallint, text, text, integer, uuid, uuid, uuid[])
  to service_role;
