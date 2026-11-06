-- B2B 기반 2: tenants 에 학년도, 계약, 기관 정보 컬럼과 기타 소속 유일 인덱스를 더한다.
-- 모든 컬럼은 null 허용이거나 기본값이 있어 위닝 사이트 DB 의 기존 행과 동작에 영향이 없다.

-- 학년도는 3월에 시작한다. KST 기준 (시각 - 2개월) 의 연도가 그 시각의 학년도다.
create function public.fn_school_year_kst(p_ts timestamptz)
returns smallint
language sql
immutable
set search_path = public, pg_temp
as $$
  select extract(year from (p_ts at time zone 'Asia/Seoul') - interval '2 months')::smallint
$$;

revoke all on function public.fn_school_year_kst(timestamptz) from public, anon, authenticated;
grant execute on function public.fn_school_year_kst(timestamptz) to service_role;

alter table public.tenants
  add column school_year smallint not null default public.fn_school_year_kst(now()),
  add column contract_start_date date,
  add column contract_end_date date,
  add column term_months smallint,
  add column grace_ends_on date,
  add column mou_status text,
  add column address text,
  add column main_phone text,
  add column contact_name text,
  add column contact_phone text,
  add column contact_mobile text,
  add column contact_email text,
  add column homepage text,
  add column info_confirmed_at timestamptz,
  add column is_catch_all boolean not null default false,
  add constraint tenants_term_months_check check (term_months in (3, 6)),
  add constraint tenants_mou_status_check check (mou_status in ('pending', 'signed', 'ended'));

comment on column public.tenants.school_year is '이 기관의 현재 학년도. 학년 올리기(rollover)가 한 해씩 올린다.';
comment on column public.tenants.is_catch_all is '소속을 모르는 가입자를 받는 기타 소속. 전체에서 하나만 가질 수 있다.';

create unique index tenants_one_catch_all_idx on public.tenants (is_catch_all) where is_catch_all;
