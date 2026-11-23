-- 자기평가서 v4.2 리뷰 보완(스키마만).
-- 리포트 선점 시각. 만드는 중인 요청이 하나만 되도록 claimed_at 이 비었거나 단계 예산보다 오래됐을 때만 선점한다.
alter table public.selfeval_report_views
  add column if not exists claimed_at timestamptz null;

comment on column public.selfeval_report_views.claimed_at is '리포트 만들기 선점 시각. 끝내면 null. 신선한 값이 있으면 다른 요청은 선점하지 못하고, 단계 예산(50초)보다 오래되면 다시 선점할 수 있다.';

-- 수기 업로드 호출 횟수를 DB 에 센다(명세 No.158~161). 서버리스 인스턴스와 상관없이 세션당 p_cap 번까지다.
-- 세션 행을 for update 로 잠근 안에서 읽고 올리므로 동시 요청도 상한을 넘기지 못한다.
-- 횟수는 selfeval_sessions.step_state.uploads 에 둔다. 단계 선점과 종료 함수는 steps 키만 바꾼다.
create or replace function public.fn_selfeval_claim_upload(p_session_id uuid, p_profile_id uuid, p_cap integer default 10) returns jsonb
    language plpgsql security definer
    set search_path to 'public', 'pg_temp'
    as $$
declare
  v_session public.selfeval_sessions;
  v_count   integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_profile_id::text, 101));

  select * into v_session
    from public.selfeval_sessions s
   where s.id = p_session_id and s.profile_id = p_profile_id
     for update;

  if not found or v_session.status not in ('draft', 'in_progress') then
    return jsonb_build_object('kind', 'locked');
  end if;

  v_count := coalesce((v_session.step_state ->> 'uploads')::integer, 0);
  if v_count >= p_cap then
    return jsonb_build_object('kind', 'limit', 'count', v_count);
  end if;

  update public.selfeval_sessions s
     set step_state = jsonb_set(coalesce(s.step_state, '{}'::jsonb), '{uploads}', to_jsonb(v_count + 1), true),
         updated_at = now()
   where s.id = p_session_id;

  return jsonb_build_object('kind', 'claimed', 'count', v_count + 1);
end;
$$;

comment on function public.fn_selfeval_claim_upload(uuid, uuid, integer) is '수기 업로드 호출 하나를 센다. 반환 kind: claimed(count)/limit(count)/locked. 열린 세션(draft, in_progress)의 소유자만 센다.';

revoke all on function public.fn_selfeval_claim_upload(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.fn_selfeval_claim_upload(uuid, uuid, integer) to service_role;
