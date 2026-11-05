-- column_categories 에 현재 교육칼럼 칩 7개를 기존 순서대로 넣는다.
-- 선행: supabase/migrations/20261104102258_column_categories.sql 적용.
-- 대상 DB: dev gjowqdiopinhixfivnkx / Winning prod ykrpjcsubmbenfcnwlzd / Schoolmentor prod aalujumpwlnwlemnqrus
-- 스쿨멘토의 추가 칩(교육청소식 등)은 이 파일이 아니라 관리자 화면에서 넣는다.
-- 멱등: label 이 이미 있으면 아무것도 바꾸지 않는다.
-- 마지막 칩의 구분자는 U+2022(BULLET)다. 임의로 바꾸지 말 것.

insert into public.column_categories (label, sort_order)
values
  ('학습관리 방법', 10),
  ('수시 및 정시 전략', 20),
  ('특목고 입학', 30),
  ('해외 및 대학원', 40),
  ('입시제도 변화', 50),
  ('대학 입시 제로', 60),
  ('학생부•수행평가•세특', 70)
on conflict (label) do nothing;
