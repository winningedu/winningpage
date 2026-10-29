-- 요금표 쿠폰안내에 노출되는 테스트 쿠폰 비활성화.
-- 목적: PricingSelling 쿠폰안내는 is_active=true 이고 grant_on_signup=false 인 쿠폰을 전부 노출한다.
--       제목이 "test" 인 테스트 쿠폰(참고 id 474518e3-5652-4116-9ee9-efed5358fbdf, min_amount 100000)이
--       고객에게 보이므로 is_active=false 로 내린다.
-- 대상 DB: dev gjowqdiopinhixfivnkx, Schoolmentor prod aalujumpwlnwlemnqrus
--          (Winning prod ykrpjcsubmbenfcnwlzd는 해당 행이 없어 0건)
-- 멱등: 활성 상태인 행만 갱신하므로 다시 실행해도 변경 없음.
-- 삭제하지 않는 이유: dev에서 orders 1건이 coupon_id 로 참조하므로 FK 참조 행은 지우지 않는다.
update coupons
set is_active = false
where title = 'test'
  and grant_on_signup = false
  and is_active = true;

-- 실행 기록
-- 2026-10-29 dev gjowqdiopinhixfivnkx: title='test' 활성 행 실행 전 1행(474518e3), 실행 후 0행(is_active=false). 재실행 변경 없음.
-- 2026-10-29 Schoolmentor prod aalujumpwlnwlemnqrus: 활성 행 실행 전 1행, 실행 후 0행. 재실행 변경 없음. Winning prod: 해당 행 없음.
