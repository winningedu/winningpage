-- 테넌트(단체 소속) 마이그레이션 3/3 — 기존 org_code 판정 함수를 tenant_id 로 재작성
--
-- 원칙 — 시그니처·반환 타입·에러 코드·reason 문자열('org_mismatch',
-- 'org_product_excluded', WC064 등)·코멘트 본문은 그대로 두고 org 비교
-- 지점만 tenant_id 로 바꾼다. 각 함수 최신 정의 파일에서 본문을 통째로
-- 복사한 뒤 최소 치환만 했다 — 그 외 로직·주석은 원문 그대로다.
--
-- fn_coupon_org_matches(20260831020402)/fn_product_org_matches(20260901050440)
-- /fn_matched_org_codes(20260901050440)는 이 파일에서 건드리지 않는다(후속
-- PR에서 drop 예정) — fn_matched_org_codes 는 코멘트만 갱신한다.

-- ---------------------------------------------------------------------
-- 1) fn_tenant_matches — fn_coupon_org_matches 와 동일 본문, tenant_id 축
-- ---------------------------------------------------------------------

create or replace function public.fn_tenant_matches(
  p_tenant_id uuid,
  p_student uuid,
  p_parent uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    p_tenant_id is null
    or exists (
      select 1
      from public.profiles p
      where p.id in (p_student, p_parent)
        and p.tenant_id = p_tenant_id
    );
$$;

comment on function public.fn_tenant_matches(uuid, uuid, uuid) is
  '단체 소속 판정(2026-09-22, fn_coupon_org_matches/fn_product_org_matches 와 동일 쌍 OR 본문을 tenant_id 축으로 재정의). p_tenant_id 가 NULL 이면 항상 true(소속 제한 없음). 아니면 학생(p_student) 또는 학부모(p_parent) 중 하나라도 profiles.tenant_id 가 그 값과 같으면 true. coupons.tenant_id/products.tenant_id 판정 양쪽에서 재사용한다.';

-- anon 은 제외한다 — 원본 fn_coupon_org_matches 는 anon 실행을 허용했지만,
-- tenant_id + 안정적 uuid 조합은 "프로필 X 가 테넌트 Y 소속인가"를 캐물을 수
-- 있는 오라클이 된다. 실제 호출부(fn_usable_coupons 등)는 전부 security
-- definer 라 소유자 권한으로 돌아 caller 의 execute 권한이 필요없다.
revoke all on function public.fn_tenant_matches(uuid, uuid, uuid) from public, anon;
grant execute on function public.fn_tenant_matches(uuid, uuid, uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2) fn_matched_tenant_ids — fn_matched_org_codes 와 동일 본문, tenant_id 축
-- ---------------------------------------------------------------------

create or replace function public.fn_matched_tenant_ids(
  p_student_profile_id uuid default null
)
returns uuid[]
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
  v_ids    uuid[];
begin
  if v_caller is null then
    return '{}';
  end if;

  select coalesce(array_agg(distinct id), '{}')
    into v_ids
    from (
      -- 본인.
      select p.tenant_id as id
        from public.profiles p
       where p.id = v_caller and p.tenant_id is not null

      union all

      -- parent_child_links 로 연결된(approved) 상대 전원.
      select p.tenant_id as id
        from public.parent_child_links l
        join public.profiles p
          on p.id = case when l.parent_id = v_caller then l.student_id
                         when l.student_id = v_caller then l.parent_id
                    end
       where l.status = 'approved'
         and (l.parent_id = v_caller or l.student_id = v_caller)
         and p.tenant_id is not null

      union all

      -- p_student_profile_id 가 주어지고 호출자와 연결돼 있으면 그 학생.
      select p.tenant_id as id
        from public.profiles p
       where p_student_profile_id is not null
         and p.id = p_student_profile_id
         and p.tenant_id is not null
         and public.fn_is_linked_pair(v_caller, p_student_profile_id)
    ) as ids;

  return v_ids;
end;
$$;

comment on function public.fn_matched_tenant_ids(uuid) is
  '로그인 사용자(auth.uid())가 소속으로 확인받을 수 있는 tenant id 목록(2026-09-22, fn_matched_org_codes 대체 — 프론트 노출 필터용, "이 소속 한정 상품을 카탈로그에 보여줄까" 판단 재료). 본인 + parent_child_links 로 연결된(approved) 상대 전원 + p_student_profile_id 로 지정된, 호출자와 연결된 학생의 tenant_id 를 중복 제거 배열로 반환한다. 비로그인은 빈 배열. 실제 구매 가능 여부 판정은 fn_tenant_matches 가 별도로 한다(이 함수는 표시 전용, 서버 검증 대체 아님).';

revoke all on function public.fn_matched_tenant_ids(uuid) from public;
grant execute on function public.fn_matched_tenant_ids(uuid)
  to authenticated;

-- fn_matched_org_codes 는 건드리지 않는다 — 코멘트만 후속 PR drop 예정으로 갱신.
comment on function public.fn_matched_org_codes(uuid) is
  '로그인 사용자(auth.uid())가 소속으로 확인받을 수 있는 org_code 목록(2026-09-01, 프론트 노출 필터용 — "이 org 한정 상품을 카탈로그에 보여줄까" 판단 재료). 본인 + parent_child_links 로 연결된(approved) 상대 전원 + p_student_profile_id 로 지정된, 호출자와 연결된 학생의 org_code 를 upper(trim) 정규화해 중복 제거 배열로 반환한다. 비로그인은 빈 배열. 실제 구매 가능 여부 판정은 fn_product_org_matches 가 별도로 한다(이 함수는 표시 전용, 서버 검증 대체 아님). 2026-09-22 — fn_matched_tenant_ids 로 대체, 후속 PR에서 drop 예정.';

-- ---------------------------------------------------------------------
-- 3) fn_usable_coupons / fn_coupon_by_code — 20260901050442 최신본에서
--    org 비교 지점만 치환. 바뀐 곳: v_org_excluded 계산의 p.org_code →
--    p.tenant_id, org 래터럴의 fn_coupon_org_matches → fn_tenant_matches.
-- ---------------------------------------------------------------------

