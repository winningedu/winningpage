-- 심화탐구(service key inquiry) 핵심 테이블 5종.
--   inquiry_sessions     심화탐구 세션. 단계 진행, 선택 주제, 리포트 포인터, 차감 원장 연결
--   inquiry_assets       세션이 출발점으로 삼은 자산(활동 기록, 회상 인터뷰, 한 줄 주제)
--   inquiry_topics       추천 라운드별 주제 후보 3개
--   inquiry_submissions  보고서 8절 작성본(자동 저장 초안과 평가용 확정본)
--   inquiry_reports      설계 리포트, 평가 리포트, 확정 리포트
--
-- 이름 규칙: 명세는 deep_* 이지만 브리프 확정대로 inquiry_* 를 쓴다. 공용 테이블의 고정값
-- (activity_records.source_program 'deep')은 공용 스키마라 그대로 둔다.
--
-- 쓰기 원칙: 세션, 자산, 주제, 작성본, 리포트는 전부 API(service_role)가 쓴다. 학생이 직접
-- 쓰는 경로는 없다(성장설계의 설문 저장 같은 본인 쓰기가 심화탐구에는 없다).
-- 읽기는 본인과 관리자만이다. 학부모 열람은 없다(명세 No.119).
--
-- CHECK 허용값은 api/_lib/inquiry/types.ts 의 유니온과 글자 그대로 같아야 한다.

-- 1) inquiry_sessions --------------------------------------------------------
-- selected_topic_id 등 리포트와 주제 포인터는 테이블을 다 만든 뒤 FK 를 건다(순환 참조).
create table public.inquiry_sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null
    references public.profiles(id) on delete cascade,
  status text not null default 'draft'
    check (status in ('draft', 'in_progress', 'completed', 'archived')),
  current_step smallint not null default 1
    check (current_step between 1 and 6),
  grade_label text
    check (grade_label in ('고1', '고2', '고3')),
  semester smallint
    check (semester in (1, 2)),
  career text,
  subject text not null,
  growth_report_id uuid
    references public.growth_reports(id) on delete set null,
  plan_item_id uuid
    references public.growth_plan_items(id) on delete set null,
  reply_pending boolean not null default false,
  selected_topic_id uuid,
  design_report_id uuid,
  latest_evaluation_id uuid,
  final_report_id uuid,
  generation_state jsonb not null default '{}'::jsonb,
  topic_round_count integer not null default 0,
  evaluation_count integer not null default 0,
  ledger_id uuid
    references public.performance_credit_ledger(id),
  ledger_reversed_at timestamptz,
  completed_at timestamptz,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inquiry_sessions_completed_has_completed_at
    check (status <> 'completed' or completed_at is not null),
  constraint inquiry_sessions_reversed_needs_ledger
    check (ledger_reversed_at is null or ledger_id is not null)
);

comment on table public.inquiry_sessions is
  '심화탐구 세션. status: draft(생성 뒤 첫 추천 성공 전, 미차감) / in_progress(첫 추천 성공으로 차감한 뒤) / completed(확정, 활동 기록 적립 완료) / archived(만료 또는 종결). 미완 세션(draft, in_progress)은 학생당 1개만 허용한다. current_step 은 화면 단계 1~6. grade_label, semester, career, subject 는 세션 생성 시점 값의 복사본이라 student_profiles 가 바뀌어도 변하지 않는다(No.124). ledger_id 는 첫 추천 성공 시 차감한 performance_credit_ledger 행(consume_inquiry_credit), ledger_reversed_at 은 종결 되돌림 시각(reverse_inquiry_credit). reply_pending 은 성장설계 과제 완료 회신이 실패해 다시 보내야 한다는 표시다. 읽기는 본인과 관리자만이고 쓰기는 service_role 만이다.';

comment on column public.inquiry_sessions.generation_state is
  '생성 모드별 운영 상태. {"modes": {"<mode>": {status(pending/running/ok/failed), attempts, startedAt, finishedAt, issues}}, "terminal": {reason, at, mode}}. mode 는 topic_recommendation, design_report, evaluation_report 3개다. 재시도와 장애 추적용이며 결과 데이터는 담지 않는다. 결과는 inquiry_topics 와 inquiry_reports 에 둔다.';

comment on column public.inquiry_sessions.topic_round_count is
  '지금까지 성공한 주제 추천 라운드 수. 재추천 상한 판정에 쓴다(최초 1 + 재추천 3).';

comment on column public.inquiry_sessions.evaluation_count is
  '지금까지 성공한 평가 횟수. 재평가 상한(3) 판정에 쓴다.';

-- 미완 세션 1개 제한. 정보 입력 폼 제출이 이 행을 만들거나 이어받는다.
create unique index inquiry_sessions_one_open_per_profile
  on public.inquiry_sessions (profile_id)
  where status in ('draft', 'in_progress');

