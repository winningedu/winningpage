-- 본사 대시보드 로그인 통계(분석 grill Q1, Q7, Q13). 스키마만 바꾼다(조회 함수 2개).
--
-- 1. fn_hq_login_buckets: 기간(KST 날짜, 양 끝 포함)을 일, 주(월요일 시작), 달로 묶어 묶음마다 서로 다른 회원 수를 센다.
--    달 묶음은 달력 기준(calendar, 기본)과 최근 30일 기준(rolling30, 종료일에서 30일씩 거슬러 묶음) 둘 다 된다(Q7).
--    묶음 양 끝은 기간 밖으로 나가지 않게 자른다.
--    출처(source): 첫 실측일(profile_login_days 의 min(kst_date)) 이후로만 이루어진 묶음은 measured.
--    그 전 날은 활동 기록(목표 기록, 타이머, 진단, AI 호출, 기관 사용 기록, 성장, 자기평가, 심화탐구, 수행평가)으로
--    추정하고, 묶음에 그 전 날이 하루라도 섞이면 estimated, 셀 회원이 없으면 none(기록 없음)이다(Q1).
--    활동 기록의 updated_at, last_activity_at 은 마지막 손댄 날만 남아 옛날을 적게 센다(추정 표시의 이유).
--    기본 제외는 fn_hq_stat_included(QA, 본사 관리자). by_member_type 은 회원 유형별 인원이고 유형이 없으면 none 키.
-- 2. fn_hq_login_log: 로그인 기록 표(Q13). 기간 안 기록을 최근 날짜, 늦게 처음 들어온 순으로 쪽 나눠 돌려준다.
--    이름은 개인정보라 라우트가 본사 관리자 권한을 확인한 뒤에만 보낸다.
-- 둘 다 security definer 이고 service_role 만 실행한다(본사 화면은 서버 라우트로만 읽는다).
-- 원천 테이블 대부분은 날짜가 앞인 인덱스가 없어 추정 구간은 순차 스캔이다. 첫 실측일 이후 구간은 원천을 읽지 않는다.

