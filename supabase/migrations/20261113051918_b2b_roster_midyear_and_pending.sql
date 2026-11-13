-- B2B 명단 올리기: 학기 중 적용과 가입 전 학생 명단.
-- 새 테이블과 새 함수만 더한다. 기존 함수(fn_school_year_rollover 등)와 위닝 사이트 DB 동작은 바뀌지 않는다.
-- 에러 코드는 학적 함수와 같다: WC077 번호가 이미 쓰이는 중, WC078 다른 사람이 먼저 바꿈(version 불일치).

-- 가입하지 않은 학생의 명단 줄(미회원가입). 이름, 학년, 학급, 번호만 둔다.
-- 콘솔 데이터는 service_role API 만 읽고 쓴다. RLS 를 켜고 정책 없이 anon, authenticated 권한을 모두 회수한다.
create table public.roster_pending_students (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  school_year smallint not null,
  name text not null check (btrim(name) <> ''),
  grade text not null check (grade in ('중1', '중2', '중3', '고1', '고2', '고3')),
  class_id uuid not null,
  number smallint check (number between 1 and 99),
  created_at timestamptz not null default now(),
  created_by uuid,
  -- 학급은 같은 기관, 학년도, 학년이어야 한다.
  foreign key (class_id, tenant_id, school_year, grade)
    references public.classes (id, tenant_id, school_year, grade)
);

create index roster_pending_students_tenant_year_idx
  on public.roster_pending_students (tenant_id, school_year);

alter table public.roster_pending_students enable row level security;
revoke all on table public.roster_pending_students from anon, authenticated;
grant all on table public.roster_pending_students to service_role;

comment on table public.roster_pending_students is
  '명단에는 있지만 아직 가입하지 않은 학생(미회원가입). 올릴 때마다 기관과 학년도 단위로 통째로 바꾼다. 읽을 때 가입한 학생과 겹치면 가린다.';

-- 가입 전 명단을 기관과 학년도 단위로 통째로 바꾼다. 같은 기관, 학년도의 동시 호출은 자문 잠금으로 줄을 세운다.
-- p_rows 의 {name, grade, group_id?, class_name?, number?} 중 이름, 학년, 반을 정하지 못한 줄은 건너뛰고 센다.
-- 학급은 fn_class_ensure 로 필요할 때 만든다(학적과 같은 길).
create function public.fn_roster_pending_replace(
  p_tenant uuid,
  p_year integer,
  p_rows jsonb,
  p_actor uuid
)
returns table (stored_count integer, skipped_count integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  c_grades constant text[] := array['중1', '중2', '중3', '고1', '고2', '고3'];
  v_r record;
  v_class uuid;
  v_stored integer := 0;
  v_skipped integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended('roster_pending:' || p_tenant::text || ':' || p_year::text, 0));

  delete from public.roster_pending_students p
   where p.tenant_id = p_tenant and p.school_year = p_year;

  for v_r in
    select x.name, x.grade, x.group_id, x.class_name, x.number
      from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb))
           as x(name text, grade text, group_id uuid, class_name text, number smallint)
  loop
    if nullif(btrim(v_r.name), '') is null
       or v_r.grade is null or v_r.grade <> all (c_grades)
       or nullif(btrim(v_r.class_name), '') is null then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_class := public.fn_class_ensure(p_tenant, p_year, v_r.grade, v_r.group_id, v_r.class_name);
    insert into public.roster_pending_students (tenant_id, school_year, name, grade, class_id, number, created_by)
    values (p_tenant, p_year, btrim(v_r.name), v_r.grade, v_class, v_r.number, p_actor);
    v_stored := v_stored + 1;
  end loop;

  return query select v_stored, v_skipped;
end;
$$;

