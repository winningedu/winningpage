-- 학년도를 기관 시간대로 판정한다(D1). 학년도는 3월에 시작한다.
-- fn_school_year_kst 는 U6 이 지울 때까지 둔다.
create function public.fn_school_year(p_ts timestamptz, p_tz text)
returns smallint
language sql
immutable
set search_path = public, pg_temp
as $$
  select extract(year from (p_ts at time zone p_tz) - interval '2 months')::smallint
$$;

revoke all on function public.fn_school_year(timestamptz, text) from public, anon, authenticated;
grant execute on function public.fn_school_year(timestamptz, text) to service_role;

-- 컬럼 기본값은 같은 행의 time_zone 을 읽을 수 없어 기본 시간대로 계산한다.
-- 기관을 만드는 경로(fn_create_tenant)는 새 기관의 시간대로 school_year 를 직접 채운다.
alter table public.tenants
  alter column school_year set default public.fn_school_year(now(), 'Asia/Seoul'); -- tz-literal-ok: D1 기본 시간대, tenants.time_zone 기본값과 같다

-- 기관 발급: 새 기관의 시간대로 school_year 를 채운다. 시간대 인자는 아직 없어 기본 시간대를 쓴다.
create or replace function public.fn_create_tenant(p_name text, p_region text, p_org_type text, p_tier text)
returns public.tenants
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_row  public.tenants;
  v_code text;
  v_i    integer;
  v_tz   text := 'Asia/Seoul'; -- tz-literal-ok: D1 새 기관의 기본 시간대, tenants.time_zone 기본값과 같다
begin
  if not public.fn_is_super_admin() then
    raise exception 'not_super_admin' using errcode = 'WC067';
  end if;

  for v_i in 1 .. 10 loop
    v_code := public.fn_generate_tenant_code();

    begin
      insert into public.tenants (code, name, region, org_type, tier, created_by, time_zone, school_year)
      values (v_code, p_name, p_region, p_org_type, p_tier, auth.uid(), v_tz, public.fn_school_year(now(), v_tz))
      returning * into v_row;

      return v_row;
    exception when unique_violation then
      -- 코드 충돌(31^8 공간에서 극히 희박하지만 발생 시 새 코드로 재시도).
      continue;
    end;
  end loop;

  raise exception 'tenant_code_generation_failed';
end;
$$;
