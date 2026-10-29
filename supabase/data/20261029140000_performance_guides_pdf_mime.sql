-- performance-guides 버킷 allowed_mime_types에 application/pdf 추가 (QA3 행73).
-- 대상 DB: dev gjowqdiopinhixfivnkx, Winning prod ykrpjcsubmbenfcnwlzd,
--          Schoolmentor prod aalujumpwlnwlemnqrus (버킷이 있을 때만 영향, 없으면 0행).
-- 멱등: 이미 application/pdf가 있으면 아무것도 바꾸지 않는다.
update storage.buckets
set allowed_mime_types = array_append(allowed_mime_types, 'application/pdf')
where id = 'performance-guides'
  and allowed_mime_types is not null
  and not ('application/pdf' = any (allowed_mime_types));
