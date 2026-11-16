-- 푸터 운영기관 이미지에 노출 대상(기관)을 지정한다. 스키마만 담는다.
-- 기존 행은 tenant_id 가 null(공통)이라 동작이 달라지지 않는다. 관리자가 배포 뒤 행마다 대상을 고른다.

alter table public.footer_operator_images
  add column if not exists tenant_id uuid references public.tenants(id);

comment on column public.footer_operator_images.tenant_id is '노출 대상 기관. null 이면 공통(모든 방문자 대상).';

create index if not exists footer_operator_images_tenant_id_idx on public.footer_operator_images using btree (tenant_id);

comment on table public.footer_operator_images is '푸터 운영기관 이미지. 공개 화면은 is_active 행 중 내 소속 기관이 노출 대상인 행이 있으면 그중 sort_order, id 순 첫 행을, 없으면 tenant_id 가 null 인 공통 행의 첫 행을 그린다. 다른 기관 대상 행은 그리지 않고, 둘 다 없으면 이미지 자리를 그리지 않는다.';
