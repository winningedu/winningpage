-- 부산캠퍼스 6항목 구성 + 목표관리 증정 데이터 반영(수동 실행, 멱등)
--
-- 왜: 마이그레이션 20261021014317_busan_oct_extension_goal_gift 는 스키마와
-- 함수만 바꾼다. bundle_items 와 program_access_grants 는 참조 데이터가 아니라
-- 마이그레이션이 insert 할 수 없어(check-migration-data-inserts) 이 파일로 뺐다.
--
-- 실행 순서: 1) dev 에서 한 번, 2) 릴리스(prod 마이그레이션 적용) 뒤 prod 에서 한 번.
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/busan-oct-goal-gift-data.sql
-- 파일 전체가 DO 블록 하나라 한 문장으로 원자적이다(중간 실패 시 전부 되돌아간다).
-- 블록 안의 순서: bundle_items(부산 6항목, 목표관리 증정) 먼저, 백필 B(살아있는
-- 부산 주문에 신규 3종 보충), 백필 C(살아있는 목표관리 주문에 증정 보충). 두 백필은
-- 각각 끝에서 영향받은 학생의 program_access 캐시를 갱신한다.
--
-- 멱등: 재실행해도 새로 바뀌는 행이 없다. 슬러그가 없는 DB(스쿨멘토)에서는
-- 대상 행이 0건이라 아무것도 하지 않는다.

do $$
declare
  r record;
begin
  -- 부산 번들: 6항목. 정가 안분 기준(list_price)은 카탈로그 개별 상품 정가다.
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

  -- 목표관리(goal) 상품 증정: 같은 기간 동안 수행평가와 심화탐구를 월 2회씩(기간
  -- 합산 풀) 함께 부여한다. 증정 행은 list_price 0 이라 paid_amount 가 0 이고,
  -- 목표관리 행이 결제액 전부를 가진다. products.program_key 는 'target' 그대로다.
  insert into public.bundle_items (
    product_id, program_key, duration_months, session_quota, validity_days, list_price
  )
  select p.id, v.program_key, p.duration_months,
         case when v.program_key = 'target' then null else p.duration_months * 2 end,
         null,
         case when v.program_key = 'target' then p.price else 0 end
    from public.products p
   cross join (values ('target'), ('suhaeng'), ('inquiry')) as v(program_key)
   where p.service_key = 'goal'
     and p.program_key = 'target'
     and p.duration_months is not null
     and not p.addon_only
  on conflict (product_id, program_key) do update
    set duration_months = excluded.duration_months,
        session_quota   = excluded.session_quota,
        validity_days   = excluded.validity_days,
        list_price      = excluded.list_price;

  -- 백필 B: 살아있는 부산 주문에 신규 3종(성장설계 1회, 심화탐구 2회, 자기평가 2회)
  -- 보충. 무상 부여(paid_amount 0), 오늘 KST 자정 시작, 만료는 그 주문 목표관리
  -- 부여와 같다. 정지(suspended)된 program_access 는 건너뛴다.
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

  -- 백필 C: 살아있는 목표관리 주문에 수행평가/심화탐구 증정 보충. 회차는 기간(개월)
  -- x 2, 오늘 KST 자정 시작, 만료는 그 주문 목표관리 부여와 같다.
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
       where p.service_key = 'goal'
         and p.program_key = 'target'
         and bi.program_key in ('suhaeng', 'inquiry')
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
