-- 목적: 스쿨멘토 이용신청 > 서비스제공 메뉴를 켠다.
--   메뉴 (public.page_contents): 이용신청(menu_group_order 4) 그룹의 두 번째 항목으로 서비스제공(/service-offer) 한 행.
--     첫 번째 항목은 이용안내(/usage-guide, sort_order 1)이고 이 파일은 건드리지 않는다.
--   2026-11-04에 중단했던 항목이다. 2026-11-17 고객사가 화면을 전달해 다시 만든다.
--
-- 대상 DB: Schoolmentor prod (aalujumpwlnwlemnqrus) 에만 실행한다. 소유자가 실행한다.
-- dev(gjowqdiopinhixfivnkx)와 Winning prod(ykrpjcsubmbenfcnwlzd)에는 실행하지 않는다.
-- 두 DB는 위닝에듀 메뉴를 담고 있어 이 메뉴가 생기면 안 된다.
-- 그래서 README의 "dev 먼저" 단계를 건너뛰고 Schoolmentor prod에 바로 실행한다
-- (20261114120000_schoolmentor_usage_guide.sql 과 같은 방식).
--
-- 실행 순서: main 배포가 끝난 뒤에 실행한다 (/service-offer 화면이 배포되기 전에 켜면 메뉴가 빈 화면으로 이어진다).
--
-- 실행 전 조회 (결과를 실행 기록에 남긴다):
--   select slug, menu_group, menu_group_order, menu_label, sort_order, is_active
--     from public.page_contents where menu_group = '이용신청' or slug = '/service-offer';
-- 실행 후 확인: 위 조회가 이용안내(순서 1)와 서비스제공(순서 2) 두 행이고, 둘 다 menu_group_order 4, 활성이어야 한다.
--
-- 멱등: 행이 이미 있으면 추가하지 않고, 값이 이미 목표와 같으면 갱신하지 않는다. 자연 키는 slug.
-- 하드코딩한 uuid 없음. 삭제 없음.

-- 0. 대상 DB 가드. Schoolmentor prod 만 통과한다 (20261114120000 과 같은 가드).
do $$
begin
  if not exists (
    select 1 from public.page_contents
     where slug = 'company-intro' and menu_label = '공지-회사소개'
  ) then
    raise exception 'Schoolmentor prod 전용 파일입니다. 대상 DB가 맞는지 확인하세요 (company-intro menu_label 이 공지-회사소개 가 아님).';
  end if;
end $$;

-- 1. 서비스제공 메뉴 행. 슬러그는 '/service-offer' 만 본다. 선행 슬래시 없는 'service-offer' 는
--    /page/service-offer 로 풀려 새 화면에 닿지 않으므로 후보로 쓰지 않는다.
insert into public.page_contents
  (slug, title, menu_label, menu_group, menu_group_order, sort_order, is_active)
select '/service-offer', '서비스제공', '서비스제공', '이용신청', 4, 2, true
 where not exists (
   select 1 from public.page_contents p where p.slug = '/service-offer'
 )
on conflict (slug) do nothing;

-- 1-1. 행이 이미 있었는데 그룹, 순서, 활성이 다르면 맞춘다.
update public.page_contents
   set menu_group = '이용신청',
       menu_group_order = 4,
       sort_order = 2,
       is_active = true
 where slug = '/service-offer'
   and (menu_group, menu_group_order, sort_order, is_active)
       is distinct from ('이용신청', 4, 2, true);

-- 실행 기록 (소유자가 실행한 뒤 채운다)
-- 아직 실행하지 않았다.
