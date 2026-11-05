-- B2B 기반 4: 선생님, 담당 학급, 가드 트리거, 로그인 아이디 생성기, 등록 함수.
-- 새 테이블은 비어 있고 어디서도 참조하지 않는다. is_username_available 은 teachers 가 비어 있으면
-- 이전과 같은 결과를 돌려주므로 위닝 사이트 DB 의 동작은 바뀌지 않는다.
-- 콘솔 데이터는 service_role API 만 읽고 쓴다. RLS 를 켜고 정책 없이 anon, authenticated 권한을 모두 회수한다.
--
-- 에러 코드: WC075 전화번호가 다른 이름의 교사에게 이미 쓰이는 중, WC076 마지막 학교 관리자 보호.

-- 사람 + 계정 상태. 계정보다 먼저 행이 생길 수 있다.
create table public.teachers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  name text not null check (btrim(name) <> ''),
  phone text not null check (phone ~ '^01[0-9]{8,9}$'),
  role text not null check (role in ('homeroom', 'school_admin')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  login_id text check (login_id ~ '^[A-HJ-KM-NP-Z2-9]{14}$'),
  profile_id uuid unique references public.profiles (id) on delete set null,
  must_change_password boolean not null default false,
  temp_password_hash text,
  temp_password_issued_at timestamptz,
  password_set_at timestamptz,
  -- 계정 발급을 맡은 요청이 얻은 시각. 동시에 두 요청이 Auth 비밀번호를 덮어쓰지 않게 한다(fn_teacher_issue_claim).
  issue_claimed_at timestamptz,
  position text,
  email text,
  landline text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid,
  constraint teachers_profile_needs_login_id check (profile_id is null or login_id is not null),
  constraint teachers_temp_password_flag check (must_change_password = (temp_password_hash is not null)),
  unique (id, tenant_id)
);

-- 삭제된 행의 아이디도 다시 쓰지 못하도록 deleted_at 과 무관하게 유일하다.
create unique index teachers_login_id_idx on public.teachers (login_id);
create unique index teachers_tenant_phone_idx on public.teachers (tenant_id, phone) where deleted_at is null;
create index teachers_tenant_idx on public.teachers (tenant_id) where deleted_at is null;

-- 담당 학급. 한 학급에 담임은 한 명, 교사당 주담당은 하나.
create table public.teacher_class_assignments (
  teacher_id uuid not null,
  tenant_id uuid not null,
  class_id uuid not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid,
  primary key (teacher_id, class_id),
  foreign key (teacher_id, tenant_id) references public.teachers (id, tenant_id) on delete cascade,
  foreign key (class_id, tenant_id) references public.classes (id, tenant_id) on delete cascade,
  unique (class_id)
);

create unique index teacher_class_assignments_primary_idx
  on public.teacher_class_assignments (teacher_id) where is_primary;

-- 기관과 로그인 아이디는 바꿀 수 없고, 로그인 아이디는 기관 코드로 시작해야 한다.
create function public.fn_teachers_guard_identity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code text;
begin
  if tg_op = 'UPDATE' then
    if new.tenant_id is distinct from old.tenant_id then
      raise exception 'teachers.tenant_id is immutable' using errcode = 'check_violation';
    end if;
    if old.login_id is not null and new.login_id is distinct from old.login_id then
      raise exception 'teachers.login_id is immutable once set' using errcode = 'check_violation';
    end if;
    new.updated_at := now();
  end if;

  if new.login_id is not null then
    select code into v_code from public.tenants where id = new.tenant_id;
    if left(new.login_id, 8) is distinct from v_code then
      raise exception 'teachers.login_id must start with the tenant code' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_teachers_guard_identity
  before insert or update on public.teachers
  for each row execute function public.fn_teachers_guard_identity();

-- 기관의 마지막 활성 학교 관리자는 비활성화, 삭제, 강등할 수 없다.
-- 기관 행을 먼저 잠가 동시에 두 명을 빼려는 요청이 직렬화된다(fn_guard_last_super_admin 과 같은 모양).
create function public.fn_guard_last_school_admin()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_remaining int;
begin
  if old.role <> 'school_admin' or old.status <> 'active' or old.deleted_at is not null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'UPDATE'
     and new.role = 'school_admin' and new.status = 'active' and new.deleted_at is null then
    return new;
  end if;

  perform 1 from public.tenants where id = old.tenant_id for update;

  select count(*) into v_remaining
    from public.teachers t
   where t.tenant_id = old.tenant_id
     and t.id <> old.id
     and t.role = 'school_admin'
     and t.status = 'active'
     and t.deleted_at is null;

  if v_remaining = 0 then
    raise exception '학교 관리자가 1명뿐이라 비활성화, 삭제, 강등할 수 없다. 다른 관리자를 먼저 지정할 것.'
      using errcode = 'WC076';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger trg_teachers_guard_last_school_admin
  before update or delete on public.teachers
  for each row execute function public.fn_guard_last_school_admin();

alter table public.teachers enable row level security;
alter table public.teacher_class_assignments enable row level security;
revoke all on table public.teachers, public.teacher_class_assignments from anon, authenticated;
grant all on table public.teachers, public.teacher_class_assignments to service_role;

