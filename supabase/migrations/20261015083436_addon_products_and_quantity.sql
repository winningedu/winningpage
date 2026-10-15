-- 추가 이용권 상품 플래그(addon_only)와 회차권 수량 부여
--
-- 왜: 이용 중인 학생이 1회 2,000원 추가 이용권을 수량 단위로 살 수 있어야 한다.
--   (a) products.addon_only 로 추가 이용권 상품을 구분한다.
--   (b) fn_request_enrollment 가 추가 이용권은 살아있는 부여(WC067)와 수량 1~10(WC068)을,
--       일반 상품은 수량 1(WC068)을 서버에서 강제한다.
--   (c) fn_grant_program_access_for_order 가 회차권 수량 > 1 을 granted_sessions 에 곱해 부여하고
--       추가 이용권은 결제일에 시작한다.
--   (d) fn_parent_create_enrollment 는 추가 이용권을 거부한다(WC067).
-- 함수 시그니처와 권한(create or replace 는 기존 grant 유지)은 바꾸지 않는다.

alter table public.products
  add column if not exists addon_only boolean not null default false;

comment on column public.products.addon_only is
  '추가 이용권 여부. true 면 해당 program_key 의 살아있는 부여가 있는 학생만 주문할 수 있고(WC067) 수량 1~10 을 허용한다(WC068). false 는 수량 1 고정.';

