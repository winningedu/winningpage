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

-- 코드 직접 입력 조회와 사용 가능 쿠폰 목록. 만료 판정의 오늘은 쿠폰 사용자(학생)의 현지 날짜다.
CREATE OR REPLACE FUNCTION "public"."fn_coupon_by_code"("p_code" "text", "p_subtotal" integer DEFAULT 0, "p_student_profile_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("id" "uuid", "title" "text", "discount_amount" integer, "min_amount" integer, "valid_until" "date", "is_active" boolean, "eligible" boolean, "reason" "text", "owner_profile_id" "uuid", "owner_is_student" boolean)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_caller  uuid := auth.uid();
  v_student uuid;
  v_parent  uuid;
  v_today   date;
  v_tz      text;
  v_code    text := lower(trim(coalesce(p_code, '')));
begin
  if p_student_profile_id is null then
    v_student := v_caller;
  else
    if v_caller is distinct from p_student_profile_id
       and not public.fn_is_linked_pair(v_caller, p_student_profile_id) then
      raise exception 'not_authorized_for_student' using errcode = 'WC030';
    end if;
    v_student := p_student_profile_id;
  end if;

  if v_code = '' then
    return;
  end if;

  select l.parent_id into v_parent
    from public.parent_child_links l
   where l.student_id = v_student and l.status = 'approved'
   limit 1;

  if v_student is null or v_parent is null then
    return;
  end if;

  -- 쿠폰 사용자(학생)의 시간대로 "오늘"을 센다. 프로필이 없으면 시간대를 채우지 않고 예외로 막는다.
  select p.time_zone into v_tz from public.profiles p where p.id = v_student;
  if not found then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;
  v_today := public.fn_local_date(now(), v_tz);

  return query
  select
    c.id,
    c.title,
    c.discount_amount,
    c.min_amount,
    eff.until_date as valid_until,
    c.is_active,
    (
      c.is_active
      and (eff.until_date is null or eff.until_date >= v_today)
      and coalesce(p_subtotal, 0) >= c.min_amount
      and (c.max_uses_per_user is null or v_student is not null)
      and not chk.is_sold_out
      and (c.grant_type <> 'granted' or own.owner_id is not null)
      and org.matches
    ) as eligible,
    case
      when not c.is_active then 'inactive'
      when eff.until_date is not null and eff.until_date < v_today then 'expired'
      when coalesce(p_subtotal, 0) < c.min_amount then 'below_min_amount'
      when not org.matches then 'org_mismatch'
      when c.max_uses_per_user is not null and v_student is null then 'login_required'
      when c.grant_type = 'granted' and not own.is_granted_overall then 'not_granted'
      when chk.is_sold_out then 'sold_out'
      when c.grant_type = 'granted' and own.owner_id is null then 'already_used'
      else null
    end as reason,
    own.owner_id as owner_profile_id,
    (own.owner_id is not null and own.owner_id = v_student) as owner_is_student
  from public.coupons c
  cross join lateral (
    select
      public.fn_coupon_is_granted(c.id, v_student) as is_granted_student,
      public.fn_coupon_is_granted(c.id, v_parent)  as is_granted_parent,
      public.fn_coupon_is_redeemed(c.id, v_student, now()) as is_redeemed_student,
      public.fn_coupon_is_redeemed(c.id, v_parent, now())  as is_redeemed_parent,
      public.fn_coupon_global_redeemed(c.id, now()) as is_sold_out,
      public.fn_coupon_grant_valid_until(c.id, v_student) as grant_until_student,
      public.fn_coupon_grant_valid_until(c.id, v_parent)  as grant_until_parent
  ) as chk
  cross join lateral (
    select
      (chk.is_granted_student or chk.is_granted_parent) as is_granted_overall,
      case
        when c.grant_type <> 'granted' then null
        when chk.is_granted_student and not chk.is_redeemed_student then v_student
        when chk.is_granted_parent and not chk.is_redeemed_parent then v_parent
        else null
      end as owner_id
  ) as own
  cross join lateral (
    select
      least(
        c.valid_until,
        greatest(chk.grant_until_student, chk.grant_until_parent)
      ) as until_date
  ) as eff
  cross join lateral (
    select public.fn_coupon_org_matches(c.org_code, v_student, v_parent) as matches
  ) as org
  where c.code is not null
    and lower(c.code) = v_code
  limit 1;
end;
$$;


CREATE OR REPLACE FUNCTION "public"."fn_coupon_by_code"("p_code" "text", "p_subtotal" integer DEFAULT 0, "p_student_profile_id" "uuid" DEFAULT NULL::"uuid", "p_order_id" "text" DEFAULT NULL::"text") RETURNS TABLE("id" "uuid", "title" "text", "discount_amount" integer, "min_amount" integer, "valid_until" "date", "is_active" boolean, "eligible" boolean, "reason" "text", "owner_profile_id" "uuid", "owner_is_student" boolean)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_caller  uuid := auth.uid();
  v_student uuid;
  v_parent  uuid;
  v_today   date;
  v_tz      text;
  v_code    text := lower(trim(coalesce(p_code, '')));
  v_org_excluded boolean;
begin
  if p_student_profile_id is null then
    v_student := v_caller;
  else
    if v_caller is distinct from p_student_profile_id
       and not public.fn_is_linked_pair(v_caller, p_student_profile_id) then
      raise exception 'not_authorized_for_student' using errcode = 'WC030';
    end if;
    v_student := p_student_profile_id;
  end if;

  if v_code = '' then
    return;
  end if;

  select l.parent_id into v_parent
    from public.parent_child_links l
   where l.student_id = v_student and l.status = 'approved'
   limit 1;

  if v_student is null or v_parent is null then
    return;
  end if;

  v_org_excluded := p_order_id is not null and exists (
    select 1
      from public.order_items oi
      join public.products p on p.id = oi.product_id
     where oi.order_id = p_order_id
       and p.tenant_id is not null
  );

  -- 쿠폰 사용자(학생)의 시간대로 "오늘"을 센다. 프로필이 없으면 시간대를 채우지 않고 예외로 막는다.
  select p.time_zone into v_tz from public.profiles p where p.id = v_student;
  if not found then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;
  v_today := public.fn_local_date(now(), v_tz);

  return query
  select
    c.id,
    c.title,
    c.discount_amount,
    c.min_amount,
    eff.until_date as valid_until,
    c.is_active,
    (
      not v_org_excluded
      and c.is_active
      and (eff.until_date is null or eff.until_date >= v_today)
      and coalesce(p_subtotal, 0) >= c.min_amount
      and (c.max_uses_per_user is null or v_student is not null)
      and not chk.is_sold_out
      and (c.grant_type <> 'granted' or own.owner_id is not null)
      and org.matches
    ) as eligible,
    case
      when v_org_excluded then 'org_product_excluded'
      when not c.is_active then 'inactive'
      when eff.until_date is not null and eff.until_date < v_today then 'expired'
      when coalesce(p_subtotal, 0) < c.min_amount then 'below_min_amount'
      when not org.matches then 'org_mismatch'
      when c.max_uses_per_user is not null and v_student is null then 'login_required'
      when c.grant_type = 'granted' and not own.is_granted_overall then 'not_granted'
      when chk.is_sold_out then 'sold_out'
      when c.grant_type = 'granted' and own.owner_id is null then 'already_used'
      else null
    end as reason,
    own.owner_id as owner_profile_id,
    (own.owner_id is not null and own.owner_id = v_student) as owner_is_student
  from public.coupons c
  cross join lateral (
    select
      public.fn_coupon_is_granted(c.id, v_student) as is_granted_student,
      public.fn_coupon_is_granted(c.id, v_parent)  as is_granted_parent,
      public.fn_coupon_is_redeemed(c.id, v_student, now()) as is_redeemed_student,
      public.fn_coupon_is_redeemed(c.id, v_parent, now())  as is_redeemed_parent,
      public.fn_coupon_global_redeemed(c.id, now()) as is_sold_out,
      public.fn_coupon_grant_valid_until(c.id, v_student) as grant_until_student,
      public.fn_coupon_grant_valid_until(c.id, v_parent)  as grant_until_parent
  ) as chk
  cross join lateral (
    select
      (chk.is_granted_student or chk.is_granted_parent) as is_granted_overall,
      case
        when c.grant_type <> 'granted' then null
        when chk.is_granted_student and not chk.is_redeemed_student then v_student
        when chk.is_granted_parent and not chk.is_redeemed_parent then v_parent
        else null
      end as owner_id
  ) as own
  cross join lateral (
    select
      least(
        c.valid_until,
        greatest(chk.grant_until_student, chk.grant_until_parent)
      ) as until_date
  ) as eff
  cross join lateral (
    select public.fn_tenant_matches(c.tenant_id, v_student, v_parent) as matches
  ) as org
  where c.code is not null
    and lower(c.code) = v_code
  limit 1;
end;
$$;


CREATE OR REPLACE FUNCTION "public"."fn_usable_coupons"("p_subtotal" integer DEFAULT 0, "p_student_profile_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("id" "uuid", "title" "text", "discount_amount" integer, "min_amount" integer, "valid_until" "date", "is_active" boolean, "eligible" boolean, "reason" "text", "owner_profile_id" "uuid", "owner_is_student" boolean)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_caller  uuid := auth.uid();
  v_student uuid;
  v_parent  uuid;
  v_today   date;
  v_tz      text;
begin
  if p_student_profile_id is null then
    v_student := v_caller;
  else
    if v_caller is distinct from p_student_profile_id
       and not public.fn_is_linked_pair(v_caller, p_student_profile_id) then
      raise exception 'not_authorized_for_student' using errcode = 'WC030';
    end if;
    v_student := p_student_profile_id;
  end if;

  select l.parent_id into v_parent
    from public.parent_child_links l
   where l.student_id = v_student and l.status = 'approved'
   limit 1;

  -- 쌍이 없으면(학부모 미연결, 또는 v_student 자체가 NULL 인 비로그인) 후보
  -- 없음 — 결제 자체가 불가능하므로 쿠폰도 없다.
  if v_student is null or v_parent is null then
    return;
  end if;

  -- 쿠폰 사용자(학생)의 시간대로 "오늘"을 센다. 프로필이 없으면 시간대를 채우지 않고 예외로 막는다.
  select p.time_zone into v_tz from public.profiles p where p.id = v_student;
  if not found then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;
  v_today := public.fn_local_date(now(), v_tz);

  return query
  select
    c.id,
    c.title,
    c.discount_amount,
    c.min_amount,
    eff.until_date as valid_until,
    c.is_active,
    (
      c.is_active
      and (eff.until_date is null or eff.until_date >= v_today)
      and coalesce(p_subtotal, 0) >= c.min_amount
      and (c.max_uses_per_user is null or v_student is not null)
      and not chk.is_sold_out
      and (c.grant_type <> 'granted' or own.owner_id is not null)
      and org.matches
    ) as eligible,
    case
      when not c.is_active then 'inactive'
      when eff.until_date is not null and eff.until_date < v_today then 'expired'
      when coalesce(p_subtotal, 0) < c.min_amount then 'below_min_amount'
      when not org.matches then 'org_mismatch'
      when c.max_uses_per_user is not null and v_student is null then 'login_required'
      when c.grant_type = 'granted' and not own.is_granted_overall then 'not_granted'
      when chk.is_sold_out then 'sold_out'
      when c.grant_type = 'granted' and own.owner_id is null then 'already_used'
      else null
    end as reason,
    own.owner_id as owner_profile_id,
    (own.owner_id is not null and own.owner_id = v_student) as owner_is_student
  from public.coupons c
  -- LATERAL 로 학생·학부모 판정을 행당 한 번씩만 계산한다(sql/55 3)절과
  -- 같은 원칙 — eligible/reason/owner 세 컬럼에서 재사용).
  cross join lateral (
    select
      public.fn_coupon_is_granted(c.id, v_student) as is_granted_student,
      public.fn_coupon_is_granted(c.id, v_parent)  as is_granted_parent,
      public.fn_coupon_is_redeemed(c.id, v_student, now()) as is_redeemed_student,
      public.fn_coupon_is_redeemed(c.id, v_parent, now())  as is_redeemed_parent,
      public.fn_coupon_global_redeemed(c.id, now()) as is_sold_out,
      public.fn_coupon_grant_valid_until(c.id, v_student) as grant_until_student,
      public.fn_coupon_grant_valid_until(c.id, v_parent)  as grant_until_parent
  ) as chk
  cross join lateral (
    select
      (chk.is_granted_student or chk.is_granted_parent) as is_granted_overall,
      -- 5-d절과 동일 규칙 — 학생 소유·미소진 우선, 아니면 학부모, 둘 다
      -- 아니면 NULL(granted 인데 소유자가 없거나 이미 다 소진). auto 는
      -- 항상 NULL.
      case
        when c.grant_type <> 'granted' then null
        when chk.is_granted_student and not chk.is_redeemed_student then v_student
        when chk.is_granted_parent and not chk.is_redeemed_parent then v_parent
        else null
      end as owner_id
  ) as own
  cross join lateral (
    select
      -- 쿠폰 기한과 발급분 기한 중 이른 날. greatest 로 쌍의 두 발급분 중
      -- 늦은 쪽을 고르는 이유는 "이 쌍이 이 쿠폰을 쓸 수 있는 마지막 날"이
      -- 표시 의미이기 때문이다(둘 중 하나만 살아 있어도 결제가 된다).
      least(
        c.valid_until,
        greatest(chk.grant_until_student, chk.grant_until_parent)
      ) as until_date
  ) as eff
  cross join lateral (
    select public.fn_coupon_org_matches(c.org_code, v_student, v_parent) as matches
  ) as org
  where c.is_active = true
  order by c.discount_amount desc, c.slug;
end;
$$;


CREATE OR REPLACE FUNCTION "public"."fn_usable_coupons"("p_subtotal" integer DEFAULT 0, "p_student_profile_id" "uuid" DEFAULT NULL::"uuid", "p_order_id" "text" DEFAULT NULL::"text") RETURNS TABLE("id" "uuid", "title" "text", "discount_amount" integer, "min_amount" integer, "valid_until" "date", "is_active" boolean, "eligible" boolean, "reason" "text", "owner_profile_id" "uuid", "owner_is_student" boolean)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_caller  uuid := auth.uid();
  v_student uuid;
  v_parent  uuid;
  v_today   date;
  v_tz      text;
  v_org_excluded boolean;
begin
  if p_student_profile_id is null then
    v_student := v_caller;
  else
    if v_caller is distinct from p_student_profile_id
       and not public.fn_is_linked_pair(v_caller, p_student_profile_id) then
      raise exception 'not_authorized_for_student' using errcode = 'WC030';
    end if;
    v_student := p_student_profile_id;
  end if;

  select l.parent_id into v_parent
    from public.parent_child_links l
   where l.student_id = v_student and l.status = 'approved'
   limit 1;

  -- 쌍이 없으면(학부모 미연결, 또는 v_student 자체가 NULL 인 비로그인) 후보
  -- 없음 — 결제 자체가 불가능하므로 쿠폰도 없다.
  if v_student is null or v_parent is null then
    return;
  end if;

  -- 신규(2026-09-01) — 주문에 org 한정 상품(busan-9900 등)이 있으면 이
  -- 주문 전체에서 쿠폰을 배제한다. p_order_id 가 NULL 이면(호출부가 아직
  -- 넘기지 않는 기존 경로) 이 축은 평가하지 않는다 — 하위호환.
  v_org_excluded := p_order_id is not null and exists (
    select 1
      from public.order_items oi
      join public.products p on p.id = oi.product_id
     where oi.order_id = p_order_id
       and p.tenant_id is not null
  );

  -- 쿠폰 사용자(학생)의 시간대로 "오늘"을 센다. 프로필이 없으면 시간대를 채우지 않고 예외로 막는다.
  select p.time_zone into v_tz from public.profiles p where p.id = v_student;
  if not found then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;
  v_today := public.fn_local_date(now(), v_tz);

  return query
  select
    c.id,
    c.title,
    c.discount_amount,
    c.min_amount,
    eff.until_date as valid_until,
    c.is_active,
    (
      not v_org_excluded
      and c.is_active
      and (eff.until_date is null or eff.until_date >= v_today)
      and coalesce(p_subtotal, 0) >= c.min_amount
      and (c.max_uses_per_user is null or v_student is not null)
      and not chk.is_sold_out
      and (c.grant_type <> 'granted' or own.owner_id is not null)
      and org.matches
    ) as eligible,
    case
      when v_org_excluded then 'org_product_excluded'
      when not c.is_active then 'inactive'
      when eff.until_date is not null and eff.until_date < v_today then 'expired'
      when coalesce(p_subtotal, 0) < c.min_amount then 'below_min_amount'
      when not org.matches then 'org_mismatch'
      when c.max_uses_per_user is not null and v_student is null then 'login_required'
      when c.grant_type = 'granted' and not own.is_granted_overall then 'not_granted'
      when chk.is_sold_out then 'sold_out'
      when c.grant_type = 'granted' and own.owner_id is null then 'already_used'
      else null
    end as reason,
    own.owner_id as owner_profile_id,
    (own.owner_id is not null and own.owner_id = v_student) as owner_is_student
  from public.coupons c
  -- LATERAL 로 학생·학부모 판정을 행당 한 번씩만 계산한다(sql/55 3)절과
  -- 같은 원칙 — eligible/reason/owner 세 컬럼에서 재사용).
  cross join lateral (
    select
      public.fn_coupon_is_granted(c.id, v_student) as is_granted_student,
      public.fn_coupon_is_granted(c.id, v_parent)  as is_granted_parent,
      public.fn_coupon_is_redeemed(c.id, v_student, now()) as is_redeemed_student,
      public.fn_coupon_is_redeemed(c.id, v_parent, now())  as is_redeemed_parent,
      public.fn_coupon_global_redeemed(c.id, now()) as is_sold_out,
      public.fn_coupon_grant_valid_until(c.id, v_student) as grant_until_student,
      public.fn_coupon_grant_valid_until(c.id, v_parent)  as grant_until_parent
  ) as chk
  cross join lateral (
    select
      (chk.is_granted_student or chk.is_granted_parent) as is_granted_overall,
      -- 5-d절과 동일 규칙 — 학생 소유·미소진 우선, 아니면 학부모, 둘 다
      -- 아니면 NULL(granted 인데 소유자가 없거나 이미 다 소진). auto 는
      -- 항상 NULL.
      case
        when c.grant_type <> 'granted' then null
        when chk.is_granted_student and not chk.is_redeemed_student then v_student
        when chk.is_granted_parent and not chk.is_redeemed_parent then v_parent
        else null
      end as owner_id
  ) as own
  cross join lateral (
    select
      -- 쿠폰 기한과 발급분 기한 중 이른 날. greatest 로 쌍의 두 발급분 중
      -- 늦은 쪽을 고르는 이유는 "이 쌍이 이 쿠폰을 쓸 수 있는 마지막 날"이
      -- 표시 의미이기 때문이다(둘 중 하나만 살아 있어도 결제가 된다).
      least(
        c.valid_until,
        greatest(chk.grant_until_student, chk.grant_until_parent)
      ) as until_date
  ) as eff
  cross join lateral (
    select public.fn_tenant_matches(c.tenant_id, v_student, v_parent) as matches
  ) as org
  where c.is_active = true
  order by c.discount_amount desc, c.slug;
end;
$$;
