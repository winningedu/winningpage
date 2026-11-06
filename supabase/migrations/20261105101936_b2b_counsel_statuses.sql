-- B2B 기반 10: 입시 상담코칭 상담 상태와 변경 일자(W10, 교 #51, 결정 2).
-- 새 테이블은 비어 있고 어디서도 참조하지 않는다. 위닝 사이트 DB 동작은 바뀌지 않는다.
-- 콘솔 데이터는 service_role API 만 읽고 쓴다. RLS 를 켜고 정책 없이 anon, authenticated 권한을 모두 회수한다.
--
-- counsel_statuses 는 기관, 학생, 학년도 한 벌당 한 행이다(결정 64, 기본 키 (tenant_id, student_id, school_year)라
-- 같은 학생이 한 기관의 한 학년도에 두 행이 될 수 없고, 학년이 바뀌면 새 학년도 행으로 처음 값에서 다시 시작한다).
-- 행이 없으면 처음 값인 미지정이다. 상태는 미지정, 상담예정, 상담완료, 상담필요 4가지이고 한 번 정해 두면 행이 남는다.
-- 변경 일자는 상태가 바뀐 때(changed_at)이고, 처리한 교사가 지워져도 기록은 남도록 changed_by 는 on delete set null 이다.
-- 변경 이력은 admin_access_logs 에 남는다.

create table public.counsel_statuses (
  tenant_id uuid not null references public.tenants (id),
  student_id uuid not null references public.profiles (id) on delete cascade,
  school_year smallint not null,
  status text not null check (status in ('unset', 'scheduled', 'done', 'needed')),
  changed_at timestamptz not null default now(),
  changed_by uuid references public.teachers (id) on delete set null,
  primary key (tenant_id, student_id, school_year)
);

create index counsel_statuses_student_idx on public.counsel_statuses (student_id);

alter table public.counsel_statuses enable row level security;
revoke all on table public.counsel_statuses from anon, authenticated;
grant all on table public.counsel_statuses to service_role;

comment on table public.counsel_statuses is '입시 상담코칭 상담 상태. 기관, 학생, 학년도당 한 행, 행이 없으면 미지정. 콘솔 API(service_role)만 읽고 쓴다.';
comment on column public.counsel_statuses.status is 'unset 미지정, scheduled 상담예정, done 상담완료, needed 상담필요.';
comment on column public.counsel_statuses.changed_at is '상태가 마지막으로 바뀐 때. 같은 상태를 다시 보내도 움직이지 않는다.';

-- 상태 정하기. 이전 값을 읽고 바꾸는 일을 한 번에 해서 동시 요청이 같은 이전 값을 읽지 않게 한다(행을 잠그고 읽는다).
-- 행이 없으면 이전 값은 unset 이고 unset 을 정하면 행을 만들지 않는다. 같은 상태는 행을 건드리지 않아 변경 일자가 그대로다.
-- 처음 행을 만드는 요청이 동시에 오면 한쪽이 충돌로 지고, 다시 읽어서 이긴 쪽의 값을 이전 값으로 삼는다.
create function public.fn_set_counsel_status(
  p_tenant_id uuid,
  p_student_id uuid,
  p_school_year integer,
  p_status text,
  p_changed_by uuid
)
returns table (previous_status text, current_status text, status_changed_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_previous text;
  v_changed_at timestamptz;
begin
  if p_status is null or p_status not in ('unset', 'scheduled', 'done', 'needed') then
    raise exception 'invalid counsel status' using errcode = 'check_violation';
  end if;

  loop
    select c.status, c.changed_at into v_previous, v_changed_at
      from public.counsel_statuses c
     where c.tenant_id = p_tenant_id and c.student_id = p_student_id and c.school_year = p_school_year
       for update;

    if found then
      if v_previous = p_status then
        return query select v_previous, p_status, v_changed_at;
        return;
      end if;
      update public.counsel_statuses c
         set status = p_status, changed_at = now(), changed_by = p_changed_by
       where c.tenant_id = p_tenant_id and c.student_id = p_student_id and c.school_year = p_school_year
      returning c.changed_at into v_changed_at;
      return query select v_previous, p_status, v_changed_at;
      return;
    end if;

    if p_status = 'unset' then
      return query select 'unset'::text, 'unset'::text, null::timestamptz;
      return;
    end if;

    insert into public.counsel_statuses (tenant_id, student_id, school_year, status, changed_by)
    values (p_tenant_id, p_student_id, p_school_year, p_status, p_changed_by)
    on conflict do nothing
    returning changed_at into v_changed_at;
    if found then
      return query select 'unset'::text, p_status, v_changed_at;
      return;
    end if;
  end loop;
end;
$$;

revoke all on function public.fn_set_counsel_status(uuid, uuid, integer, text, uuid) from public, anon, authenticated;
grant execute on function public.fn_set_counsel_status(uuid, uuid, integer, text, uuid) to service_role;
