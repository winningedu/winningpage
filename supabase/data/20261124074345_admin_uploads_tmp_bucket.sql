-- 관리자 임시 업로드 버킷 admin-uploads-tmp 생성 (B4, 관리자 엔진 업로드를 서버 경유로 옮김).
-- 대상 DB: dev gjowqdiopinhixfivnkx, Winning prod ykrpjcsubmbenfcnwlzd,
--          Schoolmentor prod aalujumpwlnwlemnqrus.
-- 아직 실행하지 않았다. 소유자 승인이 필요하고, dev 에서 먼저 실행한다(supabase/data/README.md).
-- 비공개 버킷이다. 접근 정책은 만들지 않는다(서비스 롤과 서버가 발급한 서명 토큰만 쓴다).
-- 크기 한도 52428800 은 api/_lib/admin-uploads/tmp.ts 의 MAX_UPLOAD_BYTES 와 같고,
-- 허용 MIME 목록은 같은 파일의 ALLOWED_MIME_TYPES 와 같아야 한다(tmp.test.ts 가 대조한다).
-- 멱등: 이미 있으면 같은 값으로 맞출 뿐 다시 실행해도 변경이 없다.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('admin-uploads-tmp', 'admin-uploads-tmp', false, 52428800, array[
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'application/pdf',
  'application/x-hwp',
  'application/haansofthwp',
  'application/vnd.hancom.hwp',
  'application/vnd.hancom.hwpx',
  'application/haansofthwpx',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'application/x-zip-compressed',
  'application/octet-stream'
])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- 실행 기록
-- 2026-11-24 dev gjowqdiopinhixfivnkx (supabase CLI 2.122.0): 실행 전 admin-uploads-tmp 0행,
--   실행 후 1행(public false, file_size_limit 52428800, allowed_mime_types 20개).
--   다시 실행해도 행 수 1, updated_at 2026-11-24 10:40:53.559692+00 그대로(변경 없음).
-- Winning prod, Schoolmentor prod: 아직 실행하지 않음(R2 prod 배포 때 소유자 승인 뒤).
