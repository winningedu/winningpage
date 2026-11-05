-- B2B 기반 10: 입시 상담코칭 상담 상태와 변경 일자(W10, 교 #51, 결정 2).
-- 새 테이블은 비어 있고 어디서도 참조하지 않는다. 위닝 사이트 DB 동작은 바뀌지 않는다.
-- 콘솔 데이터는 service_role API 만 읽고 쓴다. RLS 를 켜고 정책 없이 anon, authenticated 권한을 모두 회수한다.
--
-- counsel_statuses 는 학생 한 명당 한 행이다(student_id 가 기본 키라 같은 학생이 두 행이 될 수 없다).
-- 행이 없으면 처음 값인 미지정이다. 상태는 미지정, 상담예정, 상담완료, 상담필요 4가지이고 한 번 정해 두면 행이 남는다.
-- 변경 일자는 상태가 바뀐 때(changed_at)이고, 처리한 교사가 지워져도 기록은 남도록 changed_by 는 on delete set null 이다.
-- 변경 이력은 admin_access_logs 에 남는다.

create table public.counsel_statuses (
  student_id uuid primary key references public.profiles (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id),
  status text not null check (status in ('unset', 'scheduled', 'done', 'needed')),
  changed_at timestamptz not null default now(),
  changed_by uuid references public.teachers (id) on delete set null
);

create index counsel_statuses_tenant_idx on public.counsel_statuses (tenant_id);

alter table public.counsel_statuses enable row level security;
revoke all on table public.counsel_statuses from anon, authenticated;
grant all on table public.counsel_statuses to service_role;

comment on table public.counsel_statuses is '입시 상담코칭 상담 상태. 학생당 한 행, 행이 없으면 미지정. 콘솔 API(service_role)만 읽고 쓴다.';
comment on column public.counsel_statuses.status is 'unset 미지정, scheduled 상담예정, done 상담완료, needed 상담필요.';
comment on column public.counsel_statuses.changed_at is '상태가 마지막으로 바뀐 때. 같은 상태를 다시 보내도 움직이지 않는다.';
