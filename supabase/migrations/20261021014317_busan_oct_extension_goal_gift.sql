-- 부산캠퍼스 10월 연장, 구성 6항목 확대, 목표관리 증정(수행평가 + 심화탐구)
--
-- 왜: 고객사 요청(부산캠퍼스 + 가격표 개정, QA 시트 3차 59/60행).
--   (a) 부산 9,900원 번들을 6항목(학습진단, 목표관리, 성장설계, 수행평가,
--       심화탐구, 자기평가)으로 넓히고 상품명에 "(1개월 이용권)"을 붙인다.
--   (b) 10월(KST) 결제분은 모든 부여가 11/30 까지 쓰이게 한다. 슬러그를
--       함수에 박지 않고 products 의 두 컬럼(만료 하한, 적용 결제 마감)으로
--       표현한다. 11월 결제부터는 일반 1개월/30일 규칙이다.
--   기존 주문은 같은 파일 아래 백필(A 10월 결제분 만료 연장, B 살아있는
--   부산 주문에 신규 3종 보충)로 맞춘다. 전부 멱등이다.
-- 함수 시그니처와 권한은 바꾸지 않는다.

alter table public.products
  add column if not exists grant_expires_floor_at timestamptz,
  add column if not exists grant_expires_floor_paid_before timestamptz;

alter table public.products
  drop constraint if exists products_grant_expires_floor_pair_check;
alter table public.products
  add constraint products_grant_expires_floor_pair_check
  check ((grant_expires_floor_at is null) = (grant_expires_floor_paid_before is null));

comment on column public.products.grant_expires_floor_at is
  '번들 부여 만료 하한. grant_expires_floor_paid_before 이전에 결제한 주문의 모든 부여는 expires_at = greatest(정상 계산 만료, 이 값)이다. 둘 다 NULL 이면 특례 없음.';
comment on column public.products.grant_expires_floor_paid_before is
  'grant_expires_floor_at 이 적용되는 결제 시각의 상한(미포함). grant_expires_floor_at 과 함께 설정한다.';

-- 부산 번들: 상품명, 설명, 10월 특례(10/31 24:00 KST 전 결제는 11/30 24:00 KST 까지).
update public.products
   set name = '9,900원 부산캠퍼스 특별할인 학습관리 서비스 (1개월 이용권)',
       service_desc = '위닝 부산캠퍼스 소속 회원 전용 특별할인 패키지입니다. 학습진단 1회, 목표관리 1개월, 성장설계 1회, 수행평가 2회, 심화탐구 2회, 자기평가 2회를 한 번의 결제로 이용할 수 있습니다.',
       grant_expires_floor_at = '2026-11-30T15:00:00Z',
       grant_expires_floor_paid_before = '2026-10-31T15:00:00Z'
 where slug = 'busan-9900';

insert into public.bundle_items (
  product_id, program_key, duration_months, session_quota, validity_days, list_price
)
select p.id, v.program_key, v.duration_months, v.session_quota, v.validity_days, v.list_price
  from public.products p
 cross join (values
   ('diagnose', null::int, 1,         30,        10000),
   ('target',   1,         null::int, null::int, 25000),
   ('growth',   null::int, 1,         30,        18000),
   ('suhaeng',  1,         2,         null::int, 5000),
   ('inquiry',  1,         2,         null::int, 5000),
   ('selfeval', 1,         2,         null::int, 7500)
 ) as v(program_key, duration_months, session_quota, validity_days, list_price)
 where p.slug = 'busan-9900'