create or replace function public.fn_usable_coupons(
  p_subtotal integer default 0,
  p_student_profile_id uuid default null,
  p_order_id text default null
)
returns table(
  id uuid, title text, discount_amount integer, min_amount integer,
  valid_until date, is_active boolean, eligible boolean, reason text,
  owner_profile_id uuid, owner_is_student boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller  uuid := auth.uid();
  v_student uuid;
  v_parent  uuid;
  v_today   date := (now() at time zone 'Asia/Seoul')::date;
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

comment on function public.fn_usable_coupons(integer, uuid, text) is
  '쿠폰 판정 정본(활성 쿠폰만, sql/68 5-h절 쌍 축 재작성). p_student_profile_id 가 NULL 이면 호출자를 학생으로 보고 approved 학부모를 도출한다 — 값이 있으면 호출자가 그 학생 본인/학부모인지 검증한다(WC030). 쌍(학생+학부모)이 없으면 빈 목록. eligible/reason 은 5-d절 fn_respond_enrollment 와 동일 규칙(granted=쌍 OR+학생 우선, auto=소유 판정 없음). 반환 valid_until 은 쿠폰 기한과 발급분 기한(coupon_grants.valid_until) 중 이른 날이다(20260825000010) — 발급일 기준 기한이 붙은 쿠폰이 "무기한"으로 표시되지 않게 한다. owner_profile_id/owner_is_student 로 "누구 보유분"인지 알려준다(auto 는 owner_profile_id NULL). 단체 쿠폰(coupons.org_code)은 학생 또는 학부모의 profiles.org_code 가 일치해야 하고, 불일치면 reason=''org_mismatch''(20260831020402). p_order_id(신규, 2026-09-01, 기본 NULL·하위호환)를 넘기면 그 주문의 order_items 에 org 한정 상품(products.org_code not null)이 있는지 검사해, 있으면 전부 eligible=false·reason=''org_product_excluded''로 덮어쓴다(정가 특가 상품엔 쿠폰을 겹치지 않는다). 한국어 라벨은 만들지 않는다 — 표기는 프론트 책임. 2026-09-22 org_code text 비교를 tenant_id 비교로 전환.';

create or replace function public.fn_coupon_by_code(
  p_code text,
  p_subtotal integer default 0,
  p_student_profile_id uuid default null,
  p_order_id text default null
)
returns table(
  id uuid, title text, discount_amount integer, min_amount integer,
  valid_until date, is_active boolean, eligible boolean, reason text,
  owner_profile_id uuid, owner_is_student boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller  uuid := auth.uid();
  v_student uuid;
  v_parent  uuid;
  v_today   date := (now() at time zone 'Asia/Seoul')::date;
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

comment on function public.fn_coupon_by_code(text, integer, uuid, text) is
  '코드 직접 입력 조회 전용(sql/68 5-h절 쌍 축 재작성). code 를 입력으로만 받고 반환하지 않는다(sql/55 P1-1 유지). 학생/학부모 판정 축과 owner_profile_id/owner_is_student 는 fn_usable_coupons 와 동일 규칙(WC030 포함). 반환 valid_until 도 동일하게 쿠폰 기한과 발급분 기한 중 이른 날이다(20260825000010). 단체 쿠폰 불일치는 reason=''org_mismatch''(20260831020402). p_order_id(신규, 2026-09-01, 기본 NULL·하위호환)를 넘기면 fn_usable_coupons 와 동일하게 org 한정 상품 포함 주문을 reason=''org_product_excluded''로 배제한다. 못 찾으면 0행. 2026-09-22 org_code text 비교를 tenant_id 비교로 전환.';

-- ---------------------------------------------------------------------
-- 4) fn_respond_enrollment — 20260901050442 최신본에서 org 비교 지점만
--    치환. 바뀐 곳: 커서 select 목록의 c.org_code → c.tenant_id,
--    fn_coupon_org_matches → fn_tenant_matches, v_org_product_order 계산의
--    p.org_code → p.tenant_id.
-- ---------------------------------------------------------------------

create or replace function public.fn_respond_enrollment(
  p_order_id text,
  p_approve boolean,
  p_reject_reason text default null::text,
  p_coupon_ids uuid[] default null::uuid[]
)
returns table(order_id text, status text, approval_status text, amount integer, discount_amount integer, applied_coupon_ids uuid[], skipped_coupon_ids uuid[])
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order              public.orders;
  v_now                timestamptz := now();
  v_coupon             record;
  v_coupon_discount    integer := 0;
  v_applied_ids        uuid[] := '{}';
  v_applied_discounts  integer[] := '{}';
  -- 그 쿠폰이 귀속될 소유자 — granted 는 학생 또는 학부모, auto 는 항상
  -- NULL. v_cand_*/v_applied_* 는 항상 같은 인덱스로 append 된다(sql/68
  -- 5-d절과 동일 정합 원칙, sql/69 1-f절에서 이관).
  v_applied_owners     uuid[] := '{}';
  v_skipped_ids        uuid[] := '{}';
  v_cand_ids           uuid[] := '{}';
  v_cand_discounts     integer[] := '{}';
  v_cand_stackable     boolean[] := '{}';
  v_cand_owners        uuid[] := '{}';
  v_owner              uuid;
  v_best_nonstack_idx  integer;
  v_i                  integer;
  v_subtotal           integer;
  v_new_discount_total integer;
  v_new_amount         integer;
  -- 신규(sql/86) — approved 건 반려 시 원복할 쿠폰 할인 합계. requested
  -- 건(쿠폰 확정 전)은 void 대상 coupon_redemptions 행이 0개라 이 값이
  -- 0으로 남아 자연히 no-op 이 된다 — 별도 분기 불필요.
  v_reject_void_amount integer := 0;
  -- 신규(2026-09-01) — 이 주문에 org 한정 상품(products.org_code not
  -- null)이 있으면 쿠폰 적용을 전부 배제한다. 조작된 p_coupon_ids 로
  -- 프론트(fn_usable_coupons 의 org_product_excluded)를 우회할 수 없게
  -- 여기서도 한 번 더 막는다.
  v_org_product_order  boolean := false;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'WC021';
  end if;

  if v_order.parent_profile_id is distinct from auth.uid() then
    raise exception 'not_order_parent' using errcode = 'WC022';
  end if;

  -- 신규(sql/86) — 승인 게이트와 반려 게이트를 분리한다. 승인은 지금까지
  -- 그대로 approval_status='requested' 인 건만 받는다(approved 건을 다시
  -- "승인"하는 건 의미가 없다). 반려는 requested 뿐 아니라 approved 인
  -- 건도 받는다 — 학부모가 수락은 했지만 아직 결제하지 않은(status=
  -- pending) 건을 나중에 마음을 바꿔 반려할 수 있어야 한다는 요구사항
  -- (EnrollmentRequestModal 3버튼[닫기/반려/결제] 개편). rejected/
  -- superseded(sql/85) 등 이미 종결된 건은 두 경로 모두 여전히 WC023.
  if p_approve then
    if v_order.approval_status <> 'requested' then
      raise exception 'enrollment_not_pending' using errcode = 'WC023';
    end if;
  else
    if v_order.approval_status not in ('requested', 'approved') then
      raise exception 'enrollment_not_pending' using errcode = 'WC023';
    end if;
  end if;

  -- WC040(sql/71 원문 그대로) — approval_status 게이트를 통과해도 이
  -- 함수를 거치지 않은 경로(웹훅 등)로 status 가 이미 종결됐으면 응답
  -- 대상이 아니다. 승인/반려 모두 여전히 status='pending' 인 요청에만
  -- 허용한다.
  if v_order.status <> 'pending' then
    raise exception 'order_not_pending' using errcode = 'WC040';
  end if;

  if p_approve then
    -- 요청 시점(fn_request_enrollment) 의 orders.amount 는 쿠폰 미적용
    -- subtotal 이다 — 여기서 그 값을 subtotal 정본으로 쓴다(sql/69 1-f절
    -- 근거 그대로).
    v_subtotal := v_order.amount;

    v_org_product_order := exists (
      select 1
        from public.order_items oi
        join public.products p on p.id = oi.product_id
       where oi.order_id = p_order_id
         and p.tenant_id is not null
    );

    if p_coupon_ids is not null and array_length(p_coupon_ids, 1) > 0 then
      -- 1) 쿠폰 판정 (DB 쓰기는 아직 없음). 판정 축은 "쌍 OR"다 — granted
      --    는 학생 소유·미소진 우선, 아니면 학부모, 둘 다 아니면 제외.
      --    auto 는 소유 판정 없음(sql/69 1-f절과 동일).
      for v_coupon in
        select c.id, c.slug, c.discount_amount, c.min_amount, c.valid_until, c.is_active,
               c.max_uses_per_user, c.max_redemptions, c.stackable, c.grant_type, c.tenant_id
        from public.coupons c
        where c.id = any (p_coupon_ids)
        order by c.slug
      loop
        if v_coupon.max_redemptions is not null then
          perform pg_advisory_xact_lock(hashtextextended(v_coupon.id::text, 1));
        end if;

        -- (coupon_id, 프로필) 쌍 락 — 순서는 역할이 아니라 프로필 id
        -- 문자열 비교로 고정한다(sql/69 1-f절과 동일).
        if v_coupon.grant_type = 'granted' then
          if v_order.student_profile_id::text < v_order.parent_profile_id::text then
            perform pg_advisory_xact_lock(
              hashtextextended(v_coupon.id::text, hashtextextended(v_order.student_profile_id::text, 2)));
            perform pg_advisory_xact_lock(
              hashtextextended(v_coupon.id::text, hashtextextended(v_order.parent_profile_id::text, 2)));
          else
            perform pg_advisory_xact_lock(
              hashtextextended(v_coupon.id::text, hashtextextended(v_order.parent_profile_id::text, 2)));
            perform pg_advisory_xact_lock(
              hashtextextended(v_coupon.id::text, hashtextextended(v_order.student_profile_id::text, 2)));
          end if;
        end if;

        -- ② 30분 소프트 홀드 lazy 정리(sql/69 1-d/1-f절과 동일 축 — 전역,
        -- voided_at 단일 판정, 자기 주문(p_order_id) 제외) + sql/71 —
        -- void 되는 redemption 만큼 그 pending 주문의 discount_amount/
        -- amount 를 원복한다. sql/69 는 coupon_redemptions 만 정리하고 그
        -- redemption 이 반영했던 금액을 주문에 되돌리지 않아, 그 주문의
        -- amount/discount_amount 가 "이미 void 된 쿠폰 할인"을 계속 반영한
        -- 채로 남아 있었다(orders_amount_balance_check 등식 자체는 깨지지
        -- 않지만 표시 금액이 사실과 어긋난다). 한 주문에 여러 redemption
        -- 이 걸리면 합산해서 한 번에 되돌린다. o.status='pending' 인
        -- 주문만 대상이다(자기 자신 p_order_id 제외는 그대로 유지) —
        -- 이미 종결(canceled/failed)된 주문은 sql/69 1-e절 트리거가 void
        -- 를 맡고, 그 트리거는 처음부터 금액을 건드리지 않는다(주문이
        -- 이미 종결이라 discount_amount 표시가 후속 흐름에 영향을 주지
        -- 않는다는 sql/69 의 기존 결정을 그대로 따른다).
        with voided as (
          update public.coupon_redemptions cr
             set voided_at   = v_now,
                 void_reason = 'pending_hold_expired'
            from public.orders o
           where cr.order_id = o.id
             and cr.coupon_id = v_coupon.id
             and cr.order_id <> p_order_id
             and cr.voided_at is null
             and o.status = 'pending'
             and cr.created_at < v_now - (public.fn_coupon_pending_hold_minutes() || ' minutes')::interval
          returning cr.order_id, cr.discount_amount
        ),
        refund_totals as (
          select v.order_id, sum(v.discount_amount)::integer as refund_amount
            from voided v
           group by v.order_id
        )
        update public.orders o
           set discount_amount = o.discount_amount - rt.refund_amount,
               amount           = o.amount + rt.refund_amount
          from refund_totals rt
         where o.id = rt.order_id;

        if not v_coupon.is_active then
          continue;
        end if;
        if v_coupon.valid_until is not null
           and v_coupon.valid_until < (v_now at time zone 'Asia/Seoul')::date then
          continue;
        end if;
        if v_subtotal < v_coupon.min_amount then
          continue;
        end if;
        -- 신규(20260831020402) — 단체 쿠폰. 학생·학부모 둘 다 소속이
        -- 다르거나 없으면 이 쿠폰은 후보에서 제외한다. 프론트가 이미
        -- fn_usable_coupons/fn_coupon_by_code 로 걸러 보여주지만, 여기서도
        -- 막아야 조작된 p_coupon_ids 로 org 제한을 우회할 수 없다.
        if not public.fn_tenant_matches(
             v_coupon.tenant_id, v_order.student_profile_id, v_order.parent_profile_id) then
          continue;
        end if;
        -- 신규(2026-09-01) — 이 주문에 org 한정 상품이 섞여 있으면 쿠폰
        -- 축 자체(coupons.tenant_id)와 무관하게 전부 제외한다(위 v_org_
        -- product_order, 주문 단위로 한 번만 계산해 재사용).
        if v_org_product_order then
          continue;
        end if;

        if v_coupon.grant_type = 'granted' then
          if public.fn_coupon_is_granted(v_coupon.id, v_order.student_profile_id)
             and not public.fn_coupon_is_redeemed(v_coupon.id, v_order.student_profile_id, v_now) then
            v_owner := v_order.student_profile_id;
          elsif public.fn_coupon_is_granted(v_coupon.id, v_order.parent_profile_id)
                and not public.fn_coupon_is_redeemed(v_coupon.id, v_order.parent_profile_id, v_now) then
            v_owner := v_order.parent_profile_id;
          else
            continue;
          end if;
        else
          v_owner := null;
        end if;

        if public.fn_coupon_global_redeemed(v_coupon.id, v_now) then
          continue;
        end if;

        v_cand_ids       := array_append(v_cand_ids, v_coupon.id);
        v_cand_discounts := array_append(v_cand_discounts, v_coupon.discount_amount);
        v_cand_stackable := array_append(v_cand_stackable, v_coupon.stackable);
        v_cand_owners    := array_append(v_cand_owners, v_owner);
      end loop;

      -- 2) stacking 정산 — sql/69 원문과 동일.
      v_best_nonstack_idx := null;
      for v_i in 1 .. coalesce(array_length(v_cand_ids, 1), 0) loop
        if not v_cand_stackable[v_i] then
          if v_best_nonstack_idx is null
             or v_cand_discounts[v_i] > v_cand_discounts[v_best_nonstack_idx] then
            v_best_nonstack_idx := v_i;
          end if;
        end if;
      end loop;

      -- 3) 최종 적용 목록 조립 — sql/69 원문과 동일.
      for v_i in 1 .. coalesce(array_length(v_cand_ids, 1), 0) loop
        if v_cand_stackable[v_i] or v_i = v_best_nonstack_idx then
          if v_coupon_discount + v_cand_discounts[v_i] >= v_subtotal then
            continue;
          end if;
          v_applied_ids       := array_append(v_applied_ids, v_cand_ids[v_i]);
          v_applied_discounts := array_append(v_applied_discounts, v_cand_discounts[v_i]);
          v_applied_owners     := array_append(v_applied_owners, v_cand_owners[v_i]);
          v_coupon_discount    := v_coupon_discount + v_cand_discounts[v_i];
        end if;
      end loop;

      v_coupon_discount := least(v_coupon_discount, v_subtotal);

      -- skipped_coupon_ids: 요청(p_coupon_ids)에는 있었지만 최종 적용
      -- 목록(v_applied_ids)에 들지 못한 id 전부. 판정 루프의 continue
      -- 지점(비활성/기간만료/최소금액 미달/미보유/이미소진/전역 소진/
      -- org 쿠폰 불일치/org 상품 포함 주문)과 stacking 단계의 continue
      -- (non-stackable 탈락·누적액 초과 충돌)를 각각 따로 추적하는 대신
      -- "요청 - 적용" 차집합으로 한 번에 구한다 — continue 사유가 늘어나도
      -- 이 계산은 그대로 맞고, 사유별 개별 append 를 빠뜨릴 위험이 없다
      -- (sql/71 원문 그대로).
      v_skipped_ids := coalesce(
        (select array_agg(x) from (
           select unnest(p_coupon_ids)
           except
           select unnest(v_applied_ids)
         ) as t(x)),
        '{}'::uuid[]
      );
    end if;

    -- 4) 확정 금액 — 요청 시점 discount_amount(상품 단위 할인)에 쿠폰
    --    할인을 "더한다"(교체 아님) — orders.discount_amount = 상품 할인 +
    --    쿠폰 할인의 합이라는 불변식(sql/55_coupon_policy.sql:182-193)을
    --    유지해야 orders_amount_balance_check 와 감사용 분해 쿼리가 계속
    --    맞는다(sql/69 1-f절과 동일).
    v_new_discount_total := v_order.discount_amount + v_coupon_discount;
    v_new_amount          := v_order.list_amount - v_new_discount_total;

    if v_new_amount <= 0 then
      raise exception 'invalid_amount' using errcode = 'WC001';
    end if;

    update public.orders
       set approval_status  = 'approved',
           responded_at     = now(),
           discount_amount  = v_new_discount_total,
           amount           = v_new_amount,
           coupon_id        = case when array_length(v_applied_ids, 1) > 0
                                then v_applied_ids[1] else null end
     where id = p_order_id
    returning * into v_order;

    -- 6-a) 소진 직전 재검증(WC031) — advisory lock 을 우회한 경로가 이
    --    트랜잭션과 동시에 같은 (coupon, owner) 를 소진했다는 뜻이다.
    if array_length(v_applied_ids, 1) > 0 then
      for v_i in 1 .. array_length(v_applied_ids, 1) loop
        if v_applied_owners[v_i] is not null
           and public.fn_coupon_is_redeemed(v_applied_ids[v_i], v_applied_owners[v_i], v_now) then
          raise exception 'coupon_per_user_cap_exceeded'
            using errcode = 'WC031',
                  detail  = format('coupon_id=%s owner_profile_id=%s — advisory lock 우회 의심(귀속 직전 재검증 실패)',
                                    v_applied_ids[v_i], v_applied_owners[v_i]);
        end if;
      end loop;

      -- 6-b) 쿠폰 귀속(사용 이력).
      insert into public.coupon_redemptions (coupon_id, user_id, order_id, discount_amount)
      select v_applied_ids[gs.i], v_applied_owners[gs.i], p_order_id, v_applied_discounts[gs.i]
      from generate_subscripts(v_applied_ids, 1) as gs(i);
    end if;
  else
    if coalesce(btrim(p_reject_reason), '') = '' then
      raise exception 'reject_reason_required' using errcode = 'WC025';
    end if;

    -- 신규(sql/86) — approved 건은 승인 시점(위 p_approve=true 절)에 이미
    -- coupon_redemptions 행이 확정돼 있고 그 할인이 discount_amount/
    -- amount 에 반영돼 있을 수 있다. 반려로 종결시키는 이 건은 결제가
    -- 일어나지 않으므로 그 쿠폰을 "쓴 적 없는 것"으로 되돌려야 한다 —
    -- 살아있는(voided_at is null) redemption 을 전부 void 하고, void 한
    -- discount_amount 합만큼 아래 UPDATE 에서 orders.discount_amount 를
    -- 줄이고 amount 를 늘려 원복한다(위 30분 lazy 정리 절과 동일한 원복
    -- 등식). requested 건은 쿠폰이 확정되기 전이라 이 CTE 가 0행을
    -- 갱신하므로 v_reject_void_amount 가 0으로 남아 자연히 no-op 이다.
    -- ⚠ 이 함수는 RETURNS TABLE 의 out-param 으로 discount_amount/amount 라는
    --   PL/pgSQL 변수를 갖는다 — 아래 SQL 에서 같은 이름을 무한정으로 쓰면
    --   42702(ambiguous column reference)가 난다. CTE 결과와 orders 갱신식
    --   양쪽 모두 반드시 별칭으로 한정한다(첫 적용에서 실제로 터진 버그).
    with voided as (
      update public.coupon_redemptions cr
         set voided_at   = v_now,
             void_reason = 'enrollment_rejected'
       where cr.order_id = p_order_id
         and cr.voided_at is null
      returning cr.discount_amount
    )
    select coalesce(sum(v.discount_amount), 0)
      into v_reject_void_amount
      from voided v;

    -- 제약 정합(코드로 검증 불가 — 근거만 남긴다):
    --  · orders_reject_reason_pairing_check(sql/68 114-116행, (approval_
    --    status='rejected')=(reject_reason is not null)): 아래 UPDATE 가
    --    둘을 항상 함께 세팅 — 좌변/우변 모두 true.
    --  · orders_responded_at_pairing_check(sql/68 118-120행, (approval_
    --    status='requested')=(responded_at is null)): 결과 approval_
    --    status='rejected' 이므로 좌변 false, responded_at=now() 로
    --    우변도 false.
    --  · orders_approval_before_payment_check(sql/69 3절 수정본,
    --    approval_status='approved' or status in (pending,canceled,
    --    failed)): 결과 approval_status='rejected'(approved 아님)이므로
    --    좌변 false, status='canceled' 는 허용 목록 안 — 원래
    --    approval_status 가 requested 였든 approved 였든 이 UPDATE 직전
    --    status 는 위 WC040 게이트로 이미 'pending' 이 보장돼 있어 문제
    --    없다.
    --  · orders_discount_amount_check(sql/58, discount_amount>=0):
    --    v_reject_void_amount 는 쿠폰 할인분 합계일 뿐이고 discount_
    --    amount = 상품 할인 + 쿠폰 할인의 합(sql/55 182-193행 불변식,
    --    sql/71 268-272행 주석과 동일 근거)이라 쿠폰 할인분은 항상
    --    discount_amount 이하다 — 뺀 결과가 음수가 될 수 없다.
    --  · orders_amount_balance_check(sql/58, amount=list_amount-
    --    discount_amount): discount_amount 를 v_reject_void_amount 만큼
    --    줄이고 amount 를 그만큼 늘리는 대칭 갱신이라 list_amount 가
    --    불변인 한 등식이 그대로 유지된다(위 30분 lazy 정리 절, sql/71
    --    152-190행과 동일한 원복 등식).
    update public.orders o
       set approval_status  = 'rejected',
           responded_at     = now(),
           reject_reason    = p_reject_reason,
           status           = 'canceled',
           discount_amount  = o.discount_amount - v_reject_void_amount,
           amount           = o.amount + v_reject_void_amount,
           coupon_id        = null
     where o.id = p_order_id
    returning * into v_order;
  end if;

  return query
    select v_order.id, v_order.status, v_order.approval_status,
           v_order.amount, v_order.discount_amount,
           v_applied_ids, v_skipped_ids;
