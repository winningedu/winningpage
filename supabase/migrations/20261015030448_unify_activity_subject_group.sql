-- activity_records.subject_group 어휘 통일.
-- 허용 값은 교과, 자율, 동아리, 진로 네 가지(업로드 추출의 null 은 허용).
-- 교과면 subject 에 과목명, 창체면 subject 에 활동명(없으면 null)을 둔다.
-- 1) 자기평가 최종 저장 함수가 교과 영역에서 subject_group 에 과목명을 넣던 것을 '교과' 로 바꾼다.
-- 2) 기존 행을 네 값으로 백필한다.
-- 3) check 제약을 건다.

-- 1) fn_selfeval_finalize: v_group 의 subject 분기만 '교과' 로 바꾼 것 외에는 20261006111049 와 같다.
create or replace function public.fn_selfeval_finalize(
  p_session_id uuid,
  p_profile_id uuid,
  p_promoted jsonb,
  p_sections jsonb,
  p_char_count jsonb,
  p_score integer
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_session   public.selfeval_sessions;
  v_revision  integer;
  v_record_id uuid;
  v_group     text;
  v_subject   text;
  v_promoted  jsonb := coalesce(p_promoted, '{}'::jsonb);
begin
  perform pg_advisory_xact_lock(hashtextextended(p_profile_id::text, 101));

  select * into v_session
    from public.selfeval_sessions s
   where s.id = p_session_id and s.profile_id = p_profile_id
     for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- 멱등: 이미 완료된 세션은 다시 쓰지 않는다. completed 는 in_progress 가 아니므로 먼저 본다.
  if v_session.status = 'completed' then
    select a.id into v_record_id
      from public.activity_records a
     where a.source_program = 'self' and a.source_ref_id = p_session_id;

    select max(r.revision) into v_revision
      from public.selfeval_reports r
     where r.session_id = p_session_id and r.report_type = 'final';

    return jsonb_build_object(
      'ok', true, 'reason', 'already_completed',
      'activityRecordId', v_record_id, 'finalRevision', v_revision
    );
  end if;

  if v_session.status <> 'in_progress' or v_session.current_step < 5 then
    return jsonb_build_object('ok', false, 'reason', 'not_ready');
  end if;

  select coalesce(max(r.revision), 0) + 1 into v_revision
    from public.selfeval_reports r
   where r.session_id = p_session_id and r.report_type = 'final';

  insert into public.selfeval_reports (
    session_id, profile_id, report_type, revision, sections, char_count, score
  )
  values (
    p_session_id, p_profile_id, 'final', v_revision, p_sections, p_char_count, p_score
  );

  -- 구분값은 심화탐구와 같은 어휘(교과, 자율, 동아리, 진로)를 쓴다. subject 는 교과면 과목명, 창체면 활동명.
  v_group := case v_session.area
    when 'subject' then '교과'
    when 'autonomy' then '자율'
    when 'club' then '동아리'
    when 'career' then '진로'
    else null
  end;
  v_subject := case when v_session.area = 'subject' then v_session.subject else v_session.activity_name end;

  insert into public.activity_records (
    profile_id, source_program, source_ref_id, status, grade_label, semester,
    subject_group, subject, topic, concept, method, result, limitation,
    numbers, sources, confirmed_at
  )
  values (
    p_profile_id, 'self', p_session_id, 'final', v_session.grade_label, v_session.semester,
    v_group, v_subject,
    v_promoted ->> 'topic', v_promoted ->> 'concept', v_promoted ->> 'method',
    v_promoted ->> 'result', v_promoted ->> 'limitation',
    v_promoted -> 'numbers', v_promoted -> 'sources', now()
  )
  on conflict (source_program, source_ref_id) where source_ref_id is not null
  do update set
    status = excluded.status,
    grade_label = excluded.grade_label,
    semester = excluded.semester,
    subject_group = excluded.subject_group,
    subject = excluded.subject,
    topic = excluded.topic,
    concept = excluded.concept,
    method = excluded.method,
    result = excluded.result,
    limitation = excluded.limitation,
    numbers = excluded.numbers,
    sources = excluded.sources,
    confirmed_at = excluded.confirmed_at,
    updated_at = now()
  returning id into v_record_id;

  update public.selfeval_sessions s
     set status = 'completed',
         current_step = 6,
         completed_at = now(),
         last_activity_at = now(),
         updated_at = now()
   where s.id = p_session_id;

  return jsonb_build_object(
    'ok', true, 'reason', 'completed',
    'activityRecordId', v_record_id, 'finalRevision', v_revision
  );
end;
$$;

-- 2) 기존 행 백필 -------------------------------------------------------------
-- 규칙(네 값 밖이고 null 이 아닌 행만 대상):
--   빈 문자열: null
--   자기평가 세션 영역이 교과인 self 행: 교과 (과목명 "진로와 직업" 처럼 접두어가 겹치는 경우를 막는다)
--   자율, 동아리, 진로로 시작: 각각 자율, 동아리, 진로
--   창체, 봉사로 시작: 자율 (자율활동 범주)
--   그 밖: 교과, subject = coalesce(subject, 기존 subject_group)
do $$
declare
  v_before integer;
  v_after integer;
  v_updated integer;
begin
  select count(*) into v_before
    from public.activity_records
   where subject_group is not null
     and subject_group not in ('교과', '자율', '동아리', '진로');

  update public.activity_records a
     set subject = case
           when btrim(a.subject_group) = '' then a.subject
           when exists (
                  select 1 from public.selfeval_sessions s
                   where a.source_program = 'self'
                     and s.id = a.source_ref_id and s.area = 'subject')
             then coalesce(a.subject, a.subject_group)
           when a.subject_group like '자율%' or a.subject_group like '동아리%'
             or a.subject_group like '진로%' or a.subject_group like '창체%'
             or a.subject_group like '봉사%'
             then a.subject
           else coalesce(a.subject, a.subject_group)
         end,
         subject_group = case
           when btrim(a.subject_group) = '' then null
           when exists (
                  select 1 from public.selfeval_sessions s
                   where a.source_program = 'self'
                     and s.id = a.source_ref_id and s.area = 'subject')
             then '교과'
           when a.subject_group like '자율%' then '자율'
           when a.subject_group like '동아리%' then '동아리'
           when a.subject_group like '진로%' then '진로'
           when a.subject_group like '창체%' or a.subject_group like '봉사%' then '자율'
           else '교과'
         end
   where a.subject_group is not null
     and a.subject_group not in ('교과', '자율', '동아리', '진로');
  get diagnostics v_updated = row_count;

  select count(*) into v_after
    from public.activity_records
   where subject_group is not null
     and subject_group not in ('교과', '자율', '동아리', '진로');

  raise notice 'activity_records subject_group 백필: 대상 % 건, 갱신 % 건, 적용 뒤 네 값 밖 % 건',
    v_before, v_updated, v_after;
end;
$$;

-- 3) 제약 ---------------------------------------------------------------------
alter table public.activity_records
  add constraint activity_records_subject_group_check
  check (subject_group is null or subject_group in ('교과', '자율', '동아리', '진로'));

comment on column public.activity_records.subject_group is
  '활동 구분. 교과, 자율, 동아리, 진로 중 하나이며 업로드 추출은 null 이다. 교과면 subject 에 과목명, 창체(자율, 동아리, 진로)면 subject 에 활동명(없으면 null)을 둔다.';
