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