end;
$$;

comment on function public.fn_respond_enrollment(text, boolean, text, uuid[]) is
  '학부모가 학생의 수강신청(주문)을 수락/반려한다(sql/71 재작성 — RETURNS 를 orders 레코드에서 TABLE(단일 행: order_id/status/approval_status/amount/discount_amount/applied_coupon_ids/skipped_coupon_ids)로 변경, 2026-08-12). 응답 게이트는 WC021(주문 없음)·WC022(학부모 아님)에 신규 WC040(orders.status<>pending — 이 함수를 거치지 않은 경로로 이미 종결된 요청 재응답 차단)을 더했다. 승인(p_approve=true)은 approval_status=requested 인 건만 받는다(WC023). 반려(p_approve=false)는 requested 뿐 아니라 approved 인 건도 받는다(sql/86, WC023 재사용 — rejected/superseded 등 이미 종결된 건은 여전히 거부) — 학부모가 수락 후 아직 결제 전(status=pending)에 마음을 바꿔 반려할 수 있게 한다. 승인 시 쿠폰을 여기서 직접 확정한다(쌍 OR 자격·advisory lock·stacking·재검증 WC031, sql/69 1-f절과 동일). 단체 쿠폰(coupons.org_code)은 학생·학부모 둘 다 소속 코드가 불일치하면 후보에서 제외한다(20260831020402, 조작된 p_coupon_ids 우회 차단). 이 주문에 org 한정 상품(products.org_code not null)이 섞여 있으면 쿠폰 축과 무관하게 전부 제외한다(2026-09-01, 주문 단위로 한 번만 계산). p_coupon_ids 중 최종 미적용 id 는 skipped_coupon_ids 로 보고한다(차집합 계산, 사유 미분류). 30분 lazy 정리로 다른 pending 주문의 coupon_redemptions 가 void 될 때 그 주문의 discount_amount/amount 도 함께 원복한다(sql/71). 반려 시 사유 필수(WC025)이며 orders.status 를 canceled 로 내린다. approved 건 반려 시 그 주문의 살아있는 coupon_redemptions 를 전부 void(void_reason=enrollment_rejected)하고 void 한 할인 합만큼 discount_amount/amount 를 원복하며 coupon_id 를 NULL 로 되돌린다(sql/86, requested 건은 void 대상 0행이라 자연히 no-op). 2026-09-22 org_code text 비교를 tenant_id 비교로 전환.';

