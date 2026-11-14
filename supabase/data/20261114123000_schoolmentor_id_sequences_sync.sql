-- 목적: Schoolmentor prod 에서 번호 생성기(sequence)가 테이블의 가장 큰 id 보다 뒤처진 4곳을 맞춘다.
--   행은 바꾸지 않는다. 다음에 나올 번호만 올린다.
--
-- 근거: 2026-11-14 프리미엄 책자 관리에서 [적용]이 "duplicate key value violates unique constraint
--   premium_book_pages_pkey" 로 실패했다. 행은 id 1~16 인데 premium_book_pages_id_seq 가 1 이었다.
--   같은 조회에서 아래 3곳도 생성기를 한 번도 쓰지 않은 상태였다(행은 id 를 직접 넣어 들어온 것).
--     admission_posts        가장 큰 id 12
--     admission_results      가장 큰 id 43628
--     goal_university_cuts   가장 큰 id 66630
--     premium_book_pages     가장 큰 id 16, 생성기 1
--   이 상태에서는 id 를 넣지 않는 새 행 등록이 기존 id 와 부딪혀 실패한다.
--
-- 대상 DB: Schoolmentor prod (aalujumpwlnwlemnqrus) 에만 실행한다.
--   dev(gjowqdiopinhixfivnkx)와 Winning prod(ykrpjcsubmbenfcnwlzd)에는 실행하지 않는다(Winning prod 의
--   premium_book_pages 는 생성기 16, 가장 큰 id 16 으로 맞아 있다. 나머지는 조회하지 않았다).
--
-- 멱등: 생성기가 이미 가장 큰 id 이상이면 그 값을 그대로 다시 넣는다(낮추지 않는다). 다시 실행해도 결과가 같다.
--   빈 테이블은 건드리지 않는다.
--
-- 실행 전 조회 (결과를 기록한다):
--   select sequencename, last_value from pg_sequences
--    where schemaname = 'public'
--      and sequencename in ('admission_posts_id_seq', 'admission_results_id_seq',
--                           'goal_university_cuts_id_seq', 'premium_book_pages_id_seq')
--    order by 1;
-- 실행 후 확인: 위 조회의 last_value 가 각 테이블의 max(id) 이상이어야 한다.

select setval('public.admission_posts_id_seq',
              greatest((select max(id) from public.admission_posts),
                       (select coalesce(last_value, 1) from pg_sequences
                         where schemaname = 'public' and sequencename = 'admission_posts_id_seq')),
              true)
 where exists (select 1 from public.admission_posts);

select setval('public.admission_results_id_seq',
              greatest((select max(id) from public.admission_results),
                       (select coalesce(last_value, 1) from pg_sequences
                         where schemaname = 'public' and sequencename = 'admission_results_id_seq')),
              true)
 where exists (select 1 from public.admission_results);

select setval('public.goal_university_cuts_id_seq',
              greatest((select max(id) from public.goal_university_cuts),
                       (select coalesce(last_value, 1) from pg_sequences
                         where schemaname = 'public' and sequencename = 'goal_university_cuts_id_seq')),
              true)
 where exists (select 1 from public.goal_university_cuts);

select setval('public.premium_book_pages_id_seq',
              greatest((select max(id) from public.premium_book_pages),
                       (select coalesce(last_value, 1) from pg_sequences
                         where schemaname = 'public' and sequencename = 'premium_book_pages_id_seq')),
              true)
 where exists (select 1 from public.premium_book_pages);

-- 실행 기록
-- 2026-11-14 Schoolmentor prod (aalujumpwlnwlemnqrus) 실행.
--   실행 전: admission_posts_id_seq 없음(미사용), admission_results_id_seq 없음, goal_university_cuts_id_seq 없음, premium_book_pages_id_seq 1
--   실행 후: 12, 43628, 66630, 16 (각 테이블의 max(id) 와 같다)
--   재실행: 값 그대로.
--   그 뒤 프리미엄 책자 관리에서 [적용]을 다시 눌러 18장이 반영됐다(행 18개).
