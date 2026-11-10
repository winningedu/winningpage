-- 목적: 스쿨멘토 자주하는 질문 '회원가입 및 이용환경' 분류에 위닝에서 복사된 질문 5개를 내린다 (public.faqs, is_active false).
--   1 회원가입은 어떻게 하나요?                              (위닝에듀 웹사이트, 본인인증 가입)
--   2 본인인증은 어떻게 진행되나요?                          (결제 PASS 인증, 알림톡)
--   3 학부모도 자녀의 이용 현황을 확인할 수 있나요?          (위닝 가입 동의 절차)
--   4 PC와 모바일 중 어디서 이용할 수 있나요?                (위닝에듀는 웹 기반)
--   5 형제 자매가 함께 이용할 경우 계정은 어떻게 관리하나요? (위닝 개별 계정 권장, 원문은 형제와 자매 사이에 가운뎃점)
--   같은 분류의 스쿨멘토 질문 7개(20261110010434_schoolmentor_faq_signup_login.sql)는 건드리지 않는다.
--
-- 근거: 2026-11-10 사용자 결정 "개발팀이 내려". 결정 107-20은 소유자가 관리자에서 정리한다고 했으나,
--   QA 전에 위닝 안내가 보이지 않도록 개발팀이 내린다. 삭제하지 않고 비활성만 한다(관리자에서 다시 켤 수 있다).
--   다른 분류의 위닝 복사 질문은 이 파일 범위 밖이다.
--
-- 대상 DB: Schoolmentor prod (aalujumpwlnwlemnqrus) 에만 실행한다. 소유자가 실행한다.
-- dev(gjowqdiopinhixfivnkx)와 Winning prod(ykrpjcsubmbenfcnwlzd)에는 실행하지 않는다.
-- 두 DB에서 이 질문들은 위닝 FAQ로 계속 보여야 한다. 그래서 README의 "dev 먼저" 단계를 건너뛴다.
--
-- 실행 전 조회:
--   select question, sort_order, is_active from public.faqs
--    where category = '회원가입 및 이용환경' order by sort_order, question;
-- 실행 후 확인:
--   같은 조회. 위 5개만 is_active false, 나머지 7개는 true 여야 한다.
--
-- 멱등: 이미 false면 갱신하지 않는다. 자연 키는 (category, question). 하드코딩한 uuid 없음. 삭제 없음.

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

-- 1. 위닝 복사 질문 5개 비활성
update public.faqs
   set is_active = false
 where category = '회원가입 및 이용환경'
   and is_active
   and question in (
     '회원가입은 어떻게 하나요?',
     '본인인증은 어떻게 진행되나요?',
     '학부모도 자녀의 이용 현황을 확인할 수 있나요?',
     'PC와 모바일 중 어디서 이용할 수 있나요?'
   ) or (
     -- 원문의 가운뎃점을 파일에 쓰지 않으려고 한 글자 와일드카드로 맞춘다.
     category = '회원가입 및 이용환경'
     and is_active
     and question like '형제_자매가 함께 이용할 경우 계정은 어떻게 관리하나요?'
   );

-- 실행 기록 (소유자가 실행한 뒤 채운다)
-- 2026-11-10 Schoolmentor prod (aalujumpwlnwlemnqrus) 실행.
--   실행 전: '회원가입 및 이용환경' 12행 모두 노출 (스쿨멘토 7행 + 위닝 복사 5행)
--   실행 후: 위닝 복사 5행(sort_order 9~13)만 비활성, 스쿨멘토 7행(1~7)은 노출 그대로
--   재실행: 조회 결과 같음
