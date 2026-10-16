-- 성장설계 업로드 추출 선점 상태(processing)와 설문 원자 병합, 수집 확정 RPC.

-- (a) extraction_status 에 processing 추가. 제약 이름은 자동 생성된 것이다.
alter table public.growth_uploads
  drop constraint if exists growth_uploads_extraction_status_check;

alter table public.growth_uploads
  add constraint growth_uploads_extraction_status_check
  check (extraction_status in ('pending', 'processing', 'ok', 'failed'));

comment on column public.growth_uploads.extraction_status is
  'pending 은 업로드 대기, processing 은 추출 선점 상태(동시 추출 방지), ok 는 추출 완료, failed 는 실패 또는 미처리 만료.';

-- (b) 설문 답변 원자 병합. 문항별 자동 저장의 갱신 손실을 막는다(No.28).
-- null 값 키는 삭제(비우기)한다. current_step 0 가드는 생성 시작 뒤 입력 변경을 금지한다.
-- 가드에 걸리거나 행이 없으면 null 을 반환하고, 호출자가 잠김 또는 없음으로 해석한다.
create or replace function public.fn_growth_merge_survey_answers(
  p_report_id uuid,
  p_profile_id uuid,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_answers jsonb;
begin
  update public.growth_reports
  set survey_answers = jsonb_strip_nulls(
        coalesce(survey_answers, '{}'::jsonb) || coalesce(p_patch, '{}'::jsonb)
      ),
      last_activity_at = now(),
      updated_at = now()
  where id = p_report_id
    and profile_id = p_profile_id
    and status in ('draft', 'in_progress')
    and current_step = 0
  returning survey_answers into v_answers;

  return v_answers;
end;
$$;

revoke all on function public.fn_growth_merge_survey_answers(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.fn_growth_merge_survey_answers(uuid, uuid, jsonb)
  to service_role;

-- (c) 리포트 만들기 시점에 P4 입력을 고정한다(No.113). 같은 가드를 쓴다.
create or replace function public.fn_growth_commit_collect(
  p_report_id uuid,
  p_profile_id uuid,
  p_track text,
  p_grade_inputs jsonb,
  p_activity_ids uuid[]
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  update public.growth_reports
  set track = p_track,
      grade_inputs = p_grade_inputs,
      activity_ids = p_activity_ids,
      status = 'in_progress',
      last_activity_at = now(),
      updated_at = now()
  where id = p_report_id
    and profile_id = p_profile_id
    and status in ('draft', 'in_progress')
    and current_step = 0;

  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

revoke all on function public.fn_growth_commit_collect(uuid, uuid, text, jsonb, uuid[])
  from public, anon, authenticated;
grant execute on function public.fn_growth_commit_collect(uuid, uuid, text, jsonb, uuid[])
  to service_role;
