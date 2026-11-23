-- UTC 전환 U4b: 이용 기간 부여와 환불 월 단계를 구매자 시간대(profiles.time_zone)로 계산한다.
-- 서명, 권한(grant), 코멘트는 그대로다(create or replace 가 유지).

CREATE OR REPLACE FUNCTION "public"."fn_grant_program_access_for_order"("p_order_id" "text", "p_user_id" "uuid", "p_paid_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_restore_revoked" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_order        public.orders;
  v_existing     public.program_access;
  v_item         record;
  v_bundle       record;
  v_paid_at      timestamptz;
  v_anchor       timestamptz;
  v_tz           text;
  v_start        timestamptz;
  v_expires      timestamptz;
  v_key          text;
  v_item_count   int    := 0;
  v_inserted     int    := 0;
  v_is_bundle    boolean;
  v_total_list   numeric;
  v_alloc        integer;
  v_skipped      jsonb  := '[]'::jsonb;
  v_service_keys text[] := '{}';
  v_blocked      text[] := '{}';
  v_keys         text[] := '{}';
  v_sync         jsonb  := '[]'::jsonb;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'WC010';
  end if;

  -- 결제자(학부모) 확인. p_user_id 는 호출부가 orders.user_id(=parent_
  -- profile_id, orders_user_id_is_parent_check)를 그대로 넘긴다.
  if v_order.parent_profile_id is distinct from p_user_id then
    raise exception 'order_user_mismatch' using errcode = 'WC011';
  end if;

  -- 2-a) R2c 상태 가드. 미승인·미결제 주문에는 권한을 줄 수 없다.
  if v_order.status <> 'paid' then
    raise exception 'order_not_paid'
      using errcode = 'WC033',
            detail  = format('order_id=%s status=%s', p_order_id, v_order.status);
  end if;

  -- 도달 불가에 가까운 방어적 가드(orders_approval_before_payment_check 가
  -- 이미 묶어 둔다) — baseline 원문 유지.
  if v_order.approval_status <> 'approved' then
    raise exception 'order_not_approved'
      using errcode = 'WC034',
            detail  = format('order_id=%s approval_status=%s', p_order_id, v_order.approval_status);
  end if;

  if v_order.student_profile_id is null then
    return jsonb_build_object(
      'ok', true, 'granted', '[]'::jsonb, 'service_keys', '[]'::jsonb,
      'skipped', jsonb_build_array(jsonb_build_object('reason', 'order_has_no_user')),
      'ledger_inserted', 0, 'synced', '[]'::jsonb);
  end if;

  -- 부여 대상(학생) 단위로 부여·회수를 직렬화한다(sql/64 salt=101).
  perform pg_advisory_xact_lock(hashtextextended(v_order.student_profile_id::text, 101));

  v_paid_at := coalesce(p_paid_at, v_order.paid_at, now());
  -- 구매자(결제한 학부모)의 시간대. 이용 기간의 하루, 개월 경계가 이 시간대 기준이다.
  select pr.time_zone into v_tz from public.profiles pr where pr.id = v_order.parent_profile_id;
  v_anchor  := public.fn_day_start(public.fn_local_date(v_paid_at, v_tz), v_tz);

  select count(*) into v_item_count from public.order_items where order_id = p_order_id;
  if v_item_count = 0 then
    return jsonb_build_object(
      'ok', false, 'error', 'no_order_items', 'granted', '[]'::jsonb,
      'service_keys', '[]'::jsonb, 'skipped', '[]'::jsonb,
      'ledger_inserted', 0, 'synced', '[]'::jsonb);
  end if;

  for v_item in
    select oi.id as order_item_id, oi.quantity, oi.price,
           oi.product_slug, oi.service_key,
           p.id as product_id, p.program_key, p.duration_months, p.session_quota,
           p.validity_days, p.addon_only
      from public.order_items oi
      left join public.products p
             on p.id = oi.product_id
             or (oi.product_id is null and p.slug = oi.product_slug)
     where oi.order_id = p_order_id
     order by oi.id asc
  loop
    if v_item.service_key is not null
       and not (v_item.service_key = any(v_service_keys)) then
      v_service_keys := v_service_keys || v_item.service_key;
    end if;

    select exists(
      select 1 from public.bundle_items bi where bi.product_id = v_item.product_id
    ) into v_is_bundle;

    if not v_is_bundle and v_item.program_key is null then
      v_skipped := v_skipped || jsonb_build_object(
        'order_item_id', v_item.order_item_id, 'product_slug', v_item.product_slug,
        'service_key', v_item.service_key, 'program_key', null,
        'reason', 'no_program_key_mapping');
      continue;
    end if;

    -- 수량 > 1 은 회차권(session_quota 있고 duration_months 없는 단일 상품)만 허용한다.
    if v_item.quantity <> 1
       and (v_is_bundle or v_item.session_quota is null or v_item.duration_months is not null) then
      v_skipped := v_skipped || jsonb_build_object(
        'order_item_id', v_item.order_item_id, 'product_slug', v_item.product_slug,
        'service_key', v_item.service_key, 'program_key', v_item.program_key,
        'reason', 'unsupported_quantity');
      continue;
    end if;

    if not v_is_bundle
       and v_item.duration_months is null and v_item.session_quota is null then
      raise exception 'product_entitlement_spec_missing'
        using errcode = 'WC012',
              detail  = format('order_item_id=%s product_slug=%s program_key=%s',
                               v_item.order_item_id, v_item.product_slug, v_item.program_key);
    end if;

    if v_is_bundle then
      -- 번들 분기 — bundle_items 행별로 부여한다. paid_amount 는 list_price
      -- 비율 안분(반올림), 마지막 행(program_key 오름차순)이 잔차를 흡수해
      -- 합계가 라인 결제액(price*quantity)과 정확히 일치하게 한다.
      select coalesce(sum(bi.list_price), 0) into v_total_list
        from public.bundle_items bi
       where bi.product_id = v_item.product_id;

      for v_bundle in
        select bi.program_key, bi.duration_months, bi.session_quota, bi.validity_days,
               row_number() over (order by bi.program_key) as rn,
               count(*) over () as cnt,
               coalesce(
                 sum(round(bi.list_price::numeric * (v_item.price * v_item.quantity) / nullif(v_total_list, 0)))
                   over (order by bi.program_key rows between unbounded preceding and 1 preceding),
                 0
               )::int as prior_alloc,
               round(bi.list_price::numeric * (v_item.price * v_item.quantity) / nullif(v_total_list, 0))::int as row_alloc
          from public.bundle_items bi
         where bi.product_id = v_item.product_id
         order by bi.program_key
      loop
        v_alloc := case when v_bundle.rn = v_bundle.cnt
                        then (v_item.price * v_item.quantity) - v_bundle.prior_alloc
                        else v_bundle.row_alloc
                   end;

        select * into v_existing
          from public.program_access
         where id = v_order.student_profile_id and program_key = v_bundle.program_key
           for update;

        if found and v_existing.access_status = 'suspended' then
          v_skipped := v_skipped || jsonb_build_object(
            'order_item_id', v_item.order_item_id, 'product_slug', v_item.product_slug,
            'service_key', v_item.service_key, 'program_key', v_bundle.program_key,
            'reason', 'suspended_by_admin');
          if not (v_bundle.program_key = any(v_blocked)) then
            v_blocked := v_blocked || v_bundle.program_key;
          end if;
          continue;
        end if;

        if not p_restore_revoked
           and exists (
             select 1 from public.program_access_grants g
              where g.order_item_id = v_item.order_item_id
                and g.program_key = v_bundle.program_key
                and g.revoked_at is not null
           ) then
          v_skipped := v_skipped || jsonb_build_object(
            'order_item_id', v_item.order_item_id, 'product_slug', v_item.product_slug,
            'service_key', v_item.service_key, 'program_key', v_bundle.program_key,
            'reason', 'revoked_not_restored');
          if not (v_bundle.program_key = any(v_blocked)) then
            v_blocked := v_blocked || v_bundle.program_key;
          end if;
          continue;
        end if;

        if exists (
          select 1 from public.program_access_grants g
           where g.order_item_id = v_item.order_item_id
             and g.program_key = v_bundle.program_key
             and g.revoked_at is null
        ) then
          v_skipped := v_skipped || jsonb_build_object(
            'order_item_id', v_item.order_item_id, 'product_slug', v_item.product_slug,
            'service_key', v_item.service_key, 'program_key', v_bundle.program_key,
            'reason', 'already_granted');
          continue;
        end if;

        select greatest(v_anchor, max(g.expires_at)) into v_start
          from public.program_access_grants g
         where g.profile_id  = v_order.student_profile_id
           and g.program_key = v_bundle.program_key
           and g.revoked_at is null;
        v_start := coalesce(v_start, v_anchor);

        v_expires := coalesce(
          public.fn_add_months(v_start, v_bundle.duration_months, v_tz),
          case when v_bundle.validity_days is not null
               then v_start + make_interval(days => v_bundle.validity_days)
          end);

        insert into public.program_access_grants (
          profile_id, program_key, order_id, order_item_id,
          product_id, product_slug, granted_by,
          granted_months, granted_sessions, paid_amount, starts_at, expires_at,
          validity_days
        ) values (
          v_order.student_profile_id, v_bundle.program_key, p_order_id, v_item.order_item_id,
          v_item.product_id, v_item.product_slug, 'payment',
          v_bundle.duration_months, v_bundle.session_quota,
          v_alloc,
          v_start, v_expires,
          v_bundle.validity_days
        );
        v_inserted := v_inserted + 1;
      end loop;

      continue;
    end if;

    -- 스칼라 경로(기존 단일 권한 상품) — 가드 키만 (order_item_id,
    -- program_key) 로 좁혔을 뿐 v_item.program_key 는 이 라인의 유일한
    -- 권한이라 결과는 원문과 동일하다.
    select * into v_existing
      from public.program_access
     where id = v_order.student_profile_id and program_key = v_item.program_key
       for update;

    if found and v_existing.access_status = 'suspended' then
      v_skipped := v_skipped || jsonb_build_object(
        'order_item_id', v_item.order_item_id, 'product_slug', v_item.product_slug,
        'service_key', v_item.service_key, 'program_key', v_item.program_key,
        'reason', 'suspended_by_admin');
      if not (v_item.program_key = any(v_blocked)) then
        v_blocked := v_blocked || v_item.program_key;
      end if;
      continue;
    end if;

    -- 2-b) R7 — restore_revoked 판정을 원장(program_access_grants)으로.
    if not p_restore_revoked
       and exists (
         select 1 from public.program_access_grants g
          where g.order_item_id = v_item.order_item_id
            and g.program_key = v_item.program_key
            and g.revoked_at is not null
       ) then
      v_skipped := v_skipped || jsonb_build_object(
        'order_item_id', v_item.order_item_id, 'product_slug', v_item.product_slug,
        'service_key', v_item.service_key, 'program_key', v_item.program_key,
        'reason', 'revoked_not_restored');
      if not (v_item.program_key = any(v_blocked)) then
        v_blocked := v_blocked || v_item.program_key;
      end if;
      continue;
    end if;

    if exists (
      select 1 from public.program_access_grants g
       where g.order_item_id = v_item.order_item_id
         and g.program_key = v_item.program_key
         and g.revoked_at is null
    ) then
      v_skipped := v_skipped || jsonb_build_object(
        'order_item_id', v_item.order_item_id, 'product_slug', v_item.product_slug,
        'service_key', v_item.service_key, 'program_key', v_item.program_key,
        'reason', 'already_granted');
      continue;
    end if;

    select greatest(v_anchor, max(g.expires_at)) into v_start
      from public.program_access_grants g
     where g.profile_id  = v_order.student_profile_id
       and g.program_key = v_item.program_key
       and g.revoked_at is null;
    v_start   := coalesce(v_start, v_anchor);

    -- 추가 이용권은 기존 부여 만료 뒤로 미루지 않고 결제일에 시작한다.
    if v_item.addon_only then
      v_start := v_anchor;
    end if;

    -- 만료 파생(20260901 Ver10, §2-7) — 기간(개월)이 있으면 구매자 시간대 달력 개월
    -- 덧셈, 없고 유효기간(일)이 있으면 시작 + 일수, 둘 다 없으면 무기한.
    -- fn_add_months 는 p_months NULL 이면 NULL 을 돌려주는 규약이라
    -- coalesce 로 두 축이 자연스럽게 이어진다.
    v_expires := coalesce(
      public.fn_add_months(v_start, v_item.duration_months, v_tz),
      case when v_item.validity_days is not null
           then v_start + make_interval(days => v_item.validity_days)
      end);

    insert into public.program_access_grants (
      profile_id, program_key, order_id, order_item_id,
      product_id, product_slug, granted_by,
      granted_months, granted_sessions, paid_amount, starts_at, expires_at,
      validity_days
    ) values (
      v_order.student_profile_id, v_item.program_key, p_order_id, v_item.order_item_id,
      v_item.product_id, v_item.product_slug, 'payment',
      v_item.duration_months, v_item.session_quota * coalesce(v_item.quantity, 1),
      coalesce(v_item.price, 0) * coalesce(v_item.quantity, 1),
      v_start, v_expires,
      v_item.validity_days
    );
    v_inserted := v_inserted + 1;
  end loop;

  select coalesce(array_agg(distinct g.program_key), '{}')
    into v_keys
    from public.program_access_grants g
   where g.order_id = p_order_id
     and g.revoked_at is null
     and not (g.program_key = any(v_blocked));

  foreach v_key in array v_keys loop
    v_sync := v_sync || public.fn_sync_program_access_cache(v_order.student_profile_id, v_key, null);
  end loop;

  return jsonb_build_object(
    'ok',              true,
    'granted',         to_jsonb(v_keys),
    'service_keys',    to_jsonb(v_service_keys),
    'skipped',         v_skipped,
    'ledger_inserted', v_inserted,
    'synced',          v_sync
  );