-- 보관함 목록과 이용 현황 조회.
create index inquiry_sessions_profile_status_completed_idx
  on public.inquiry_sessions (profile_id, status, completed_at desc);

-- 차감 원장에서 세션을 거꾸로 찾는다. 한 원장 행은 한 세션에만 붙는다.
create unique index inquiry_sessions_ledger_uniq
  on public.inquiry_sessions (ledger_id)
  where ledger_id is not null;

create trigger trg_inquiry_sessions_updated_at
  before update on public.inquiry_sessions
  for each row execute function public.set_updated_at();

-- 2) inquiry_assets ----------------------------------------------------------
create table public.inquiry_assets (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null
    references public.inquiry_sessions(id) on delete cascade,
  profile_id uuid not null
    references public.profiles(id) on delete cascade,
  kind text not null
    check (kind in ('record', 'interview', 'oneline')),
  reliability text not null
    check (reliability in ('A', 'B', 'C')),
  position smallint not null,
  -- 학생이 직접 쓴 활동 기록(manual)을 지우면 그 기록을 출발점으로 삼은 자산도 함께 지운다.
  -- set null 로 두면 kind record 의 not null 체크와 충돌해 활동 기록 삭제 자체가 막힌다.
  activity_record_id uuid
    references public.activity_records(id) on delete cascade,
  interview_answers jsonb,
  gaps text[],
  oneline_text text,
  created_at timestamptz not null default now(),
  constraint inquiry_assets_record_shape
    check (kind <> 'record' or (activity_record_id is not null and reliability = 'A')),
  -- gaps 가 null 이면 cardinality 도 null 이라 검사가 통과해 버리므로 coalesce 로 0 취급한다.
  constraint inquiry_assets_interview_shape
    check (kind <> 'interview'
           or (interview_answers is not null
               and reliability = 'B'
               and coalesce(cardinality(gaps), 0) >= 1)),
  constraint inquiry_assets_oneline_shape
    check (kind <> 'oneline' or (oneline_text is not null and reliability = 'C')),
  constraint inquiry_assets_session_position_uniq
    unique (session_id, position)
);

comment on table public.inquiry_assets is
  '심화탐구 세션의 선택 자산. kind: record(기존 활동 기록, 신뢰도 A) / interview(회상 인터뷰, 신뢰도 B, 빈틈 1개 이상) / oneline(한 줄 주제, 신뢰도 C). 신뢰도는 kind 에서 서버가 정하며 제약으로도 고정한다. position 0 이 기본 출발 활동이다. 세션의 자산 집합은 통째로 교체되므로 행은 세션 단위로 지우고 다시 넣는다.';

create index inquiry_assets_profile_idx
  on public.inquiry_assets (profile_id);

create index inquiry_assets_activity_record_idx
  on public.inquiry_assets (activity_record_id)
  where activity_record_id is not null;

-- 3) inquiry_topics ----------------------------------------------------------
create table public.inquiry_topics (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null
    references public.inquiry_sessions(id) on delete cascade,
  profile_id uuid not null
    references public.profiles(id) on delete cascade,
  round smallint not null,
  idx smallint not null
    check (idx between 1 and 3),
  link_kind text not null
    check (link_kind in ('followup', 'transfer', 'critique', 'extension')),
  linkage_type text not null
    check (linkage_type in ('direct', 'interest_based_provisional')),
  fit text not null
    check (fit in ('match', 'neutral', 'off')),
  detail jsonb not null,
  selected boolean not null default false,
  created_at timestamptz not null default now(),
  constraint inquiry_topics_session_round_idx_uniq
    unique (session_id, round, idx)
);

comment on table public.inquiry_topics is
  '심화탐구 주제 후보. 추천 라운드(round)마다 3개(idx 1~3)를 저장한다. detail 은 12항목과 경로 도식, 적합도 사유, 예비 주제 확인 질문을 담은 TopicDetail 이다. link_kind, linkage_type, fit 은 모델 응답이 아니라 서버 계산값이다(No.124). selected 는 설계 리포트로 확정한 주제 표시다.';

create index inquiry_topics_profile_idx
  on public.inquiry_topics (profile_id);

-- 4) inquiry_submissions -----------------------------------------------------
create table public.inquiry_submissions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null
    references public.inquiry_sessions(id) on delete cascade,
  profile_id uuid not null
    references public.profiles(id) on delete cascade,
  revision integer not null,
  sections jsonb not null,
  char_counts jsonb not null,
  is_draft boolean not null default true,
  is_final boolean not null default false,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inquiry_submissions_session_revision_uniq
    unique (session_id, revision)
);