create function public.fn_hq_login_buckets(
  p_from date,
  p_to date,
  p_grain text,
  p_mau_mode text,
  p_include_internal boolean
)
returns table (
  bucket_start date,
  bucket_end date,
  source text,
  members bigint,
  by_member_type jsonb
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_first date;
  v_est_to date;
  v_from_ts timestamptz;
  v_est_to_ts timestamptz;
begin
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'invalid range' using errcode = '22023';
  end if;
  if p_grain is null or p_grain not in ('day', 'week', 'month') then
    raise exception 'invalid grain' using errcode = '22023';
  end if;
  if p_mau_mode is null or p_mau_mode not in ('calendar', 'rolling30') then
    raise exception 'invalid mau mode' using errcode = '22023';
  end if;

  select min(d.kst_date) into v_first from public.profile_login_days d;
  -- 추정은 첫 실측일 전날까지만 한다. 실측이 아직 없으면 기간 전체를 추정한다.
  v_est_to := least(p_to, coalesce(v_first - 1, p_to));
  v_from_ts := p_from::timestamp at time zone 'Asia/Seoul';
  v_est_to_ts := (v_est_to + 1)::timestamp at time zone 'Asia/Seoul';

  return query
  with buckets as (
    select g::date as b_start, g::date as b_end
      from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') g
     where p_grain = 'day'
    union all
    select greatest(g::date, p_from), least((g + interval '6 days')::date, p_to)
      from generate_series(date_trunc('week', p_from::timestamp), p_to::timestamp, interval '7 days') g
     where p_grain = 'week'
    union all
    select greatest(g::date, p_from), least((g + interval '1 month' - interval '1 day')::date, p_to)
      from generate_series(date_trunc('month', p_from::timestamp), p_to::timestamp, interval '1 month') g
     where p_grain = 'month' and p_mau_mode = 'calendar'
    union all
    select greatest(p_to - (k * 30 + 29), p_from), p_to - k * 30
      from generate_series(0, (p_to - p_from) / 30) k
     where p_grain = 'month' and p_mau_mode = 'rolling30'
  ),
  measured as (
    select d.profile_id, d.kst_date as day
      from public.profile_login_days d
     where d.kst_date between p_from and p_to
  ),
  activity (profile_id, day) as (
      select t.profile_id, (t.created_at at time zone 'Asia/Seoul')::date
        from public.goal_daily_records t
       where t.created_at >= v_from_ts and t.created_at < v_est_to_ts
      union all
      select t.profile_id, (t.started_at at time zone 'Asia/Seoul')::date
        from public.goal_timer_sessions t
       where t.started_at >= v_from_ts and t.started_at < v_est_to_ts
      union all
      select t.profile_id, (t.created_at at time zone 'Asia/Seoul')::date
        from public.diagnosis_attempts t
       where t.created_at >= v_from_ts and t.created_at < v_est_to_ts
      union all
      select t.profile_id, (t.created_at at time zone 'Asia/Seoul')::date
        from public.ai_model_calls t
       where t.created_at >= v_from_ts and t.created_at < v_est_to_ts
      union all
      select t.profile_id, (t.used_at at time zone 'Asia/Seoul')::date
        from public.tenant_usage_events t
       where t.used_at >= v_from_ts and t.used_at < v_est_to_ts
      union all
      select t.profile_id, (t.survey_saved_at at time zone 'Asia/Seoul')::date
        from public.growth_profiles t
       where t.survey_saved_at >= v_from_ts and t.survey_saved_at < v_est_to_ts
      union all
      select t.profile_id, (t.created_at at time zone 'Asia/Seoul')::date
        from public.growth_reports t
       where t.created_at >= v_from_ts and t.created_at < v_est_to_ts
      union all
      select t.profile_id, (t.last_activity_at at time zone 'Asia/Seoul')::date
        from public.growth_reports t
       where t.last_activity_at >= v_from_ts and t.last_activity_at < v_est_to_ts
      union all
      select t.profile_id, (t.issued_at at time zone 'Asia/Seoul')::date
        from public.growth_reports t
       where t.issued_at >= v_from_ts and t.issued_at < v_est_to_ts
      union all
      select t.profile_id, (t.created_at at time zone 'Asia/Seoul')::date
        from public.selfeval_sessions t
       where t.created_at >= v_from_ts and t.created_at < v_est_to_ts
      union all
      select t.profile_id, (t.last_activity_at at time zone 'Asia/Seoul')::date
        from public.selfeval_sessions t
       where t.last_activity_at >= v_from_ts and t.last_activity_at < v_est_to_ts
      union all
      select t.profile_id, (t.completed_at at time zone 'Asia/Seoul')::date
        from public.selfeval_sessions t
       where t.completed_at >= v_from_ts and t.completed_at < v_est_to_ts
      union all
      select t.profile_id, (t.created_at at time zone 'Asia/Seoul')::date
        from public.inquiry_sessions t
       where t.created_at >= v_from_ts and t.created_at < v_est_to_ts
      union all
      select t.profile_id, (t.last_activity_at at time zone 'Asia/Seoul')::date
        from public.inquiry_sessions t
       where t.last_activity_at >= v_from_ts and t.last_activity_at < v_est_to_ts
      union all
      select t.profile_id, (t.completed_at at time zone 'Asia/Seoul')::date
        from public.inquiry_sessions t
       where t.completed_at >= v_from_ts and t.completed_at < v_est_to_ts
      union all
      select t.profile_id, (t.created_at at time zone 'Asia/Seoul')::date
        from public.performance_sessions t
       where t.created_at >= v_from_ts and t.created_at < v_est_to_ts
      union all
      select t.profile_id, (t.updated_at at time zone 'Asia/Seoul')::date
        from public.performance_sessions t
       where t.updated_at >= v_from_ts and t.updated_at < v_est_to_ts
  ),
  days as (
    select m.profile_id, m.day from measured m
    union
    select a.profile_id, a.day from activity a
     where a.profile_id is not null and v_est_to >= p_from
  ),
  counted as (
    select b.b_start, x.profile_id, p.member_type
      from buckets b
      join days x on x.day between b.b_start and b.b_end
      join public.profiles p on p.id = x.profile_id
     where public.fn_hq_stat_included(x.profile_id, p_include_internal)
     group by b.b_start, x.profile_id, p.member_type
  ),
  by_type as (
    select c.b_start, coalesce(c.member_type, 'none') as member_type, count(*) as n
      from counted c
     group by c.b_start, coalesce(c.member_type, 'none')
  ),
  totals as (
    select t.b_start, sum(t.n)::bigint as n, jsonb_object_agg(t.member_type, t.n) as types
      from by_type t
     group by t.b_start
  )
  select b.b_start,
         b.b_end,
         case
           when v_first is not null and b.b_start >= v_first then 'measured'
           when coalesce(t.n, 0) > 0 then 'estimated'
           else 'none'
         end,
         coalesce(t.n, 0)::bigint,
         coalesce(t.types, '{}'::jsonb)
    from buckets b
    left join totals t on t.b_start = b.b_start
   order by b.b_start;
end;
$$;

comment on function public.fn_hq_login_buckets(date, date, text, text, boolean) is
  '본사 DAU, MAU. 기간을 day, week, month(calendar 또는 rolling30)로 묶어 서로 다른 회원 수와 출처(measured, estimated, none)를 돌려준다.';

revoke all on function public.fn_hq_login_buckets(date, date, text, text, boolean) from public, anon, authenticated;
grant execute on function public.fn_hq_login_buckets(date, date, text, text, boolean) to service_role;

create function public.fn_hq_login_log(
  p_from date,
  p_to date,
  p_include_internal boolean,
  p_limit integer,
  p_offset integer
)
returns table (
  profile_id uuid,
  kst_date date,
  first_seen_at timestamptz,
  name text,
  member_type text,
  tenant_name text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'invalid range' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 200 or p_offset is null or p_offset < 0 then
    raise exception 'invalid page' using errcode = '22023';
  end if;

  return query
  select d.profile_id, d.kst_date, d.first_seen_at, p.name, p.member_type, t.name, count(*) over ()
    from public.profile_login_days d
    join public.profiles p on p.id = d.profile_id
    left join public.tenants t on t.id = p.tenant_id
   where d.kst_date between p_from and p_to
     and public.fn_hq_stat_included(d.profile_id, p_include_internal)
   order by d.kst_date desc, d.first_seen_at desc, d.profile_id
   limit p_limit offset p_offset;
end;
$$;

comment on function public.fn_hq_login_log(date, date, boolean, integer, integer) is
  '본사 로그인 기록 표. 기간 안 profile_login_days 를 최근 날짜, 늦게 처음 들어온 순으로 쪽 나눠 회원 이름, 유형, 기관과 함께 돌려준다.';

revoke all on function public.fn_hq_login_log(date, date, boolean, integer, integer) from public, anon, authenticated;
grant execute on function public.fn_hq_login_log(date, date, boolean, integer, integer) to service_role;
