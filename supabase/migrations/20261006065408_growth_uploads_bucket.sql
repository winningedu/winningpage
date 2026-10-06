-- 성장설계 학기 자료 업로드용 비공개 버킷.
-- 쓰기는 service_role 이 발급한 서명 URL 로만 하고, 읽기와 삭제도 service_role 만 한다.
-- 원문 미보관 원칙이라 추출 직후 객체를 지우며, 사용자가 다시 읽을 일이 없다.
-- 그래서 사용자용 storage.objects 정책은 만들지 않는다
-- (performance-guides 의 소유자 읽기 정책도 복제하지 않는다).

-- 서명 URL 은 클라이언트 신고값을 강제하지 않으므로 버킷에서 크기와 형식을 막는다.
-- 크기 상한 10MB, 형식은 pdf, png, jpeg, txt, docx 만 허용한다.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'growth-uploads',
  'growth-uploads',
  false,
  10485760,
  array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'text/plain',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
