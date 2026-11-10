-- 목적: 스쿨멘토 자주하는 질문에 가입, 로그인 초기 질문 7개를 넣는다 (public.faqs).
--   카테고리 '회원가입 및 이용환경', 노출, sort_order 1~7, content_json 없음(답변 텍스트만).
--
-- 근거: 결정 107.20, 계획 8 B 묶음 9g (사 #90). 답은 이미 정한 동작으로만 쓴다.
--   1 가입 방법              결정 75, 77 (소속코드와 학년, 반, 번호로 가입)
--   2 소속코드 확인 안내     결정 75 (오류 문구)
--   3 이미 가입한 번호       결정 75 (중복 가입 문구)
--   4 아이디 찾기            결정 72, 80 (휴대폰 번호, 14세 미만은 학부모 번호)
--   5 학생 비밀번호 찾기     결정 103.8, 104.1 (휴대폰 인증 뒤 새 비밀번호)
--   6 선생님 로그인          결정 23 (학교에서 받은 아이디, 첫 로그인 때 비밀번호 변경)
--   7 선생님 비밀번호 찾기   결정 103.1, 103.2 (선생님 탭, 아이디와 휴대폰 번호)
--   5번 답은 학생 비밀번호 찾기(결정 104)가 main에 배포된 뒤에 맞는 설명이다. 실행 전에 main을 확인한다.
--   이 문구는 개발팀이 쓴 것이다. 위닝 답이 없으며 위닝이 관리자에서 고칠 수 있다.
--
-- 대상 DB: Schoolmentor prod (aalujumpwlnwlemnqrus) 에만 실행한다. 소유자가 실행한다.
-- dev(gjowqdiopinhixfivnkx)와 Winning prod(ykrpjcsubmbenfcnwlzd)에는 실행하지 않는다.
-- 그래서 README의 "dev 먼저" 단계를 건너뛰고 Schoolmentor prod에 바로 실행한다
-- (20261105160000_schoolmentor_menu_five_groups.sql 과 같은 방식).
--
-- 실행 전 조회 (결과를 소유자에게 알린다):
--   위닝 전용 답(예: 이메일 인증)이 복사돼 있으면 이 파일이 끄지 않으므로 소유자가 관리자에서 정리한다 (결정 107.20).
--   select id, question, left(answer, 60) as answer, sort_order, is_active
--     from public.faqs where category = '회원가입 및 이용환경' order by sort_order, question;
--   select count(*) as faqs_in_category from public.faqs where category = '회원가입 및 이용환경';
-- 실행 후 확인:
--   select question, sort_order, is_active from public.faqs
--    where category = '회원가입 및 이용환경' order by sort_order, question;
--   select count(*) as faqs_in_category from public.faqs where category = '회원가입 및 이용환경';
--     -- 실행 전 건수 + 추가한 행 수(처음에는 7) 이어야 한다.
--
-- 멱등: 같은 question 행이 이미 있으면 추가하지 않는다. 자연 키는 question (faqs에 유니크 키는 없다).
-- 하드코딩한 uuid 없음. 삭제와 비활성 없음.

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

insert into public.faqs (question, answer, category, is_active, sort_order, content_json)
select v.question, v.answer, '회원가입 및 이용환경', true, v.sort_order, null
  from (values
    ('학생은 어떻게 가입하나요?',
     '회원가입에서 학교나 학원에서 받은 소속코드를 넣고 학년, 반, 번호를 적어 가입해요. 소속코드를 모르면 선생님께 물어봐 주세요.',
     1),
    ('소속코드를 다시 확인해 달라고 나와요.',
     '소속코드를 다시 확인해 주세요. 정보가 맞는데 계속 막히면 온라인문의로 알려 주세요.',
     2),
    ('이미 가입한 번호라고 나와요.',
     '같은 학년, 반, 번호로 가입한 계정이 있어요. 아이디 찾기에서 확인해 주세요.',
     3),
    ('아이디를 잊어버렸어요.',
     '로그인 화면의 아이디 찾기에서 휴대폰 번호로 찾을 수 있어요. 14세 미만 학생은 학부모 휴대폰 번호로도 찾을 수 있어요.',
     4),
    ('비밀번호를 잊어버렸어요.',
     '로그인 화면의 ''비밀번호를 잊으셨나요?''에서 휴대폰 인증을 마친 뒤 새 비밀번호를 정하면 돼요.',
     5),
    ('선생님은 어디에서 로그인하나요?',
     '학생과 같은 로그인 화면에서 학교에서 받은 아이디로 로그인해요. 처음 로그인하면 임시 비밀번호를 새 비밀번호로 바꿔요.',
     6),
    ('선생님 비밀번호를 잊어버렸어요.',
     '''비밀번호를 잊으셨나요?''에서 ''선생님'' 탭을 고른 뒤 아이디와 휴대폰 번호로 인증하고 새 비밀번호를 정하면 돼요.',
     7)
  ) as v(question, answer, sort_order)
 where not exists (
   select 1 from public.faqs f where f.question = v.question
 );

-- 실행 기록 (소유자가 실행한 뒤 채운다)
-- 2026-11-10 Schoolmentor prod (aalujumpwlnwlemnqrus), main 18a6e5e8 배포 뒤 실행.
--   실행 전: '회원가입 및 이용환경' 5행, 모두 위닝에서 복사된 질문(위닝에듀 웹사이트, PASS 본인인증, 알림톡 안내 등)
--   실행 후: 12행 (7행 추가, sort_order 1~7). 위닝 질문 5행은 이 파일이 끄지 않아 그대로 노출 중이며 소유자가 관리자에서 정리한다.
--   재실행: 조회 결과 같음
