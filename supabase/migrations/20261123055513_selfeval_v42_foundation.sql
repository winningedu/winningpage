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

-- ---------------------------------------------------------------------
-- fn_selfeval_claim_step: link 단계 추가(No.174, 17). 나머지는 20261021014317 정의와 같다.
-- 권한은 CREATE OR REPLACE 가 그대로 이어받는다.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."fn_selfeval_claim_step"("p_session_id" "uuid", "p_profile_id" "uuid", "p_step" "text", "p_stale_seconds" integer DEFAULT 120) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  c_max_attempts constant integer := 10;

  v_session  public.selfeval_sessions;
  v_rec      jsonb;
  v_min_step integer;
  v_attempts integer;
  v_started  timestamptz;
  v_now_iso  text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if p_step is null or p_step not in ('link', 'analyze', 'write', 'verify') then
    raise exception 'selfeval_step_unknown' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_profile_id::text, 101));

  select * into v_session
    from public.selfeval_sessions s
   where s.id = p_session_id and s.profile_id = p_profile_id
     for update;

  if not found then
    return jsonb_build_object('kind', 'locked');
  end if;

  if v_session.status not in ('draft', 'in_progress') then
    return jsonb_build_object('kind', 'locked');
  end if;

  if (v_session.step_state -> 'terminal') is not null
     and jsonb_typeof(v_session.step_state -> 'terminal') <> 'null' then
    return jsonb_build_object('kind', 'locked');
  end if;

  -- 순서 가드(명세 No.65): 분석은 활동 선택 확정 뒤, 생성은 분석 뒤, 검증은 생성 뒤에만 한다.
  -- 연결(link, 명세 No.174)은 활동 선택 단계(기본 입력 저장 뒤, 선택 확정 전)에서 부른다.
  v_min_step := case p_step when 'link' then 1 when 'analyze' then 2 when 'write' then 3 else 4 end;
  if v_session.current_step < v_min_step then
    return jsonb_build_object('kind', 'order', 'currentStep', v_session.current_step);
  end if;

  v_rec := v_session.step_state -> 'steps' -> p_step;

  -- 신선한 running 이면 다른 요청이 처리 중이다. startedAt 이 없거나 오래됐으면 선점 가능.
  if v_rec ->> 'status' = 'running' and v_rec ->> 'startedAt' is not null then
    v_started := (v_rec ->> 'startedAt')::timestamptz;
    if v_started > now() - make_interval(secs => p_stale_seconds) then
      return jsonb_build_object('kind', 'running');
    end if;
  end if;

  v_attempts := coalesce((v_rec ->> 'attempts')::integer, 0);
  if v_attempts >= c_max_attempts then
    return jsonb_build_object('kind', 'exhausted', 'attempts', v_attempts);
  end if;

  update public.selfeval_sessions s
     set step_state = jsonb_set(
           coalesce(s.step_state, '{}'::jsonb),
           '{steps}',
           coalesce(s.step_state -> 'steps', '{}'::jsonb)
             || jsonb_build_object(
                  p_step,
                  jsonb_build_object(
                    'status', 'running',
                    'attempts', v_attempts + 1,
                    'startedAt', v_now_iso,
                    'finishedAt', null,
                    'issues', coalesce(v_rec -> 'issues', '[]'::jsonb)
                  )
                ),
           true
         ),
         status = case when s.status = 'draft' then 'in_progress' else s.status end,
         last_activity_at = now(),
         updated_at = now()
   where s.id = p_session_id;

  return jsonb_build_object('kind', 'claimed', 'attempts', v_attempts + 1);
end;
$$;

comment on function public.fn_selfeval_claim_step(uuid, uuid, text, integer) is '자기평가서 단계 선점. 프로필 advisory 잠금(101) 뒤 세션 행을 for update 로 읽어 단계를 running 으로 표시한다. 반환 kind 어휘: claimed(attempts)/locked/order(currentStep)/running/exhausted(attempts). 순서 가드는 current_step 기준으로 link 1 이상, analyze 2 이상, write 3 이상, verify 4 이상이다(명세 No.65, 174). link 는 활동 선택 단계의 기록 연결 모델 호출이다. 이미 ok 인 단계도 다시 선점할 수 있다(재분석, 재생성, 재검증). 시도 상한은 단계당 10(No.89). startedAt 이 p_stale_seconds 보다 오래된 running 은 서버리스 중단으로 보고 다시 선점한다. draft 세션은 in_progress 로 올린다. p_step 이 link, analyze, write, verify 밖이면 예외(selfeval_step_unknown). 리포트 생성 시도는 selfeval_report_views.attempts 가 센다.';

