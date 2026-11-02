-- 목적: 메인 랜딩 섹션 제목(home_section_copy)에 현재 코드의 문구를 그대로 넣는다.
-- 대상 DB: dev gjowqdiopinhixfivnkx / Winning prod ykrpjcsubmbenfcnwlzd / Schoolmentor prod aalujumpwlnwlemnqrus
-- 선행: supabase/migrations/20261029044125_home_section_copy.sql 적용.
-- 멱등: section_key 충돌 시 아무것도 바꾸지 않는다(관리자가 고친 문구를 덮어쓰지 않는다).

insert into public.home_section_copy (section_key, eyebrow, title_main, title_sub)
values
  ('acceptance', null, '인서울부터 과기원까지', '합격생 선배님들의 압도적 선택'),
  ('services', '핵심 서비스', '진학의 순간들을', '막막하지 않도록. 필요한 만큼만.'),
  ('mentor', '멘토스 소개', '위닝과 함께 합격한 선배에게', '멘토 상담을 받아보세요')
on conflict (section_key) do nothing;

-- 실행 기록
-- 2026-10-29 dev gjowqdiopinhixfivnkx: 실행 전 0행, 실행 후 3행(acceptance, services, mentor). 재실행 변경 없음.
-- 2026-10-29 Winning prod ykrpjcsubmbenfcnwlzd: 실행 전 0행, 실행 후 3행. 재실행 변경 없음.
-- 2026-10-29 Schoolmentor prod aalujumpwlnwlemnqrus: 실행 전 0행, 실행 후 3행. 재실행 변경 없음.
