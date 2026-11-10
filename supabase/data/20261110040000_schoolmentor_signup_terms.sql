-- 목적: 스쿨멘토 학생 가입 약관 4개를 임시 문안으로 준비한다 (public.terms, 사 #99).
--   1) student_service, student_privacy, student_marketing (v1): 위닝에서 복사된 본문의 서비스 이름을 스쿨멘토로 바꾸고 켠다.
--      바꾸는 말: '위닝에듀' 를 '스쿨멘토' 로, '위닝 ' 을 '스쿨멘토 ' 로(위닝 학습관리, 위닝 목표관리), '위닝콜멘토' 를 '콜멘토' 로.
--      회사 이름 '위닝로직' 은 운영 회사라 그대로 둔다(이 세 본문에는 없다).
--   2) student_db_transfer (v1): DB 전환 안내를 새로 넣는다. 가입 화면 필수 항목이고 화면 주소는 /terms/student/db-transfer 다.
--      fn_student_signup 은 켜진 약관 행에만 동의 기록을 남기므로, 이 행이 없으면 DB 전환 동의가 기록되지 않는다.
--
-- 근거: 2026-11-10 사용자 결정 "엉 그렇게 해"(개발팀 임시 문안으로 넣는다, 결정 112).
--   위닝로직이 확정 문안을 주면 content 만 새 문안으로 바꾼다. 학부모 약관(parent_*)은 이 파일 범위가 아니다.
--
-- 대상 DB: Schoolmentor prod (aalujumpwlnwlemnqrus) 에만 실행한다. 소유자가 실행한다.
-- dev(gjowqdiopinhixfivnkx)와 Winning prod(ykrpjcsubmbenfcnwlzd)에는 실행하지 않는다.
-- 두 DB의 학생 약관은 위닝 문안이어야 한다. 그래서 README의 "dev 먼저" 단계를 건너뛴다.
--
-- 실행 전 조회:
--   select code, version, is_active, title, (length(content)-length(replace(content,'위닝','')))/2 as winning_hits
--     from public.terms where audience = 'student' order by sort_order, code;
-- 실행 후 확인:
--   같은 조회. student_service, student_privacy, student_db_transfer, student_marketing 만 켜져 있다.
--   winning_hits 는 student_db_transfer 만 3(위닝에듀로 옮기는 안내라 이름이 들어간다), 나머지 켜진 행은 0.
--
-- 멱등: replace 는 이미 바뀐 본문에서 아무것도 바꾸지 않는다. student_db_transfer 는 (code, version) 이 없을 때만 넣는다.
--   하드코딩한 uuid 없음. 삭제 없음.

-- 0. 대상 DB 가드. Schoolmentor prod 만 통과한다.
--    page_contents company-intro 의 menu_label '공지-회사소개' 는 20261105021419_schoolmentor_menu_labels.sql 이
--    Schoolmentor prod 에만 넣은 값이다. 위닝 DB(dev, Winning prod)의 값은 '회사소개' 라 여기서 멈춘다.
--    raise 는 supabase db query -f 실행 전체를 중단한다 (의도한 동작).
do $$
begin
  if not exists (
    select 1 from public.page_contents
     where slug = 'company-intro' and menu_label = '공지-회사소개'
  ) then
    raise exception 'Schoolmentor prod 전용 파일입니다. 대상 DB가 맞는지 확인하세요 (company-intro menu_label 이 공지-회사소개 가 아님).';
  end if;
end $$;

-- 1. 학생 약관 3개: 서비스 이름을 스쿨멘토로 바꾸고 켠다
update public.terms
   set title = replace(replace(replace(title, '위닝에듀', '스쿨멘토'), '위닝콜멘토', '콜멘토'), '위닝 ', '스쿨멘토 '),
       content = replace(replace(replace(content, '위닝에듀', '스쿨멘토'), '위닝콜멘토', '콜멘토'), '위닝 ', '스쿨멘토 '),
       is_active = true
 where audience = 'student'
   and version = 'v1'
   and code in ('student_service', 'student_privacy', 'student_marketing');

-- 2. DB 전환 안내를 새로 넣는다
insert into public.terms (code, version, audience, title, route, content, is_required, profile_column, sort_order, is_active)
select 'student_db_transfer', 'v1', 'student', 'DB 전환 안내', '/terms/student/db-transfer',
       E'스쿨멘토와 위닝에듀는 서버와 회원 DB가 따로 있어요.\n'
       || E'지금은 가입 정보가 위닝에듀로 넘어가지 않아요.\n'
       || E'앞으로 서비스를 위닝에듀로 옮길 때는 회원 정보도 함께 옮길 수 있어요.\n'
       || E'정보를 옮기기 전에 회원 본인에게 다시 동의를 받아요.\n'
       || E'동의하지 않으면 정보는 옮겨지지 않아요.',
       true, null, 25, true
 where not exists (
   select 1 from public.terms where code = 'student_db_transfer' and version = 'v1'
 );

-- 실행 기록 (소유자가 실행한 뒤 채운다)
-- 2026-11-10 Schoolmentor prod (aalujumpwlnwlemnqrus) 실행.
--   실행 전: student_service, student_privacy, student_identity, student_marketing, student_promotion 모두 꺼짐,
--     위닝 이름 11, 3, 4, 1, 2회. student_db_transfer 없음.
--   실행 후: student_service(제목 '학생회원 스쿨멘토 이용약관'), student_privacy, student_marketing 켜짐, 위닝 이름 0회.
--     student_db_transfer 1행 켜짐. student_identity, student_promotion 은 꺼진 채 그대로.
--   재실행: 조회 결과 같음, student_db_transfer 1행 그대로
