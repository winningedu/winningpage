-- AI 호출 계기판 코어 테이블.
--
-- 이유: 수행평가 AI 개선 안내(2026-08-19) 4번의 측정 장치다. 모델 호출 1건과 검색 1건마다
--   행 1개를 쌓아 관리자 화면에서 집계한다. 프롬프트와 응답 본문은 저장하지 않는다.
-- 쓰기: 서버(service_role)만 insert 한다. authenticated 는 관리자 select 만 가능하고
--   insert, update, delete 정책은 두지 않는다.
-- 회원탈퇴: fn_delete_account 를 다시 쓰며 두 테이블의 profile_id 를 null 로 끊는다.
--   운영 통계는 보존하고 개인 식별만 끊는다.

create table public.ai_model_calls (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  started_at timestamptz not null,
  trace_id uuid not null,
  kind text not null check (kind in ('generate', 'embed')),
  service text not null check (service in ('performance', 'growth', 'inquiry', 'selfeval', 'goal')),
  feature text not null,
  step text,
  target_kind text,
  target_id uuid,
  profile_id uuid,
  model text not null,
  prompt_version text,
  attempt integer not null default 1 check (attempt >= 1),
  retry_reason text,
  transport_attempt integer not null default 1 check (transport_attempt >= 1),
  status text not null check (status in ('ok', 'error')),
  error_code text,
  error_message text,
  finish_reason text,
  prompt_tokens integer,
  output_tokens integer,
  cached_tokens integer,
  thoughts_tokens integer,
  total_tokens integer,
  input_chars integer,
  output_chars integer,
  latency_ms integer not null check (latency_ms >= 0),
  validation text check (validation in ('ok', 'failed')),
  issue_codes text[]
);

create index ai_model_calls_created_at_idx on public.ai_model_calls (created_at desc);
create index ai_model_calls_service_created_at_idx on public.ai_model_calls (service, created_at desc);
create index ai_model_calls_trace_id_idx on public.ai_model_calls (trace_id);
create index ai_model_calls_profile_created_at_idx on public.ai_model_calls (profile_id, created_at desc);

create table public.ai_retrieval_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  started_at timestamptz not null,
  trace_id uuid not null,
  service text not null check (service in ('performance', 'growth', 'inquiry', 'selfeval', 'goal')),
  feature text not null,
  step text,
  target_kind text,
  target_id uuid,
  profile_id uuid,
  kind text not null check (kind in ('knowledge', 'student_history')),
  knowledge_type text,
  threshold double precision,
  match_count_requested integer,
  raw_hits integer,
  packed_hits integer,
  top_score double precision,
  source text check (source is null or source in ('vector', 'keyword', 'none')),
  degraded boolean not null default false,
  injected_chars integer,
  embed_ms integer,
  latency_ms integer not null check (latency_ms >= 0),
  status text not null check (status in ('ok', 'error')),
  error_message text,
  hit_resource_ids uuid[],
  cited_resource_ids uuid[]
);

create index ai_retrieval_events_created_at_idx on public.ai_retrieval_events (created_at desc);
create index ai_retrieval_events_service_created_at_idx on public.ai_retrieval_events (service, created_at desc);
create index ai_retrieval_events_trace_id_idx on public.ai_retrieval_events (trace_id);

alter table public.ai_model_calls enable row level security;
alter table public.ai_retrieval_events enable row level security;

create policy ai_model_calls_admin_select on public.ai_model_calls
  for select to authenticated using (public.is_admin());
create policy ai_retrieval_events_admin_select on public.ai_retrieval_events
  for select to authenticated using (public.is_admin());

grant select on public.ai_model_calls to authenticated;
grant select on public.ai_retrieval_events to authenticated;
grant all on public.ai_model_calls to service_role;
grant all on public.ai_retrieval_events to service_role;

-- fn_delete_account 는 20261006111510 본문을 그대로 두고 탈퇴 사용자의 계기판 행에서
-- 개인 식별(profile_id)만 끊는 두 줄을 추가한다. 기존 삭제 순서는 바꾸지 않는다.
CREATE OR REPLACE FUNCTION "public"."fn_delete_account"("p_user_id" "uuid")
    RETURNS "text"
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

REVOKE ALL ON FUNCTION "public"."fn_delete_account"("uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_delete_account"("uuid") TO "service_role";

COMMENT ON FUNCTION "public"."fn_delete_account"("uuid") IS '회원탈퇴 하드 삭제(QA #2), api/delete-account.ts(service_role) 전용, authenticated/anon 실행 금지. orders/refund_requests/coupon_redemptions 참조가 있으면(전자상거래법 5년 보존 + FK RESTRICT/NOT NULL) 사용자 소유 데이터(성장설계, 심화탐구 포함)만 정리하고 profiles 는 개인식별 필드만 익명화한 뒤 anonymized 를 반환, 참조가 전혀 없으면 profiles 까지 지우고 deleted 를 반환한다. 호출부는 deleted 일 때만 auth.admin.deleteUser 를 이어서 호출하고, anonymized 일 때는 updateUserById(ban) 로 로그인만 막는다.';
