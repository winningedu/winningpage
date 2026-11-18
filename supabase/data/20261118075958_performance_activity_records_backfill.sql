-- 목적: 이미 최종본인 수행평가 제출을 활동 기록(activity_records)으로 처음 한 번 채우기
--   finalize_performance_submission 이 최종 확정 때 활동 기록을 만들지 않아 기존 최종본에는 행이 없다.
--   수정된 함수는 앞으로의 최종본만 처리하므로, 이미 확정된 건을 여기서 채운다.
--   source_ref_id 는 수행평가 세션 id 이고, (source_program, source_ref_id) 유니크라 다시 돌려도 중복이 없다.
--   is_final 만으로 충분하다. 함수가 평가 리포트 존재를 확인한 뒤에만 is_final 을 켜고,
--   세션당 최종본은 performance_submissions_one_final_per_session_idx 로 1건이다.
--   subject_group 은 세션 값(국어/수학 등)이 CHECK 에 어긋나므로 항상 '교과'로 넣는다.
--
-- 대상 DB: dev (gjowqdiopinhixfivnkx), Winning prod (ykrpjcsubmbenfcnwlzd),
--   Schoolmentor prod (aalujumpwlnwlemnqrus). dev 먼저, prod 는 DB마다 소유자 승인 후 수동으로 실행한다.
-- 전제: *_performance_final_activity_record.sql 마이그레이션이 먼저 적용되어 있어야 한다.

-- 1) 실행 전 확인 (읽기 전용): 최종본 수 / 활동 기록이 없는 수
select count(*) as final_submissions,
       count(*) filter (where not exists (
         select 1 from public.activity_records a
         where a.source_program = 'performance' and a.source_ref_id = sub.session_id
       )) as missing_activity_records
from public.performance_submissions sub
where sub.is_final;

-- 2) 백필
insert into public.activity_records
  (profile_id, source_program, source_ref_id, status, grade_label, semester,
   subject_group, subject, topic, confirmed_at)
select s.profile_id, 'performance', s.id, 'confirmed',
       case when s.grade_label in ('고1','고2','고3') then s.grade_label end,
       case s.semester when '1학기' then 1 when '2학기' then 2 end,
       '교과',
       s.subject,
       (select t.title from public.performance_topics t where t.id = s.selected_topic_id and t.session_id = s.id),
       coalesce(sub.finalized_at, now())
from public.performance_submissions sub
join public.performance_sessions s on s.id = sub.session_id
where sub.is_final
on conflict (source_program, source_ref_id) where source_ref_id is not null do nothing;

-- 3) 실행 후 확인 (읽기 전용): 활동 기록이 없는 수가 0이어야 한다
select count(*) as final_submissions,
       count(*) filter (where not exists (
         select 1 from public.activity_records a
         where a.source_program = 'performance' and a.source_ref_id = sub.session_id
       )) as missing_activity_records
from public.performance_submissions sub
where sub.is_final;

-- 실행 기록
-- 2026-11-18 dev(gjowqdiopinhixfivnkx): 실행 전 최종본 7건, performance 기록 0건. 1회차 뒤 7건, 누락 0. 2회차 추가 0건.
-- 2026-11-18 Winning prod(ykrpjcsubmbenfcnwlzd): 실행 전 최종본 4건, performance 기록 0건. 1회차 뒤 4건, 누락 0. 2회차 추가 0건. 학년, 학기, 주제 NULL 0건.
-- 2026-11-18 Schoolmentor prod(aalujumpwlnwlemnqrus): 실행 전 최종본 2건, performance 기록 0건. 1회차 뒤 2건, 누락 0. 2회차 추가 0건. 학년, 학기, 주제 NULL 0건.
