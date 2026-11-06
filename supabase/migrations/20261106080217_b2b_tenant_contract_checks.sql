set local lock_timeout = '5s';

-- 본사 기관 관리 화면(5번)은 RLS 를 거쳐 tenants 를 바로 고쳐서 서버 검증이 없다. 계약 날짜의 앞뒤 순서를 DB 가 지킨다.
-- 값이 비어 있는 쪽은 검사하지 않는다. 스키마만 바꾸고 데이터 문장은 없다.
-- 적용 전 확인: select count(*) from public.tenants where contract_start_date > contract_end_date or grace_ends_on < contract_end_date;
alter table public.tenants
  add constraint tenants_contract_order check (
    contract_start_date is null or contract_end_date is null or contract_start_date <= contract_end_date
  ),
  add constraint tenants_grace_after_end check (
    grace_ends_on is null or contract_end_date is null or grace_ends_on >= contract_end_date
  );