end;
$$;

CREATE OR REPLACE FUNCTION "public"."fn_refund_quote"("p_order_id" "text", "p_order_item_ids" bigint[] DEFAULT NULL::bigint[], "p_company_fault" boolean DEFAULT false, "p_at" timestamp with time zone DEFAULT "now"()) RETURNS TABLE("order_id" "text", "gross_amount" integer, "refund_amount" integer, "fee_amount" integer, "started" boolean, "needs_review" boolean, "policy_code" "text", "lines" "jsonb", "scope" "text", "terms_version" "text", "within_withdrawal" boolean, "company_fault" boolean, "bundle_return_amount" integer, "coupon_restore" boolean)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_order        public.orders;
  v_caller       uuid := auth.uid();
  v_items        bigint[];
  v_scope        text;
  v_sum_list     bigint := 0;   -- 정가 합계액(주문의 모든 order_items, 회수 라인 포함)
  v_grant_count  integer := 0;  -- 대상 라인 수
  v_live_count   integer := 0;  -- 주문 전체의 살아있는 라인 수
  v_line_list    integer;       -- 개별 정가
  v_line_paid    integer;       -- 안분결제액 P_i
  v_step2        integer;       -- 제33조의1 적용 결과(공제 전)
  v_line_refund  integer;
  v_used         integer;
  v_ratio        numeric;
  v_months       integer;
  v_k            integer;       -- 완료 개월 수
  v_c            numeric;       -- 해당 월 계단 차감률(0 / 1/3 / 1/2 / 1)
  v_monthly      numeric;       -- L(정가 월액) 또는 M(안분 월액, ⑪ 예외)
  v_ms           timestamptz;
  v_me           timestamptz;
  v_wd           boolean;
  v_all_wd       boolean := true;
  v_all_before   boolean := true;
  v_cap          integer;
  v_code         text;
  v_started      boolean := false;
  v_review       boolean := false;
  v_sum_refund   bigint := 0;
  v_bundle_sum   integer := 0;
  v_codes        text[] := '{}';
  -- grant 단위 원본 라인(루프가 쌓는다) - order_item_id 로 다시 합쳐 v_lines 로
  -- 만든다(아래 "표시 라인 합산" 블록).
  v_grant_lines  jsonb := '[]'::jsonb;
  v_lines        jsonb := '[]'::jsonb;
  v_idx          integer := 0;
  v_restore      boolean := false;
  g              record;
  v_tz           text;
