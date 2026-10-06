-- 자기평가서(service key selfeval) 핵심 테이블 3종.
--   selfeval_sessions            작성 세션. 단계 진행, 성장설계 스냅샷, 차감 원장 연결
--   selfeval_session_activities  세션이 쓰는 활동(핵심 1개, 보조 최대 2개)과 11항목 분석
--   selfeval_reports             생성, 편집, 검증, 최종 리포트 이력(회차별 revision)
--
-- 쓰기 원칙: 세션 진행, 활동 선택, 분석, 리포트 저장은 전부 API(service_role)가 쓴다.
-- 학생은 읽기만 한다. 학부모 열람은 두지 않는다(명세 No.67), 그래서 fn_is_linked_pair 를
-- 정책에 넣지 않는다. 성장설계와 달리 학부모에게 보여줄 가공본이 없다.
--
-- jsonb 키의 정본은 api/_lib/selfeval/types.ts 이다. 이 파일의 컬럼 코멘트가 그 타입 이름을 가리킨다.

-- 1) selfeval_sessions -------------------------------------------------------
create table public.selfeval_sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null
    references public.profiles(id) on delete cascade,
  status text not null default 'draft'
    check (status in ('draft', 'in_progress', 'completed', 'archived')),
  current_step smallint not null default 0
    check (current_step between 0 and 6),
  academic_year integer
    check (academic_year between 2000 and 2100),
  grade_label text
    check (grade_label in ('고1', '고2', '고3')),
  semester smallint
    check (semester in (1, 2)),
  area text
    check (area in ('subject', 'autonomy', 'club', 'career')),
  subject text,
  activity_name text,
  school_prompt text,
  teacher_note text,
  target_chars integer
    check (target_chars is null or target_chars between 100 and 3000),
  target_chars_mode text not null default 'with_space'
    check (target_chars_mode in ('with_space', 'without_space')),
  career jsonb not null default '{}'::jsonb,
  growth_report_id uuid
    references public.growth_reports(id) on delete set null,
  growth_applied boolean not null default false,
  growth_snapshot jsonb,
  plan_item_id uuid
    references public.growth_plan_items(id) on delete set null,
  reply_pending jsonb,
  regenerate_count integer not null default 0
    check (regenerate_count between 0 and 3),
  step_state jsonb not null default '{}'::jsonb,
  ledger_id uuid
    references public.performance_credit_ledger(id),
  ledger_reversed_at timestamptz,
  last_activity_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint selfeval_sessions_completed_has_completed_at
    check (status <> 'completed' or completed_at is not null),
  constraint selfeval_sessions_reversed_needs_ledger
    check (ledger_reversed_at is null or ledger_id is not null)
);

comment on table public.selfeval_sessions is
  '자기평가서 작성 세션. 미완 세션(draft/in_progress)은 학생당 1개만 허용한다(명세 No.15). current_step 은 0 생성됨, 1 기본 입력 저장, 2 활동 선택 확정, 3 분석 완료, 4 생성 성공, 5 검증 완료, 6 최종 저장이다. ledger_id 는 첫 모델 호출 단계(write) 성공 시 차감한 performance_credit_ledger 행(consume_selfeval_credit), ledger_reversed_at 은 되돌림 시각(reverse_selfeval_credit)이다. 읽기는 본인/관리자만이고 쓰기는 service_role 만이다.';

comment on column public.selfeval_sessions.subject is
  '교과 영역(area=subject)일 때의 과목명.';

comment on column public.selfeval_sessions.activity_name is
  '창의적 체험활동 영역(자율, 동아리, 진로)일 때의 활동명.';

comment on column public.selfeval_sessions.career is
  '진로 정보. api/_lib/selfeval/types.ts 의 CareerInfo(career, department, universities)와 같은 키. 세션 생성 때 student_profiles 값으로 채우고 이후에는 이 세션 값이 정본이다.';

comment on column public.selfeval_sessions.growth_snapshot is
  '세션 생성 시점에 고정한 성장설계 수신 8종. api/_lib/selfeval/types.ts 의 GrowthSnapshot 과 같은 키. 이후 성장설계가 다시 발급되어도 이 세션은 변하지 않는다.';

comment on column public.selfeval_sessions.reply_pending is
  '성장설계 회신 실패 기록(명세 No.75). api/_lib/selfeval/types.ts 의 ReplyPending 과 같은 키. 다음 진입 때 서버가 다시 보낸다.';

comment on column public.selfeval_sessions.step_state is
  '모델 호출 단계 운영 상태. api/_lib/selfeval/types.ts 의 StepState 와 같은 키. steps 는 analyze, write, verify 키에 {status(pending/running/ok/failed), attempts, startedAt, finishedAt, issues} 를 담고 terminal 은 {reason, at, step} 형태의 종결 사유다. 재시도와 장애 추적용이며 결과 데이터는 담지 않는다.';

-- 차감 원장에서 세션을 거꾸로 찾는다(환불 소비 판정, 정합성 점검).
create index selfeval_sessions_ledger_idx
  on public.selfeval_sessions (ledger_id)
  where ledger_id is not null;

-- 학생당 미완 세션 1개(명세 No.15).
create unique index selfeval_sessions_open_uniq
  on public.selfeval_sessions (profile_id)
  where status in ('draft', 'in_progress');