comment on table public.teachers is '선생님 사람과 계정 상태. 계정보다 먼저 행이 생길 수 있다. 같은 기관, 이름, 전화번호는 같은 사람이다. login_id 는 삭제 후에도 재사용하지 않는다.';
comment on table public.teacher_class_assignments is '담당 학급. 학급당 담임 하나, 교사당 주담당 하나. 기관이 다른 학급은 복합 FK 로 막힌다.';

-- 기관 코드 8자 + 무작위 6자. 문자 집합은 fn_generate_tenant_code 와 같은 31자(rejection sampling).
-- teachers.login_id 와 profiles.username 에 이미 있으면 다시 뽑는다.
create function public.fn_generate_teacher_login_id(p_tenant_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  c_len      constant int  := length(c_alphabet);
  c_limit    constant int  := (256 / c_len) * c_len;
  v_code text;
  v_suffix text;
  v_id text;
  v_byte int;
begin
  select code into v_code from public.tenants where id = p_tenant_id;
  if v_code is null then
    raise exception 'tenant not found' using errcode = 'no_data_found';
  end if;

  loop
    v_suffix := '';
    while length(v_suffix) < 6 loop
      v_byte := get_byte(extensions.gen_random_bytes(1), 0);
      if v_byte < c_limit then
        v_suffix := v_suffix || substr(c_alphabet, (v_byte % c_len) + 1, 1);
      end if;
    end loop;
    v_id := v_code || v_suffix;

    exit when not exists (select 1 from public.teachers where login_id = v_id)
      and not exists (select 1 from public.profiles where lower(trim(username)) = lower(v_id));
  end loop;

  return v_id;
end;
$$;

-- 같은 사람이면(기관, 이름, 전화번호) 학급만 더하고, 다른 이름이면 WC075.
-- 같은 사람에게 학교 관리자를 발급하면 그 행을 승격한다(id 와 로그인 아이디 유지, 강등은 하지 않는다).
-- p_classes: [{ "grade": "고1", "name": "3반", "group_id": null, "school_year": 생략하면 기관 현재 학년도 }]
-- 학급은 fn_class_ensure 로 만들고, 다른 교사가 이미 담임이면 23505 로 함수 전체가 취소된다.
create function public.fn_teacher_register(
  p_tenant_id uuid,
  p_name text,
  p_phone text,
  p_role text,
  p_classes jsonb,
  p_actor uuid
)
returns table (teacher_id uuid, verdict text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_name text := btrim(p_name);
  v_year integer;
  v_t public.teachers;
  v_verdict text;
  v_row jsonb;
  v_class uuid;
begin
  select school_year into v_year from public.tenants where id = p_tenant_id;
  if v_year is null then
    raise exception 'tenant not found' using errcode = 'no_data_found';
  end if;

  select * into v_t from public.teachers
   where tenant_id = p_tenant_id and phone = p_phone and deleted_at is null
   for update;

  if found then
    if v_t.name <> v_name then
      raise exception 'phone already used by another teacher' using errcode = 'WC075';
    end if;
    if p_role = 'school_admin' and v_t.role = 'homeroom' then
      update public.teachers set role = 'school_admin' where id = v_t.id;
      v_verdict := 'promoted';
    else
      v_verdict := 'classes_added';
    end if;
  else
    insert into public.teachers (tenant_id, name, phone, role, login_id, created_by)
    values (p_tenant_id, v_name, p_phone, p_role, public.fn_generate_teacher_login_id(p_tenant_id), p_actor)
    returning * into v_t;
    v_verdict := 'created';
  end if;

  for v_row in select * from jsonb_array_elements(coalesce(p_classes, '[]'::jsonb)) loop
    v_class := public.fn_class_ensure(
      p_tenant_id,
      coalesce((v_row ->> 'school_year')::integer, v_year),
      v_row ->> 'grade',
      nullif(v_row ->> 'group_id', '')::uuid,
      v_row ->> 'name'
    );
    insert into public.teacher_class_assignments (teacher_id, tenant_id, class_id, is_primary, created_by)
    values (
      v_t.id, p_tenant_id, v_class,
      not exists (select 1 from public.teacher_class_assignments a where a.teacher_id = v_t.id and a.is_primary),
      p_actor
    )
    on conflict (teacher_id, class_id) do nothing;
  end loop;

  return query select v_t.id, v_verdict;
end;
$$;

-- 발급된 로그인 아이디는 삭제된 교사 것까지 쓸 수 없다.
create or replace function public.is_username_available(check_username text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select not exists (
    select 1
    from public.profiles p
    where lower(trim(p.username)) = lower(trim(check_username))
      and p.username is not null
      and trim(p.username) <> ''
  ) and not exists (
    select 1
    from public.teachers t
    where lower(trim(t.login_id)) = lower(trim(check_username))
  );
$$;

revoke all on function public.fn_generate_teacher_login_id(uuid) from public, anon, authenticated;
grant execute on function public.fn_generate_teacher_login_id(uuid) to service_role;
revoke all on function public.fn_teacher_register(uuid, text, text, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.fn_teacher_register(uuid, text, text, text, jsonb, uuid) to service_role;
