-- 성장설계(service key growth) 핵심 테이블 4종.
--   growth_profiles   학생별 설문 응답, 트랙(학생당 1행)
--   growth_reports    성장설계 회차(리포트). 단계 진행, 결과, 차감 원장 연결
--   growth_plan_items 리포트가 만든 실행 계획 항목
--   growth_uploads    활동 자료 업로드 메타와 추출 결과
--
-- 쓰기 원칙: 리포트, 계획 생성, 업로드 추출은 전부 API(service_role)가 쓴다.
-- 본인이 직접 쓰는 것은 growth_profiles(설문 저장)와 growth_plan_items 수동 체크뿐이다.

-- 1) growth_profiles ---------------------------------------------------------
create table public.growth_profiles (
  profile_id uuid primary key
    references public.profiles(id) on delete cascade,
  track text
    check (track in ('고1', '고2', '고3', '졸업', 'N수')),
  survey_answers jsonb not null default '{}'::jsonb,
  survey_saved_at timestamptz,
  updated_at timestamptz not null default now()
);

comment on table public.growth_profiles is
  '성장설계 전용 학생 프로필(학생당 1행). 설문 응답 초안과 트랙을 둔다. 여섯 서비스 공용 값은 student_profiles 에 있다. 회차 시작 시 survey_answers 는 growth_reports.survey_answers 로 스냅샷된다.';

alter table public.growth_profiles enable row level security;

create policy "growth_profiles select own admin"
  on public.growth_profiles for select
  to authenticated
  using (profile_id = auth.uid() or public.is_winning_admin());

create policy "growth_profiles insert own"
  on public.growth_profiles for insert
  to authenticated
  with check (profile_id = auth.uid());

create policy "growth_profiles update own"
  on public.growth_profiles for update
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create trigger trg_growth_profiles_updated_at
  before update on public.growth_profiles
  for each row execute function public.set_updated_at();

grant select, insert, update on public.growth_profiles to authenticated;
grant all on public.growth_profiles to service_role;

-- 2) growth_reports ----------------------------------------------------------
create table public.growth_reports (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null
    references public.profiles(id) on delete cascade,
  status text not null default 'draft'
    check (status in ('draft', 'in_progress', 'completed', 'archived')),
  current_step smallint not null default 0
    check (current_step between 0 and 8),
  track text
    check (track in ('고1', '고2', '고3', '졸업', 'N수')),
  survey_answers jsonb,
  activity_ids uuid[] not null default '{}',
  grade_inputs jsonb,
  narrative_theme text,
  grade_subthemes jsonb,
  stage text,
  axis_scores jsonb,
  consistency jsonb,
  sections jsonb,
  signals jsonb,
  issued_at timestamptz,
  ledger_id uuid
    references public.performance_credit_ledger(id),
  ledger_reversed_at timestamptz,
  model_attempt_count integer not null default 0,
  schema_version integer not null default 1,
  step_state jsonb not null default '{}'::jsonb,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint growth_reports_completed_has_issued_at
    check (status <> 'completed' or issued_at is not null),
  constraint growth_reports_reversed_needs_ledger
    check (ledger_reversed_at is null or ledger_id is not null)
);

comment on table public.growth_reports is
  '성장설계 회차. 활성 회차는 별도 플래그 없이 "issued_at 이 가장 늦은 completed 1건"이다(is_active 컬럼을 두지 않는다). 미완 회차(draft/in_progress)는 학생당 1개만 허용한다. survey_answers 는 회차 시작 시점 스냅샷. ledger_id 는 첫 모델 호출 단계 성공 시 차감한 performance_credit_ledger 행(consume_growth_credit), ledger_reversed_at 은 실패 되돌림 시각(reverse_growth_credit). 읽기는 본인/관리자만이고 쓰기는 service_role 만이다.';

comment on column public.growth_reports.survey_answers is
  '회차 시작 시점의 설문 응답 스냅샷. 이후 growth_profiles 가 바뀌어도 이 회차는 변하지 않는다.';

comment on column public.growth_reports.activity_ids is
  '분석 대상 활동 ID 고정(No.113 세션 누적). 활동이 나중에 바뀌어도 이 회차가 읽은 재료를 재현하기 위한 것. FK 무결성은 두지 않는다.';

comment on column public.growth_reports.schema_version is
  'sections 항목 스키마 버전. 섹션 구조가 바뀔 때 올려 과거 회차를 구분해 읽는다.';

comment on column public.growth_reports.step_state is
  '단계별 운영 상태. 키는 단계 이름이고 값은 status, error, attempts, started_at, finished_at 를 담은 객체다. 재시도와 장애 추적용이며 결과 데이터는 담지 않는다.';

-- 차감 원장에서 회차를 거꾸로 찾는다(환불 소비 판정, 정합성 점검).
create index growth_reports_ledger_idx
  on public.growth_reports (ledger_id)
  where ledger_id is not null;

-- 학생당 미완 회차 1개.
create unique index growth_reports_one_open_per_profile
  on public.growth_reports (profile_id)
  where status in ('draft', 'in_progress');

-- 활성 회차(최신 completed) 조회.
create index growth_reports_profile_status_issued_idx
  on public.growth_reports (profile_id, status, issued_at desc);

alter table public.growth_reports enable row level security;

-- 학부모 select 정책은 의도적으로 만들지 않는다. 학부모에게는 성적 항목을 제외한
-- 열람만 허용해야 하는데 RLS 는 열 단위로 가릴 수 없다. 그 열람은 API(service_role)가
-- 성적 항목을 걷어낸 응답으로 담당한다.
create policy "growth_reports select own admin"
  on public.growth_reports for select
  to authenticated
  using (profile_id = auth.uid() or public.is_winning_admin());