comment on table public.inquiry_submissions is
  '보고서 8절 작성본. is_draft 행은 세션당 1개이고 자동 저장과 수동 저장이 덮어쓴다. 평가를 요청하면 그 초안이 is_draft false 로 확정되고(submitted_at 기록) 평가 뒤 수정이 시작될 때 다음 revision 의 새 초안이 생긴다. is_final 은 확정 화면까지 간 작성본 표시다. char_counts 는 서버가 다시 센 값이다.';

create unique index inquiry_submissions_one_draft_per_session
  on public.inquiry_submissions (session_id)
  where is_draft;

create index inquiry_submissions_profile_idx
  on public.inquiry_submissions (profile_id);

create trigger trg_inquiry_submissions_updated_at
  before update on public.inquiry_submissions
  for each row execute function public.set_updated_at();

-- 5) inquiry_reports ---------------------------------------------------------
create table public.inquiry_reports (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null
    references public.inquiry_sessions(id) on delete cascade,
  profile_id uuid not null
    references public.profiles(id) on delete cascade,
  report_type text not null
    check (report_type in ('design', 'evaluation', 'final')),
  topic_id uuid
    references public.inquiry_topics(id) on delete set null,
  submission_id uuid
    references public.inquiry_submissions(id) on delete set null,
  sections jsonb not null,
  score numeric(4, 1),
  label text
    check (label in (
      'ready_with_minor_edits',
      'revision_needed',
      'major_revision_needed',
      'not_evaluable'
    )),
  model text,
  prompt_version text,
  created_at timestamptz not null default now()
);

comment on table public.inquiry_reports is
  '심화탐구 리포트. report_type: design(설계 리포트, 세션당 1건) / evaluation(평가 리포트, 재평가마다 새 행, submission_id 로 작성본 연결) / final(확정 때 적립한 7항목 사본, 세션당 1건). score 와 label 은 evaluation 행에만 채운다. model, prompt_version 은 모델 호출로 만든 행의 재현용 기록이다.';

create unique index inquiry_reports_one_design_per_session
  on public.inquiry_reports (session_id)
  where report_type = 'design';

create unique index inquiry_reports_one_final_per_session
  on public.inquiry_reports (session_id)
  where report_type = 'final';

create index inquiry_reports_session_type_created_idx
  on public.inquiry_reports (session_id, report_type, created_at desc);

create index inquiry_reports_profile_idx
  on public.inquiry_reports (profile_id);

-- 6) 세션 포인터 FK ----------------------------------------------------------
-- 포인터가 가리키는 행이 지워져도 세션은 남아야 하므로 set null 이다.
alter table public.inquiry_sessions
  add constraint inquiry_sessions_selected_topic_fk
    foreign key (selected_topic_id)
    references public.inquiry_topics(id) on delete set null,
  add constraint inquiry_sessions_design_report_fk
    foreign key (design_report_id)
    references public.inquiry_reports(id) on delete set null,
  add constraint inquiry_sessions_latest_evaluation_fk
    foreign key (latest_evaluation_id)
    references public.inquiry_reports(id) on delete set null,
  add constraint inquiry_sessions_final_report_fk
    foreign key (final_report_id)
    references public.inquiry_reports(id) on delete set null;

-- 7) RLS ---------------------------------------------------------------------
-- 학부모 select 정책은 의도적으로 만들지 않는다(명세 No.119). authenticated 에는 select
-- 만 열고 insert, update, delete 정책과 grant 를 두지 않는다. 쓰기는 service_role 전용이다.
alter table public.inquiry_sessions enable row level security;
alter table public.inquiry_assets enable row level security;
alter table public.inquiry_topics enable row level security;
alter table public.inquiry_submissions enable row level security;
alter table public.inquiry_reports enable row level security;

create policy "inquiry_sessions select own admin"
  on public.inquiry_sessions for select
  to authenticated
  using (profile_id = auth.uid() or public.is_winning_admin());

create policy "inquiry_assets select own admin"
  on public.inquiry_assets for select
  to authenticated
  using (profile_id = auth.uid() or public.is_winning_admin());

create policy "inquiry_topics select own admin"
  on public.inquiry_topics for select
  to authenticated
  using (profile_id = auth.uid() or public.is_winning_admin());

create policy "inquiry_submissions select own admin"
  on public.inquiry_submissions for select
  to authenticated
  using (profile_id = auth.uid() or public.is_winning_admin());

create policy "inquiry_reports select own admin"
  on public.inquiry_reports for select
  to authenticated
  using (profile_id = auth.uid() or public.is_winning_admin());

grant select on public.inquiry_sessions to authenticated;
grant select on public.inquiry_assets to authenticated;
grant select on public.inquiry_topics to authenticated;
grant select on public.inquiry_submissions to authenticated;
grant select on public.inquiry_reports to authenticated;

grant all on public.inquiry_sessions to service_role;
grant all on public.inquiry_assets to service_role;
grant all on public.inquiry_topics to service_role;
grant all on public.inquiry_submissions to service_role;
grant all on public.inquiry_reports to service_role;