on conflict (product_id, program_key) do update
  set duration_months = excluded.duration_months,
      session_quota   = excluded.session_quota,
      validity_days   = excluded.validity_days,
      list_price      = excluded.list_price;

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
           p.validity_days, p.addon_only,
           p.grant_expires_floor_at, p.grant_expires_floor_paid_before
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

        -- 상품이 정한 만료 하한(10월 특례) — 결제 시각이 기준 시각 전이면 정상
        -- 계산한 만료와 하한 중 늦은 쪽을 쓴다. 체이닝으로 이미 더 늦은 만료는
        -- greatest 가 그대로 둔다.
        if v_item.grant_expires_floor_at is not null
           and v_paid_at < v_item.grant_expires_floor_paid_before then
          v_expires := greatest(v_expires, v_item.grant_expires_floor_at);
        end if;

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
  '주문 하나에 대해 이용 권한을 부여한다(sql/69 재작성 + 20260901001438 유효기간 + 20260901 부산캠퍼스 번들). product_id 가 bundle_items 에 행을 가진 라인은 그 행별로 program_access_grants 를 부여한다(program_key/duration_months/session_quota/validity_days 는 bundle_items 값, paid_amount 는 list_price 비율 안분 + program_key 오름차순 마지막 행 잔차 흡수), 없으면 기존 스칼라 경로(products.program_key/duration_months/session_quota) 그대로. 멱등 가드(already_granted), 복구 가드(revoked_not_restored)는 (order_item_id, program_key) 단위로 판정해 번들 2, 3번째 권한이 첫 권한 존재만으로 skip 되지 않게 한다(단일 상품 경로는 program_key 가 하나뿐이라 의미 동일, 동작 불변). 기간(duration_months)이 없는 상품은 validity_days(1회권 30일 등)를 expires_at = starts_at + N일 로 환산한다. 그 외(R2c 상태 가드, R7 원장 기반 restore_revoked, 라인별 skipped, WC010~012, 체이닝, suspended 판정)는 이전 정본과 동일. 추가: 회차권(session_quota 있고 duration_months 없는 단일 상품)은 quantity > 1 을 허용해 granted_sessions = session_quota × quantity 로 부여하고, 그 밖의 quantity > 1 은 unsupported_quantity 로 건너뛴다. addon_only 상품은 기존 부여 만료 뒤로 미루지 않고 결제일(KST 자정)에 시작한다. 추가: 상품의 grant_expires_floor_at 이 있고 결제 시각이 grant_expires_floor_paid_before 보다 이르면 번들 부여의 만료를 greatest(정상 만료, 하한)으로 올린다.';

-- ---------------------------------------------------------------------
-- 백필 A: 10월(KST) 결제 부산 주문의 살아있는 부여를 하한까지 연장
-- ---------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    with upd as (
      update public.program_access_grants g
         set expires_at = p.grant_expires_floor_at
        from public.order_items oi
        join public.orders o on o.id = oi.order_id
        join public.products p on p.id = oi.product_id
       where g.order_item_id = oi.id
         and p.grant_expires_floor_at is not null
         and o.status = 'paid'
         and o.paid_at >= '2026-09-30T15:00:00Z'
         and o.paid_at <  p.grant_expires_floor_paid_before
         and g.revoked_at is null
         and g.expires_at < p.grant_expires_floor_at
      returning g.profile_id, g.program_key
    )
    select distinct profile_id, program_key from upd
  loop
    perform public.fn_sync_program_access_cache(r.profile_id, r.program_key, null);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 백필 B: 살아있는 부산 주문에 신규 3종(성장설계 1회, 심화탐구 2회, 자기평가 2회) 보충
--   무상 부여(paid_amount 0), 오늘 KST 자정 시작, 만료는 그 주문 목표관리 부여와 같다.
-- ---------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    with ins as (
      insert into public.program_access_grants (
        profile_id, program_key, order_id, order_item_id, product_id, product_slug,
        granted_by, granted_months, granted_sessions, paid_amount,
        starts_at, expires_at, validity_days
      )
      select o.student_profile_id, bi.program_key, o.id, oi.id, p.id, p.slug,
             'payment', bi.duration_months, bi.session_quota, 0,
             public.fn_kst_day_start(now()), t.expires_at, bi.validity_days
        from public.order_items oi
        join public.orders o on o.id = oi.order_id
        join public.products p on p.id = oi.product_id
        join public.bundle_items bi on bi.product_id = p.id
        join public.program_access_grants t
          on t.order_item_id = oi.id and t.program_key = 'target' and t.revoked_at is null
       where p.slug = 'busan-9900'
         and bi.program_key in ('growth', 'inquiry', 'selfeval')
         and o.status = 'paid'
         and t.expires_at > now()
         and not exists (
           select 1 from public.program_access_grants g
            where g.order_item_id = oi.id and g.program_key = bi.program_key)
         and not exists (
           select 1 from public.program_access pa
            where pa.id = o.student_profile_id
              and pa.program_key = bi.program_key
              and pa.access_status = 'suspended')
      returning profile_id, program_key
    )
    select distinct profile_id, program_key from ins
  loop
    perform public.fn_sync_program_access_cache(r.profile_id, r.program_key, null);
  end loop;
end $$;
