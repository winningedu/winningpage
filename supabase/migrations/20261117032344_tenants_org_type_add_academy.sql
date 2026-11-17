set local lock_timeout = '5s';

-- 기관 유형(tenants.org_type)에 학원을 더한다. 허용 값: 기관, 사기업, 학교, 캠퍼스, 학원, 기타.
-- 기존 값은 모두 새 집합에 들어 있어 검증이 실패할 수 없다. 제약 교체는 한 트랜잭션이라 그 사이에 제약 없는 틈이 없다.
-- 바뀌지 않는 것: 열 타입, 기본값, 기존 행, 학교 여부(org_type = '학교')로 갈리는 함수와 트리거의 동작.
-- org_type 허용 목록을 따로 하드코딩한 함수, 뷰, 다른 제약은 없다(마이그레이션 전체를 검색해 확인).

alter table public.tenants
  drop constraint tenants_org_type_check,
  add constraint tenants_org_type_check
    check (org_type = any (array['기관'::text, '사기업'::text, '학교'::text, '캠퍼스'::text, '학원'::text, '기타'::text]));
