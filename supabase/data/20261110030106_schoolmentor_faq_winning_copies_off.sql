-- 목적: 스쿨멘토 자주하는 질문에서 위닝에서 복사된 질문을 모두 내린다 (public.faqs, is_active false).
--   대상: 2026-11-10 이전에 만들어진 행 중 아직 노출 중인 것 전부(실행 전 25행, 7개 분류와 분류 없는 테스트 글 1개).
--   남는 것: 20261110010434_schoolmentor_faq_signup_login.sql 이 넣은 '회원가입 및 이용환경' 질문 7개.
--   가입 분류의 위닝 복사 5행은 20261110024949_schoolmentor_faq_signup_winning_rows_off.sql 이 이미 내렸다.
--
-- 근거: 2026-11-10 사용자 결정 "그것도 개발팀이 내려". 남은 행은 위닝에듀 이름, PASS 인증, 토스 결제, 환불,
--   무료 학습진단(스쿨멘토에는 없음, 사 #12), 개인 회원 요금 안내, 비어 있는 고객센터 안내("입력 예정"),
--   분류 없는 테스트 글(test21)이라 스쿨멘토 화면에 맞지 않는다. 삭제하지 않고 비활성만 한다.
--   관리자에서 다시 켜거나 스쿨멘토 문구로 고쳐 켤 수 있다.
--
-- 대상 DB: Schoolmentor prod (aalujumpwlnwlemnqrus) 에만 실행한다. 소유자가 실행한다.
-- dev(gjowqdiopinhixfivnkx)와 Winning prod(ykrpjcsubmbenfcnwlzd)에는 실행하지 않는다.
-- 두 DB에서는 위닝 FAQ가 계속 보여야 한다. 그래서 README의 "dev 먼저" 단계를 건너뛴다.
--
-- 실행 전 조회:
--   select category, count(*) filter (where is_active) as active, count(*) as total
--     from public.faqs group by category order by category;
-- 실행 후 확인:
--   같은 조회. 노출 행은 '회원가입 및 이용환경' 7개뿐이어야 한다.
--
-- 멱등: 이미 false면 갱신하지 않는다. 2026-11-10 00:00 UTC 이후 만들어진 행(스쿨멘토 질문, 이후 관리자가 추가한 질문)은
--   다시 실행해도 건드리지 않는다. 하드코딩한 uuid 없음. 삭제 없음.

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

-- 1. 2026-11-10 이전에 복사된 위닝 질문 비활성
update public.faqs
   set is_active = false
 where is_active
   and created_at < timestamptz '2026-11-10 00:00:00+00';

-- 실행 기록 (소유자가 실행한 뒤 채운다)
-- 2026-11-10 Schoolmentor prod (aalujumpwlnwlemnqrus) 실행.
--   실행 전 (노출/전체): 분류 없음 1/1, 개인정보 및 데이터 보안 5/5, 기타 문의 3/3, 서비스 소개 5/5, 서비스 이용 방법 4/4,
--     요금제 및 결제 4/4, 학교 및 기관 도입 3/3, 회원가입 및 이용환경 7/12
--   실행 후: 회원가입 및 이용환경 7/12 만 노출, 나머지 분류 모두 0 (25행 비활성)
--   재실행: 조회 결과 같음
