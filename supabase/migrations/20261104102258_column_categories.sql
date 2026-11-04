-- 교육칼럼 카테고리 칩 목록을 DB 로 관리한다. 사이트별 DB 가 분리돼 있어 칩 목록도 DB 마다 다르다.
-- 스키마만 담는다. 현재 7개 칩 seed 는 supabase/data/ 의 column_categories_seed.sql 로 수동 실행한다.

create table if not exists public.column_categories (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.column_categories is '교육칼럼 카테고리 칩. 공개 화면은 is_active 행만 sort_order, label 순으로 그린다.';
comment on column public.column_categories.label is 'galleries.category 에 저장되는 값과 같은 문자열.';

-- 칩 이름을 바꾸면 그 이름을 쓰던 글의 category 도 같은 트랜잭션에서 새 이름으로 바꾼다.
-- 칩을 삭제하거나 숨기는 것은 글을 건드리지 않는다(글은 화면에서 전체로 취급된다).
create or replace function public.column_categories_propagate_label()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.galleries
  set category = new.label
  where category = old.label;
  return new;
end;
$$;

create trigger trg_column_categories_propagate_label
  after update of label on public.column_categories
  for each row
  when (old.label is distinct from new.label)
  execute function public.column_categories_propagate_label();

alter table public.column_categories enable row level security;

create policy "column_categories public read" on public.column_categories
  for select to authenticated, anon using (is_active or public.is_winning_admin());

create policy "column_categories admin all" on public.column_categories
  to authenticated
  using (public.is_winning_admin())
  with check (public.is_winning_admin());

grant all on table public.column_categories to anon, authenticated, service_role;
