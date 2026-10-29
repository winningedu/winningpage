alter table public.galleries add column if not exists link_url text null;

comment on column public.galleries.link_url is '외부 연결주소. 값이 있으면 목록 카드가 상세 대신 이 주소로 새 창 이동';
