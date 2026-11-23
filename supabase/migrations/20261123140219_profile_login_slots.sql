-- 로그인 기록을 순간(15분 칸)으로 저장하고 DAU, MAU 를 조회 때 보는 사람 시간대로 묶는다(UTC 이전 D2). 스키마만 바꾼다.
--
-- 1. profile_login_slots: 회원별 15분 칸 1행. slot_start = date_bin('15 minutes', now(), timestamptz '2000-01-01 00:00:00+00').
--    모든 UTC 오프셋은 15분의 배수라 어느 시간대로 묶어도 하루 경계가 정확하다.
--    profile_login_days 는 그대로 두고 더는 적지 않는다(U6 에서 지운다). 옛 기록은 supabase/data 의 백필 SQL 이 옮긴다.
-- 2. fn_hq_login_buckets: 끝에 p_tz 를 더했다. 로그인은 15분 칸을 p_tz 의 날로 묶고, 추정 경로와 기간 경계도 p_tz 를 쓴다.
-- 3. fn_hq_login_log: 끝에 p_tz 를 더했다. 회원별 p_tz 하루 1행(login_date)과 그날 첫 칸(first_seen_at 순간)을 돌려준다.
-- 반환 열이나 인자가 바뀌어 옛 함수를 지우고 새로 만든다. 권한은 그대로 service_role 만 실행한다.

create table public.profile_login_slots (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  slot_start timestamptz not null,
  primary key (profile_id, slot_start)
);

create index profile_login_slots_slot_idx on public.profile_login_slots (slot_start, profile_id);

alter table public.profile_login_slots enable row level security;
revoke all on table public.profile_login_slots from anon, authenticated;
grant all on table public.profile_login_slots to service_role;

-- 새 테이블은 QA 본사 관리자 쓰기 차단 트리거가 자동으로 붙지 않는다(20261110040330_qa_account_guard.sql).
create trigger trg_qa_admin_write_block
  before insert or update or delete on public.profile_login_slots
  for each statement execute function public.fn_block_qa_admin_write();

comment on table public.profile_login_slots is
  '회원별 15분 칸 1행 로그인 기록. /api/session-check 가 적고, 본사 DAU, MAU 는 조회 때 보는 사람 시간대로 묶는다.';
comment on column public.profile_login_slots.slot_start is
  '그 회원이 로그인 상태로 앱을 쓴 15분 칸의 시작 순간(date_bin 15분, 기준 2000-01-01 UTC).';

drop function public.fn_hq_login_buckets(date, date, text, text, boolean, text);

