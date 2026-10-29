-- 메인 랜딩 섹션(합격생 대학, 핵심 서비스, 멘토스 소개)의 큰제목/중제목을 관리자에서 입력한다.
-- 스키마만 담는다. 현재 문구 seed는 supabase/data/ 의 home_section_copy_seed.sql 로 수동 실행한다.

create table if not exists public.home_section_copy (
  section_key text primary key
    check (section_key in ('acceptance', 'services', 'mentor')),
  eyebrow text,
  title_main text not null,
  title_sub text,
  updated_at timestamptz not null default now()
);

comment on table public.home_section_copy is '메인 랜딩 섹션 제목. section_key 당 1행. 행이 없으면 랜딩은 제목을 렌더하지 않는다.';
comment on column public.home_section_copy.title_main is '큰제목(h2 첫 줄).';
comment on column public.home_section_copy.title_sub is '중제목(h2 둘째 줄).';

create trigger trg_home_section_copy_updated_at
  before update on public.home_section_copy
  for each row execute function public.set_updated_at();

alter table public.home_section_copy enable row level security;

create policy "home_section_copy public read" on public.home_section_copy
  for select to authenticated, anon using (true);

create policy "home_section_copy admin all" on public.home_section_copy
  to authenticated
  using (public.is_winning_admin())
  with check (public.is_winning_admin());

grant all on table public.home_section_copy to anon, authenticated, service_role;
