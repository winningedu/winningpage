-- UTC 전환 U0b: 시간대를 인자로 받는 날짜 헬퍼.
-- 하루, 월 단위 경계는 항상 호출부가 IANA 시간대를 넘긴다(시간대 하드코딩 금지).

-- 시간대 이름이 pg_timezone_names 에 있는지. null 은 null 이 아니라 false.
-- pg_timezone_names 는 뷰라서 STABLE 로 둔다. CHECK 제약은 쓰기 때 한 번만 평가하므로
-- STABLE 로 충분하고, 시간대 DB 갱신에도 거짓 IMMUTABLE 표시가 남지 않는다.
create or replace function public.fn_is_valid_time_zone(p_tz text)
returns boolean
language sql
stable
parallel safe
set search_path = ''
as $$
  select coalesce(
    exists (select 1 from pg_catalog.pg_timezone_names n where n.name = p_tz),
    false
  );
$$;

-- p_ts 가 p_tz 에서 속하는 달력 날짜
create or replace function public.fn_local_date(p_ts timestamptz, p_tz text)
returns date
language sql
immutable
parallel safe
set search_path = ''
as $$
  select (p_ts at time zone p_tz)::date;
$$;

-- p_tz 에서 p_date 하루의 첫 순간. DST 공백이면 존재하는 첫 순간.
create or replace function public.fn_day_start(p_date date, p_tz text)
returns timestamptz
language sql
immutable
parallel safe
set search_path = ''
as $$
  select p_date::timestamp at time zone p_tz;
$$;

-- fn_add_months_kst 와 같은 규칙에 시간대를 인자로 둔 것.
-- p_tz 의 하루 시작으로 내림한 뒤 달력 개월을 더한다(말일 클램프). p_months null 은 null(무기한).
create or replace function public.fn_add_months(p_ts timestamptz, p_months int, p_tz text)
returns timestamptz
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
           when p_months is null then null
           else ((pg_catalog.date_trunc('day', p_ts at time zone p_tz)
                  + pg_catalog.make_interval(months => p_months)) at time zone p_tz)
         end;
$$;

-- 이 헬퍼는 사용자 데이터를 읽지 않고 authenticated RPC 안에서 호출된다.
revoke execute on function public.fn_is_valid_time_zone(text) from public;
revoke execute on function public.fn_local_date(timestamptz, text) from public;
revoke execute on function public.fn_day_start(date, text) from public;
revoke execute on function public.fn_add_months(timestamptz, int, text) from public;
grant execute on function public.fn_is_valid_time_zone(text) to anon, authenticated, service_role;
grant execute on function public.fn_local_date(timestamptz, text) to anon, authenticated, service_role;
grant execute on function public.fn_day_start(date, text) to anon, authenticated, service_role;
grant execute on function public.fn_add_months(timestamptz, int, text) to anon, authenticated, service_role;
