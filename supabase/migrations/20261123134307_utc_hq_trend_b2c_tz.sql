-- 본사 추이와 B2C 요약의 하루, 달 경계를 보는 사람 시간대(p_tz)로 바꾼다. 서명이 바뀌어 옛 함수를 지우고 새로 만든다.
drop function public.fn_hq_trend_buckets(date, date, text, text, boolean);
drop function public.fn_hq_b2c_summary(date, date, boolean);

create function public.fn_hq_trend_buckets(
  p_from date,
  p_to date,
  p_grain text,
  p_mau_mode text,
  p_include_internal boolean,
  p_tz text
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
    select public.fn_local_date(p.created_at, p_tz) as day, coalesce(p.member_type, 'none') as member_type
      from public.profiles p
     where p.created_at >= public.fn_day_start(p_from, p_tz)
       and p.created_at < public.fn_day_start(p_to + 1, p_tz)
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
    select public.fn_local_date(o.paid_at, p_tz) as day
      from public.orders o
     where o.status in ('paid', 'refunded')
       and o.paid_at >= public.fn_day_start(p_from, p_tz)
       and o.paid_at < public.fn_day_start(p_to + 1, p_tz)
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

comment on function public.fn_hq_trend_buckets(date, date, text, text, boolean, text) is
  '본사 추이. 로그인 묶음과 같은 기간 묶음마다 새 가입 회원 수(유형별)와 결제 주문 수(paid, refunded, 결제일은 p_tz 기준)를 돌려준다.';

revoke all on function public.fn_hq_trend_buckets(date, date, text, text, boolean, text) from public, anon, authenticated;
grant execute on function public.fn_hq_trend_buckets(date, date, text, text, boolean, text) to service_role;

create function public.fn_hq_b2c_summary(
  p_from date,
  p_to date,
  p_include_internal boolean,
  p_tz text
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
     where r.paid_at >= public.fn_day_start(p_from, p_tz)
       and r.paid_at < public.fn_day_start(p_to + 1, p_tz)
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

comment on function public.fn_hq_b2c_summary(date, date, boolean, text) is
  '위닝 B2C 요약. 기관 없음, 기타 소속 회원 수(유형별)와 기간(p_tz 하루 경계) 결제(admin_revenue_items 합: 결제 학생 수, 주문 수, 결제, 환불, 순매출).';

revoke all on function public.fn_hq_b2c_summary(date, date, boolean, text) from public, anon, authenticated;
grant execute on function public.fn_hq_b2c_summary(date, date, boolean, text) to service_role;