-- ---------------------------------------------------------------------
-- 5) fn_revalidate_order_coupons — 20260901050442 최신본에서 org 비교
--    지점만 치환. 바뀐 곳: is_org_ok 의 fn_coupon_org_matches → fn_tenant_
--    matches, is_org_product_excluded 의 p.org_code → p.tenant_id.
-- ---------------------------------------------------------------------

create or replace function public.fn_revalidate_order_coupons(p_order_id text)
returns table(coupon_id uuid, ok boolean, reason text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := now();
begin
  return query
  select
    cr.coupon_id,
    (chk.is_granted and not chk.is_redeemed and not chk.is_sold_out
     and chk.is_org_ok and not chk.is_org_product_excluded) as ok,
    case
      when not chk.is_granted then 'not_granted'
      when chk.is_redeemed then 'already_used'
      when chk.is_sold_out then 'sold_out'
      when not chk.is_org_ok then 'org_mismatch'
      when chk.is_org_product_excluded then 'org_product_excluded'
      else null
    end as reason
  from public.coupon_redemptions cr
  join public.orders o on o.id = cr.order_id
  join public.coupons c on c.id = cr.coupon_id
  cross join lateral (
    select
      (cr.user_id is null or public.fn_coupon_is_granted(cr.coupon_id, cr.user_id)) as is_granted,
      (cr.user_id is not null
        and public.fn_coupon_is_redeemed(cr.coupon_id, cr.user_id, v_now, p_order_id)) as is_redeemed,
      public.fn_coupon_global_redeemed(cr.coupon_id, v_now, p_order_id) as is_sold_out,
      public.fn_tenant_matches(c.tenant_id, o.student_profile_id, o.parent_profile_id) as is_org_ok,
      exists (
        select 1
          from public.order_items oi
          join public.products p on p.id = oi.product_id
         where oi.order_id = o.id
           and p.tenant_id is not null
      ) as is_org_product_excluded
  ) as chk
  where cr.order_id = p_order_id
    and cr.voided_at is null;
end;
$$;

comment on function public.fn_revalidate_order_coupons(text) is
  'service_role 전용. 결제 승인 직전 호출 — coupon_redemptions 행마다 그 행의 귀속 소유자(cr.user_id)를 축으로 재판정한다(sql/68 5-i절 재작성, orders.user_id 단일 축 폐기). cr.user_id NULL(auto)은 소유 판정 없이 항상 발급·미소진 취급. 판정 축 5개: 발급(not_granted)/1인 사용 횟수(already_used)/전체 발행량(sold_out)/단체 소속 일치(org_mismatch, 20260831020402 — coupons.org_code 축, orders 의 student_profile_id/parent_profile_id 로 판정)/주문에 org 한정 상품 포함(org_product_excluded, 2026-09-01 — products.org_code 축, coupons.org_code 와 독립). 행이 없으면 이 주문에 쿠폰이 없다는 뜻(통과). ok=false 행이 있으면 승인을 진행하지 않아야 한다. 2026-09-22 org_code text 비교를 tenant_id 비교로 전환.';

-- ---------------------------------------------------------------------
-- 6) fn_request_enrollment — 20260901050440 최신본에서 org 비교 지점만
--    치환. 바뀐 곳: v_prod 커서의 p.org_code → p.tenant_id(2곳: select
--    목록·where 절), fn_product_org_matches → fn_tenant_matches, 구매
--    이력 체크의 v_prod.org_code → v_prod.tenant_id.
-- ---------------------------------------------------------------------

create or replace function public.fn_request_enrollment(
  p_order_id text,
  p_student_profile_id uuid,
  p_parent_profile_id uuid,
  p_customer_email text,
  p_order_name text,
  p_items jsonb,
  p_list_amount integer,
  p_subtotal integer
) returns table(order_id text, amount integer, discount_amount integer)
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_discount_amount integer;
  v_amount          integer;
  v_prod            record;