create or replace function public.fn_grant_program_access_for_order(
  p_order_id text,
  p_user_id uuid,
  p_paid_at timestamp with time zone default null,
  p_restore_revoked boolean default false
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_order        public.orders;
  v_existing     public.program_access;
  v_item         record;
  v_bundle       record;
  v_paid_at      timestamptz;
  v_anchor       timestamptz;
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
  v_anchor  := public.fn_kst_day_start(v_paid_at);

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
          public.fn_add_months_kst(v_start, v_bundle.duration_months),
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

    -- 만료 파생(20260901 Ver10, §2-7) — 기간(개월)이 있으면 KST 달력 개월
    -- 덧셈, 없고 유효기간(일)이 있으면 시작 + 일수, 둘 다 없으면 무기한.
    -- fn_add_months_kst 는 p_months NULL 이면 NULL 을 돌려주는 규약이라
    -- coalesce 로 두 축이 자연스럽게 이어진다.
    v_expires := coalesce(
      public.fn_add_months_kst(v_start, v_item.duration_months),
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

comment on function public.fn_grant_program_access_for_order(text, uuid, timestamp with time zone, boolean) is
  '주문 하나에 대해 이용 권한을 부여한다(sql/69 재작성 + 20260901001438 유효기간 + 20260901 부산캠퍼스 번들). product_id 가 bundle_items 에 행을 가진 라인은 그 행별로 program_access_grants 를 부여한다(program_key/duration_months/session_quota/validity_days 는 bundle_items 값, paid_amount 는 list_price 비율 안분 + program_key 오름차순 마지막 행 잔차 흡수), 없으면 기존 스칼라 경로(products.program_key/duration_months/session_quota) 그대로. 멱등 가드(already_granted), 복구 가드(revoked_not_restored)는 (order_item_id, program_key) 단위로 판정해 번들 2, 3번째 권한이 첫 권한 존재만으로 skip 되지 않게 한다(단일 상품 경로는 program_key 가 하나뿐이라 의미 동일, 동작 불변). 기간(duration_months)이 없는 상품은 validity_days(1회권 30일 등)를 expires_at = starts_at + N일 로 환산한다. 그 외(R2c 상태 가드, R7 원장 기반 restore_revoked, 라인별 skipped, WC010~012, 체이닝, suspended 판정)는 이전 정본과 동일. 추가: 회차권(session_quota 있고 duration_months 없는 단일 상품)은 quantity > 1 을 허용해 granted_sessions = session_quota × quantity 로 부여하고, 그 밖의 quantity > 1 은 unsupported_quantity 로 건너뛴다. addon_only 상품은 기존 부여 만료 뒤로 미루지 않고 결제일(KST 자정)에 시작한다.';

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
  v_addon           record;
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

  -- 추가 이용권(addon_only) 및 수량 검증. 추가 이용권은 같은 program_key 의
  -- 살아있는 부여가 있는 학생만 주문할 수 있고 수량 1~10, 그 외 상품은 수량 1 만 허용한다.
  for v_addon in
    select p.addon_only, p.program_key,
           coalesce((it ->> 'quantity')::integer, 1) as quantity
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as it
      join public.products p on p.id = (it ->> 'product_id')::uuid
  loop
    if v_addon.addon_only and not exists (
      select 1 from public.program_access_grants g
       where g.profile_id  = p_student_profile_id
         and g.program_key = v_addon.program_key
         and g.revoked_at is null
         and (g.expires_at is null or g.expires_at > now())
    ) then
      raise exception 'addon_requires_live_grant' using errcode = 'WC067';
    end if;

    if (v_addon.addon_only and (v_addon.quantity < 1 or v_addon.quantity > 10))
       or (not v_addon.addon_only and v_addon.quantity <> 1) then
      raise exception 'invalid_quantity' using errcode = 'WC068';
    end if;
  end loop;

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
  '학생이 수강신청(주문)을 생성한다(sql/76, WC043 중복 열린 요청 차단 제거, 2026-09-01 org 한정 상품 서버 검증). 한 학생이 승인 대기 요청을 여러 건 가질 수 있다. 동시 이중 신청 방지는 학생 축 advisory lock(salt 101)이 계속 담당한다. p_items 의 product_id 가 org_code/sale_ends_at 을 가진 상품이면 소속 불일치(WC064), 판매 마감(WC065), 학생당 1회 구매 제한 초과(WC066)를 여기서 재검증한다(클라이언트가 넘긴 p_items 를 신뢰하지 않는다). 나머지 가드(쌍 필수 WC019, 동일인 금지 WC020, 링크 검증 WC042, 0원 이하 WC001)는 sql/71 원문과 동일하다. auth.uid() 는 참조하지 않는다, 신뢰 경계는 호출자(api/request-enrollment.js)다. 2026-09-22 org_code text 비교를 tenant_id 비교로 전환. 추가 이용권: addon_only 상품은 같은 program_key 의 살아있는 부여가 없으면 WC067, 수량은 addon_only 1~10 / 그 외 정확히 1 이며 위반하면 WC068.';

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

  -- 추가 이용권은 학생 요청을 그대로 승인하는 경로로만 결제한다. 학부모
  -- 대체 구성에는 낼 수 없다.
  if exists (
    select 1 from public.products p
     where p.id = any (v_product_ids) and p.addon_only
  ) then
    raise exception 'addon_requires_live_grant' using errcode = 'WC067';
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
  '학부모가 학생의 미응답 수강신청 요청(status=pending, approval_status=requested)을 자신이 고른 상품 구성으로 대체해 즉시 approved 상태의 새 주문을 만든다(sql/85 + 20260825 is_orderable 게이트 + 2026-09-01 org 한정 상품 서버 검증). 호출자는 그 주문의 parent_profile_id 여야 하고(WC052) 원래 요청이 여전히 미응답이어야 한다(WC053). fn_is_linked_pair 로 쌍을 재검증한다(WC055, sql/71 WC042 와 동일 헬퍼). 선택 상품은 is_active=true 이고 is_orderable=true 인 것만 허용하며 하나라도 비활성/주문불가/존재하지 않으면 거부한다(WC056). org_code/sale_ends_at 을 가진 상품이면 소속 불일치(WC064), 판매 마감(WC065), 학생당 1회 구매 제한 초과(WC066)를 재검증한다. discount_amount 가 음수면 WC001 로 거부한다(orders_discount_amount_check 사전 방어). 대표 상품명(order_name)은 카탈로그 정렬(service_sort_order, sort_order)로 결정적으로 고른다. 새 주문은 쿠폰을 받지 않는다(coupon_id NULL, 범위 밖). 원래 주문은 approval_status=superseded, status=canceled, superseded_by_order_id=새 주문 id 로 종결된다, reject_reason 은 세팅하지 않는다(orders_reject_reason_pairing_check 상 NULL 유지 필요), responded_at 은 함께 세팅한다(orders_responded_at_pairing_check 상 필수). 같은 학생의 다른 열린 요청(sql/76 이 허용하는, 다른 서비스에 걸친 동시 pending/requested 요청) 중 이번에 선택된 상품과 service_key 가 겹치는 것도 함께 superseded 처리해 나중에 독립 승인될 때 같은 서비스가 중복 결제되는 것을 막는다. 2026-09-22 org_code text 비교를 tenant_id 비교로 전환. 추가 이용권: 선택 상품에 addon_only 가 하나라도 있으면 WC067 로 거부한다(추가 이용권은 학생 요청을 그대로 승인하는 경로로만 결제).';
