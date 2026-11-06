-- 목적: 스쿨멘토 메뉴를 5개 그룹으로 재편 (public.page_contents)
--   목표성장서비스(1): 학습진단, 목표관리, 성장설계
--   수행심화서비스(2): 수행평가, 심화탐구, 자기평가
--   입시정보(3):       대입모집요강, 입결정보, 칼럼-교육청소식
--   이용신청(4):       이용안내, 서비스제공은 화면이 생길 때까지 행을 두지 않는다 (아래 주의 참고)
--   고객안내(5):       공지-회사소개, 교육-정보안내, 자주하는 질문, 온라인문의
--   비활성: 콜멘토, 대입합격, 특목고합격, 서비스요금, 멘토신청, 교육청소식
--
-- 대상 DB: Schoolmentor prod (aalujumpwlnwlemnqrus) 에만 실행한다.
-- dev(gjowqdiopinhixfivnkx)와 Winning prod(ykrpjcsubmbenfcnwlzd)에는 실행하지 않는다.
-- 두 DB는 위닝에듀 메뉴를 담고 있어 이 그룹 구성으로 바뀌면 안 된다.
-- 그래서 README의 "dev 먼저" 단계를 건너뛰고 Schoolmentor prod에 바로 실행한다.
--
-- 주의 1: 행을 비활성하면 /page/<slug> 동적 페이지도 같이 닫힌다 (DynamicPage가 is_active를 본다).
--   라우트 페이지(/admission/*, /pricing)는 메뉴에서만 빠지고 주소는 열려 있다.
-- 주의 2: 이용신청 그룹은 서비스요금, 멘토신청을 비활성하면 행이 남지 않아 메뉴에서 사라진다.
--   이용안내 화면 주소가 정해지면 그 행을 이용신청 그룹(menu_group_order 4)으로 추가한다.
-- 주의 3: 학습진단과 성장설계는 행을 만들지 않는다. useNavGroups가 목표성장서비스 그룹에 코드로 주입한다.
-- 주의 4: 슬러그를 모르는 행이 있어 같은 메뉴의 슬러그 후보를 모두 적었다. 실행 전에 아래 조회로
--   현재 행을 확인하고, 후보에 없는 슬러그가 있으면 이 파일의 목록에 추가한 뒤 실행한다.
--
-- 실행 전 조회 (결과를 실행 기록에 남긴다):
--   select slug, menu_group, menu_group_order, menu_label, sort_order, is_active
--     from public.page_contents order by menu_group_order, sort_order;
-- 실행 후 확인: menu_group 이 '서비스' 인 활성 행이 0건이어야 한다.
--   select slug from public.page_contents where is_active and menu_group = '서비스';
--
-- 멱등: 값이 이미 목표와 같으면 갱신하지 않고, 행이 이미 있으면 추가하지 않는다. 자연 키는 slug.
-- 하드코딩한 uuid 없음. 삭제 없음 (비활성만).

-- 1. 기존 행을 새 그룹, 순서로 옮기고 활성화한다.
update public.page_contents p
   set menu_group = v.menu_group,
       menu_group_order = v.menu_group_order,
       sort_order = v.sort_order,
       is_active = true
  from (values
    ('learning-diagnosis',                 '목표성장서비스', 1, 1),
    ('services-learning-diagnosis',        '목표성장서비스', 1, 1),
    ('/services/learning-diagnosis',       '목표성장서비스', 1, 1),
    ('services-goal',                      '목표성장서비스', 1, 2),
    ('/services/goal',                     '목표성장서비스', 1, 2),
    ('services-growth',                    '목표성장서비스', 1, 3),
    ('/services/growth',                   '목표성장서비스', 1, 3),
    ('services-ai-performance',            '수행심화서비스', 2, 1),
    ('/services/performance',              '수행심화서비스', 2, 1),
    ('services-in-depth-research',         '수행심화서비스', 2, 2),
    ('/services/research',                 '수행심화서비스', 2, 2),
    ('services-self-assessment',           '수행심화서비스', 2, 3),
    ('/services/self-assessment',          '수행심화서비스', 2, 3),
    ('/admission/guidelines',              '입시정보',       3, 1),
    ('admission-guidelines',               '입시정보',       3, 1),
    ('/admission/results',                 '입시정보',       3, 2),
    ('admission-results',                  '입시정보',       3, 2),
    ('/gallery',                           '입시정보',       3, 3),
    ('company-intro',                      '고객안내',       5, 1),
    ('/events',                            '고객안내',       5, 2),
    ('/faq',                               '고객안내',       5, 3),
    ('faq',                                '고객안내',       5, 3),
    ('/online-inquiry',                    '고객안내',       5, 4),
    ('online-inquiry',                     '고객안내',       5, 4)
  ) as v(slug, menu_group, menu_group_order, sort_order)
 where p.slug = v.slug
   and (p.menu_group, p.menu_group_order, p.sort_order, p.is_active)
       is distinct from (v.menu_group, v.menu_group_order, v.sort_order, true);

-- 2. 없는 메뉴 행만 추가한다. 슬러그 후보 중 하나라도 이미 있으면 추가하지 않는다.
insert into public.page_contents
  (slug, title, menu_label, menu_group, menu_group_order, sort_order, is_active)
select v.slug, v.menu_label, v.menu_label, v.menu_group, v.menu_group_order, v.sort_order, true
  from (values
    ('/admission/guidelines', '대입모집요강', '입시정보', 3, 1, array['/admission/guidelines', 'admission-guidelines']),
    ('/admission/results',    '입결정보',     '입시정보', 3, 2, array['/admission/results', 'admission-results']),
    ('/faq',                  '자주하는 질문', '고객안내', 5, 3, array['/faq', 'faq']),
    ('/online-inquiry',       '온라인문의',   '고객안내', 5, 4, array['/online-inquiry', 'online-inquiry'])
  ) as v(slug, menu_label, menu_group, menu_group_order, sort_order, candidates)
 where not exists (
   select 1 from public.page_contents p where p.slug = any (v.candidates)
 )
on conflict (slug) do nothing;

-- 3. 스쿨멘토에서 만들지 않는 메뉴를 비활성한다 (콜멘토, 대입합격, 특목고합격, 서비스요금, 멘토신청, 교육청소식).
update public.page_contents
   set is_active = false
 where is_active
   and (
     slug in (
       'services-content', '/services/callmentor', 'services-callmentor',
       '/admission/susi-jungsi', 'admission-susi-jungsi',
       '/admission/special-highschool', 'admission-special-highschool-results',
       '/pricing', 'pricing',
       'mentor-apply', '/mentor-apply', 'premium-apply'
     )
     or menu_label in (
       '콜멘토', '대입합격', '수시정시합격', '특목고합격', '서비스요금', '멘토신청', '교육청소식'
     )
   );

-- 실행 기록
-- 2026-11-06 Schoolmentor prod aalujumpwlnwlemnqrus: page_contents 20행
--   실행 전: '서비스' 그룹 활성 6행(학습진단, 목표관리, 수행평가, 자기평가, 심화탐구, 콜멘토),
--     비활성 대상 활성 6행(콜멘토, 수시정시합격, 특목고합격, 서비스요금, 프리미엄 이용, 멘토신청)
--   실행 후: 목표성장서비스 2행, 수행심화서비스 3행, 입시정보 3행, 고객안내 4행 활성, 위 6행 비활성,
--     '서비스' 그룹 활성 0행. 추가 행 0 (후보 슬러그가 이미 있음)
--   그룹이 빈 활성 2행(services-susi-prediction, services-record-coach)은 후보에 없고 메뉴 그룹에 나오지 않아 그대로 둠
--   재실행: 변경 없음
-- dev, Winning prod: 실행하지 않음 (위닝에듀 메뉴)
