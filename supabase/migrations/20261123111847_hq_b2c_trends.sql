-- 본사 대시보드 추이와 위닝 B2C 화면(분석 grill Q5 A10, A11). 스키마만 바꾼다(함수 교체 1개, 새 함수 4개).
--
-- 1. fn_hq_buckets: 기간(KST 날짜, 양 끝 포함)을 일, 주(월요일 시작), 달(calendar 또는 rolling30)로 나눈 묶음.
--    로그인 묶음과 추이 묶음이 같은 창을 쓰도록 fn_hq_login_buckets 에 있던 묶음 식을 그대로 옮겼다. 입력 검사도 여기서 한다(22023).
-- 2. fn_hq_is_b2c_tenant: B2C 회원 판정. 소속 기관이 없거나 기타 소속(is_catch_all) 기관이면 B2C 다.
--    profiles.tenant_id 는 졸업, 계약 종료 뒤에도 남아 옛 기관 학생은 B2C 로 세지 않는다.
-- 3. fn_hq_login_buckets: 범위 인자 p_scope(all, b2c)를 더했다. 반환 열이 같아도 인자가 늘어 옛 5개 인자 함수를 지우고 새로 만든다.
--    본문은 20261123070708_hq_login_stats.sql 과 같고, 묶음은 fn_hq_buckets 로, b2c 면 fn_hq_is_b2c_tenant 로 거른다.
-- 4. fn_hq_trend_buckets: 묶음마다 새 가입 회원 수(profiles.created_at, 회원 유형별)와 결제 주문 수(A10).
--    결제 주문은 admin_revenue_items 와 같이 status 가 paid 또는 refunded 이고 결제일(paid_at, KST)이 묶음 안인 주문이다.
--    제외 판정은 이용 학생(student_profile_id) 기준이다.
-- 5. fn_hq_b2c_summary: B2C 회원 수(지금 기준, 유형별, 비활성과 이름 "삭제된 학생"은 뺌, Q9 와 같은 기준)와 기간 결제 요약(A11). 결제 금액은 admin_revenue_items 의
--    paid_amount, refunded_amount, net_amount 를 더하기만 한다(매출 및 결제 화면과 같은 원천, 새 매출 식 없음).
--    결제 회원은 B2C 이용 학생 기준 서로 다른 수다.
-- 통계 함수는 security definer 이고 service_role 만 실행한다. 기본 제외는 fn_hq_stat_included.

create function public.fn_hq_buckets(
  p_from date,
  p_to date,
  p_grain text,
  p_mau_mode text
)
returns table (bucket_start date, bucket_end date)
language plpgsql
stable
set search_path = public, pg_temp
as $$
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

  return query
    select g::date, g::date
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
     where p_grain = 'month' and p_mau_mode = 'rolling30';
end;
$$;

comment on function public.fn_hq_buckets(date, date, text, text) is
  '본사 통계 기간 묶음. day, week(월요일 시작), month(calendar 또는 rolling30). 양 끝은 기간으로 자른다.';

revoke all on function public.fn_hq_buckets(date, date, text, text) from public, anon, authenticated;
grant execute on function public.fn_hq_buckets(date, date, text, text) to service_role;