begin
  if p_order_id is null or p_subtotal is null or p_list_amount is null then
    raise exception 'order_id/list_amount/subtotal required';
  end if;

  if p_student_profile_id is null or p_parent_profile_id is null then
    raise exception 'enrollment_pair_required' using errcode = 'WC019';
  end if;
  if p_student_profile_id = p_parent_profile_id then
    raise exception 'enrollment_pair_same_profile' using errcode = 'WC020';
  end if;

  -- 학생 축 advisory lock 유지(sql/71) — 동시에 들어온 같은 학생의 요청을
  -- 직렬화한다. 학부모 축이 아니라 학생 축인 이유는 한 학부모가 여러 자녀를
  -- 동시에 신청시키는 정상 흐름까지 직렬화하지 않기 위해서다.
  perform pg_advisory_xact_lock(hashtextextended(p_student_profile_id::text, 101));

  if not public.fn_is_linked_pair(p_student_profile_id, p_parent_profile_id) then
    raise exception 'pair_not_linked' using errcode = 'WC042';
  end if;

  -- ⚠ 여기 있던 WC043(중복 열린 요청 차단) EXISTS 블록을 제거했다.
  --   파일 상단 "왜 되돌리나" 참고.

  -- 신규(2026-09-01) — org 한정 상품 서버 검증. p_items 는 클라이언트가
  -- 넘긴다(이 함수는 auth.uid() 를 참조하지 않는다 — 신뢰 경계는 호출부
  -- api/request-enrollment.js) 그래도 tenant_id/sale_ends_at/구매 이력은
  -- 여기서 products 를 직접 조회해 재검증한다.
  for v_prod in
    select p.id as product_id, p.tenant_id, p.sale_ends_at
      from public.products p
     where p.id in (
       select (it ->> 'product_id')::uuid
         from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as it
     )
       and (p.tenant_id is not null or p.sale_ends_at is not null)
  loop
    if v_prod.tenant_id is not null
       and not public.fn_tenant_matches(
             v_prod.tenant_id, p_student_profile_id, p_parent_profile_id) then
      raise exception 'product_org_mismatch' using errcode = 'WC064';
    end if;

    if v_prod.sale_ends_at is not null and now() >= v_prod.sale_ends_at then
      raise exception 'product_sale_ended' using errcode = 'WC065';
    end if;

    if v_prod.tenant_id is not null and exists (
      select 1
        from public.orders o
        join public.order_items oi on oi.order_id = o.id
       where o.student_profile_id = p_student_profile_id
         and o.status in ('paid', 'waiting_deposit')
         and oi.product_id = v_prod.product_id
    ) then
      raise exception 'product_purchase_limit' using errcode = 'WC066';
    end if;
  end loop;

  v_discount_amount := p_list_amount - p_subtotal;
  v_amount          := p_subtotal;

  if v_amount <= 0 then
    raise exception 'invalid_amount' using errcode = 'WC001';
  end if;

  insert into public.orders
    (id, user_id, student_profile_id, parent_profile_id, status, order_name,
     list_amount, discount_amount, amount, customer_email)
  values
    (p_order_id, p_parent_profile_id, p_student_profile_id, p_parent_profile_id,
     'pending', p_order_name, p_list_amount, v_discount_amount, v_amount, p_customer_email);

  insert into public.order_items
    (order_id, product_id, product_slug, service_key, name, list_price, price, quantity)
  select
    p_order_id,
    (it->>'product_id')::uuid,
    it->>'product_slug',
    it->>'service_key',
    it->>'name',
    coalesce((it->>'list_price')::integer, 0),
    coalesce((it->>'price')::integer, 0),
    coalesce((it->>'quantity')::integer, 1)
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as it;

  return query
    select p_order_id, v_amount, v_discount_amount;
end;
$$;

comment on function public.fn_request_enrollment(text, uuid, uuid, text, text, jsonb, integer, integer) is
  '학생이 수강신청(주문)을 생성한다(sql/76 — WC043 중복 열린 요청 차단 제거, 2026-08-13 사용자 확정 + 2026-09-01 org 한정 상품 서버 검증). 한 학생이 승인 대기 요청을 여러 건 가질 수 있다. 동시 이중 신청 방지는 학생 축 advisory lock(salt 101)이 계속 담당한다. p_items 의 product_id 가 org_code/sale_ends_at 을 가진 상품이면 소속 불일치(WC064)·판매 마감(WC065)·학생당 1회 구매 제한 초과(WC066)를 여기서 재검증한다(클라이언트가 넘긴 p_items 를 신뢰하지 않는다). 나머지 가드(쌍 필수 WC019·동일인 금지 WC020·링크 검증 WC042·0원 이하 WC001)는 sql/71 원문과 동일하다. auth.uid() 는 참조하지 않는다 — 신뢰 경계는 호출자(api/request-enrollment.js)다. 2026-09-22 org_code text 비교를 tenant_id 비교로 전환.';

-- ---------------------------------------------------------------------
-- 7) fn_parent_create_enrollment — 20260901050440 최신본에서 org 비교
--    지점만 치환(fn_request_enrollment 와 동일 3곳).
-- ---------------------------------------------------------------------

create or replace function public.fn_parent_create_enrollment(
  p_original_order_id text,
  p_items jsonb
) returns table(order_id text, amount integer, discount_amount integer)
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_order           public.orders;
  v_product_ids     uuid[];
  v_product_count   integer;
  v_list_amount     integer;
  v_subtotal        integer;
  v_discount_amount integer;
  v_new_order_id    text;
  v_order_name      text;
  v_first_name      text;
  v_prod            record;
begin
  select * into v_order from public.orders where id = p_original_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'WC051';
  end if;

  if v_order.parent_profile_id is distinct from auth.uid() then
    raise exception 'not_order_parent' using errcode = 'WC052';
  end if;

  -- 이 함수는 "미응답 요청"만 대체한다 — 원래 요청이 이미 승인/반려/
  -- superseded 등으로 종결됐으면 대체 불가.
  if v_order.approval_status <> 'requested' or v_order.status <> 'pending' then
    raise exception 'order_not_pending_for_override' using errcode = 'WC053';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'no_items_selected' using errcode = 'WC054';
  end if;

  -- 쌍 재검증 — sql/71 WC042 판정 로직과 동일 헬퍼 재사용.
  if not public.fn_is_linked_pair(v_order.student_profile_id, auth.uid()) then
    raise exception 'pair_not_linked' using errcode = 'WC055';
  end if;

  select array_agg(distinct (i ->> 'product_id')::uuid)
    into v_product_ids
    from jsonb_array_elements(p_items) as i;

  select count(*), sum(coalesce(p.list_price, p.price, 0)), sum(coalesce(p.price, 0))
    into v_product_count, v_list_amount, v_subtotal
    from public.products p
   where p.id = any (v_product_ids)
     and p.is_active = true
     and p.is_orderable = true;

  if v_product_count is distinct from array_length(v_product_ids, 1) then
    raise exception 'invalid_products' using errcode = 'WC056';
  end if;

  -- 신규(2026-09-01) — org 한정 상품 서버 검증(fn_request_enrollment 와
  -- 동일 축). 이 경로의 학부모는 auth.uid(), 학생은 v_order.student_
  -- profile_id.
  for v_prod in
    select p.id as product_id, p.tenant_id, p.sale_ends_at
      from public.products p
     where p.id = any (v_product_ids)
       and (p.tenant_id is not null or p.sale_ends_at is not null)
  loop
    if v_prod.tenant_id is not null
       and not public.fn_tenant_matches(
             v_prod.tenant_id, v_order.student_profile_id, auth.uid()) then
      raise exception 'product_org_mismatch' using errcode = 'WC064';
    end if;

    if v_prod.sale_ends_at is not null and now() >= v_prod.sale_ends_at then
      raise exception 'product_sale_ended' using errcode = 'WC065';
    end if;

    if v_prod.tenant_id is not null and exists (
      select 1
        from public.orders o
        join public.order_items oi on oi.order_id = o.id
       where o.student_profile_id = v_order.student_profile_id
         and o.status in ('paid', 'waiting_deposit')
         and oi.product_id = v_prod.product_id
    ) then
      raise exception 'product_purchase_limit' using errcode = 'WC066';
    end if;
  end loop;

  v_discount_amount := v_list_amount - v_subtotal;

  -- list_price < price 인 상품 데이터가 섞이면 discount_amount 가 음수가
  -- 될 수 있다 — 그대로 두면 아래 INSERT 가 orders_discount_amount_check
  -- (sql/58, discount_amount >= 0)에 걸려 처리되지 않은 raw 23514 로
  -- 죽는다. WC001 을 재사용해(v_subtotal <= 0 과 같은 금액 무결성 오류)
  -- 여기서 먼저 명시적으로 거부한다.
  if v_subtotal <= 0 or v_discount_amount < 0 then
    raise exception 'invalid_amount' using errcode = 'WC001';
  end if;

  v_new_order_id := 'order_' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint
                     || '_' || substr(md5(random()::text || clock_timestamp()::text), 1, 8);

  -- p.id 는 랜덤 UUID 라 order by p.id 로는 매번 다른 상품이 "대표"로
  -- 뽑힌다 — 카탈로그 표시 순서(src/lib/products.ts PRODUCT_COLUMNS 와
  -- 동일한 service_sort_order, sort_order)로 정렬해 결정적으로 만든다.
  select p.name into v_first_name
    from public.products p
   where p.id = any (v_product_ids)
     and p.is_active = true
     and p.is_orderable = true
   order by p.service_sort_order, p.sort_order
   limit 1;

  v_order_name := case when v_product_count > 1
                    then coalesce(v_first_name, '위닝에듀 서비스') || ' 외 ' || (v_product_count - 1) || '건'
                    else coalesce(v_first_name, '위닝에듀 서비스')
                  end;

  -- 새 주문 — 학부모 본인이 결제 주체로서 직접 만드는 주문이라 스스로
  -- 승인 대기시킬 이유가 없다(refund_requests_parent_auto_approve_check
  -- 와 같은 선례 — 본인 신청은 즉시 approved). responded_at 도 함께
  -- 세팅해야 orders_responded_at_pairing_check 를 통과한다. 쿠폰은 받지
  -- 않는다(coupon_id NULL, 범위 밖).
  insert into public.orders (
    id, user_id, student_profile_id, parent_profile_id, status, order_name,
    list_amount, discount_amount, amount, customer_email,
    approval_status, responded_at
  ) values (
    v_new_order_id, auth.uid(), v_order.student_profile_id, auth.uid(), 'pending', v_order_name,
    v_list_amount, v_discount_amount, v_subtotal, v_order.customer_email,
    'approved', now()
  );

  insert into public.order_items (order_id, product_id, product_slug, service_key, name, list_price, price, quantity)
  select
    v_new_order_id,
    p.id,
    p.slug,
    p.service_key,
    p.name,
    coalesce(p.list_price, p.price, 0),
    coalesce(p.price, 0),
    1
  from public.products p
  where p.id = any (v_product_ids)
    and p.is_active = true
    and p.is_orderable = true;

  -- 원래 요청 종결 — reject_reason 은 세팅하지 않는다(NULL 유지, 위 1)절
  -- CHECK 근거). status 는 canceled 로 내려 orders_approval_before_
  -- payment_check 를 통과시킨다.
  update public.orders
     set approval_status         = 'superseded',
         superseded_by_order_id  = v_new_order_id,
         status                  = 'canceled',
         responded_at            = now()
   where id = p_original_order_id;

  -- 형제 요청 대체 — sql/76 이 학생당 여러 서비스에 걸친 동시 열린 요청을
  -- 허용해서, 이번에 선택한 서비스와 겹치는 다른 열린 요청을 안 건드리면
  -- 그 요청이 나중에 독립적으로 승인될 때 같은 서비스가 중복 결제된다.
  update public.orders o
     set approval_status        = 'superseded',
         superseded_by_order_id = v_new_order_id,
         status                 = 'canceled',
         responded_at           = now()
   where o.student_profile_id = v_order.student_profile_id
     and o.status = 'pending'
     and o.approval_status = 'requested'
     and o.id <> p_original_order_id
     and exists (
       select 1 from public.order_items oi
        where oi.order_id = o.id
          and oi.service_key in (
            select distinct p.service_key
              from public.products p
             where p.id = any (v_product_ids)
               and p.is_active = true
               and p.is_orderable = true
          )
     );

  return query select v_new_order_id, v_subtotal, v_discount_amount;
