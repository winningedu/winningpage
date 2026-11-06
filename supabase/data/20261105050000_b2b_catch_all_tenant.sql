-- B2B 「기타」 소속(catch-all tenant) 한 행을 넣는다. 소속을 모르는 가입자를 받는다(사 #107, 사 결정 r4).
-- 대상 DB: Schoolmentor prod aalujumpwlnwlemnqrus 전용. dev gjowqdiopinhixfivnkx 는 테스트용으로 실행해도 무해하다.
--          Winning prod ykrpjcsubmbenfcnwlzd 에는 실행하지 않는다.
-- 멱등: tenants_one_catch_all_idx(is_catch_all) where is_catch_all 에 해당하는 행이 이미 있으면 아무것도 넣지 않는다.
-- code 는 fn_generate_tenant_code() 가 만든다. region/tier 는 NOT NULL 이라 region '기타', tier 'S' 를 쓴다(tier 는 내부 등급이며 임시로 S, 소유자가 바꿀 수 있다).

insert into public.tenants (code, name, region, org_type, tier, is_catch_all)
select public.fn_generate_tenant_code(), '기타', '기타', '기타', 'S', true
where not exists (select 1 from public.tenants where is_catch_all);

-- 실행 기록
-- 2026-11-06 dev gjowqdiopinhixfivnkx: 실행 전 catch-all 1행(이미 있음), 실행 후 1행, 재실행 변경 없음
-- 2026-11-06 Schoolmentor prod aalujumpwlnwlemnqrus: 실행 전 0행, 실행 후 1행, 재실행 변경 없음
-- Winning prod: 실행하지 않음
