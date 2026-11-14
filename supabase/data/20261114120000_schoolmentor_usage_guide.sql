-- 목적: 스쿨멘토 이용신청 > 이용안내 메뉴와 홈 이용안내 카드를 켠다.
--   메뉴 (public.page_contents): 이용신청(menu_group_order 4) 그룹에 이용안내(/usage-guide) 한 행.
--     서비스제공은 2026-11-04 중단이라 행을 만들지 않는다.
--   홈 카드 (public.program_categories): 20261110010433 이 꺼 둔 채로 넣은 '이용안내' 카드의
--     link 를 /usage-guide 로 채우고 켠다. 카드를 새로 만들거나 모양을 바꾸지 않는다.
--
-- 대상 DB: Schoolmentor prod (aalujumpwlnwlemnqrus) 에만 실행한다. 소유자가 실행한다.
-- dev(gjowqdiopinhixfivnkx)와 Winning prod(ykrpjcsubmbenfcnwlzd)에는 실행하지 않는다.
-- 두 DB는 위닝에듀 메뉴와 홈을 담고 있어 이 메뉴가 생기면 안 된다.
-- 그래서 README의 "dev 먼저" 단계를 건너뛰고 Schoolmentor prod에 바로 실행한다
-- (20261105160000_schoolmentor_menu_five_groups.sql 과 같은 방식).
--
-- 선행: /usage-guide 화면이 main에 배포돼 있어야 한다 (배포 전에 켜면 링크가 홈으로 되돌아간다).
--   안내서 PDF 올리기(어드민 > 프리미엄 책자 관리)는 이 SQL과 별개이며 배포 뒤에 한다.
--
-- 실행 전 조회 (결과를 실행 기록에 남긴다):
--   select slug, menu_group, menu_group_order, menu_label, sort_order, is_active
--     from public.page_contents where menu_group = '이용신청' or slug = '/usage-guide';
--   select name, link, sort_order, is_active from public.program_categories
--    where lower(trim(name)) = '이용안내';
-- 실행 후 확인: 위 두 조회가 이용안내 1행씩, link /usage-guide, 활성이어야 한다.
--
-- 멱등: 행이 이미 있으면 추가하지 않고, 값이 이미 목표와 같으면 갱신하지 않는다. 자연 키는 slug 와 lower(trim(name)).
-- 하드코딩한 uuid 없음. 삭제 없음.

-- 0. 대상 DB 가드. Schoolmentor prod 만 통과한다 (20261110010433 과 같은 가드).
do $$
begin
  if not exists (
    select 1 from public.page_contents
     where slug = 'company-intro' and menu_label = '공지-회사소개'
  ) then
    raise exception 'Schoolmentor prod 전용 파일입니다. 대상 DB가 맞는지 확인하세요 (company-intro menu_label 이 공지-회사소개 가 아님).';
  end if;
end $$;

-- 1. 이용안내 메뉴 행. 슬러그는 '/usage-guide' 만 본다. 선행 슬래시 없는 'usage-guide' 는
--    /page/usage-guide 로 풀려 새 화면에 닿지 않으므로 후보로 쓰지 않는다.
insert into public.page_contents
  (slug, title, menu_label, menu_group, menu_group_order, sort_order, is_active)
select '/usage-guide', '이용안내', '이용안내', '이용신청', 4, 1, true
 where not exists (
   select 1 from public.page_contents p where p.slug = '/usage-guide'
 )
on conflict (slug) do nothing;

-- 1-1. 행이 이미 있었는데 그룹, 순서, 활성이 다르면 맞춘다.
update public.page_contents
   set menu_group = '이용신청',
       menu_group_order = 4,
       sort_order = 1,
       is_active = true
 where slug = '/usage-guide'
   and (menu_group, menu_group_order, sort_order, is_active)
       is distinct from ('이용신청', 4, 1, true);

-- 2. 홈 이용안내 카드를 켠다.
update public.program_categories
   set link = '/usage-guide',
       is_active = true
 where lower(trim(name)) = '이용안내'
   and (link, is_active) is distinct from ('/usage-guide', true);

-- 실행 기록 (소유자가 실행한 뒤 채운다)