create function public.fn_hq_login_buckets(
  p_from date,
  p_to date,
  p_grain text,
  p_mau_mode text,
  p_include_internal boolean,
  p_scope text,
  p_tz text
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
  v_to_ts timestamptz;
begin
  if p_scope is null or p_scope not in ('all', 'b2c') then
    raise exception 'invalid scope' using errcode = '22023';
  end if;
  if not public.fn_is_valid_time_zone(p_tz) then
    raise exception 'invalid time zone' using errcode = '22023';
  end if;

  -- 첫 실측일은 가장 이른 15분 칸이 보는 사람 시간대에서 속한 날이다.
  select public.fn_local_date(min(s.slot_start), p_tz) into v_first from public.profile_login_slots s;
  -- 추정은 첫 실측일 전날까지만 한다. 실측이 아직 없으면 기간 전체를 추정한다.
  v_est_to := least(p_to, coalesce(v_first - 1, p_to));
  v_from_ts := public.fn_day_start(p_from, p_tz);
  v_est_to_ts := public.fn_day_start(v_est_to + 1, p_tz);
  v_to_ts := public.fn_day_start(p_to + 1, p_tz);

  return query
  with buckets as (
    select h.bucket_start as b_start, h.bucket_end as b_end
      from public.fn_hq_buckets(p_from, p_to, p_grain, p_mau_mode) h
  ),
  measured as (
    select distinct s.profile_id, public.fn_local_date(s.slot_start, p_tz) as day
      from public.profile_login_slots s
     where s.slot_start >= v_from_ts and s.slot_start < v_to_ts
  ),
  activity (profile_id, day) as (
      select t.profile_id, public.fn_local_date(t.created_at, p_tz)
        from public.goal_daily_records t
       where t.created_at >= v_from_ts and t.created_at < v_est_to_ts
      union all
      select t.profile_id, public.fn_local_date(t.started_at, p_tz)
        from public.goal_timer_sessions t
       where t.started_at >= v_from_ts and t.started_at < v_est_to_ts
      union all
      select t.profile_id, public.fn_local_date(t.created_at, p_tz)
        from public.diagnosis_attempts t
       where t.created_at >= v_from_ts and t.created_at < v_est_to_ts
      union all
      select t.profile_id, public.fn_local_date(t.created_at, p_tz)
        from public.ai_model_calls t
       where t.created_at >= v_from_ts and t.created_at < v_est_to_ts
      union all
      select t.profile_id, public.fn_local_date(t.used_at, p_tz)
        from public.tenant_usage_events t
       where t.used_at >= v_from_ts and t.used_at < v_est_to_ts
      union all
      select t.profile_id, public.fn_local_date(t.survey_saved_at, p_tz)
        from public.growth_profiles t
       where t.survey_saved_at >= v_from_ts and t.survey_saved_at < v_est_to_ts
      union all
      select t.profile_id, public.fn_local_date(t.created_at, p_tz)
        from public.growth_reports t
       where t.created_at >= v_from_ts and t.created_at < v_est_to_ts
      union all
      select t.profile_id, public.fn_local_date(t.last_activity_at, p_tz)
        from public.growth_reports t
       where t.last_activity_at >= v_from_ts and t.last_activity_at < v_est_to_ts
      union all
      select t.profile_id, public.fn_local_date(t.issued_at, p_tz)
        from public.growth_reports t
       where t.issued_at >= v_from_ts and t.issued_at < v_est_to_ts
      union all
      select t.profile_id, public.fn_local_date(t.created_at, p_tz)
        from public.selfeval_sessions t
       where t.created_at >= v_from_ts and t.created_at < v_est_to_ts
      union all
      select t.profile_id, public.fn_local_date(t.last_activity_at, p_tz)
        from public.selfeval_sessions t
       where t.last_activity_at >= v_from_ts and t.last_activity_at < v_est_to_ts
      union all
      select t.profile_id, public.fn_local_date(t.completed_at, p_tz)
        from public.selfeval_sessions t
       where t.completed_at >= v_from_ts and t.completed_at < v_est_to_ts
      union all
      select t.profile_id, public.fn_local_date(t.created_at, p_tz)
        from public.inquiry_sessions t
       where t.created_at >= v_from_ts and t.created_at < v_est_to_ts
      union all
      select t.profile_id, public.fn_local_date(t.last_activity_at, p_tz)
        from public.inquiry_sessions t
       where t.last_activity_at >= v_from_ts and t.last_activity_at < v_est_to_ts
      union all
      select t.profile_id, public.fn_local_date(t.completed_at, p_tz)
        from public.inquiry_sessions t
       where t.completed_at >= v_from_ts and t.completed_at < v_est_to_ts
      union all
      select t.profile_id, public.fn_local_date(t.created_at, p_tz)
        from public.performance_sessions t
       where t.created_at >= v_from_ts and t.created_at < v_est_to_ts
      union all
      select t.profile_id, public.fn_local_date(t.updated_at, p_tz)
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
       and (p_scope = 'all' or public.fn_hq_is_b2c_tenant(p.tenant_id))
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

comment on function public.fn_hq_login_buckets(date, date, text, text, boolean, text, text) is
  '본사 DAU, MAU. 기간을 day, week, month(calendar 또는 rolling30)로 묶어 서로 다른 회원 수와 출처(measured, estimated, none)를 돌려준다. p_scope b2c 는 기관 없음, 기타 소속 회원만 센다. p_from, p_to 와 묶음 날짜는 p_tz(IANA 시간대) 기준 달력 날짜이고, 로그인은 15분 칸(profile_login_slots)을 그 시간대의 날로 묶어 센다.';

revoke all on function public.fn_hq_login_buckets(date, date, text, text, boolean, text, text) from public, anon, authenticated;
grant execute on function public.fn_hq_login_buckets(date, date, text, text, boolean, text, text) to service_role;

revoke all on function public.fn_hq_login_buckets(date, date, text, text, boolean, text, text) from public, anon, authenticated;
grant execute on function public.fn_hq_login_buckets(date, date, text, text, boolean, text, text) to service_role;

drop function public.fn_hq_login_log(date, date, boolean, integer, integer);

create function public.fn_hq_login_log(
  p_from date,
  p_to date,
  p_include_internal boolean,
  p_limit integer,
  p_offset integer,
  p_tz text
)
returns table (
  profile_id uuid,
  login_date date,
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
  if not public.fn_is_valid_time_zone(p_tz) then
    raise exception 'invalid time zone' using errcode = '22023';
  end if;

  return query
  with days as (
    select s.profile_id as pid,
           public.fn_local_date(s.slot_start, p_tz) as day,
           min(s.slot_start) as first_slot
      from public.profile_login_slots s
     where s.slot_start >= public.fn_day_start(p_from, p_tz)
       and s.slot_start < public.fn_day_start(p_to + 1, p_tz)
       and public.fn_hq_stat_included(s.profile_id, p_include_internal)
     group by s.profile_id, public.fn_local_date(s.slot_start, p_tz)
  )
  select d.pid, d.day, d.first_slot, p.name, p.member_type, t.name, count(*) over ()
    from days d
    join public.profiles p on p.id = d.pid
    left join public.tenants t on t.id = p.tenant_id
   order by d.day desc, d.first_slot desc, d.pid
   limit p_limit offset p_offset;
end;
$$;

comment on function public.fn_hq_login_log(date, date, boolean, integer, integer, text) is
  '본사 로그인 기록 표. 기간(p_tz 달력 날짜) 안 profile_login_slots 를 회원별 p_tz 하루 1행으로 묶어 최근 날짜, 늦게 처음 들어온 순으로 쪽 나눠 회원 이름, 유형, 기관과 함께 돌려준다.';

revoke all on function public.fn_hq_login_log(date, date, boolean, integer, integer, text) from public, anon, authenticated;
grant execute on function public.fn_hq_login_log(date, date, boolean, integer, integer, text) to service_role;
