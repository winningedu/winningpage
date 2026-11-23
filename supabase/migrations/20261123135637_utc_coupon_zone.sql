-- UTC 전환 U4b-coupon: 쿠폰 기한(date, 포함) 판정의 "오늘"을 쿠폰 사용자의
-- profiles.time_zone 기준 현지 날짜로 바꾼다(D1, D3). 프로필이 없으면 예외로
-- 막고 시간대를 임의로 채우지 않는다. 서명과 권한은 그대로다.

-- 발급 판정 정본. 조건형은 항상 true, 발급형은 회수되지 않고 기한이 지나지 않은
-- 발급 행이 있어야 true. 게스트(user_id NULL)와 없는 쿠폰은 false(fail-closed).
-- 기한 비교에 사용자 시간대가 필요해 plpgsql 로 바꾼다.
create or replace function public.fn_coupon_is_granted(p_coupon_id uuid, p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_grant_type text;
  v_tz         text;
begin
  select c.grant_type into v_grant_type
    from public.coupons c
   where c.id = p_coupon_id;

  if v_grant_type is null then
    return false;
  end if;
  if v_grant_type <> 'granted' then
    return true;
  end if;
  if p_user_id is null then
    return false;
  end if;

  select p.time_zone into v_tz from public.profiles p where p.id = p_user_id;
  if not found then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;

  return exists (
    select 1
      from public.coupon_grants g
     where g.coupon_id = p_coupon_id
       and g.user_id = p_user_id
       and g.revoked_at is null
       -- 발급분 기한(20260825000010). NULL 이면 무기한 — 이 컬럼이
       -- 생기기 전 발급분과 관리자 수기 발급이 여기 해당한다.
       and (g.valid_until is null
            or g.valid_until >= public.fn_local_date(now(), v_tz))
  );
end;
$$;

-- 관리자 전용 발급. 발급분 기한은 대상 사용자 현지 오늘 + N개월이다.
create or replace function public.fn_grant_coupon(p_coupon_id uuid, p_user_id uuid)
returns public.coupon_grants
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_grant_type text;
  v_tz         text;
  v_row        public.coupon_grants;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select c.grant_type into v_grant_type
    from public.coupons c
   where c.id = p_coupon_id;

  if coalesce(v_grant_type, '') <> 'granted' then
    raise exception 'coupon_not_grantable' using errcode = 'WC004';
  end if;

  -- 사용 완료(redeemed) 가드 — 20260823000001 원문 그대로.
  if public.fn_coupon_is_redeemed(p_coupon_id, p_user_id) then
    raise exception 'coupon_already_redeemed' using errcode = 'WC005';
  end if;

  select p.time_zone into v_tz from public.profiles p where p.id = p_user_id;
  if not found then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;

  insert into public.coupon_grants (coupon_id, user_id, granted_by, valid_until)
  values (
    p_coupon_id,
    p_user_id,
    'admin',
    (public.fn_local_date(now(), v_tz)
       + (public.fn_coupon_grant_valid_months() || ' months')::interval)::date
  )
  on conflict (coupon_id, user_id) where revoked_at is null do nothing
  returning * into v_row;

  if v_row.id is null then
    select g.* into v_row
      from public.coupon_grants g
     where g.coupon_id = p_coupon_id
       and g.user_id = p_user_id
       and g.revoked_at is null;
  end if;

  return v_row;
end;
$$;

-- 가입 쿠폰 발급 본문. 오늘과 발급분 기한은 가입자 현지 날짜 기준이다.
create or replace function public.fn_grant_signup_coupons_for_user(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_tz      text;
  v_today   date;
  v_granted integer := 0;
begin
  if p_user_id is null then
    return 0;
  end if;

  select p.time_zone into v_tz from public.profiles p where p.id = p_user_id;
  if not found then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;
  v_today := public.fn_local_date(now(), v_tz);

  insert into public.coupon_grants (coupon_id, user_id, granted_by, valid_until)
  select
    c.id,
    p_user_id,
    'signup',
    (v_today + (public.fn_coupon_grant_valid_months() || ' months')::interval)::date
    from public.coupons c
   where c.grant_type = 'granted'
     and c.grant_on_signup = true
     and c.is_active = true
     and (c.valid_until is null or c.valid_until >= v_today)
  on conflict (coupon_id, user_id) where revoked_at is null do nothing;

  get diagnostics v_granted = row_count;

  return v_granted;
end;
$$;