end;
$$;

comment on function public.fn_parent_create_enrollment(text, jsonb) is
  '학부모가 학생의 미응답 수강신청 요청(status=pending, approval_status=requested)을 자신이 고른 상품 구성으로 대체해 즉시 approved 상태의 새 주문을 만든다(sql/85 + 20260825 is_orderable 게이트 + 2026-09-01 org 한정 상품 서버 검증). 호출자는 그 주문의 parent_profile_id 여야 하고(WC052) 원래 요청이 여전히 미응답이어야 한다(WC053). fn_is_linked_pair 로 쌍을 재검증한다(WC055, sql/71 WC042 와 동일 헬퍼). 선택 상품은 is_active=true 이고 is_orderable=true 인 것만 허용하며 하나라도 비활성/주문불가/존재하지 않으면 거부한다(WC056). org_code/sale_ends_at 을 가진 상품이면 소속 불일치(WC064)·판매 마감(WC065)·학생당 1회 구매 제한 초과(WC066)를 재검증한다. discount_amount 가 음수면 WC001 로 거부한다(orders_discount_amount_check 사전 방어). 대표 상품명(order_name)은 카탈로그 정렬(service_sort_order, sort_order)로 결정적으로 고른다. 새 주문은 쿠폰을 받지 않는다(coupon_id NULL, 범위 밖). 원래 주문은 approval_status=superseded·status=canceled·superseded_by_order_id=새 주문 id 로 종결된다 — reject_reason 은 세팅하지 않는다(orders_reject_reason_pairing_check 상 NULL 유지 필요), responded_at 은 함께 세팅한다(orders_responded_at_pairing_check 상 필수). 같은 학생의 다른 열린 요청(sql/76 이 허용하는, 다른 서비스에 걸친 동시 pending/requested 요청) 중 이번에 선택된 상품과 service_key 가 겹치는 것도 함께 superseded 처리해 나중에 독립 승인될 때 같은 서비스가 중복 결제되는 것을 막는다. 2026-09-22 org_code text 비교를 tenant_id 비교로 전환.';