-- ---------------------------------------------------------------------
-- fn_delete_account: 새 표 3개를 세션 삭제 앞에서 지운다(No.95). 나머지는 20261021014317 정의와 같다.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."fn_delete_account"("p_user_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_has_retained_records boolean;
begin
  if p_user_id is null then
    raise exception 'user_id_required' using errcode = '22004';
  end if;

  select exists (
    select 1 from public.orders
     where user_id = p_user_id
        or parent_profile_id = p_user_id
        or student_profile_id = p_user_id
    union all
    select 1 from public.refund_requests
     where user_id = p_user_id
        or parent_profile_id = p_user_id
        or student_profile_id = p_user_id
        or requested_by = p_user_id
    union all
    select 1 from public.coupon_redemptions where user_id = p_user_id
  ) into v_has_retained_records;

  -- AI 호출 계기판. 운영 통계는 보존하고 개인 식별만 끊는다.
  update public.ai_model_calls set profile_id = null where profile_id = p_user_id;
  update public.ai_retrieval_events set profile_id = null where profile_id = p_user_id;

  -- 자기평가서(FK 역순). selfeval_sessions.ledger_id 가 원장을 참조하고 selfeval_session_activities 가
  -- activity_records 를 restrict 로 참조하므로 둘보다 앞에서 지운다. 20261006111050 의 블록을
  -- 이 파일이 함수 본문을 다시 쓰면서 그대로 가져온다.
  delete from public.selfeval_manual_logs
   where session_id in (select id from public.selfeval_sessions where profile_id = p_user_id);
  delete from public.selfeval_record_links
   where session_id in (select id from public.selfeval_sessions where profile_id = p_user_id);
  delete from public.selfeval_report_views
   where session_id in (select id from public.selfeval_sessions where profile_id = p_user_id);
  delete from public.selfeval_reports where profile_id = p_user_id;
  delete from public.selfeval_session_activities where profile_id = p_user_id;
  delete from public.selfeval_sessions where profile_id = p_user_id;

  -- 심화탐구(FK 역순). inquiry_sessions.ledger_id 가 원장을 참조하므로 원장 삭제보다 먼저.
  -- inquiry_assets 가 activity_records 를 참조하므로 활동 기록 삭제보다도 앞이다.
  delete from public.inquiry_reports where profile_id = p_user_id;
  delete from public.inquiry_submissions where profile_id = p_user_id;
  delete from public.inquiry_topics where profile_id = p_user_id;
  delete from public.inquiry_assets where profile_id = p_user_id;
  delete from public.inquiry_sessions where profile_id = p_user_id;

  -- 성장설계(FK 역순). growth_reports.ledger_id 가 원장을 참조하므로 원장 삭제보다 먼저.
  delete from public.growth_plan_items where profile_id = p_user_id;
  delete from public.growth_uploads where profile_id = p_user_id;
  delete from public.growth_reports where profile_id = p_user_id;
  delete from public.growth_profiles where profile_id = p_user_id;
  delete from public.activity_records where profile_id = p_user_id;
  delete from public.student_profiles where profile_id = p_user_id;
  delete from public.goal_students where profile_id = p_user_id;
  delete from public.performance_sessions where profile_id = p_user_id;
  delete from public.diagnosis_attempts where profile_id = p_user_id;
  delete from public.performance_credit_ledger where profile_id = p_user_id;
  delete from public.performance_session_vectors where profile_id = p_user_id;
  delete from public.program_access_grants where profile_id = p_user_id;
  delete from public.program_access where id = p_user_id;
  delete from public.payments where id = p_user_id;
  delete from public.identity_verifications where user_id = p_user_id;
  delete from public.mentor_applications where user_id = p_user_id;
  delete from public.phone_verifications where user_id = p_user_id;
  delete from public.student_link_codes where student_id = p_user_id;
  delete from public.parent_child_links where parent_id = p_user_id or student_id = p_user_id;
  delete from public.coupon_grants where user_id = p_user_id;
  delete from public.link_code_lookups where actor_id = p_user_id;
  delete from public.user_term_agreements where user_id = p_user_id;
  update public.enrollments set profile_id = null where profile_id = p_user_id;

  if v_has_retained_records then
    update public.profiles
       set name = null,
           phone = null,
           email = null,
           username = null,
           school_type = null,
           school_name = null,
           birth_date = null,
           gender = null,
           landline = null,
           address = null,
           address_detail = null,
           guardian_phone = null,
           memo = null,
           region = null,
           payment_terminal_id = null,
           marketing_agreed = false,
           ads_agreed = false,
           sms_agreed = false,
           guardian_consent = false,
           is_active = false,
           updated_at = now()
     where id = p_user_id;
    return 'anonymized';
  end if;

  delete from public.profiles where id = p_user_id;
  return 'deleted';
end;
$$;
