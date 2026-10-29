-- QA3 행76: 학습진단, 성장설계 안내 문구 변경.
-- 목적: service_desc의 "이용 리포트는 회원정보에 보관되어 관리하실 수 있습니다."를
--       "결과 리포트는 회원정보에 보관되어 관리하실 수 있습니다."로 바꾼다.
-- 대상 DB: dev gjowqdiopinhixfivnkx, Winning prod ykrpjcsubmbenfcnwlzd
--          (Schoolmentor prod는 해당 slug가 없어 0건)
-- 멱등: 이전 문구가 남은 행만 갱신하므로 다시 실행해도 변경 없음.
update products
set service_desc = replace(
  service_desc,
  '이용 리포트는 회원정보에 보관되어 관리하실 수 있습니다.',
  '결과 리포트는 회원정보에 보관되어 관리하실 수 있습니다.'
)
where slug in ('diagnose-1', 'growth-1')
  and service_desc like '%이용 리포트는 회원정보에%';

-- 실행 기록
-- 2026-10-29 dev gjowqdiopinhixfivnkx: 이전 문구 행 실행 전 2행(diagnose-1, growth-1), 실행 후 0행, 새 문구 행 2행. 재실행 변경 없음.
-- 2026-10-29 Winning prod ykrpjcsubmbenfcnwlzd: 이전 문구 행 실행 전 2행(diagnose-1, growth-1), 실행 후 0행, 새 문구 행 2행. 재실행 변경 없음.
