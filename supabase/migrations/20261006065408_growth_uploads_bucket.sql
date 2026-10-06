-- 성장설계 학기 자료 업로드용 비공개 버킷.
-- 쓰기는 service_role 이 발급한 서명 URL 로만 하고, 읽기와 삭제도 service_role 만 한다.
-- 원문 미보관 원칙이라 추출 직후 객체를 지우며, 사용자가 다시 읽을 일이 없다.
-- 그래서 사용자용 storage.objects 정책은 만들지 않는다
-- (performance-guides 의 소유자 읽기 정책도 복제하지 않는다).

insert into storage.buckets (id, name, public)
values ('growth-uploads', 'growth-uploads', false)
on conflict (id) do update set public = excluded.public;
