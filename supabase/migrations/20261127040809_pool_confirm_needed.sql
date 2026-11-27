-- 미배정 목록 "확인 필요"(2026-11-27 고객 결정, 기관 유형 구분 없음).
-- 학생이 소속코드로 가입하거나 스스로 반을 정할 때(fn_enrollment_join) 적은 반이 업로드된 명단과 맞지 않으면
-- student_enrollments.needs_confirm 을 true 로 둔다. 학생은 적은 반에 그대로 있고, 교사는 미배정 목록에서
-- 확인(fn_enrollment_confirm)하거나 배치를 바꿔 확인한다.
-- 교사, 명단 적용, 학년도 전환, 본사 이동처럼 학생이 아닌 쪽이 배치를 쓰면 확인된 상태가 된다.
--
-- 이 마이그레이션 이전의 학적은 모두 확인된 것으로 본다. 새 열의 기본값 false 가 곧 그 백필이다
-- (데이터 문장 없이 기존 행이 false 로 채워진다). 그래서 지난 가입 학생이 목록에 한꺼번에 뜨지 않는다.

alter table public.student_enrollments
  add column needs_confirm boolean not null default false;

alter table public.student_enrollments
  add constraint student_enrollments_confirm_needs_class check (not needs_confirm or class_id is not null);

comment on column public.student_enrollments.needs_confirm is
  '학생이 스스로 적은 반이 명단과 맞지 않아 교사 확인을 기다리는 학적. fn_enrollment_join 만 true 로 쓰고, 확인이나 교사 쪽 배치 쓰기가 false 로 돌린다. 이 열이 생기기 전 학적은 false(확인됨).';

-- 확인 이력 kind 를 더한다.
alter table public.enrollment_changes drop constraint enrollment_changes_kind_check;
alter table public.enrollment_changes
  add constraint enrollment_changes_kind_check
  check (kind = any (array['signup', 'self_assign', 'request', 'homeroom_edit', 'admin_direct', 'pool_assign', 'rollover', 'confirm']));

-- 확인 필요 학적에 학생이 아닌 쪽이 배치를 쓰면(version 이 오르거나 학년, 반, 번호, 기관, 상태가 바뀌면) 확인된다.
-- fn_enrollment_update, fn_roster_midyear, fn_school_year_rollover, fn_decide_enrollment_change 를 따로 고치지 않고
-- 여기 한곳에서 정한다. 같은 update 에서 needs_confirm 을 직접 바꾸면(fn_enrollment_join, 확인) 그 값을 따른다.
create or replace function public.fn_enrollment_confirm_reset()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if old.needs_confirm and new.needs_confirm
     and (new.version <> old.version
          or (new.grade, new.class_id, new.number, new.tenant_id, new.status)
             is distinct from (old.grade, old.class_id, old.number, old.tenant_id, old.status)) then
    new.needs_confirm := false;
  end if;
  return new;
end;
$$;

revoke all on function public.fn_enrollment_confirm_reset() from public, anon, authenticated;
grant execute on function public.fn_enrollment_confirm_reset() to service_role;

create trigger trg_student_enrollments_confirm_reset
  before update on public.student_enrollments
  for each row execute function public.fn_enrollment_confirm_reset();

-- 학생 본인 입력 경로. 적은 반이 명단과 맞는지를 쓰기 전에 보고 needs_confirm 을 정한다.
create or replace function public.fn_enrollment_join(p_student uuid, p_tenant uuid, p_grade text, p_group_name text, p_class_name text, p_number smallint)
returns table (enrollment_id uuid, class_id uuid, version integer)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
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
  v_needs_confirm boolean := false;
begin
  if not exists (select 1 from public.profiles pr where pr.id = p_student and pr.member_type = 'student') then
    raise exception 'not a student account' using errcode = 'WC094';
  end if;

  -- 기관 행을 공유 잠금으로 읽어 학년도 넘기기가 끝날 때까지 기다리고, 읽은 학년도가 도중에 바뀌지 않게 한다.
  select school_year into v_year from public.tenants where id = p_tenant for share;
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

  -- 학생이 적은 반이 명단(roster_pending_students)과 맞는지 본다. 조건은 fn_roster_pending_claim 과 같다.
  -- 명단 행을 잠가 같은 행을 두 학생이 동시에 맞았다고 보지 않게 한다(먼저 잡은 쪽이 지우면 뒤쪽은 못 찾는다).
  if v_class is not null then
    perform 1 from public.roster_pending_students p
      join public.profiles pr on pr.id = p_student
     where p.tenant_id = p_tenant and p.school_year = v_year and p.class_id = v_class
       and p.name = btrim(pr.name)
       and (p.number is null or p.number = p_number)
       for update of p;
    v_needs_confirm := not found;
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
         set grade = p_grade, class_id = v_class, number = p_number, needs_confirm = v_needs_confirm,
             version = e.version + 1, updated_at = now(), updated_by = p_student
       where e.id = v_old.id
      returning * into v_new;
    else
      v_kind := 'signup';
      insert into public.student_enrollments (tenant_id, student_id, school_year, grade, class_id, number, needs_confirm, updated_by)
      values (p_tenant, p_student, v_year, p_grade, v_class, p_number, v_needs_confirm, p_student)
      returning * into v_new;
    end if;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'student_enrollments_class_number_idx' then
      perform public.fn_raise_number_taken(v_class, p_number);
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