-- 학년도 넘기기와 가입 전 명단을 한 트랜잭션으로. 넘기기는 fn_school_year_rollover 그대로고(같은 학년도로 다시
-- 부르면 효과 없음), 기관이 p_to_year 에 있을 때 그 학년도의 가입 전 명단을 바꾼다.
create function public.fn_roster_rollover(
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
  pending_skipped integer
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
begin
  select * into v_r from public.fn_school_year_rollover(p_tenant, p_to_year, p_rows, p_actor);

  if exists (select 1 from public.tenants t where t.id = p_tenant and t.school_year = p_to_year) then
    select s.stored_count, s.skipped_count into v_stored, v_skipped
      from public.fn_roster_pending_replace(p_tenant, p_to_year, p_pending, p_actor) s;
  end if;

  return query select v_r.graduated_count, v_r.promoted_count, v_r.skipped_count, v_r.assigned_count,
                      v_stored, v_skipped;
end;
$$;

-- 학기 중 명단 적용. 학년은 그대로 두고 명단에 있는 재학생의 학급(그룹, 반)과 번호만 바꾼다.
-- 명단에 없는 학생은 건드리지 않고, 졸업도 없고, tenants.school_year 도 그대로다. 몇 번이든 부를 수 있다.
-- p_rows 의 {student_id, class_name, group_id?, number?, version} 마다
--   학적이 없거나 재학이 아니거나 학년이 없으면 건너뛰고(skipped_count), 이미 그 학급과 번호면 건너뛴다.
--   version 이 지금 학적과 다르면 WC078 로 전체가 되돌려진다(미리보기 뒤에 바뀐 학생).
--   번호가 겹치면 WC077 로 전체가 되돌려진다. 학급 안에서 번호를 서로 맞바꾸는 명단도 되도록,
--   바꿀 학생의 번호를 먼저 비우고(version 은 올리지 않는다) 새 값을 넣는다.
-- 이력은 enrollment_changes 에 kind admin_direct, reason class_change(학급이 바뀜) 또는 number_change(번호만)로 남긴다.
-- 기관 행을 공유 잠금으로 읽어 학년도 넘기기와 겹치지 않게 하고, 학적은 학생 id 순으로 잠근다.
-- 같은 학생이 두 번 오면 첫 줄만 쓴다. 가입 전 명단은 기관의 올해 학년도 것을 같은 트랜잭션에서 바꾼다.
create function public.fn_roster_midyear(
  p_tenant uuid,
  p_rows jsonb,
  p_pending jsonb,
  p_actor uuid
)
returns table (updated_count integer, skipped_count integer, pending_stored integer, pending_skipped integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_year integer;
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
  v_constraint text;
begin
  select t.school_year into v_year from public.tenants t where t.id = p_tenant for share;
  if v_year is null then
    raise exception 'tenant not found' using errcode = 'no_data_found';
  end if;

  select a.teacher_id, a.proxy_session_id into v_teacher, v_proxy from public.fn_console_actor(p_actor) a;

  for v_r in
    select x.student_id, x.group_id, x.class_name, x.number, x.version
      from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb))
           as x(student_id uuid, group_id uuid, class_name text, number smallint, version integer)
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

    v_class := public.fn_class_ensure(p_tenant, v_year, v_e.grade, v_r.group_id, v_r.class_name);
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

  select s.stored_count, s.skipped_count into v_stored, v_pending_skipped
    from public.fn_roster_pending_replace(p_tenant, v_year, p_pending, p_actor) s;

  return query select v_updated, v_skipped, v_stored, v_pending_skipped;
end;
$$;

revoke all on function public.fn_roster_pending_replace(uuid, integer, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.fn_roster_pending_replace(uuid, integer, jsonb, uuid) to service_role;
revoke all on function public.fn_roster_rollover(uuid, integer, jsonb, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.fn_roster_rollover(uuid, integer, jsonb, jsonb, uuid) to service_role;
revoke all on function public.fn_roster_midyear(uuid, jsonb, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.fn_roster_midyear(uuid, jsonb, jsonb, uuid) to service_role;
