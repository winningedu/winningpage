-- B2B 기반 8: 교사 일괄 등록 실행 기록과 담임 덮어쓰기 함수.
-- 새 테이블은 비어 있고 어디서도 참조하지 않으며 함수는 새로 만든다. 위닝 사이트 DB 동작은 바뀌지 않는다.
-- 콘솔 데이터는 service_role API 만 읽고 쓴다. RLS 를 켜고 정책 없이 anon, authenticated 권한을 모두 회수한다.
--
-- request_id 는 클라이언트가 한 번의 가져오기마다 만들고, 20행 이하 청크마다 chunk_index(1부터)를 붙여 보낸다(설계 R7).
-- 멱등 키는 (request_id, chunk_index) 이고 payload_hash 로 같은 요청인지 가린다. 판정은 fn_teacher_import_chunk_claim 이 한다.
-- row_results 에는 행 번호, 판정 코드, 적용 여부만 담는다(전화번호와 임시 비밀번호는 넣지 않는다).

create table public.teacher_import_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  request_id uuid not null,
  chunk_index integer not null check (chunk_index >= 1),
  payload_hash text not null,
  actor_profile_id uuid references public.profiles (id) on delete set null,
  proxy_session_id uuid references public.proxy_sessions (id) on delete set null,
  total_rows integer not null default 0 check (total_rows >= 0),
  created_count integer not null default 0 check (created_count >= 0),
  updated_count integer not null default 0 check (updated_count >= 0),
  account_count integer not null default 0 check (account_count >= 0),
  error_count integer not null default 0 check (error_count >= 0),
  row_results jsonb not null default '[]',
  created_at timestamptz not null default now(),
  claimed_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (request_id, chunk_index)
);

create index teacher_import_runs_tenant_created_idx
  on public.teacher_import_runs (tenant_id, created_at desc);

alter table public.teacher_import_runs enable row level security;
revoke all on table public.teacher_import_runs from anon, authenticated;
grant all on table public.teacher_import_runs to service_role;

comment on table public.teacher_import_runs is '교사 엑셀 일괄 등록 실행 기록. request_id 가 같으면 같은 실행이다. finished_at 이 null 이면 아직 끝나지 않았다.';
comment on column public.teacher_import_runs.payload_hash is '청크 본문(적용 방식과 행)의 해시. 같은 키에 해시가 다르면 IDEMPOTENCY_KEY_MISMATCH 다.';
comment on column public.teacher_import_runs.claimed_at is '마지막으로 처리를 맡은 시각. 끝나지 않았고 60초가 지나지 않았으면 처리 중으로 본다.';
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

-- 청크의 멱등 키를 잡는다. outcome:
--   claimed       새 청크. 호출자가 처리한다.
--   replay        같은 해시로 끝난 청크. 저장된 결과를 돌려준다.
--   mismatch      같은 키에 다른 해시.
--   in_progress   끝나지 않았고 claimed_at 이 60초 안이라 다른 요청이 처리 중이다.
--   resumed       끝나지 않았고 60초가 지났다. claimed_at 을 갱신해 이어받는다.
--   other_tenant  다른 기관이 쓴 request_id.
-- 기존 행은 FOR UPDATE 로 잠근 뒤 판정하고 claimed_at 을 갱신하므로, 동시에 이어받는 두 요청 중 하나만 resumed 를 받는다.
create function public.fn_teacher_import_chunk_claim(
  p_tenant uuid, p_request_id uuid, p_chunk_index integer, p_payload_hash text,
  p_actor uuid, p_proxy_session uuid, p_total_rows integer
)
returns table (outcome text, run_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run public.teacher_import_runs;
begin
  insert into public.teacher_import_runs (tenant_id, request_id, chunk_index, payload_hash, actor_profile_id, proxy_session_id, total_rows)
  values (p_tenant, p_request_id, p_chunk_index, p_payload_hash, p_actor, p_proxy_session, p_total_rows)
  on conflict (request_id, chunk_index) do nothing
  returning * into v_run;
  if found then
    return query select 'claimed'::text, v_run.id;
    return;
  end if;

  select * into v_run from public.teacher_import_runs r
   where r.request_id = p_request_id and r.chunk_index = p_chunk_index for update;
  if v_run.tenant_id <> p_tenant then
    return query select 'other_tenant'::text, v_run.id;
  elsif v_run.payload_hash <> p_payload_hash then
    return query select 'mismatch'::text, v_run.id;
  elsif v_run.finished_at is not null then
    return query select 'replay'::text, v_run.id;
  elsif v_run.claimed_at > now() - interval '60 seconds' then
    return query select 'in_progress'::text, v_run.id;
  else
    update public.teacher_import_runs r set claimed_at = now() where r.id = v_run.id;
    return query select 'resumed'::text, v_run.id;
  end if;
end;
$$;

revoke all on function public.fn_teacher_import_chunk_claim(uuid, uuid, integer, text, uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.fn_teacher_import_chunk_claim(uuid, uuid, integer, text, uuid, uuid, integer) to service_role;
