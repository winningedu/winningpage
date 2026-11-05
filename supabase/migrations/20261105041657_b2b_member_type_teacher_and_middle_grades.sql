-- B2B 기반 1: 선생님 회원 종류와 중학년 값.
-- profiles.member_type 에 teacher 를 추가하고(콘솔 역할은 teachers.role, profiles.role 은 user 유지),
-- student_profiles.grade 에 중1~중3 을 추가한다. 둘 다 기존 값을 그대로 받아들이는 확장이라
-- 위닝 사이트 DB 에는 영향이 없다.

alter table public.profiles drop constraint profiles_member_type_check;
alter table public.profiles add constraint profiles_member_type_check
  check (member_type is null or member_type = any (array['student', 'parent', 'mentor', 'teacher']));

alter table public.student_profiles drop constraint student_profiles_grade_check;
alter table public.student_profiles add constraint student_profiles_grade_check
  check (grade = any (array['중1', '중2', '중3', '고1', '고2', '고3', '졸업', 'N수']));
