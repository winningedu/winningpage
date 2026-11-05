-- B2B 기반 8: 교사 일괄 등록 실행 기록과 담임 덮어쓰기 함수.
-- 새 테이블은 비어 있고 어디서도 참조하지 않으며 함수는 새로 만든다. 위닝 사이트 DB 동작은 바뀌지 않는다.
-- 콘솔 데이터는 service_role API 만 읽고 쓴다. RLS 를 켜고 정책 없이 anon, authenticated 권한을 모두 회수한다.
--
-- request_id 는 클라이언트가 제출마다 만든다. 같은 값으로 다시 오면 unique 위반(23505)이라 API 가 같은 실행으로 이어받는다.
-- row_results 에는 행 번호, 판정 코드, 적용 여부만 담는다(전화번호와 임시 비밀번호는 넣지 않는다).

create table public.teacher_import_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  request_id uuid not null unique,
  actor_profile_id uuid references public.profiles (id) on delete set null,
  proxy_session_id uuid references public.proxy_sessions (id) on delete set null,
  total_rows integer not null default 0 check (total_rows >= 0),
  created_count integer not null default 0 check (created_count >= 0),
  updated_count integer not null default 0 check (updated_count >= 0),
  account_count integer not null default 0 check (account_count >= 0),
  error_count integer not null default 0 check (error_count >= 0),
  row_results jsonb not null default '[]',
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index teacher_import_runs_tenant_created_idx
  on public.teacher_import_runs (tenant_id, created_at desc);

alter table public.teacher_import_runs enable row level security;
revoke all on table public.teacher_import_runs from anon, authenticated;
grant all on table public.teacher_import_runs to service_role;

comment on table public.teacher_import_runs is '교사 엑셀 일괄 등록 실행 기록. request_id 가 같으면 같은 실행이다. finished_at 이 null 이면 아직 끝나지 않았다.';
comment on column public.teacher_import_runs.row_results is '행 번호(index), 판정 코드(verdict), 적용 여부(applied)만 담는다. 전화번호와 임시 비밀번호는 넣지 않는다.';

-- 이미 다른 담임이 있는 학급을 p_teacher_id 의 담당으로 옮긴다("담임 이름 덮어쓰기").
-- 옛 담임은 학급 없이 남을 수 있고(삭제하지 않는다), 주담당을 잃었으면 남은 학급 중 먼저 배정된 학급이 주담당이 된다.
-- 이미 p_teacher_id 의 학급이면 아무것도 하지 않아 재시도해도 같다. 학급과 교사의 기관이 다르거나 없으면 WC088.
create function public.fn_teacher_import_move_class(p_class_id uuid, p_teacher_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_t public.teachers;
  v_old uuid;
begin
  select * into v_t from public.teachers where id = p_teacher_id and deleted_at is null for update;
  if not found
     or not exists (select 1 from public.classes c where c.id = p_class_id and c.tenant_id = v_t.tenant_id) then
    raise exception 'teacher or class not found' using errcode = 'WC088';
  end if;

  select a.teacher_id into v_old from public.teacher_class_assignments a where a.class_id = p_class_id;
  if v_old = p_teacher_id then
    return;
  end if;

  if v_old is not null then
    delete from public.teacher_class_assignments a where a.class_id = p_class_id;
    if not exists (select 1 from public.teacher_class_assignments a where a.teacher_id = v_old and a.is_primary) then
      update public.teacher_class_assignments a set is_primary = true
       where a.teacher_id = v_old
         and a.class_id = (select b.class_id from public.teacher_class_assignments b
                            where b.teacher_id = v_old order by b.created_at, b.class_id limit 1);
    end if;
  end if;

  insert into public.teacher_class_assignments (teacher_id, tenant_id, class_id, is_primary)
  values (
    v_t.id, v_t.tenant_id, p_class_id,
    not exists (select 1 from public.teacher_class_assignments a where a.teacher_id = v_t.id and a.is_primary)
  );
end;
$$;

revoke all on function public.fn_teacher_import_move_class(uuid, uuid) from public, anon, authenticated;
grant execute on function public.fn_teacher_import_move_class(uuid, uuid) to service_role;
