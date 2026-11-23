-- 자기평가서 v4.2 기반 스키마(명세 No.133-194).
-- 스키마만 담는다. 기존 행은 새 컬럼이 null 이고 백필하지 않는다.
-- 앱 코드는 record_status null 을 status 에서 파생(planned 면 plan, 그 밖은 completed)하고
-- submitted_at null 을 created_at 으로 읽는다.

-- ---------------------------------------------------------------------
-- activity_records 새 컬럼(No.141, 146). 기존 status, source_program 검사는 건드리지 않는다.
-- ---------------------------------------------------------------------
alter table public.activity_records
  add column submitted_at timestamptz,
  add column record_status text,
  add column summary text,
  add column reflection text,
  add column parent_record_id uuid references public.activity_records (id) on delete set null,
  add column course_name text,
  add column entry_kind text,
  add constraint activity_records_record_status_check
    check (record_status in ('completed', 'in_progress', 'plan')),
  add constraint activity_records_entry_kind_check
    check (entry_kind in ('performance', 'deep', 'activity'));

comment on column public.activity_records.submitted_at is '제출일(No.141). null 이면 앱이 created_at 으로 읽는다.';
comment on column public.activity_records.record_status is '기록 상태(No.141): completed, in_progress, plan. null 이면 앱이 status 에서 파생한다(planned 면 plan, 그 밖은 completed).';
comment on column public.activity_records.parent_record_id is '상위 기록(No.141). 상위 기록이 지워지면 null 로 돌아간다.';
comment on column public.activity_records.entry_kind is '직접 입력 때 학생이 고른 기록 유형(No.146): performance, deep, activity. source_program 과 별개다.';

-- ---------------------------------------------------------------------
-- selfeval_manual_logs: 직접 입력한 활동 로그(No.159, 160, 188). 원본 파일은 저장하지 않는다.
-- ---------------------------------------------------------------------
create table public.selfeval_manual_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.selfeval_sessions (id) on delete cascade,
  written_at date,
  text text not null check (char_length(text) between 1 and 300),
  ocr boolean not null default false,
  confirmed boolean not null default false,
  included boolean not null default true,
  belongs_to uuid references public.activity_records (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index selfeval_manual_logs_session_idx on public.selfeval_manual_logs (session_id);
create index selfeval_manual_logs_belongs_to_idx on public.selfeval_manual_logs (belongs_to);

create trigger trg_selfeval_manual_logs_updated_at
  before update on public.selfeval_manual_logs
  for each row execute function public.set_updated_at();

comment on table public.selfeval_manual_logs is '자기평가서 세션의 직접 입력 활동 로그(No.159, 160, 188). 사진 입력은 OCR 텍스트만 남기고 원본 파일 컬럼은 없다. 읽기는 세션 소유자와 관리자, 쓰기는 service_role 만이다.';

-- ---------------------------------------------------------------------
-- selfeval_record_links: 활동 기록 사이 연결(No.175-186, 194)
-- ---------------------------------------------------------------------
create table public.selfeval_record_links (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.selfeval_sessions (id) on delete cascade,
  from_record_id uuid not null references public.activity_records (id) on delete cascade,
  to_record_id uuid not null references public.activity_records (id) on delete cascade,
  link_type text not null check (link_type in (
    'inherit', 'deepen', 'borrow_method', 'complement', 'background', 'area_extend', 'grade_continue')),
  strength text not null check (strength in ('explicit', 'implicit')),
  source text not null check (source in ('model', 'student')),
  confirmed boolean not null default false,
  deleted boolean not null default false,
  note text,
  quote_from text,
  quote_to text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint selfeval_record_links_pair_uniq unique (session_id, from_record_id, to_record_id),
  constraint selfeval_record_links_not_self check (from_record_id <> to_record_id)
);

create index selfeval_record_links_from_idx on public.selfeval_record_links (from_record_id);
create index selfeval_record_links_to_idx on public.selfeval_record_links (to_record_id);

create trigger trg_selfeval_record_links_updated_at
  before update on public.selfeval_record_links
  for each row execute function public.set_updated_at();

comment on table public.selfeval_record_links is '자기평가서 세션의 활동 기록 연결(No.175-186, 194). 세션과 방향 있는 쌍마다 1행이다. deleted 는 학생이 지운 연결을 다시 제안하지 않기 위한 표시다. 읽기는 세션 소유자와 관리자, 쓰기는 service_role 만이다.';

-- ---------------------------------------------------------------------
-- selfeval_report_views: 최종 리포트 뷰 캐시(No.133, 173). 세션당 1행.
-- ---------------------------------------------------------------------
create table public.selfeval_report_views (
  session_id uuid primary key references public.selfeval_sessions (id) on delete cascade,
  final_revision integer not null,
  payload jsonb not null default '{}'::jsonb,
  tag_map jsonb not null default '{}'::jsonb,
  status text not null check (status in ('ready', 'failed')),
  attempts integer not null default 0,
  built_at timestamptz not null default now()
);

comment on table public.selfeval_report_views is '자기평가서 최종 리포트 뷰(No.133, 173). 세션당 1행이고 attempts 가 리포트 생성 시도 횟수다. 읽기는 세션 소유자와 관리자, 쓰기는 service_role 만이다.';

-- ---------------------------------------------------------------------
-- student_profiles.service_tier(No.135)
-- ---------------------------------------------------------------------
alter table public.student_profiles
  add column service_tier text,
  add constraint student_profiles_service_tier_check
    check (service_tier in ('individual', 'standard'));

-- ---------------------------------------------------------------------
-- RLS: 세션 소유자(또는 위닝 관리자)만 읽고, 쓰기는 service_role 만 한다.
-- ---------------------------------------------------------------------
alter table public.selfeval_manual_logs enable row level security;
alter table public.selfeval_record_links enable row level security;
alter table public.selfeval_report_views enable row level security;

create policy "selfeval_manual_logs select own admin" on public.selfeval_manual_logs
  for select to authenticated
  using (
    exists (
      select 1 from public.selfeval_sessions s
       where s.id = selfeval_manual_logs.session_id
         and (s.profile_id = auth.uid() or public.is_winning_admin())
    )
  );

create policy "selfeval_record_links select own admin" on public.selfeval_record_links
  for select to authenticated
  using (
    exists (
      select 1 from public.selfeval_sessions s
       where s.id = selfeval_record_links.session_id
         and (s.profile_id = auth.uid() or public.is_winning_admin())
    )
  );

create policy "selfeval_report_views select own admin" on public.selfeval_report_views
  for select to authenticated
  using (
    exists (
      select 1 from public.selfeval_sessions s
       where s.id = selfeval_report_views.session_id
         and (s.profile_id = auth.uid() or public.is_winning_admin())
    )
  );

revoke all on table public.selfeval_manual_logs from anon, authenticated;
revoke all on table public.selfeval_record_links from anon, authenticated;
revoke all on table public.selfeval_report_views from anon, authenticated;
grant select on table public.selfeval_manual_logs to authenticated;
grant select on table public.selfeval_record_links to authenticated;
grant select on table public.selfeval_report_views to authenticated;
grant all on table public.selfeval_manual_logs to service_role;
grant all on table public.selfeval_record_links to service_role;
grant all on table public.selfeval_report_views to service_role;