-- 본사 학생 이동은 fn_enrollment_join 을 쓰지만 본사가 정한 배치라 확인된 상태로 둔다.
CREATE OR REPLACE FUNCTION "public"."fn_admin_move_student_tenant"("p_actor" "uuid", "p_student" "uuid", "p_tenant" "uuid", "p_grade" "text", "p_group_name" "text", "p_class_name" "text", "p_number" smallint) RETURNS TABLE("from_tenant_id" "uuid", "tenant_id" "uuid", "enrollment_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
#variable_conflict use_column
declare
  v_member_type text;
  v_from_tenant uuid;
  v_phone_digits text;
  v_target public.tenants;
  v_enrollment uuid;
  v_constraint text;
begin
  select p.member_type, p.tenant_id, regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g')
    into v_member_type, v_from_tenant, v_phone_digits
    from public.profiles p
   where p.id = p_student
     for update of p;
  if v_member_type is distinct from 'student' then
    raise exception 'not a student account' using errcode = 'WC094';
  end if;

  select * into v_target from public.tenants t where t.id = p_tenant for share;
  if not found then
    raise exception 'tenant_not_found' using errcode = 'P0002';
  end if;
  if v_target.id is not distinct from v_from_tenant then
    raise exception 'same_tenant' using errcode = 'WC099';
  end if;

  if v_phone_digits <> '' and exists (
    select 1 from public.profiles pr
     where pr.id <> p_student
       and pr.member_type is not null
       and pr.tenant_id = v_target.id
       and regexp_replace(coalesce(pr.phone, ''), '[^0-9]', '', 'g') = v_phone_digits
  ) then
    raise exception 'phone_taken' using errcode = 'WC096';
  end if;

  update public.enrollment_changes c
     set status = 'rejected', reject_reason = '소속 변경', decided_by = p_actor, decided_at = now()
   where c.student_id = p_student and c.status = 'pending';

  -- 옛 기관의 활성 학적 행과, 올해 학적 행이 다른 기관에 남은 경우를 함께 지운다. 학적은 (학생, 학년도)당 하나라
  -- 남겨 두면 fn_enrollment_join 이 그 행을 잡아 WC079 나 외래키 오류로 막힌다. 졸업 행은 남긴다.
  delete from public.student_enrollments e
   where e.student_id = p_student
     and e.status = 'active'
     and (e.tenant_id = v_from_tenant or e.school_year = v_target.school_year);

  -- 지운 뒤에도 올해 학적 행이 다른 기관에 남아 있으면(졸업 행 등, 기관마다 학년도 전환 시점이 달랐던 경우)
  -- fn_enrollment_join 이 그 행을 조용히 덮어쓰므로 막는다.
  if exists (
    select 1 from public.student_enrollments e
     where e.student_id = p_student
       and e.school_year = v_target.school_year
       and e.tenant_id <> v_target.id
  ) then
    raise exception 'other_tenant_enrollment' using errcode = 'WC100';
  end if;

  perform set_config('app.tenant_set_via_rpc', '1', true);
  begin
    update public.profiles pr
       set tenant_id = v_target.id,
           school_name = case when v_target.org_type = '학교' then v_target.name end,
           updated_at = now()
     where pr.id = p_student;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'profiles_tenant_phone_unique_idx' then
      raise exception 'phone_taken' using errcode = 'WC096';
    end if;
    raise;
  end;

  select j.enrollment_id into v_enrollment
    from public.fn_enrollment_join(p_student, v_target.id, p_grade, p_group_name, p_class_name, p_number) j;

  -- 본사가 정한 배치라 교사 배치와 같게 확인된 상태로 둔다(fn_enrollment_join 은 학생 본인 입력으로 본다).
  update public.student_enrollments e set needs_confirm = false
   where e.id = v_enrollment and e.needs_confirm;

  return query select v_from_tenant, v_target.id, v_enrollment;
end;
$$;

-- 확인 필요 학생을 확인한다(학교 관리자, 본사 대행은 기관 전체, 담임은 p_allowed_class_ids 의 반만).
-- 이미 확인된 학적은 version 과 상관없이 바꾸지 않고 changed false 로 돌려준다(멱등).
-- 확인 필요인데 version 이 다르면 WC078, 학적이 없거나 범위 밖이면 WC081.
create or replace function public.fn_enrollment_confirm(p_student uuid, p_expected_version integer, p_actor uuid, p_tenant uuid, p_allowed_class_ids uuid[] default null)
returns table (enrollment_id uuid, version integer, changed boolean)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
#variable_conflict use_column
declare
  v_year integer;
  v_old public.student_enrollments;
  v_new public.student_enrollments;
  v_teacher uuid;
  v_proxy uuid;
begin
  select t.school_year into v_year from public.tenants t where t.id = p_tenant for share;
  if v_year is null then
    raise exception 'enrollment not found' using errcode = 'WC081';
  end if;

  select e.* into v_old from public.student_enrollments e
   where e.student_id = p_student and e.tenant_id = p_tenant and e.school_year = v_year and e.status = 'active'
     for update;
  if not found
     or (p_allowed_class_ids is not null
         and (v_old.class_id is null or v_old.class_id <> all (p_allowed_class_ids))) then
    raise exception 'enrollment not found' using errcode = 'WC081';
  end if;

  if not v_old.needs_confirm then
    return query select v_old.id, v_old.version, false;
    return;
  end if;
  if v_old.version <> p_expected_version then
    raise exception 'enrollment was changed by someone else' using errcode = 'WC078';
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
    p_tenant, p_student, v_year, 'confirm', 'applied',
    v_old.grade, v_old.class_id, v_old.number, v_new.grade, v_new.class_id, v_new.number,
    p_expected_version, p_actor, p_actor, v_teacher, v_proxy, now()
  );

  return query select v_new.id, v_new.version, true;
end;
$$;

revoke all on function public.fn_enrollment_confirm(uuid, integer, uuid, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.fn_enrollment_confirm(uuid, integer, uuid, uuid, uuid[]) to service_role;
