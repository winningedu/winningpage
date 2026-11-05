-- 목적: 스쿨멘토 메뉴 이름 변경 (page_contents.menu_label)
--   company-intro: 회사소개 에서 공지-회사소개 로
--   /events:       공지사항 에서 교육-정보안내 로
--   /gallery:      교육컬럼 에서 칼럼-교육청소식 로
--
-- 대상 DB: Schoolmentor prod (aalujumpwlnwlemnqrus) 에만 실행한다.
-- dev(gjowqdiopinhixfivnkx)와 Winning prod(ykrpjcsubmbenfcnwlzd)에는 실행하지 않는다.
-- 두 DB는 위닝에듀 메뉴를 담고 있어 이 이름으로 바뀌면 안 된다.
-- 그래서 README의 "dev 먼저" 단계를 건너뛰고 Schoolmentor prod에 바로 실행한다.
--
-- 멱등: menu_label이 이미 새 값이면 갱신하지 않는다. 자연 키는 slug.
-- title, slug, 그룹, 순서는 바꾸지 않는다.

update public.page_contents
   set menu_label = '공지-회사소개'
 where slug = 'company-intro'
   and menu_label is distinct from '공지-회사소개';

update public.page_contents
   set menu_label = '교육-정보안내'
 where slug = '/events'
   and menu_label is distinct from '교육-정보안내';

update public.page_contents
   set menu_label = '칼럼-교육청소식'
 where slug = '/gallery'
   and menu_label is distinct from '칼럼-교육청소식';
