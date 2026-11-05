-- B2B 기반 9: 특이학생 수동 지정과 기관별 달성율 기준(W6 특이학생, 사 #147).
-- 새 테이블과 새 열은 비어 있고 어디서도 참조하지 않는다. 위닝 사이트 DB 동작은 바뀌지 않는다.
-- 콘솔 데이터는 service_role API 만 읽고 쓴다. RLS 를 켜고 정책 없이 anon, authenticated 권한을 모두 회수한다.
--
-- student_flags 는 학생 한 명당 한 행이다(student_id 가 기본 키라 같은 학생을 두 번 지정해도 한 행).
-- 지정한 교사가 지워져도 지정은 남도록 flagged_teacher_id 는 on delete set null 이다.
-- special_exec_rate_pct 는 "주간 목표시간 달성율이 이 값 미만이면 특이학생" 기준(%)이다. null 이면 이 사유는 쓰지 않는다.

create table public.student_flags (
  student_id uuid primary key references public.profiles (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id),
  flagged_teacher_id uuid references public.teachers (id) on delete set null,
  created_at timestamptz not null default now()
);

create index student_flags_tenant_idx on public.student_flags (tenant_id);

alter table public.student_flags enable row level security;
revoke all on table public.student_flags from anon, authenticated;
grant all on table public.student_flags to service_role;

comment on table public.student_flags is '특이학생 수동 지정. 학생당 한 행이고 지우면 지정이 풀린다. 콘솔 API(service_role)만 읽고 쓴다.';

alter table public.tenants
  add column special_exec_rate_pct smallint check (special_exec_rate_pct between 1 and 100);

comment on column public.tenants.special_exec_rate_pct is '주간 목표시간 달성율이 이 값(%) 미만이면 특이학생 사유가 된다. null 이면 이 사유를 쓰지 않는다.';