create index selfeval_sessions_profile_created_idx
  on public.selfeval_sessions (profile_id, created_at desc);

-- 만료 크론이 오래 멈춘 미완 세션을 훑는다.
create index selfeval_sessions_status_activity_idx
  on public.selfeval_sessions (status, last_activity_at);

create trigger trg_selfeval_sessions_updated_at
  before update on public.selfeval_sessions
  for each row execute function public.set_updated_at();

alter table public.selfeval_sessions enable row level security;

create policy "selfeval_sessions select own admin"
  on public.selfeval_sessions for select
  to authenticated
  using (profile_id = auth.uid() or public.is_winning_admin());

grant select on public.selfeval_sessions to authenticated;
grant all on public.selfeval_sessions to service_role;

-- 2) selfeval_session_activities --------------------------------------------
create table public.selfeval_session_activities (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null
    references public.selfeval_sessions(id) on delete cascade,
  profile_id uuid not null
    references public.profiles(id) on delete cascade,
  activity_record_id uuid not null
    references public.activity_records(id) on delete restrict,
  role text not null
    check (role in ('core', 'support')),
  fit_score numeric(5, 2),
  fit_reasons jsonb,
  analysis jsonb,
  analysis_source text
    check (analysis_source in ('model', 'student')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint selfeval_session_activities_session_activity_uniq
    unique (session_id, activity_record_id)
);

comment on table public.selfeval_session_activities is
  '자기평가서 세션이 쓰는 활동. role 은 core(핵심 1개) 또는 support(보조 최대 2개)이다. 활동이 쓰이는 동안 지워지지 않도록 activity_records 는 on delete restrict 로 참조한다(회원탈퇴 함수가 이 표를 먼저 지운다).';

comment on column public.selfeval_session_activities.fit_score is
  '적합도 점수 0~100. 학생이 직접 입력한 활동은 계산 대상이 아니라 null 이다.';

comment on column public.selfeval_session_activities.fit_reasons is
  '적합도 판정 결과. api/_lib/selfeval/types.ts 의 FitResult 와 같은 키(signals, reasons).';

comment on column public.selfeval_session_activities.analysis is
  '활동별 11항목 분석. api/_lib/selfeval/types.ts 의 Analysis 와 같은 키(values, sources, conflicts).';

comment on column public.selfeval_session_activities.analysis_source is
  'analysis 의 출처. model 은 모델 분석, student 는 학생이 고친 값.';

-- 세션당 핵심 활동은 1개.
create unique index selfeval_session_activities_core_uniq
  on public.selfeval_session_activities (session_id)
  where role = 'core';

create index selfeval_session_activities_profile_idx
  on public.selfeval_session_activities (profile_id);

create index selfeval_session_activities_record_idx
  on public.selfeval_session_activities (activity_record_id);

create trigger trg_selfeval_session_activities_updated_at
  before update on public.selfeval_session_activities
  for each row execute function public.set_updated_at();

alter table public.selfeval_session_activities enable row level security;

create policy "selfeval_session_activities select own admin"
  on public.selfeval_session_activities for select
  to authenticated
  using (profile_id = auth.uid() or public.is_winning_admin());

grant select on public.selfeval_session_activities to authenticated;
grant all on public.selfeval_session_activities to service_role;

-- 3) selfeval_reports --------------------------------------------------------
create table public.selfeval_reports (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null
    references public.selfeval_sessions(id) on delete cascade,
  profile_id uuid not null
    references public.profiles(id) on delete cascade,
  report_type text not null
    check (report_type in ('generation', 'edited', 'verification', 'final')),
  revision integer not null
    check (revision >= 1),
  sections jsonb not null,
  char_count jsonb,
  score integer
    check (score is null or score between 0 and 100),
  mandatory_fixes jsonb,
  created_at timestamptz not null default now(),
  constraint selfeval_reports_session_type_revision_uniq
    unique (session_id, report_type, revision)
);

comment on table public.selfeval_reports is
  '자기평가서 리포트 이력. 같은 report_type 은 revision 1부터 쌓이고 덮어쓰지 않는다(재생성, 재검증 이력 보존). generation, edited, final 의 sections 는 api/_lib/selfeval/types.ts 의 GenerationSections, verification 의 sections 는 VerificationSections 와 같은 키다. 수정하지 않는 이력 표라 updated_at 이 없다.';

comment on column public.selfeval_reports.char_count is
  '글자 수. api/_lib/selfeval/types.ts 의 CharCount(withSpace, withoutSpace)와 같은 키.';

comment on column public.selfeval_reports.mandatory_fixes is
  '제출 전 필수 수정 목록. api/_lib/selfeval/types.ts 의 MandatoryFix 배열. verification 리포트에서만 쓴다.';

create index selfeval_reports_session_created_idx
  on public.selfeval_reports (session_id, created_at desc);

create index selfeval_reports_profile_idx
  on public.selfeval_reports (profile_id);

alter table public.selfeval_reports enable row level security;

create policy "selfeval_reports select own admin"
  on public.selfeval_reports for select
  to authenticated
  using (profile_id = auth.uid() or public.is_winning_admin());

grant select on public.selfeval_reports to authenticated;
grant all on public.selfeval_reports to service_role;