-- ---------------------------------------------------------------------
-- 8) complete_signup_profile — 20260903041457 최신본에서 org_code 정규화
--    저장을 tenant_id 해석·저장으로 치환. 시그니처(파라미터명 p_org_code
--    포함)는 그대로 둔다.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "public"."complete_signup_profile"("p_name" "text", "p_username" "text", "p_phone" "text", "p_email" "text", "p_region" "text", "p_school_type" "text", "p_school_name" "text", "p_member_type" "text", "p_terms_service_agreed" boolean, "p_privacy_required_agreed" boolean, "p_identity_required_agreed" boolean, "p_privacy_optional_agreed" boolean, "p_marketing_agreed" boolean, "p_ads_agreed" boolean, "p_guardian_phone" "text" DEFAULT NULL::"text", "p_guardian_consent" boolean DEFAULT false, "p_identity_request_id" "text" DEFAULT NULL::"text", "p_birth_date" "date" DEFAULT NULL::"date", "p_gender" "text" DEFAULT NULL::"text", "p_org_code" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
declare
  v_user_id        uuid;
  v_name           text;
  v_username       text;
  v_phone          text;
  v_phone_digits   text;
  v_pv_id          uuid;
  v_email          text;
  v_region         text;
  v_school_type    text;
  v_school_name    text;
  v_member_type    text;
  v_link_code      text;
  v_guardian_phone        text;
  v_guardian_phone_digits text;
  v_identity_rid   text;
  v_iv_id          uuid;
  v_iv_purpose     text;
  v_iv_under14     boolean;
  v_iv_birth_date  date;
  v_iv_gender      text;
  v_iv_mobile      text;
  v_under14        boolean := false;
  v_birth_date     date;
  v_gender         text;
  v_org_code_input text;
  v_tenant_id      uuid;
  v_require_tenant boolean;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  v_name        := trim(coalesce(p_name, ''));
  v_email       := lower(trim(coalesce(p_email, '')));
  v_username    := lower(trim(coalesce(nullif(p_username, ''), v_email)));
  v_phone       := trim(coalesce(p_phone, ''));
  v_region      := trim(coalesce(p_region, ''));
  v_school_type := trim(coalesce(p_school_type, ''));
  v_school_name := trim(coalesce(p_school_name, ''));
  v_member_type := lower(trim(coalesce(p_member_type, '')));

  v_guardian_phone := trim(coalesce(p_guardian_phone, ''));
  v_identity_rid   := trim(coalesce(p_identity_request_id, ''));

  -- 저장은 입력값 그대로 두고(기존 동작 유지), 조회만 숫자로 정규화한다.
  v_phone_digits := regexp_replace(v_phone, '[^0-9]', '', 'g');

  if v_name = '' then
    raise exception 'name_required';
  end if;

  if v_email = '' then
    raise exception 'email_required';
  end if;

  if v_username = '' then
    v_username := v_email;
  end if;

  if v_member_type = '' then
    raise exception 'member_type_required';
  end if;

  if v_member_type not in ('student', 'parent', 'mentor') then
    raise exception 'invalid_member_type';
  end if;

  -- 지역·재학 구분은 학생에게만 필수([13]).
  if v_member_type = 'student' and v_region = '' then
    raise exception 'region_required';
  end if;

  if v_member_type = 'student' and v_school_type = '' then
    raise exception 'school_type_required';
  end if;

  if coalesce(p_terms_service_agreed, false) is not true then
    raise exception 'terms_service_required';
  end if;

  if coalesce(p_privacy_required_agreed, false) is not true then
    raise exception 'privacy_required';
  end if;

  -- 본인 인증 정보 수집 동의는 학생 약관에만 있는 항목이다.
  if v_member_type = 'student'
     and coalesce(p_identity_required_agreed, false) is not true then
    raise exception 'identity_required';
  end if;

  -- ── 생년월일·성별 (QA 2026-08-22) ──────────────────────────────
  -- 우선 입력값을 그대로 정규화·검증한다. 14세 미만 흐름은 프런트가 이 두 값을 보내지
  -- 않으므로(PASS 값이 정본) 여기서는 통과하고, 아래 법정대리인 본인확인 블록에서
  -- identity_verifications 값으로 덮어쓴다.
  v_birth_date := p_birth_date;
  v_gender     := nullif(trim(coalesce(p_gender, '')), '');

  -- ── 소속 코드 (2026-09-22, tenants 전환) ────────────────────────
  -- p_org_code 는 이제 8자 tenant 코드다(fn_generate_tenant_code 출력 형식).
  -- 값이 있으면 fn_resolve_tenant_code 가 정규화·조회·레이트리밋(WC068)을
  -- 하고, 못 찾으면 실패 기록을 남긴 뒤 NULL 을 돌려준다(raise 하지 않음 —
  -- 그래야 기록 insert 가 이 가입 트랜잭션과 함께 커밋된다). 소속이
  -- 필수(require_tenant_on_signup)가 아니면 잘못된 코드는 조용히 무시하고
  -- (선택 입력이라 오타로 가입 자체를 막지 않는다), 필수면 아래에서 WC073.
  v_org_code_input := trim(coalesce(p_org_code, ''));
  if v_org_code_input <> '' then
    v_tenant_id := public.fn_resolve_tenant_code(v_org_code_input);
  end if;

  -- jsonb 를 안전하게 boolean 으로 — #>>'{}' 는 스칼라 jsonb(true/false 이든
  -- 문자열 "true" 이든) 를 text 로 뽑는다. value::text::boolean 은 값이
  -- json 문자열 '"true"' 로 저장되면 22P02 로 터져 가입 전체를 막는다.
  select ((s.value #>> '{}')::boolean) into v_require_tenant
    from public.app_settings s
   where s.key = 'require_tenant_on_signup';

  if coalesce(v_require_tenant, false) and v_tenant_id is null then
    raise exception 'tenant_required' using errcode = 'WC073';
  end if;

  if v_gender is not null and v_gender not in ('남', '여') then
    raise exception 'invalid_gender';
  end if;

  -- ── 법정대리인 본인확인 (만 14세 미만) ──────────────────────────
  if v_identity_rid <> '' then
    select id, purpose, is_under14, birth_date, gender, mobile
      into v_iv_id, v_iv_purpose, v_iv_under14, v_iv_birth_date, v_iv_gender, v_iv_mobile
    from public.identity_verifications
    where request_id = v_identity_rid
      and status = 'verified'
      and consumed_at is null
      and verified_at > now() - interval '30 minutes'
    limit 1;

    if v_iv_id is null then
      raise exception 'identity_not_verified';
    end if;

    if v_iv_purpose is distinct from 'under14_guardian' then
      raise exception 'identity_purpose_mismatch';
    end if;

    -- 법정대리인이 만 14세 미만이면 대리인이 될 수 없다.
    if coalesce(v_iv_under14, false) then
      raise exception 'guardian_age';
    end if;

    v_under14 := true;

    -- PASS 실명 정보가 정본이다 — 폼에서 보낸 p_birth_date/p_gender는 무시한다.
    -- NICE 성별코드 관례: 홀수(1/3/5/7)=남, 짝수 계열(0/2/4/6/8)=여
    -- (0/2/4/6/8은 내국인/외국인·출생연도대별 조합, 매핑에 없는 값이면 null).
    v_birth_date := v_iv_birth_date;
    v_gender := case
      when v_iv_gender in ('1', '3', '5', '7') then '남'
      when v_iv_gender in ('0', '2', '4', '6', '8') then '여'
      else null
    end;

    -- 법정대리인(학부모) 번호도 PASS 콜백이 저장한 mobile_no가 정본이다 — 있으면
    -- 폼 입력값(p_guardian_phone)을 무시하고 덮어쓴다. 없으면 입력값을 그대로 쓴다.
    v_guardian_phone := coalesce(
      nullif(regexp_replace(coalesce(v_iv_mobile, ''), '[^0-9]', '', 'g'), ''),
      v_guardian_phone
    );
  end if;

  v_guardian_phone_digits := regexp_replace(v_guardian_phone, '[^0-9]', '', 'g');

  -- 표기 정규화 — profiles.phone은 사용자가 입력한 형식(예: 010-1234-5678)을 그대로
  -- 저장하는 관행이라, guardian_phone도 저장 직전에 같은 하이픈 형식으로 맞춘다. PASS
  -- mobile_no(하이픈 없는 숫자열)와 폼 입력값(하이픈 유무가 제각각) 둘 다 위에서 이미
  -- v_guardian_phone에 합쳐졌으므로 여기 한 곳에서만 처리하면 된다. 인증 조회·중복
  -- 비교는 계속 v_guardian_phone_digits(숫자만)를 쓴다.
  v_guardian_phone := case
    when v_guardian_phone_digits = '' then ''
    when length(v_guardian_phone_digits) = 11 then
      substr(v_guardian_phone_digits, 1, 3) || '-' || substr(v_guardian_phone_digits, 4, 4) || '-' || substr(v_guardian_phone_digits, 8, 4)
    when length(v_guardian_phone_digits) = 10 then
      substr(v_guardian_phone_digits, 1, 3) || '-' || substr(v_guardian_phone_digits, 4, 3) || '-' || substr(v_guardian_phone_digits, 7, 4)
    else v_guardian_phone
  end;

  if v_under14 then
    if v_guardian_phone = '' then
      raise exception 'guardian_phone_required';
    end if;

    if coalesce(p_guardian_consent, false) is not true then
      raise exception 'guardian_consent_required';
    end if;
  end if;

  -- 14세 이상 학생·학부모는 생년월일·성별이 필수다(멘토는 가입 화면이 아직 없어 제외).
  if not v_under14 and v_member_type in ('student', 'parent') then
    if v_birth_date is null then
      raise exception 'birth_date_required';
    end if;

    if v_gender is null then
      raise exception 'gender_required';
    end if;
  end if;

  -- 학생은 본인 명의 번호 또는 학부모 번호 중 하나가 있어야 한다("학생 명의의
  -- 핸드폰이 없어요" 체크 시 phone을 비우고 guardian_phone을 채워 보낸다).
  -- 14세 미만은 위 guardian_phone_required가 이미 걸러내므로 여기는 14세 이상
  -- 학생이 phone도 guardian_phone도 안 보낸 경우를 막는 안전망이다.
  if v_member_type = 'student'
     and v_phone_digits = ''
     and v_guardian_phone_digits = '' then
    raise exception 'phone_or_guardian_required';
  end if;

  -- ── 휴대폰 인증 확인 (본인 번호) ─────────────────────────────────
  -- purpose는 가입 목적으로 발송된 것만 인정한다(find_account/reset_password 등
  -- 다른 목적 인증을 가입에 재사용하지 못하게). TTL은 30분 → 10분으로 단축한다.
  if v_phone_digits <> '' then
    select id into v_pv_id
    from public.phone_verifications
    where phone = v_phone_digits
      and purpose in ('signup', 'parent_signup')
      and verified_at is not null
      and consumed_at is null
      and verified_at > now() - interval '10 minutes'
    order by verified_at desc
    limit 1;
  end if;

  -- ── 휴대폰 인증 확인 (학부모 번호 — 14세 이상 학생이 본인 번호 대신 보낸 경우) ──
  -- 본인 번호를 비우고 학부모 번호를 보낸 14세 이상 학생만 해당한다. 14세 미만은
  -- PASS 본인확인으로 이미 검증된 번호라 별도 인증이 필요 없다.
  if v_member_type = 'student'
     and not v_under14
     and v_phone_digits = ''
     and v_guardian_phone_digits <> '' then
    select id into v_pv_id
    from public.phone_verifications
    where phone = v_guardian_phone_digits
      and purpose = 'guardian_signup'
      and verified_at is not null
      and consumed_at is null
      and verified_at > now() - interval '10 minutes'
    order by verified_at desc
    limit 1;

    if v_pv_id is null then
      raise exception 'guardian_phone_not_verified';
    end if;
  end if;

  -- [15]: 학생도 포함. 멘토는 가입 화면이 생길 때 추가한다.
  -- 만 14세 미만이 본인 번호를 비운 경우만 면제한다(위 (3)-c 주석). 14세 이상
  -- 학생이 학부모 번호 경로를 탄 경우는 바로 위 블록에서 이미 v_pv_id를 채웠거나
  -- guardian_phone_not_verified로 걸러졌으므로 여기서 추가로 막을 필요가 없다.
  if v_member_type in ('parent', 'student')
     and v_pv_id is null
     and not (v_under14 and v_phone_digits = '') then
    raise exception 'phone_not_verified';
  end if;

  if exists (
    select 1
    from public.profiles
    where lower(trim(email)) = v_email
      and id <> v_user_id
  ) then
    raise exception 'duplicate_email';
  end if;

  -- ── [16] 전화번호 중복 ──────────────────────────────────────────
  -- guardian_phone은 검사하지 않는다(학부모 본인 계정 번호·형제 공유가 정상).
  if v_phone_digits <> '' and exists (
    select 1
    from public.profiles
    where id <> v_user_id
      and member_type is not null
      and regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') = v_phone_digits
  ) then
    raise exception 'duplicate_phone';
  end if;

  -- fn_profiles_lock_tenant(20260922) 게이트를 통과시킨다 — 아래 INSERT ...
  -- ON CONFLICT DO UPDATE 가 재호출 시 UPDATE 경로를 탈 수 있어서다.
  perform set_config('app.tenant_set_via_rpc', '1', true);

  insert into public.profiles (
    id, name, username, phone, email, region,
    school_type, school_name, member_type, role,
    terms_service_agreed, privacy_required_agreed, privacy_optional_agreed,
    marketing_agreed, ads_agreed, guardian_phone, guardian_consent,
    birth_date, gender, tenant_id, updated_at
  )
  values (
    v_user_id, v_name, v_username, nullif(v_phone, ''), v_email, nullif(v_region, ''),
    nullif(v_school_type, ''), nullif(v_school_name, ''), v_member_type, 'user',
    coalesce(p_terms_service_agreed, false),
    coalesce(p_privacy_required_agreed, false),
    coalesce(p_privacy_optional_agreed, false),
    coalesce(p_marketing_agreed, false),
    coalesce(p_ads_agreed, false),
    nullif(v_guardian_phone, ''),
    coalesce(p_guardian_consent, false),
    v_birth_date, v_gender, v_tenant_id,
    now()
  )
  on conflict (id) do update
  set
    name                    = excluded.name,
    username                = excluded.username,
    phone                   = excluded.phone,
    email                   = excluded.email,
    region                  = excluded.region,
    school_type             = excluded.school_type,
    school_name             = excluded.school_name,
    member_type             = excluded.member_type,
    role                    = coalesce(public.profiles.role, 'user'),
    terms_service_agreed    = excluded.terms_service_agreed,
    privacy_required_agreed = excluded.privacy_required_agreed,
    privacy_optional_agreed = excluded.privacy_optional_agreed,
    marketing_agreed        = excluded.marketing_agreed,
    ads_agreed              = excluded.ads_agreed,
    -- 재호출로 이미 채운 법정대리인 정보를 빈 값이 덮지 않게 한다.
    guardian_phone          = coalesce(excluded.guardian_phone, public.profiles.guardian_phone),
    guardian_consent        = excluded.guardian_consent or coalesce(public.profiles.guardian_consent, false),
    -- 생년월일·성별·소속도 같은 원칙 — 재호출(예: 재시도)로 이번엔 비어 온 값이
    -- 이전에 채워진 값을 지우지 않게 한다.
    birth_date              = coalesce(excluded.birth_date, public.profiles.birth_date),
    gender                  = coalesce(excluded.gender, public.profiles.gender),
    tenant_id               = coalesce(excluded.tenant_id, public.profiles.tenant_id),
    updated_at              = now();

  -- 인증 기록을 소비 처리한다. 같은 인증으로 두 번 가입할 수 없게 한다.
  if v_pv_id is not null then
    update public.phone_verifications
    set consumed_at = now()
    where id = v_pv_id;
  end if;

  -- 본인확인도 같은 원칙으로 소비하고, 이제서야 생긴 계정과 잇는다.
  -- user_id를 여기서 채우는 이유는 가입 전 인증이라 그 시점엔 계정이 없어서다([11]).
  if v_iv_id is not null then
    update public.identity_verifications
    set consumed_at = now(),
        user_id     = v_user_id
    where id = v_iv_id;
  end if;

  -- 약관 동의 이력 (버전 단위).
  insert into public.user_term_agreements (user_id, term_id, agreed)
  select
    v_user_id,
    t.id,
    case
      when t.code ~ '_identity$'                        then coalesce(p_identity_required_agreed, false)
      when t.profile_column = 'terms_service_agreed'    then coalesce(p_terms_service_agreed, false)
      when t.profile_column = 'privacy_required_agreed' then coalesce(p_privacy_required_agreed, false)
      when t.profile_column = 'marketing_agreed'        then coalesce(p_marketing_agreed, false)
      when t.profile_column = 'ads_agreed'              then coalesce(p_ads_agreed, false)
      else false
    end
  from public.terms t
  where t.is_active
    and t.audience in (v_member_type, 'common')
  on conflict (user_id, term_id) do update
  set agreed    = excluded.agreed,
      agreed_at = now();

  -- 학생 연결코드: 없을 때만 발급한다(재호출로 코드가 회전하면 안 된다).
  if v_member_type = 'student' then
    select code into v_link_code
    from public.student_link_codes
    where student_id = v_user_id
      and is_active;

    if v_link_code is null then
      v_link_code := public.issue_student_link_code(v_user_id);
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', v_user_id,
    'email', v_email,
    'member_type', v_member_type,
    'under14', v_under14,
    'link_code', v_link_code   -- 학생이 아니면 null
  );
end;
$_$;

comment on function public.complete_signup_profile(
  "text", "text", "text", "text", "text", "text", "text", "text",
  boolean, boolean, boolean, boolean, boolean, boolean,
  "text", boolean, "text", "date", "text", "text"
) is
  '회원가입 프로필 완성 RPC(20260903041457 학생/학부모 번호 분기 최신본 기준). 2026-09-22 — p_org_code(파라미터명 유지)는 이제 8자 tenant 코드로 해석된다: fn_resolve_tenant_code 로 정규화·조회하고(레이트리밋 WC068은 그 함수가 던지고, 못 찾으면 NULL 을 돌려준다) profiles.tenant_id 에 저장한다(org_code 컬럼에는 더 이상 쓰지 않는다). app_settings.require_tenant_on_signup 이 true 인데 코드가 없거나 못 찾으면 WC073(필수가 아니면 잘못된 코드는 무시). fn_profiles_lock_tenant(20260922) 트리거를 통과시키려고 upsert 직전 app.tenant_set_via_rpc 를 켠다. 나머지(학생 본인 번호 없을 시 guardian_phone 정본화, 14세 미만 PASS 본인확인, 전화번호 인증·중복 검사 등)는 원문 그대로다.';

REVOKE ALL ON FUNCTION "public"."complete_signup_profile"("p_name" "text", "p_username" "text", "p_phone" "text", "p_email" "text", "p_region" "text", "p_school_type" "text", "p_school_name" "text", "p_member_type" "text", "p_terms_service_agreed" boolean, "p_privacy_required_agreed" boolean, "p_identity_required_agreed" boolean, "p_privacy_optional_agreed" boolean, "p_marketing_agreed" boolean, "p_ads_agreed" boolean, "p_guardian_phone" "text", "p_guardian_consent" boolean, "p_identity_request_id" "text", "p_birth_date" "date", "p_gender" "text", "p_org_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_signup_profile"("p_name" "text", "p_username" "text", "p_phone" "text", "p_email" "text", "p_region" "text", "p_school_type" "text", "p_school_name" "text", "p_member_type" "text", "p_terms_service_agreed" boolean, "p_privacy_required_agreed" boolean, "p_identity_required_agreed" boolean, "p_privacy_optional_agreed" boolean, "p_marketing_agreed" boolean, "p_ads_agreed" boolean, "p_guardian_phone" "text", "p_guardian_consent" boolean, "p_identity_request_id" "text", "p_birth_date" "date", "p_gender" "text", "p_org_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_signup_profile"("p_name" "text", "p_username" "text", "p_phone" "text", "p_email" "text", "p_region" "text", "p_school_type" "text", "p_school_name" "text", "p_member_type" "text", "p_terms_service_agreed" boolean, "p_privacy_required_agreed" boolean, "p_identity_required_agreed" boolean, "p_privacy_optional_agreed" boolean, "p_marketing_agreed" boolean, "p_ads_agreed" boolean, "p_guardian_phone" "text", "p_guardian_consent" boolean, "p_identity_request_id" "text", "p_birth_date" "date", "p_gender" "text", "p_org_code" "text") TO "service_role";

-- ---------------------------------------------------------------------
-- 9) admin_refund_ledger 뷰 — 끝에 tenant_name 추가(기존 컬럼 순서·이름 유지)
-- ---------------------------------------------------------------------

create or replace view public.admin_refund_ledger
with (security_invoker = on)
as
select
  r.id,
  r.completed_at,
  r.order_id,
  coalesce(student.name, payer.name)          as student_name,
  -- 소속코드는 학생 기준이다(단체 할인·정산 귀속이 학생을 따른다).
  coalesce(student.org_code, payer.org_code)  as org_code,
  r.order_name                                as program_name,
  o.amount                                    as paid_amount,
  r.amount                                    as refund_amount,
  r.refund_method,
  handler.name                                as processed_by_name,
  r.reason,
  r.admin_memo,
  r.status,
  tenant.name                                 as tenant_name
from public.refund_requests r
left join public.orders   o       on o.id = r.order_id
left join public.profiles student on student.id = r.student_profile_id
left join public.profiles payer   on payer.id   = r.user_id
left join public.profiles handler on handler.id = r.processed_by
left join public.tenants  tenant  on tenant.id  = coalesce(student.tenant_id, payer.tenant_id)
where r.status = 'completed';

comment on view public.admin_refund_ledger is
  '「환불 처리 대장」 화면의 원천(20260831081100, 파일18 기준). 완료된 환불만 싣는다 — 처리 중인 건은 환불 신청 내역 화면이 본다. security_invoker=on 이라 refund_requests 의 RLS 가 그대로 적용된다. 2026-09-22 — tenant_name(학생 우선, 없으면 결제자 tenant_id 기준) 컬럼을 끝에 추가했다. 기존 org_code 컬럼은 그대로 유지한다(drop 은 후속 PR).';

grant select on public.admin_refund_ledger to authenticated;

-- ---------------------------------------------------------------------
-- 10) app_settings — require_tenant_on_signup 기본값(false, 멱등)
-- ---------------------------------------------------------------------

insert into public.app_settings (key, value)
values ('require_tenant_on_signup', 'false'::jsonb)
on conflict (key) do nothing;
