-- 목적: 스쿨멘토 홈의 선배 영역 제목과 서비스 카드 9개를 정한 순서, 문구로 맞춘다.
--   선배 영역 제목 (public.home_section_copy, section_key 'mentor'):
--     "스쿨멘토와 함께 한 선배들의 학습 합격 노하우를" (남색) + "서비스에 담았어요" (회색), 머리말 없음
--   서비스 카드 (public.program_categories), 순서와 설명:
--     1 학습진단  전문학습 분석을 통한 나의 입시좌표 확인
--     2 목표관리  목표 대학과 진로에 맞춘 관리 서비스
--     3 성장설계  학생별 맞춤 로드맵으로 목표부터 실행까지 설계   (링크 /services/growth)
--     4 수행평가  주제 선정부터 구성, 점검까지 수행평가 함께 완성
--     5 심화탐구  주제 추천부터 탐구 설계까지
--     6 자기평가  문항 해석부터 구조 설계까지
--     7 입결정보  설명 없음                                         (링크 /admission/results)
--     8 이용안내  이용 절차와 신청 방법을 단계별로 안내             (꺼 둔 채로 추가, 링크 없음)
--     9 자주하는 질문  궁금한 점을 빠르게 확인하세요                (링크 /faq)
--   9개 밖의 활성 카드(콜멘토, 프리미엄 카드 등)는 비활성한다. 삭제는 하지 않는다.
--
-- 근거: 결정 107.13, 계획 8 B 묶음 7 (사 #29, #30, #31). 설명 문구에 손으로 줄바꿈을 넣지 않는다.
--   이용안내 카드는 이용안내 화면이 생길 때 켠다(결정 19와 같음). 그 전에는 카드가 8개다.
--   켤 때는 이용안내 데이터 SQL에서 link를 채우고 is_active를 true로 바꾼다. 이 파일은 이미 있는
--   이용안내 행을 건드리지 않으므로 다시 실행해도 켠 카드가 꺼지지 않는다.
--
-- 대상 DB: Schoolmentor prod (aalujumpwlnwlemnqrus) 에만 실행한다. 소유자가 실행한다.
-- dev(gjowqdiopinhixfivnkx)와 Winning prod(ykrpjcsubmbenfcnwlzd)에는 실행하지 않는다.
-- 두 DB는 위닝에듀 홈을 담고 있어 이 제목과 카드 구성으로 바뀌면 안 된다.
-- 그래서 README의 "dev 먼저" 단계를 건너뛰고 Schoolmentor prod에 바로 실행한다
-- (20261105160000_schoolmentor_menu_five_groups.sql 과 같은 방식).
--
-- 선행: 카드 이미지 3장(public/images/landing/services/admission-results.png, service-guide.png,
--   faq.png)이 main에 배포돼 있어야 한다. 이미지가 없으면 입결정보, 자주하는 질문 카드 그림이 깨진다.
--
-- 실행 전 조회 (결과를 실행 기록에 남긴다):
--   select section_key, eyebrow, title_main, title_sub from public.home_section_copy
--    where section_key = 'mentor';
--   select name, description, link, icon_image_url, sort_order, is_active, is_premium
--     from public.program_categories order by sort_order, name;
--   select count(*) filter (where is_active) as active_cards, count(*) as all_cards
--     from public.program_categories;
-- 실행 후 확인:
--   select section_key, eyebrow, title_main, title_sub from public.home_section_copy
--    where section_key = 'mentor';
--   select name, description, link, icon_image_url, sort_order, is_active
--     from public.program_categories where is_active order by sort_order;
--     -- 활성 8행(이용안내 제외) 이어야 하고 콜멘토와 프리미엄 카드가 없어야 한다.
--   select count(*) filter (where is_active) as active_cards, count(*) as all_cards
--     from public.program_categories;
--
-- 멱등: 값이 이미 목표와 같으면 갱신하지 않고, 행이 이미 있으면 추가하지 않는다.
--   자연 키는 home_section_copy는 section_key, program_categories는 lower(trim(name)).
-- 제목은 시드 원본 값(위닝 문구)일 때만 바꾼다. 관리자가 고친 제목은 덮어쓰지 않는다.
-- 카드의 설명, 순서, 활성과 9개 밖 비활성은 첫 실행에만 적용한다 (표식 키가 생기면 이후 실행은 건너뜀).
-- 하드코딩한 uuid 없음. 삭제 없음.

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

-- 1. 선배 영역 제목. 행이 없으면 새 제목으로 추가하고(이미 있으면 건드리지 않음), 있으면 아래 갱신이 처리한다.
insert into public.home_section_copy (section_key, eyebrow, title_main, title_sub)
values ('mentor', null, '스쿨멘토와 함께 한 선배들의 학습 합격 노하우를', '서비스에 담았어요')
on conflict (section_key) do nothing;

update public.home_section_copy
   set eyebrow = null,
       title_main = '스쿨멘토와 함께 한 선배들의 학습 합격 노하우를',
       title_sub = '서비스에 담았어요'
 where section_key = 'mentor'
   and title_main = '위닝과 함께 합격한 선배에게';

-- 2. '자기평가서' 행이 있고 '자기평가' 행이 없으면 이름을 바꾼다 (이름은 lower(trim()) 유니크).
update public.program_categories
   set name = '자기평가'
 where trim(name) = '자기평가서'
   and not exists (
     select 1 from public.program_categories c where lower(trim(c.name)) = '자기평가'
   );

-- 3. 이용안내를 뺀 8개 카드: 있으면 설명, 순서, 활성, 링크를 맞추고, 없으면 추가한다.
--    기존 행의 그림과 링크는 값이 비어 있을 때만 채운다. 성장설계 링크는 이름으로 길을 못 찾아 항상 맞춘다.
--    첫 실행 표식: app_settings 키 schoolmentor_home_cards_applied(6번에서 마지막에 넣음)가 이미 있으면
--    이 파일이 한 번 돌았다는 뜻이다. 그때는 기존 카드의 설명, 순서, 활성을 갱신하지 않아 관리자가 고친 값을
--    덮어쓰지 않는다. 이용안내 카드는 QA에서 지우거나 이름을 바꿀 수 있어 표식으로 쓰지 않는다.
update public.program_categories p
   set description = v.description,
       sort_order = v.sort_order,
       is_active = true,
       link = coalesce(v.link, p.link),
       icon_image_url = coalesce(nullif(p.icon_image_url, ''), v.icon_image_url)
  from (values
    ('학습진단',      '전문학습 분석을 통한 나의 입시좌표 확인',         null::text,          '/images/landing/services/learning-diagnosis.png',      1),
    ('목표관리',      '목표 대학과 진로에 맞춘 관리 서비스',             null::text,          '/images/landing/services/goal-management.png',         2),
    ('성장설계',      '학생별 맞춤 로드맵으로 목표부터 실행까지 설계',   '/services/growth',  '/images/landing/services/growth.png',                  3),
    ('수행평가',      '주제 선정부터 구성, 점검까지 수행평가 함께 완성', null::text,          '/images/landing/services/performance-assessment.png',  4),
    ('심화탐구',      '주제 추천부터 탐구 설계까지',                     null::text,          '/images/landing/services/deep-inquiry.png',            5),
    ('자기평가',      '문항 해석부터 구조 설계까지',                     null::text,          '/images/landing/services/self-assessment.png',         6),
    ('입결정보',      '',                                                '/admission/results', '/images/landing/services/admission-results.png',       7),
    ('자주하는 질문', '궁금한 점을 빠르게 확인하세요',                   '/faq',              '/images/landing/services/faq.png',                     9)
  ) as v(name, description, link, icon_image_url, sort_order)
 where lower(trim(p.name)) = v.name
   and not exists (select 1 from public.app_settings m where m.key = 'schoolmentor_home_cards_applied')
   and (p.description, p.sort_order, p.is_active, p.link, nullif(p.icon_image_url, ''))
       is distinct from (v.description, v.sort_order, true, coalesce(v.link, p.link),
                         coalesce(nullif(p.icon_image_url, ''), v.icon_image_url));

insert into public.program_categories
  (name, description, link, icon_image_url, sort_order, is_active, is_premium)
select v.name, v.description, coalesce(v.link, '/services'), v.icon_image_url, v.sort_order, true, false
  from (values
    ('학습진단',      '전문학습 분석을 통한 나의 입시좌표 확인',         null::text,          '/images/landing/services/learning-diagnosis.png',      1),
    ('목표관리',      '목표 대학과 진로에 맞춘 관리 서비스',             null::text,          '/images/landing/services/goal-management.png',         2),
    ('성장설계',      '학생별 맞춤 로드맵으로 목표부터 실행까지 설계',   '/services/growth',  '/images/landing/services/growth.png',                  3),
    ('수행평가',      '주제 선정부터 구성, 점검까지 수행평가 함께 완성', null::text,          '/images/landing/services/performance-assessment.png',  4),
    ('심화탐구',      '주제 추천부터 탐구 설계까지',                     null::text,          '/images/landing/services/deep-inquiry.png',            5),
    ('자기평가',      '문항 해석부터 구조 설계까지',                     null::text,          '/images/landing/services/self-assessment.png',         6),
    ('입결정보',      '',                                                '/admission/results', '/images/landing/services/admission-results.png',       7),
    ('자주하는 질문', '궁금한 점을 빠르게 확인하세요',                   '/faq',              '/images/landing/services/faq.png',                     9)
  ) as v(name, description, link, icon_image_url, sort_order)
 where not exists (
   select 1 from public.program_categories p where lower(trim(p.name)) = v.name
 );

-- 4. 9개 밖의 활성 카드를 비활성한다 (콜멘토, 프리미엄 카드 등). 첫 실행에만 적용한다 (표식 키가 아직 없을 때).
update public.program_categories
   set is_active = false
 where is_active
   and not exists (select 1 from public.app_settings m where m.key = 'schoolmentor_home_cards_applied')
   and lower(trim(name)) not in (
     '학습진단', '목표관리', '성장설계', '수행평가', '심화탐구', '자기평가',
     '입결정보', '이용안내', '자주하는 질문'
   );

-- 5. 이용안내 카드는 없을 때만 꺼 둔 채로 추가한다 (링크 없음). 이미 있는 행은 건드리지 않는다.
insert into public.program_categories
  (name, description, link, icon_image_url, sort_order, is_active, is_premium)
select '이용안내', '이용 절차와 신청 방법을 단계별로 안내', null,
       '/images/landing/services/service-guide.png', 8, false, false
 where not exists (
   select 1 from public.program_categories p where lower(trim(p.name)) = '이용안내'
 );

-- 6. 첫 실행 표식. 위 3, 4번이 끝난 뒤 맨 마지막에 넣는다. 이미 있으면 건드리지 않는다.
insert into public.app_settings (key, value)
values ('schoolmentor_home_cards_applied', 'true'::jsonb)
on conflict (key) do nothing;

-- 실행 기록 (소유자가 실행한 뒤 채운다)
