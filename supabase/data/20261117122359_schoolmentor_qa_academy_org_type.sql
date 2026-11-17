-- 목적: Schoolmentor 의 QA 학원 기관(tenants)의 기관 유형(org_type)을 기타에서 학원으로 바꾼다.
--   기관 유형에 학원이 새 허용 값으로 생겼다(20261117032344_tenants_org_type_add_academy.sql).
--   기타는 소속 없는 회원을 모으는 기본 기관(is_catch_all = true)의 값이므로 그 행은 건드리지 않는다.
--
-- 대상 DB: Schoolmentor prod (aalujumpwlnwlemnqrus) 에만 실행한다. 소유자가 실행한다.
-- dev(gjowqdiopinhixfivnkx)와 Winning prod(ykrpjcsubmbenfcnwlzd)에는 실행하지 않는다.
-- 그래서 README의 "dev 먼저" 단계를 건너뛰고 Schoolmentor prod에 바로 실행한다
-- (20261114120000_schoolmentor_usage_guide.sql 과 같은 방식).
--
-- 실행 순서: 20261117032344_tenants_org_type_add_academy.sql 마이그레이션이 이 DB에 적용된 뒤에 실행한다.
--   적용 전에 실행하면 CHECK(tenants_org_type_check)가 학원 값을 거부해 실패한다.
--
-- 실행 전 조회 (결과를 실행 기록에 남긴다):
--   select name, org_type, is_catch_all from public.tenants where name in ('QA학원', '기타');
-- 실행 후 확인: 같은 조회에서 QA학원은 학원, 기타(is_catch_all true)는 기타 그대로여야 한다.
--
-- 멱등: org_type 이 이미 학원이면 갱신하지 않는다. 자연 키는 기관 이름 QA학원이고 is_catch_all 이 false 인 행만 고른다.
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

-- 1. QA학원 기관 유형을 학원으로. 기본 기관(is_catch_all)은 조건에서 제외한다.
update public.tenants
   set org_type = '학원'
 where name = 'QA학원'
   and is_catch_all = false
   and org_type is distinct from '학원';

-- 실행 기록 (소유자가 실행한 뒤 채운다)
-- 2026-11-17 Schoolmentor prod (aalujumpwlnwlemnqrus) 실행. main 배포(1d1be81b) 뒤, 마이그레이션 20261117032344 적용을 확인하고 실행했다.
--   실행 전: tenants 4행. QA학원 org_type 기타, 위닝고등학교 학교, 한솔고등학교 학교, 기타(is_catch_all) 기타.
--            tenants_org_type_check 허용 값에 학원 포함(두 운영 DB 모두).
--   실행 후: QA학원 org_type 학원. 나머지 3행은 그대로다.