grant select on public.growth_reports to authenticated;
grant all on public.growth_reports to service_role;

-- 3) growth_plan_items -------------------------------------------------------
create table public.growth_plan_items (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null
    references public.growth_reports(id) on delete cascade,
  profile_id uuid not null
    references public.profiles(id) on delete cascade,
  program text not null
    check (program in ('school', 'self', 'deep')),
  title text not null,
  description text,
  priority text not null
    check (priority in ('required', 'recommended')),
  axis text
    check (axis in ('A', 'B', 'C', 'D', 'E')),
  category text,
  period text not null
    check (period in ('course_selection', 'semester', 'vacation')),
  period_label text,
  deadline date,
  status text not null default 'pending'
    check (status in ('pending', 'done')),
  done_source_program text
    check (done_source_program in ('manual', 'self', 'deep')),
  done_ref_id uuid,
  done_at timestamptz,
  carried_from_report_id uuid
    references public.growth_reports(id) on delete set null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.growth_plan_items is
  '성장설계 실행 계획 항목. program: school(학교 활동)/self(자기평가서)/deep(심화탐구). 완료는 수동 체크(done_source_program=manual) 또는 해당 서비스 산출물 연결(self/deep, done_ref_id)로 기록한다. carried_from_report_id 는 이전 회차에서 이월된 항목의 원본 회차. 본인은 update(수동 체크)만 하고 insert/delete 는 service_role 만 한다.';

create index growth_plan_items_carried_from_idx
  on public.growth_plan_items (carried_from_report_id)
  where carried_from_report_id is not null;

create index growth_plan_items_report_idx
  on public.growth_plan_items (report_id);

create index growth_plan_items_profile_status_idx
  on public.growth_plan_items (profile_id, status);

alter table public.growth_plan_items enable row level security;

-- 학부모 select 를 유지한다. 항목 title, description 에는 성적 수치나 등급을 쓰지 않는다
-- (학부모 열람 범위, No.112). 생성 단계 검증이 강제한다.
create policy "growth_plan_items select own linked admin"
  on public.growth_plan_items for select
  to authenticated
  using (
    profile_id = auth.uid()
    or public.fn_is_linked_pair(auth.uid(), profile_id)
    or public.is_winning_admin()
  );

create policy "growth_plan_items update own"
  on public.growth_plan_items for update
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create trigger trg_growth_plan_items_updated_at
  before update on public.growth_plan_items
  for each row execute function public.set_updated_at();

-- 학생은 수동 체크(status, done_at)만, 나머지 컬럼은 service_role 만 쓴다.
-- 열 단위 grant 로 다른 컬럼 update 를 막고, 트리거로 완료 출처 위조를 막는다.
grant select on public.growth_plan_items to authenticated;
grant update (status, done_at, done_source_program, updated_at)
  on public.growth_plan_items to authenticated;
grant all on public.growth_plan_items to service_role;

-- 학생 update 가드. 학생은 done_source_program 을 manual 로만 쓸 수 있고(self/deep 연결은
-- 서비스 산출물과 이어지는 값이라 service_role 전용) done_ref_id 는 바꿀 수 없다.
-- service_role 경로(auth.role() 가 service_role 또는 null)는 검사 없이 통과한다.
create or replace function public.fn_growth_plan_items_guard_student_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.role() is distinct from 'authenticated' then
    return new;
  end if;

  if new.done_source_program is not null
     and new.done_source_program <> 'manual'
     and new.done_source_program is distinct from old.done_source_program then
    raise exception 'plan_item_done_source_not_allowed' using errcode = '42501';
  end if;

  if new.done_ref_id is distinct from old.done_ref_id then
    raise exception 'plan_item_done_source_not_allowed' using errcode = '42501';
  end if;

  if new.status = 'done' then
    new.done_at := coalesce(new.done_at, now());
    new.done_source_program := coalesce(new.done_source_program, 'manual');
  elsif new.status = 'pending' then
    new.done_at := null;
    new.done_source_program := null;
    new.done_ref_id := null;
  end if;

  return new;
end;
$$;

create trigger growth_plan_items_guard_student_update
  before update on public.growth_plan_items
  for each row execute function public.fn_growth_plan_items_guard_student_update();

-- 4) growth_uploads ----------------------------------------------------------
create table public.growth_uploads (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null
    references public.profiles(id) on delete cascade,
  grade_label text
    check (grade_label in ('고1', '고2', '고3')),
  semester smallint
    check (semester in (1, 2)),
  file_name text not null,
  mime_type text not null,
  byte_size integer not null
    check (byte_size >= 0),
  consent_at timestamptz not null,
  extraction_status text not null default 'pending'
    check (extraction_status in ('pending', 'ok', 'failed')),
  extracted jsonb,
  extraction_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.growth_uploads is
  '성장설계 업로드 메타와 추출 결과. 원문은 보관하지 않는다(원문 미보관 원칙), 저장 경로 컬럼이 없고 파일명, 형식, 크기, 동의 시각과 추출 결과만 남긴다. extracted 는 주제, 개념, 결과, 한계 네 항목만 담는다. 추출 성공분은 activity_records(source_program=upload, source_ref_id=이 행 id)로 승격된다.';

create index growth_uploads_profile_grade_semester_idx
  on public.growth_uploads (profile_id, grade_label, semester);

alter table public.growth_uploads enable row level security;

create policy "growth_uploads select own admin"
  on public.growth_uploads for select
  to authenticated
  using (profile_id = auth.uid() or public.is_winning_admin());

grant select on public.growth_uploads to authenticated;
grant all on public.growth_uploads to service_role;
