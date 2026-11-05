-- B2B 기반 3: 반 그룹, 학급, 학급 이름 정규화, 학급 찾기/만들기.
-- 새 테이블은 비어 있고 어디서도 참조하지 않아 위닝 사이트 DB 에는 영향이 없다.
-- 콘솔 데이터는 service_role API 만 읽고 쓴다. RLS 를 켜고 정책 없이 anon, authenticated 권한을 모두 회수한다.

-- 학원 수준 그룹(소프트 삭제만)
create table public.class_groups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, tenant_id)
);

create unique index class_groups_tenant_name_idx
  on public.class_groups (tenant_id, lower(name)) where deleted_at is null;

-- 학급 = 기관, 학년도, 학년, 그룹, 반
create table public.classes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  school_year smallint not null,
  grade text not null check (grade in ('중1', '중2', '중3', '고1', '고2', '고3')),
  group_id uuid,
  name text not null check (btrim(name) <> ''),
  capacity smallint check (capacity > 0),
  created_at timestamptz not null default now(),
  foreign key (group_id, tenant_id) references public.class_groups (id, tenant_id),
  unique (id, tenant_id),
  unique (id, tenant_id, school_year, grade)
);

create unique index classes_identity_idx
  on public.classes (tenant_id, school_year, grade, group_id, lower(name)) nulls not distinct;
create index classes_tenant_year_idx on public.classes (tenant_id, school_year);

create function public.fn_classes_lock_tenant()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.tenant_id is distinct from old.tenant_id then
    raise exception 'classes.tenant_id is immutable' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger trg_classes_lock_tenant
  before update of tenant_id on public.classes
  for each row execute function public.fn_classes_lock_tenant();

alter table public.class_groups enable row level security;
alter table public.classes enable row level security;
revoke all on table public.class_groups, public.classes from anon, authenticated;
grant all on table public.class_groups, public.classes to service_role;

comment on table public.class_groups is '학원 수준 그룹. 삭제는 deleted_at 소프트 삭제만 한다.';
comment on table public.classes is '학급(기관, 학년도, 학년, 그룹, 반). fn_class_ensure 로 필요할 때 만든다.';

-- 학교(org_type = 학교)는 숫자만 남기고 앞의 0 을 뗀다(03, 3반, 3 은 모두 3).
-- 그 외 기관은 학원 규칙으로 앞뒤와 안의 공백을 모두 지운다. 학교에서 숫자가 남지 않으면 빈 문자열이다.
create function public.fn_normalize_class_name(p_org_type text, p_raw text)
returns text
language sql
immutable
security definer
set search_path = public, pg_temp
as $$
  select case
    when p_org_type = '학교'
      then ltrim(regexp_replace(coalesce(p_raw, ''), '[^0-9]', '', 'g'), '0')
    else regexp_replace(coalesce(p_raw, ''), '\s', '', 'g')
  end
$$;

-- 같은 입력이면 같은 학급 id 를 돌려주는 find-or-create. 학교는 그룹을 쓰지 않는다.
create function public.fn_class_ensure(
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
  v_name := public.fn_normalize_class_name(v_org_type, p_raw_name);
  if v_name = '' then
    raise exception 'invalid class name' using errcode = 'invalid_parameter_value';
  end if;

  insert into public.classes (tenant_id, school_year, grade, group_id, name)
  values (p_tenant_id, p_school_year, p_grade, p_group_id, v_name)
  on conflict (tenant_id, school_year, grade, group_id, lower(name)) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.classes
    where tenant_id = p_tenant_id and school_year = p_school_year and grade = p_grade
      and group_id is not distinct from p_group_id and lower(name) = lower(v_name);
  end if;
  return v_id;
end;
$$;

revoke all on function public.fn_normalize_class_name(text, text) from public, anon, authenticated;
grant execute on function public.fn_normalize_class_name(text, text) to service_role;
revoke all on function public.fn_class_ensure(uuid, integer, text, uuid, text) from public, anon, authenticated;
grant execute on function public.fn_class_ensure(uuid, integer, text, uuid, text) to service_role;