create function public.fn_hq_is_b2c_tenant(p_tenant_id uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select p_tenant_id is null
      or exists (select 1 from public.tenants t where t.id = p_tenant_id and t.is_catch_all);
$$;

comment on function public.fn_hq_is_b2c_tenant(uuid) is
  '본사 통계 B2C 판정. 소속 기관이 없거나 기타 소속(is_catch_all)이면 true.';

revoke all on function public.fn_hq_is_b2c_tenant(uuid) from public, anon, authenticated;
grant execute on function public.fn_hq_is_b2c_tenant(uuid) to service_role;

drop function public.fn_hq_login_buckets(date, date, text, text, boolean);

create function public.fn_hq_login_buckets(
  p_from date,
  p_to date,
  p_grain text,
  p_mau_mode text,
  p_include_internal boolean,
  p_scope text
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
  if p_scope is null or p_scope not in ('all', 'b2c') then
    raise exception 'invalid scope' using errcode = '22023';
  end if;

  select min(d.kst_date) into v_first from public.profile_login_days d;
  -- 추정은 첫 실측일 전날까지만 한다. 실측이 아직 없으면 기간 전체를 추정한다.
  v_est_to := least(p_to, coalesce(v_first - 1, p_to));
  v_from_ts := p_from::timestamp at time zone 'Asia/Seoul';
  v_est_to_ts := (v_est_to + 1)::timestamp at time zone 'Asia/Seoul';

  return query
  with buckets as (
    select h.bucket_start as b_start, h.bucket_end as b_end
      from public.fn_hq_buckets(p_from, p_to, p_grain, p_mau_mode) h
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

comment on function public.fn_hq_login_buckets(date, date, text, text, boolean, text) is
  '본사 DAU, MAU. 기간을 day, week, month(calendar 또는 rolling30)로 묶어 서로 다른 회원 수와 출처(measured, estimated, none)를 돌려준다. p_scope b2c 는 기관 없음, 기타 소속 회원만 센다.';

revoke all on function public.fn_hq_login_buckets(date, date, text, text, boolean, text) from public, anon, authenticated;
grant execute on function public.fn_hq_login_buckets(date, date, text, text, boolean, text) to service_role;

create function public.fn_hq_trend_buckets(
  p_from date,
  p_to date,
  p_grain text,
  p_mau_mode text,
  p_include_internal boolean
)
returns table (
  bucket_start date,
  bucket_end date,
  signups bigint,
  signups_by_member_type jsonb,
  paid_orders bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with buckets as (
    select h.bucket_start as b_start, h.bucket_end as b_end
      from public.fn_hq_buckets(p_from, p_to, p_grain, p_mau_mode) h
  ),
  joined as (
    select (p.created_at at time zone 'Asia/Seoul')::date as day, coalesce(p.member_type, 'none') as member_type
      from public.profiles p
     where p.created_at >= p_from::timestamp at time zone 'Asia/Seoul'
       and p.created_at < (p_to + 1)::timestamp at time zone 'Asia/Seoul'
       and public.fn_hq_stat_included(p.id, p_include_internal)
  ),
  signup_types as (
    select b.b_start, j.member_type, count(*) as n
      from buckets b
      join joined j on j.day between b.b_start and b.b_end
     group by b.b_start, j.member_type
  ),
  signup_totals as (
    select s.b_start, sum(s.n)::bigint as n, jsonb_object_agg(s.member_type, s.n) as types
      from signup_types s
     group by s.b_start
  ),
  paid as (
    select (o.paid_at at time zone 'Asia/Seoul')::date as day
      from public.orders o
     where o.status in ('paid', 'refunded')
       and o.paid_at >= p_from::timestamp at time zone 'Asia/Seoul'
       and o.paid_at < (p_to + 1)::timestamp at time zone 'Asia/Seoul'
       and public.fn_hq_stat_included(o.student_profile_id, p_include_internal)
  ),
  paid_totals as (
    select b.b_start, count(*)::bigint as n
      from buckets b
      join paid x on x.day between b.b_start and b.b_end
     group by b.b_start
  )
  select b.b_start,
         b.b_end,
         coalesce(s.n, 0)::bigint,
         coalesce(s.types, '{}'::jsonb),
         coalesce(o.n, 0)::bigint
    from buckets b
    left join signup_totals s on s.b_start = b.b_start
    left join paid_totals o on o.b_start = b.b_start
   order by b.b_start;
$$;

comment on function public.fn_hq_trend_buckets(date, date, text, text, boolean) is
  '본사 추이. 로그인 묶음과 같은 기간 묶음마다 새 가입 회원 수(유형별)와 결제 주문 수(paid, refunded, 결제일 KST)를 돌려준다.';

revoke all on function public.fn_hq_trend_buckets(date, date, text, text, boolean) from public, anon, authenticated;
grant execute on function public.fn_hq_trend_buckets(date, date, text, text, boolean) to service_role;

create function public.fn_hq_b2c_summary(
  p_from date,
  p_to date,
  p_include_internal boolean
)
returns table (
  member_total bigint,
  by_member_type jsonb,
  paying_members bigint,
  order_count bigint,
  paid_amount numeric,
  refunded_amount numeric,
  net_amount numeric
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

  return query
  with members as (
    select coalesce(p.member_type, 'none') as member_type, count(*) as n
      from public.profiles p
     where public.fn_hq_is_b2c_tenant(p.tenant_id)
       and p.is_active is distinct from false
       and p.name is distinct from '삭제된 학생'
       and public.fn_hq_stat_included(p.id, p_include_internal)
     group by coalesce(p.member_type, 'none')
  ),
  items as (
    select r.student_profile_id, r.order_id, r.paid_amount, r.refunded_amount, r.net_amount
      from public.admin_revenue_items r
      join public.profiles s on s.id = r.student_profile_id
     where r.paid_at >= p_from::timestamp at time zone 'Asia/Seoul'
       and r.paid_at < (p_to + 1)::timestamp at time zone 'Asia/Seoul'
       and public.fn_hq_is_b2c_tenant(s.tenant_id)
       and public.fn_hq_stat_included(r.student_profile_id, p_include_internal)
  )
  select (select coalesce(sum(m.n), 0)::bigint from members m),
         (select coalesce(jsonb_object_agg(m.member_type, m.n), '{}'::jsonb) from members m),
         (select count(distinct i.student_profile_id)::bigint from items i),
         (select count(distinct i.order_id)::bigint from items i),
         (select coalesce(sum(i.paid_amount), 0)::numeric from items i),
         (select coalesce(sum(i.refunded_amount), 0)::numeric from items i),
         (select coalesce(sum(i.net_amount), 0)::numeric from items i);
end;
$$;

comment on function public.fn_hq_b2c_summary(date, date, boolean) is
  '위닝 B2C 요약. 기관 없음, 기타 소속 회원 수(유형별)와 기간 결제(admin_revenue_items 합: 결제 학생 수, 주문 수, 결제, 환불, 순매출).';

revoke all on function public.fn_hq_b2c_summary(date, date, boolean) from public, anon, authenticated;
grant execute on function public.fn_hq_b2c_summary(date, date, boolean) to service_role;