begin
  select * into v_order from public.orders o where o.id = p_order_id;

  -- 구매자(결제한 학부모)의 시간대. 부여 때와 같은 시간대로 월 단계를 센다.
  select pr.time_zone into v_tz from public.profiles pr where pr.id = v_order.parent_profile_id;

  -- 소유권 - fn_request_refund 와 같은 쌍 판정(존재 스캐닝 방지, Ver9 유지).
  if v_order.id is null
     or (v_caller is distinct from v_order.student_profile_id
         and v_caller is distinct from v_order.parent_profile_id
         and not public.is_admin()) then
    raise exception 'order_not_found_or_not_owned' using errcode = 'WC005';
  end if;

  if v_order.status <> 'paid' then
    raise exception 'order_not_refundable' using errcode = 'WC006';
  end if;

  -- 대상 항목 정규화 - 중복 제거. 빈 배열은 신청이 아니다.
  if p_order_item_ids is not null then
    select array_agg(distinct x order by x) into v_items
      from unnest(p_order_item_ids) x;
    if v_items is null then
      raise exception 'refund_items_invalid'
        using errcode = 'WC060', detail = 'order_item_ids is empty';
    end if;
    -- 주문 밖의 항목은 거부한다.
    if exists (
      select 1 from unnest(v_items) x
       where not exists (
         select 1 from public.order_items oi
          where oi.id = x and oi.order_id = p_order_id)
    ) then
      raise exception 'refund_items_invalid'
        using errcode = 'WC060',
              detail  = format('order_id=%s items=%s - 주문에 속하지 않는 항목', p_order_id, v_items);
    end if;
    -- 살아있는 부여가 없는 항목(이미 회수됐거나 부여 자체가 없던 라인)은
    -- 환불할 실체가 없다.
    if exists (
      select 1 from unnest(v_items) x
       where not exists (
         select 1 from public.program_access_grants pg
          where pg.order_item_id = x and pg.revoked_at is null)
    ) then
      raise exception 'refund_items_invalid'
        using errcode = 'WC060',
              detail  = format('order_id=%s items=%s - 살아있는 부여가 없는 항목', p_order_id, v_items);
    end if;
  end if;

  select count(*) into v_live_count
    from public.program_access_grants pg
   where pg.order_id = p_order_id and pg.revoked_at is null
     and not (pg.paid_amount = 0
                and exists (select 1 from public.order_items gi
                             where gi.id = pg.order_item_id and gi.list_price > 0));

  -- 대상이 살아있는 라인 전부를 덮으면 주문 전체 신청으로 승격한다 -
  -- "전부 해지" 판정(⑦-5 다목, 제33조의3 ⑤)과 유니크 인덱스 축이 한
  -- 표현으로 모인다(§2-10). RefundRequestModal 의 전체 선택도 이 경로다.
  if v_items is not null
     and not exists (
       select 1 from public.program_access_grants pg
        where pg.order_id = p_order_id
          and pg.revoked_at is null
          and not (pg.paid_amount = 0
                and exists (select 1 from public.order_items gi
                             where gi.id = pg.order_item_id and gi.list_price > 0))
          and not (pg.order_item_id = any(v_items))
     ) then
    v_items := null;
  end if;

  v_scope := case when v_items is null then 'order' else 'items' end;

  -- 부여 원장이 없는 주문 - 산정 근거 없음. 전액 + 검토 플래그(Ver9 유지).
  if v_live_count = 0 then
    return query select
      v_order.id, v_order.amount, v_order.amount, 0,
      false, true, 'no_grant'::text, '[]'::jsonb,
      'order'::text, 'v10'::text, null::boolean, p_company_fault, 0, false;
    return;
  end if;

  -- 정가 합계액(제33조의2 ⑤ 분모) - 주문의 모든 order_items. 회수된 라인도
  -- 포함한다: 분모는 주문 시점에 고정돼야 부분환불을 거듭해도 배분이 흔들리지
  -- 않는다(§3-1 1단계).
  select coalesce(sum(oi.list_price::bigint * oi.quantity), 0) into v_sum_list
    from public.order_items oi
   where oi.order_id = p_order_id;

  select count(*) into v_grant_count
    from public.program_access_grants pg
   where pg.order_id = p_order_id
     and pg.revoked_at is null
     and not (pg.paid_amount = 0
                and exists (select 1 from public.order_items gi
                             where gi.id = pg.order_item_id and gi.list_price > 0))
     and (v_items is null or pg.order_item_id = any(v_items));

  for g in
    select pg.id, pg.program_key, pg.product_slug, pg.paid_amount,
           pg.granted_months, pg.granted_sessions, pg.validity_days,
           pg.starts_at, pg.expires_at, pg.first_accessed_at,
           pg.order_item_id,
           oi.list_price, oi.quantity, oi.name as item_name
      from public.program_access_grants pg
      left join public.order_items oi on oi.id = pg.order_item_id
     where pg.order_id = p_order_id
       and pg.revoked_at is null
       and not (pg.paid_amount = 0
                and exists (select 1 from public.order_items gi
                             where gi.id = pg.order_item_id and gi.list_price > 0))
       and (v_items is null or pg.order_item_id = any(v_items))
     order by pg.id
  loop
    v_idx := v_idx + 1;

    v_line_list := coalesce(g.list_price, 0) * coalesce(g.quantity, 1);

    -- 1/2단계 - 안분결제액 P_i = 실결제액 × 개별 정가 / 정가 합계액, 절상
    -- (제33조의2 ⑤, ※ 절상 차액은 회사 부담). 정가 0 라인은 무상 취득분
    -- (제33조의3 ⑥) - 배분 0. 정가 합계 0은 orders_amount_check 상 도달
    -- 불가지만, 그래도 오면 사람이 보게 검토 플래그만 세운다.
    if v_sum_list > 0 then
      v_line_paid := ceil(v_order.amount::numeric * v_line_list / v_sum_list)::integer;
    else
      v_line_paid := ceil(v_order.amount::numeric / v_grant_count)::integer;
      v_review := true;
    end if;

    -- 청약철회기간(제32조 ①, 7일) - 기산은 이용 가능일(starts_at)과 결제
    -- 시각 중 늦은 쪽(§2-9: 재구매 체이닝으로 starts_at 이 미래일 수 있다).
    v_wd := p_at < greatest(g.starts_at, coalesce(v_order.paid_at, g.starts_at))
                   + interval '7 days';

    -- 회차 순소비(Ver9 유지).
    select coalesce(sum(-l.delta), 0)::integer into v_used
      from public.performance_credit_ledger l
     where l.grant_id = g.id;

    v_started := v_started or v_used > 0 or g.first_accessed_at is not null;

    v_ratio   := null;
    v_k       := null;
    v_c       := null;
    v_monthly := null;

    if v_line_list = 0 and v_sum_list > 0 then
      -- 무상 취득분(제33조의3 ⑥) - 환불 대상 아님, 검토 대상도 아님(§2-2).
      v_step2 := 0;
      v_code  := 'free_item';

    elsif g.expires_at is not null and p_at >= g.expires_at then
      -- 유효기간/이용기간 만료(제33조의1 ⑤/⑥) - 잔여 가치 소멸.
      v_step2 := 0;
      v_code  := 'expired';

    elsif g.granted_sessions is not null then
      -- 회차제(⑧). 기간+회차 혼합 상품도 회차제다(⑧ 후문 단서 + 고객사
      -- 회신 8/31, §2-6) - 기간은 위 만료 축으로만 작동한다.
      if v_used <= 0 then
        v_step2 := v_line_paid;
        v_code  := 'before_start';
      elsif g.granted_sessions = 1 then
        -- 1회권 개시 후 청약철회 제한(④ + 제32조 ②).
        v_step2 := 0;
        v_code  := 'single_use_closed';
      else
        -- 회차 단가 × 미사용 잔여, 절상(⑧ + ⑤ ※).
        v_step2 := ceil(
          v_line_paid::numeric
          * greatest(g.granted_sessions - v_used, 0)
          / g.granted_sessions
        )::integer;
        v_code := 'sessions_prorated';
      end if;

    elsif g.first_accessed_at is null then
      -- 기간제 미개시 - 이용 시작 전 전액(②-1).
      v_step2 := v_line_paid;
      v_code  := 'before_start';

    else
      v_months := g.granted_months;

      if g.expires_at is null or g.expires_at <= g.starts_at then
        -- 무기한/비정상 기간은 경과율을 정의할 수 없다(Ver9 유지).
        v_step2 := v_line_paid;
        v_code  := 'period_unbounded';

      elsif v_months = 1 then
        -- 1개월 이내 과정 - ②-2 계단, 절상.
        v_ratio := extract(epoch from (p_at - g.starts_at))
                 / extract(epoch from (g.expires_at - g.starts_at));
        v_step2 := case
          when v_ratio < (1.0/3.0) then ceil(v_line_paid::numeric * 2 / 3)::integer
          when v_ratio < 0.5       then ceil(v_line_paid::numeric / 2)::integer
          else 0
        end;
        v_code := 'period_tier';

      else
        -- 1개월 초과 과정 - 환불 = max(0, P − L×(k+c)) (§2-4 권장 (a)=(b):
        -- ②-3호 월 계단과 ⑪ 정가 재산정을 어느 순서로 읽어도 같은 값).
        --   k = 완료 개월 수, c = 해당 월 계단 차감률(그 월 안의 경과율로
        --   ②-2와 같은 기준), L = 정가 월액. 회사 귀책/청약철회기간 내면
        --   ⑪ 예외 - L 을 안분결제 월액(M = P/N)으로 바꿔 같은 식을 쓴다.
        select count(*)::integer into v_k
          from generate_series(1, v_months) i
         where public.fn_add_months(g.starts_at, i, v_tz) <= p_at;
        v_k := least(v_k, v_months);

        v_ms := public.fn_add_months(g.starts_at, v_k, v_tz);
        if p_at > v_ms and v_k < v_months then
          v_me := public.fn_add_months(g.starts_at, v_k + 1, v_tz);
          v_ratio := extract(epoch from (p_at - v_ms))
                   / extract(epoch from (v_me - v_ms));
          v_c := case
            when v_ratio < (1.0/3.0) then 1.0/3.0
            when v_ratio < 0.5       then 0.5
            else 1.0
          end;
        else
          v_c := 0;
        end if;

        if p_company_fault or v_wd then
          v_monthly := v_line_paid::numeric / v_months;
          v_code    := 'period_monthly_tier_noreprice';
        else
          v_monthly := v_line_list::numeric / v_months;
          v_code    := 'period_monthly_tier';
        end if;

        v_step2 := ceil(greatest(0::numeric, v_line_paid - v_monthly * (v_k + v_c)))::integer;
      end if;
    end if;

    -- 3단계 - 제33조의2 ⑦ 동시결제 조건부 할인 반환금. 현 데이터 모델에는
    -- 조건부 할인 컬럼이 없어 항상 0(§2-5 확정 - ⑦-1이 장기할인/쿠폰을
    -- 명시 제외). 컬럼이 생기면 ⑦-2 산식 + ⑦-4 표시 전제 + ⑦-5 면제
    -- (회사 귀책 ∨ 철회기간 내 ∨ 전부 해지)를 여기서 계산한다.
    v_line_refund := greatest(0, v_step2);
    v_sum_refund  := v_sum_refund + v_line_refund;
    v_codes       := v_codes || v_code;
    v_all_wd      := v_all_wd and v_wd;
    v_all_before  := v_all_before and v_code = 'before_start';
    v_review      := v_review or v_code = 'period_unbounded';

    v_grant_lines := v_grant_lines || jsonb_build_object(
      'grant_id',          g.id,
      'order_item_id',     g.order_item_id,
      'program_key',       g.program_key,
      'product_slug',      g.product_slug,
      'item_name',         g.item_name,
      'list_price',        v_line_list,
      'paid_allocated',    v_line_paid,
      'list_amount',       v_line_list,
      'granted_months',    g.granted_months,
      'granted_sessions',  g.granted_sessions,
      'used_sessions',     v_used,
      'first_accessed_at', g.first_accessed_at,
      'expires_at',        g.expires_at,
      'within_withdrawal', v_wd,
      'elapsed_ratio',     v_ratio,
      'charge_months',     v_k,
      'month_tier',        case when v_c is null then null else round(v_c, 4) end,
      'monthly_list',      case when v_monthly is null then null
                                else round(v_monthly, 2) end,
      'step2_amount',      v_step2,
      'bundle_return',     0,
      'refund',            v_line_refund,
      'policy_code',       v_code
    );
  end loop;

  -- 표시 라인 합산 - order_item_id 단위로 grant 라인을 다시 묶는다(위 설명
  -- 주석 참고). grant 가 하나뿐인 order_item은 원본 라인을 그대로 내보내고,
  -- 여럿(번들)이면 금액을 합산한 라인 하나로 합친다.
  with numbered as (
    select row_number() over () as seq,
           elem,
           (elem->>'order_item_id')::bigint as item_id
      from jsonb_array_elements(v_grant_lines) elem
  ),
  grouped as (
    select
      item_id,
      count(*) as n,
      min(seq) as first_seq,
      (array_agg(elem order by seq))[1] as sole_elem,
      jsonb_build_object(
        'grant_id',          null,
        'order_item_id',     item_id,
        'program_key',       null,
        'product_slug',      null,
        'item_name',         min(elem->>'item_name'),
        'list_price',        sum((elem->>'list_price')::bigint),
        'paid_allocated',    sum((elem->>'paid_allocated')::bigint),
        'list_amount',       sum((elem->>'list_amount')::bigint),
        'granted_months',    null,
        'granted_sessions',  null,
        'used_sessions',     null,
        'first_accessed_at', null,
        'expires_at',        null,
        'within_withdrawal', bool_and((elem->>'within_withdrawal')::boolean),
        'elapsed_ratio',     null,
        'charge_months',     null,
        'month_tier',        null,
        'monthly_list',      null,
        'step2_amount',      sum((elem->>'step2_amount')::bigint),
        'bundle_return',     0,
        'refund',            sum((elem->>'refund')::bigint),
        'policy_code',       case when count(distinct elem->>'policy_code') = 1
                                   then min(elem->>'policy_code')
                                   else 'mixed' end
      ) as merged_elem
      from numbered
     group by item_id
  )
  select coalesce(
           jsonb_agg(
             case when n = 1 then sole_elem else merged_elem end
             order by first_seq
           ),
           '[]'::jsonb
         )
    into v_lines
    from grouped;

  -- 합산 - 100원 내림은 폐지(⑤ ※ 전면 절상). 클램프 상한은 누적 완료
  -- 환불을 반영한다(§3-1 8단계 - Ver9 는 orders.amount 만 봤다).
  v_cap := greatest(0, v_order.amount - public.fn_refund_completed_amount(p_order_id));
  v_sum_refund := greatest(0, least(v_sum_refund, v_cap));

  -- 전부 청약철회 쿠폰 복원(제33조의3 ⑤) - 주문 전체 + 모든 라인 철회기간
  -- 내 + 모든 라인 미개시 + 살아있는 쿠폰 사용이 있을 때.
  v_restore := v_scope = 'order'
    and v_all_wd
    and v_all_before
    and exists (
      select 1 from public.coupon_redemptions cr
       where cr.order_id = p_order_id and cr.voided_at is null);

  select case when count(distinct c) = 1 then min(c) else 'mixed' end
    into v_code
    from unnest(v_codes) c;

  return query select
    v_order.id,
    v_order.amount,
    v_sum_refund::integer,
    (v_order.amount - v_sum_refund)::integer,
    v_started,
    v_review,
    v_code,
    v_lines,
    v_scope,
    'v10'::text,
    v_all_wd,
    p_company_fault,
    v_bundle_sum,
    v_restore;
end;
$$;
