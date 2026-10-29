-- performance-guides 버킷 allowed_mime_types에 application/pdf 추가 (QA3 행73).
-- 대상 DB: dev gjowqdiopinhixfivnkx, Winning prod ykrpjcsubmbenfcnwlzd,
--          Schoolmentor prod aalujumpwlnwlemnqrus (버킷이 있을 때만 영향, 없으면 0행).
-- 멱등: 이미 application/pdf가 있으면 아무것도 바꾸지 않는다.
update storage.buckets
set allowed_mime_types = array_append(allowed_mime_types, 'application/pdf')
where id = 'performance-guides'
  and allowed_mime_types is not null
  and not ('application/pdf' = any (allowed_mime_types));

-- 실행 기록
-- 2026-10-29 dev gjowqdiopinhixfivnkx: 실행 전 image/png,image/jpeg,image/webp. 실행 후 application/pdf 추가. 재실행 변경 없음.
-- Winning prod, Schoolmentor prod: 미실행(dev 검증 후 main 배포 시 실행).
