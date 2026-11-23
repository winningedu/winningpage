-- =====================================================================
-- 환불 Ver10 SQL 시나리오 스펙 (docs/refund-quote-ver10-design.md §3-5 T1~T19)
--
-- 실행: 마이그레이션이 전부 적용된 스택에서
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/refund-quote-ver10.spec.sql
--
-- 전체가 한 트랜잭션이고 마지막에 ROLLBACK 한다 — 어떤 데이터도 남기지
-- 않는다. 단언 실패는 예외로 터져 psql 이 비정상 종료(ON_ERROR_STOP)한다.
--
-- 시간 축: 산정(fn_refund_quote)은 p_at 인자로 고정 시각을 재현한다
-- (기준 시각 2026-09-01 12:00 KST). 신청·완료 RPC 는 내부에서 now() 를
-- 쓰므로 그 흐름(T3·T14~T19)은 "방금 결제한 주문"으로만 구성한다.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 단언·컨텍스트 헬퍼(pg_temp — 세션 종료와 함께 소멸)
-- ---------------------------------------------------------------------
create function pg_temp.expect_int(t text, got bigint, want bigint) returns void
language plpgsql as $$
begin
  if got is distinct from want then
    raise exception '[FAIL] %: got %, want %', t, got, want;
  end if;
  raise notice '[PASS] % = %', t, want;
end $$;

create function pg_temp.expect_text(t text, got text, want text) returns void
language plpgsql as $$
begin
  if got is distinct from want then
    raise exception '[FAIL] %: got %, want %', t, got, want;
  end if;
  raise notice '[PASS] % = %', t, want;
end $$;

create function pg_temp.expect_bool(t text, got boolean, want boolean) returns void
language plpgsql as $$
begin
  if got is distinct from want then
    raise exception '[FAIL] %: got %, want %', t, got, want;
  end if;
  raise notice '[PASS] % = %', t, want;
end $$;

-- auth.uid() 시뮬레이션 — request.jwt.claims 를 트랜잭션 로컬로 세팅.
create function pg_temp.as_user(p_uid uuid) returns void
language plpgsql as $$
begin
  -- auth.uid() 구현이 신형(request.jwt.claims)·구형(request.jwt.claim.sub)
  -- 어느 쪽이든 통하도록 둘 다 세팅한다.
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
end $$;

-- 회원 생성 — auth.users + profiles(트리거 유무와 무관하게 upsert).
create function pg_temp.mk_user(p_email text, p_role text, p_member_type text) returns uuid
language plpgsql as $$
declare
  v_id uuid := gen_random_uuid();
begin
  -- auth 스키마 버전(로컬 스택/이미지)에 따라 컬럼 구성이 달라 어디에나
  -- 존재하는 최소 컬럼만 넣는다.
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data
  ) values (
    v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    p_email, 'x', now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
  );
  insert into public.profiles (id, name, role, member_type, email)
  values (v_id, p_email, p_role, p_member_type, p_email)
  on conflict (id) do update
    set role = excluded.role, member_type = excluded.member_type, name = excluded.name;
  return v_id;
end $$;

-- 주문 1건 생성(+부여) — items: jsonb 배열 [{slug, list, price}], 부여는
-- 운영과 같은 경로(fn_grant_program_access_for_order)로 만든다.
create function pg_temp.mk_order(
  p_order_id text, p_parent uuid, p_student uuid,
  p_items jsonb, p_discount int, p_paid_at timestamptz
) returns void
language plpgsql as $$
declare
  v_list int := 0;
  it jsonb;
begin
  select coalesce(sum((x->>'list')::int), 0) into v_list
    from jsonb_array_elements(p_items) x;

  insert into public.orders (
    id, user_id, status, order_name, list_amount, discount_amount, amount,
    customer_email, paid_at, created_at,
    student_profile_id, parent_profile_id,
    approval_status, requested_at, responded_at
  ) values (
    p_order_id, p_parent, 'paid', p_order_id, v_list, p_discount, v_list - p_discount,
    'spec@test.local', p_paid_at, p_paid_at,
    p_student, p_parent,
    'approved', p_paid_at, p_paid_at
  );

  for it in select * from jsonb_array_elements(p_items) loop
    insert into public.order_items (order_id, product_slug, service_key, name, list_price, price, quantity, product_id)
    select p_order_id, p.slug, p.service_key, p.name, (it->>'list')::int, (it->>'price')::int, 1, p.id
      from public.products p where p.slug = it->>'slug';
  end loop;

  perform public.fn_grant_program_access_for_order(p_order_id, p_parent, p_paid_at);
end $$;

-- 회차 소비 — 콜멘토 축(session_id 불요)으로 원장에 원본 차감을 남긴다.
create function pg_temp.consume(p_order_id text, p_slug text, p_n int) returns void
language plpgsql as $$
declare
  g record;
begin
  select pg.id, pg.profile_id into g
    from public.program_access_grants pg
    join public.order_items oi on oi.id = pg.order_item_id
   where pg.order_id = p_order_id and oi.product_slug = p_slug and pg.revoked_at is null;
  insert into public.performance_credit_ledger (profile_id, grant_id, delta, source_kind, reason)
  select g.profile_id, g.id, -1, 'mentor_call_booking', 'spec'
    from generate_series(1, p_n);
end $$;

create function pg_temp.mark_accessed(p_order_id text, p_slug text) returns void
language plpgsql as $$
begin
  update public.program_access_grants pg
     set first_accessed_at = pg.starts_at + interval '1 hour'
    from public.order_items oi
   where oi.id = pg.order_item_id
     and pg.order_id = p_order_id and oi.product_slug = p_slug;
end $$;

create function pg_temp.item_id(p_order_id text, p_slug text) returns bigint
language sql as $$
  select oi.id from public.order_items oi
   where oi.order_id = p_order_id and oi.product_slug = p_slug;
$$;

-- ---------------------------------------------------------------------
-- 픽스처 — 테스트 전용 프로그램·상품(§0-3 카탈로그 미러 + [별표 2] 전제)
-- ---------------------------------------------------------------------
insert into public.programs (program_key, name) values
  ('zt-target', 'spec 목표관리'), ('zt-suhaeng', 'spec 수행평가'),
  ('zt-mentor', 'spec 콜멘토'),
  ('zt-a', 'spec A'), ('zt-b', 'spec B'), ('zt-c', 'spec C'),
  ('zt-d', 'spec D'), ('zt-e', 'spec E');

insert into public.products
  (service_key, service_name, name, slug, program_key, list_price, price, duration_months, session_quota, validity_days) values
  ('zt', 'spec', 'goal-12m',   'zt-goal-12m',   'zt-target',  300000, 180000, 12, null, null),
  ('zt', 'spec', 'goal-1m',    'zt-goal-1m',    'zt-target',  25000,  25000,  1,  null, null),
  ('zt', 'spec', 'suhaeng-2',  'zt-suhaeng-2',  'zt-suhaeng', 5000,   5000,   1,  2,    null),
  ('zt', 'spec', 'suhaeng-6',  'zt-suhaeng-6',  'zt-suhaeng', 15000,  13500,  3,  6,    null),
  ('zt', 'spec', 'suhaeng-1',  'zt-suhaeng-1',  'zt-suhaeng', 3500,   3500,   null, 1,  30),
  ('zt', 'spec', 'mentor-1',   'zt-mentor-1',   'zt-mentor',  50000,  50000,  null, 1,  30),
  ('zt', 'spec', 'free-item',  'zt-free',       'zt-target',  0,      0,      1,  null, null),
  ('zt', 'spec', 'A',          'zt-pa',         'zt-a',       100000, 80000,  1,  null, null),
  ('zt', 'spec', 'B',          'zt-pb',         'zt-b',       100000, 80000,  1,  null, null),
  ('zt', 'spec', 'C',          'zt-pc',         'zt-c',       100000, 80000,  1,  null, null),
  ('zt', 'spec', 'D',          'zt-pd',         'zt-d',       100000, 80000,  1,  null, null),
  ('zt', 'spec', 'E',          'zt-pe',         'zt-e',       100000, 80000,  1,  null, null);

insert into public.coupons (title, discount_amount, slug, grant_type)
values ('spec 50k', 50000, 'zt-coupon-50k', 'auto');

-- 시나리오마다 독립 학생·학부모 쌍(부여 체이닝 간섭 방지).
-- 주문 Z 계열: [별표 2] 전제 — A~E 5종, 정가 각 100,000, 묶음할인을 상품
-- 단가 80,000 으로 모델링, 정액 쿠폰 50,000 → amount 350,000.
-- 주문 Y 계열: goal-12m + suhaeng-2 + 쿠폰 5,000 → amount 180,000.
do $$
declare
  z_items constant jsonb := '[
    {"slug":"zt-pa","list":100000,"price":80000},
    {"slug":"zt-pb","list":100000,"price":80000},
    {"slug":"zt-pc","list":100000,"price":80000},
    {"slug":"zt-pd","list":100000,"price":80000},
    {"slug":"zt-pe","list":100000,"price":80000}]';
  y_items constant jsonb := '[
    {"slug":"zt-goal-12m","list":300000,"price":180000},
    {"slug":"zt-suhaeng-2","list":5000,"price":5000}]';
  p uuid; s uuid;
begin
  p := pg_temp.mk_user('z1-p@t.local', 'user', 'parent');
  s := pg_temp.mk_user('z1-s@t.local', 'user', 'student');
  perform pg_temp.mk_order('zt-z1', p, s, z_items, 150000, '2026-08-31 10:00+09');

  p := pg_temp.mk_user('z2-p@t.local', 'user', 'parent');
  s := pg_temp.mk_user('z2-s@t.local', 'user', 'student');
  perform pg_temp.mk_order('zt-z2', p, s, z_items, 150000, '2026-08-24 09:00+09');
  perform pg_temp.mark_accessed('zt-z2', 'zt-pa');

  p := pg_temp.mk_user('z3-p@t.local', 'user', 'parent');
  s := pg_temp.mk_user('z3-s@t.local', 'user', 'student');
  perform pg_temp.mk_order('zt-z3', p, s, z_items, 150000, now() - interval '1 hour');
  insert into public.coupon_redemptions (coupon_id, user_id, order_id, discount_amount)
  select c.id, p, 'zt-z3', 50000 from public.coupons c where c.slug = 'zt-coupon-50k';

  p := pg_temp.mk_user('y4-p@t.local', 'user', 'parent');
  s := pg_temp.mk_user('y4-s@t.local', 'user', 'student');
  perform pg_temp.mk_order('zt-y4', p, s, y_items, 125000, '2026-08-31 10:00+09');

  p := pg_temp.mk_user('y6-p@t.local', 'user', 'parent');
  s := pg_temp.mk_user('y6-s@t.local', 'user', 'student');
  perform pg_temp.mk_order('zt-y6', p, s, y_items, 125000, '2026-06-26 10:00+09');
  perform pg_temp.mark_accessed('zt-y6', 'zt-goal-12m');

  p := pg_temp.mk_user('y7-p@t.local', 'user', 'parent');
  s := pg_temp.mk_user('y7-s@t.local', 'user', 'student');
  perform pg_temp.mk_order('zt-y7', p, s, y_items, 125000, '2026-08-28 10:00+09');
  perform pg_temp.mark_accessed('zt-y7', 'zt-goal-12m');

  p := pg_temp.mk_user('y9-p@t.local', 'user', 'parent');
  s := pg_temp.mk_user('y9-s@t.local', 'user', 'student');
  perform pg_temp.mk_order('zt-y9', p, s,
    '[{"slug":"zt-goal-1m","list":25000,"price":25000}]', 0, '2026-08-27 10:00+09');
  perform pg_temp.mark_accessed('zt-y9', 'zt-goal-1m');

  p := pg_temp.mk_user('t10a-p@t.local', 'user', 'parent');
  s := pg_temp.mk_user('t10a-s@t.local', 'user', 'student');
  perform pg_temp.mk_order('zt-t10a', p, s,
    '[{"slug":"zt-suhaeng-1","list":3500,"price":3500}]', 0, '2026-08-01 10:00+09');

  p := pg_temp.mk_user('t10b-p@t.local', 'user', 'parent');
  s := pg_temp.mk_user('t10b-s@t.local', 'user', 'student');
  perform pg_temp.mk_order('zt-t10b', p, s,
    '[{"slug":"zt-suhaeng-1","list":3500,"price":3500}]', 0, '2026-08-04 10:00+09');

  p := pg_temp.mk_user('t11a-p@t.local', 'user', 'parent');
  s := pg_temp.mk_user('t11a-s@t.local', 'user', 'student');
  perform pg_temp.mk_order('zt-t11a', p, s,
    '[{"slug":"zt-suhaeng-6","list":15000,"price":13500}]', 1500, '2026-08-15 10:00+09');
  perform pg_temp.consume('zt-t11a', 'zt-suhaeng-6', 2);

  p := pg_temp.mk_user('t11b-p@t.local', 'user', 'parent');
  s := pg_temp.mk_user('t11b-s@t.local', 'user', 'student');
  perform pg_temp.mk_order('zt-t11b', p, s,
    '[{"slug":"zt-suhaeng-6","list":15000,"price":13500}]', 1500, '2026-05-20 10:00+09');
  perform pg_temp.consume('zt-t11b', 'zt-suhaeng-6', 2);

  p := pg_temp.mk_user('t12-p@t.local', 'user', 'parent');
  s := pg_temp.mk_user('t12-s@t.local', 'user', 'student');
  perform pg_temp.mk_order('zt-t12', p, s,
    '[{"slug":"zt-mentor-1","list":50000,"price":50000}]', 0, '2026-08-25 10:00+09');

  p := pg_temp.mk_user('t13-p@t.local', 'user', 'parent');
  s := pg_temp.mk_user('t13-s@t.local', 'user', 'student');
  perform pg_temp.mk_order('zt-t13', p, s,
    '[{"slug":"zt-goal-1m","list":25000,"price":25000},
      {"slug":"zt-free","list":0,"price":0}]', 0, '2026-08-31 10:00+09');

  p := pg_temp.mk_user('t14-p@t.local', 'user', 'parent');
  s := pg_temp.mk_user('t14-s@t.local', 'user', 'student');
  perform pg_temp.mk_order('zt-t14', p, s, y_items, 125000, now() - interval '1 hour');

  p := pg_temp.mk_user('t15-p@t.local', 'user', 'parent');
  s := pg_temp.mk_user('t15-s@t.local', 'user', 'student');
  perform pg_temp.mk_order('zt-t15', p, s, y_items, 125000, now() - interval '1 hour');

  p := pg_temp.mk_user('t18-p@t.local', 'user', 'parent');
  s := pg_temp.mk_user('t18-s@t.local', 'user', 'student');
  perform pg_temp.mk_order('zt-t18', p, s,
    '[{"slug":"zt-suhaeng-6","list":15000,"price":13500}]', 1500, now() - interval '1 hour');

  p := pg_temp.mk_user('t19-p@t.local', 'user', 'parent');
  s := pg_temp.mk_user('t19-s@t.local', 'user', 'student');
  perform pg_temp.mk_order('zt-t19', p, s,
    '[{"slug":"zt-suhaeng-6","list":15000,"price":13500}]', 1500, now() - interval '1 hour');
end $$;

-- 어드민(완료·재산정 RPC 호출자).
do $$ begin perform pg_temp.mk_user('admin@t.local', 'admin', null); end $$;

-- ---------------------------------------------------------------------
-- T1~T13 — 산정(fn_refund_quote) 단언. 기준 시각 2026-09-01 12:00 KST.
-- ---------------------------------------------------------------------
do $$
declare
  c_at constant timestamptz := '2026-09-01 12:00+09';
  q record;
  ln jsonb;
begin
  -- 산정은 관리자 컨텍스트로 호출한다(WC005 admin 경로) — 신청 흐름 테스트
  -- (T14~)는 당사자 컨텍스트로 따로 잡는다.
  perform pg_temp.as_user((select id from public.profiles where email = 'admin@t.local'));

  -- T1 — [별표 2] 예시 1: A만, 미개시, 7일 내 → 70,000.
  select * into q from public.fn_refund_quote('zt-z1',
    array[pg_temp.item_id('zt-z1', 'zt-pa')], false, c_at);
  perform pg_temp.expect_int('T1 refund', q.refund_amount, 70000);
  perform pg_temp.expect_int('T1 bundle_return', q.bundle_return_amount, 0);
  perform pg_temp.expect_bool('T1 coupon_restore', q.coupon_restore, false);
  perform pg_temp.expect_text('T1 scope', q.scope, 'items');
  perform pg_temp.expect_text('T1 policy', q.policy_code, 'before_start');
  perform pg_temp.expect_bool('T1 within_withdrawal', q.within_withdrawal, true);

  -- T2 — 예시 2: A만, 개시 후 해당 기간 1/3 전, 7일 경과 → 46,667
  --      (⑦ 공제는 현 모델 조건부 할인 부재로 0 — 별표 개정값 26,667은
  --       조건부 할인 컬럼 도입 후에만 재현 가능, §1-A-Z).
  select * into q from public.fn_refund_quote('zt-z2',
    array[pg_temp.item_id('zt-z2', 'zt-pa')], false, c_at);
  perform pg_temp.expect_int('T2 refund', q.refund_amount, 46667);
  perform pg_temp.expect_text('T2 policy', q.policy_code, 'period_tier');
  perform pg_temp.expect_bool('T2 within_withdrawal', q.within_withdrawal, false);

  -- T3(산정부) — 예시 3: 전부, 미개시, 7일 내 → 350,000 + 쿠폰 복원 조건 충족.
  select * into q from public.fn_refund_quote('zt-z3', null, false, now());
  perform pg_temp.expect_int('T3 refund', q.refund_amount, 350000);
  perform pg_temp.expect_bool('T3 coupon_restore', q.coupon_restore, true);
  perform pg_temp.expect_text('T3 scope', q.scope, 'order');

  -- T4 — 주문 Y 안분: goal 177,050 / suhaeng 2,951, 합 180,001 → 클램프 180,000.
  select * into q from public.fn_refund_quote('zt-y4', null, false, c_at);
  perform pg_temp.expect_int('T4 refund(클램프)', q.refund_amount, 180000);
  select x into ln from jsonb_array_elements(q.lines) x
   where x->>'product_slug' = 'zt-goal-12m';
  perform pg_temp.expect_int('T4 goal 안분', (ln->>'paid_allocated')::bigint, 177050);
  select x into ln from jsonb_array_elements(q.lines) x
   where x->>'product_slug' = 'zt-suhaeng-2';
  perform pg_temp.expect_int('T4 suhaeng 안분', (ln->>'paid_allocated')::bigint, 2951);

  -- T5 — Y1: suhaeng-2만, 미개시 → 2,951.
  select * into q from public.fn_refund_quote('zt-y4',
    array[pg_temp.item_id('zt-y4', 'zt-suhaeng-2')], false, c_at);
  perform pg_temp.expect_int('T5 refund', q.refund_amount, 2951);

  -- T6 — Y2: goal만, 개시 후 2개월+α(해당 월 1/3 전), 7일 경과
  --      → 177,050 − 25,000×(2+1/3) = 118,717 (period_monthly_tier).
  select * into q from public.fn_refund_quote('zt-y6',
    array[pg_temp.item_id('zt-y6', 'zt-goal-12m')], false, c_at);
  perform pg_temp.expect_int('T6 refund', q.refund_amount, 118717);
  perform pg_temp.expect_text('T6 policy', q.policy_code, 'period_monthly_tier');
  select x into ln from jsonb_array_elements(q.lines) x;
  perform pg_temp.expect_int('T6 charge_months', (ln->>'charge_months')::bigint, 2);

  -- T7 — Y3: goal만, 개시 후 5일 미만, 7일 내(⑪-2 예외, L=M)
  --      → 177,050 − (177,050/12)×(1/3) = 172,132.
  select * into q from public.fn_refund_quote('zt-y7',
    array[pg_temp.item_id('zt-y7', 'zt-goal-12m')], false, c_at);
  perform pg_temp.expect_int('T7 refund', q.refund_amount, 172132);
  perform pg_temp.expect_text('T7 policy', q.policy_code, 'period_monthly_tier_noreprice');

  -- T8 — T6 + 회사 귀책(⑪-1 예외, L=M)
  --      → 177,050 − (177,050/12)×(7/3) = 142,624.
  select * into q from public.fn_refund_quote('zt-y6',
    array[pg_temp.item_id('zt-y6', 'zt-goal-12m')], true, c_at);
  perform pg_temp.expect_int('T8 refund', q.refund_amount, 142624);
  perform pg_temp.expect_text('T8 policy', q.policy_code, 'period_monthly_tier_noreprice');

  -- T9 — goal-1m, 개시 후 5/31 경과 → ②-2 계단 2/3 절상 = 16,667.
  select * into q from public.fn_refund_quote('zt-y9', null, false, c_at);
  perform pg_temp.expect_int('T9 refund', q.refund_amount, 16667);
  perform pg_temp.expect_text('T9 policy', q.policy_code, 'period_tier');

  -- T10 — suhaeng-1(유효기간 30일): 만료 후 0 / 만료 전 전액.
  select * into q from public.fn_refund_quote('zt-t10a', null, false, c_at);
  perform pg_temp.expect_int('T10 만료 후', q.refund_amount, 0);
  perform pg_temp.expect_text('T10 만료 policy', q.policy_code, 'expired');
  select * into q from public.fn_refund_quote('zt-t10b', null, false, c_at);
  perform pg_temp.expect_int('T10 만료 전', q.refund_amount, 3500);
  perform pg_temp.expect_text('T10 만료 전 policy', q.policy_code, 'before_start');

  -- T11 — suhaeng-6 2회 사용: 기간 내 ceil(13,500×4/6)=9,000 / 만료 후 0.
  select * into q from public.fn_refund_quote('zt-t11a', null, false, c_at);
  perform pg_temp.expect_int('T11 기간 내', q.refund_amount, 9000);
  perform pg_temp.expect_text('T11 policy', q.policy_code, 'sessions_prorated');
  select * into q from public.fn_refund_quote('zt-t11b', null, false, c_at);
  perform pg_temp.expect_int('T11 만료 후', q.refund_amount, 0);
  perform pg_temp.expect_text('T11 만료 policy', q.policy_code, 'expired');

  -- T12 — mentor-1 미사용(소비 원장 없음 — 콜멘토 소비 함수 미구현 제한).
  select * into q from public.fn_refund_quote('zt-t12', null, false, c_at);
  perform pg_temp.expect_int('T12 refund', q.refund_amount, 50000);
  perform pg_temp.expect_text('T12 policy', q.policy_code, 'before_start');

  -- T13 — 정가 0 라인: free_item 0원, 나머지가 안분 전액.
  select * into q from public.fn_refund_quote('zt-t13', null, false, c_at);
  perform pg_temp.expect_int('T13 refund', q.refund_amount, 25000);
  select x into ln from jsonb_array_elements(q.lines) x
   where x->>'product_slug' = 'zt-free';
  perform pg_temp.expect_text('T13 free policy', ln->>'policy_code', 'free_item');
  perform pg_temp.expect_int('T13 free refund', (ln->>'refund')::bigint, 0);
end $$;

-- ---------------------------------------------------------------------
-- T14 — 열린 신청과 항목 겹침(WC061)·전체끼리 중복(WC007)
-- ---------------------------------------------------------------------
do $$
declare
  v_parent uuid;
  v_suh bigint := pg_temp.item_id('zt-t14', 'zt-suhaeng-2');
  v_goal bigint := pg_temp.item_id('zt-t14', 'zt-goal-12m');
  r public.refund_requests;
begin
  select parent_profile_id into v_parent from public.orders where id = 'zt-t14';
  perform pg_temp.as_user(v_parent);

  r := public.fn_request_refund('zt-t14', 'spec', null, null, null, array[v_suh]);
  perform pg_temp.expect_int('T14 부분 신청 금액', r.amount, 2951);
  perform pg_temp.expect_text('T14 terms_version', r.terms_version, 'v10');

  -- 같은 항목 재신청 → WC061.
  begin
    perform public.fn_request_refund('zt-t14', 'spec', null, null, null, array[v_suh]);
    raise exception '[FAIL] T14 같은 항목 재신청이 거부되지 않았다';
  exception when sqlstate 'WC061' then
    raise notice '[PASS] T14 항목 겹침 WC061';
  end;

  -- 주문 전체 신청(열린 부분 신청과 겹침) → WC061.
  begin
    perform public.fn_request_refund('zt-t14', 'spec', null, null, null, null);
    raise exception '[FAIL] T14 전체 신청이 거부되지 않았다';
  exception when sqlstate 'WC061' then
    raise notice '[PASS] T14 전체↔부분 겹침 WC061';
  end;

  -- 겹치지 않는 항목 신청은 허용된다(부분 신청 공존, §2-10).
  r := public.fn_request_refund('zt-t14', 'spec', null, null, null, array[v_goal]);
  perform pg_temp.expect_int('T14 비겹침 신청 금액', r.amount, 177050);

  -- goal 신청과 다시 겹치면 → WC061.
  begin
    perform public.fn_request_refund('zt-t14', 'spec', null, null, null, array[v_goal, v_suh]);
    raise exception '[FAIL] T14 goal 겹침이 거부되지 않았다';
  exception when sqlstate 'WC061' then
    raise notice '[PASS] T14 goal 겹침 WC061';
  end;
end $$;

-- ---------------------------------------------------------------------
-- T3(완료부)·T15·T16·T17 — 부분환불 완료 → 두 번째 신청 → 전부 완료
-- ---------------------------------------------------------------------
do $$
declare
  v_parent uuid;
  v_admin uuid := (select id from public.profiles where email = 'admin@t.local');
  v_suh bigint := pg_temp.item_id('zt-t15', 'zt-suhaeng-2');
  v_goal_alive int;
  r public.refund_requests;
  q record;
begin
  -- T15 1단계 — suhaeng-2 부분 신청·완료.
  select parent_profile_id into v_parent from public.orders where id = 'zt-t15';
  perform pg_temp.as_user(v_parent);
  r := public.fn_request_refund('zt-t15', 'spec', null, null, null, array[v_suh]);
  perform pg_temp.expect_int('T15 부분 신청 금액', r.amount, 2951);

  perform pg_temp.as_user(v_admin);
  r := public.fn_complete_refund(r.id, 'spec 부분 완료');
  perform pg_temp.expect_text('T15 부분 완료 status', r.status, 'completed');

  -- T16 — 잔여 grant 생존, 캐시 동기화, orders.status 유지.
  select count(*) into v_goal_alive
    from public.program_access_grants g
    join public.order_items oi on oi.id = g.order_item_id
   where g.order_id = 'zt-t15' and g.revoked_at is null and oi.product_slug = 'zt-goal-12m';
  perform pg_temp.expect_int('T16 goal grant 생존', v_goal_alive, 1);
  perform pg_temp.expect_text('T16 orders.status',
    (select status from public.orders where id = 'zt-t15'), 'paid');
  perform pg_temp.expect_text('T16 suhaeng 캐시 종결',
    (select pa.payment_status from public.program_access pa
      where pa.id = (select student_profile_id from public.orders where id = 'zt-t15')
        and pa.program_key = 'zt-suhaeng'), 'refunded');
  perform pg_temp.expect_text('T16 goal 캐시 활성',
    (select pa.access_status from public.program_access pa
      where pa.id = (select student_profile_id from public.orders where id = 'zt-t15')
        and pa.program_key = 'zt-target'), 'active');

  -- T15 2단계 — 회수된 라인 재신청은 WC060, 잔여 전체 신청은 클램프
  -- (amount − 완료 누적 = 180,000 − 2,951 = 177,049).
  perform pg_temp.as_user(v_parent);
  begin
    perform public.fn_request_refund('zt-t15', 'spec', null, null, null, array[v_suh]);
    raise exception '[FAIL] T15 회수 라인 재신청이 거부되지 않았다';
  exception when sqlstate 'WC060' then
    raise notice '[PASS] T15 회수 라인 WC060';
  end;

  select * into q from public.fn_refund_quote('zt-t15', null, false, now());
  perform pg_temp.expect_int('T15 잔여 견적(클램프)', q.refund_amount, 177049);

  r := public.fn_request_refund('zt-t15', 'spec', null, null, null, null);
  perform pg_temp.expect_int('T15 잔여 신청 금액', r.amount, 177049);

  -- T17 — 전부 완료: orders refunded, 모든 grant 회수.
  perform pg_temp.as_user(v_admin);
  r := public.fn_complete_refund(r.id, 'spec 전부 완료');
  perform pg_temp.expect_text('T17 orders.status',
    (select status from public.orders where id = 'zt-t15'), 'refunded');
  perform pg_temp.expect_int('T17 잔여 grant 0',
    (select count(*) from public.program_access_grants g
      where g.order_id = 'zt-t15' and g.revoked_at is null), 0);

  -- T3(완료부) — 전부 청약철회 완료 시 쿠폰 사용 이력 자동 복원.
  select parent_profile_id into v_parent from public.orders where id = 'zt-z3';
  perform pg_temp.as_user(v_parent);
  r := public.fn_request_refund('zt-z3', 'spec', null, null, null, null);
  perform pg_temp.expect_int('T3 전부 신청 금액', r.amount, 350000);

  perform pg_temp.as_user(v_admin);
  r := public.fn_complete_refund(r.id, 'spec 철회 완료');
  perform pg_temp.expect_text('T3 완료 status', r.status, 'completed');
  perform pg_temp.expect_bool('T3 coupon_restored_at 기록', r.coupon_restored_at is not null, true);
  perform pg_temp.expect_text('T3 redemption void_reason',
    (select cr.void_reason from public.coupon_redemptions cr where cr.order_id = 'zt-z3'),
    'refund_withdrawal_full');
  perform pg_temp.expect_bool('T3 redemption voided',
    (select cr.voided_at is not null from public.coupon_redemptions cr where cr.order_id = 'zt-z3'),
    true);
end $$;

-- ---------------------------------------------------------------------
-- T18 — terms_version='v9' 레거시 행: WC039 재견적 비교 우회, WC037 유지
-- ---------------------------------------------------------------------
do $$
declare
  v_admin uuid := (select id from public.profiles where email = 'admin@t.local');
  v_parent uuid;
  v_student uuid;
  v_id bigint;
  r public.refund_requests;
begin
  select parent_profile_id, student_profile_id into v_parent, v_student
    from public.orders where id = 'zt-t18';

  -- Ver9 시절 신청을 재현 — 전액(12,000... 아님: amount 13,500) 승인 상태로
  -- 직접 삽입하고, 신청 후 2회 소비로 현재 v10 견적(9,000)이 신청액보다
  -- 작아지게 만든다. v10 행이면 WC039 로 막힐 상황.
  insert into public.refund_requests (
    user_id, order_id, order_item_id, order_name, amount, reason, status,
    student_profile_id, parent_profile_id, requested_by,
    approval_status, approval_responded_at, gross_amount, policy_code,
    needs_review, terms_version
  ) values (
    v_parent, 'zt-t18', null, 'zt-t18', 13500, 'spec v9', 'requested',
    v_student, v_parent, v_parent,
    'approved', now(), 13500, 'before_start', false, 'v9'
  ) returning id into v_id;

  perform pg_temp.consume('zt-t18', 'zt-suhaeng-6', 2);

  perform pg_temp.as_user(v_admin);
  r := public.fn_complete_refund(v_id, 'spec v9 완료');
  perform pg_temp.expect_text('T18 v9 완료(WC039 우회)', r.status, 'completed');
  perform pg_temp.expect_text('T18 orders.status',
    (select status from public.orders where id = 'zt-t18'), 'refunded');
end $$;

-- ---------------------------------------------------------------------
-- T19 — v10 행: 신청 후 추가 소비로 재견적 감소 → WC039 유지
-- ---------------------------------------------------------------------
do $$
declare
  v_admin uuid := (select id from public.profiles where email = 'admin@t.local');
  v_parent uuid;
  r public.refund_requests;
begin
  select parent_profile_id into v_parent from public.orders where id = 'zt-t19';
  perform pg_temp.as_user(v_parent);
  r := public.fn_request_refund('zt-t19', 'spec', null, null, null, null);
  perform pg_temp.expect_int('T19 신청 금액', r.amount, 13500);

  perform pg_temp.consume('zt-t19', 'zt-suhaeng-6', 1);

  perform pg_temp.as_user(v_admin);
  begin
    perform public.fn_complete_refund(r.id, 'spec');
    raise exception '[FAIL] T19 재견적 감소가 거부되지 않았다';
  exception when sqlstate 'WC039' then
    raise notice '[PASS] T19 재견적 감소 WC039';
  end;
end $$;

-- ---------------------------------------------------------------------
-- UTC 전환 U4b — 구매자 시간대(profiles.time_zone)로 이용 기간과 환불 월 단계를 계산한다.
-- 기존 서울 구매자 단언(T1~T19)은 그대로이고, 아래는 뉴욕 구매자 단언이다.
-- ---------------------------------------------------------------------
do $$
declare
  p uuid; s uuid;
  g record;
  q record;
  c_paid constant timestamptz := '2026-11-23T03:00:00Z';
begin
  -- U1 뉴욕 1개월권: 현지 11-22 22:00 결제 => 현지 11-22 00:00(=05:00Z) 시작, 현지 12-22 00:00(=05:00Z) 만료.
  p := pg_temp.mk_user('ny1-p@t.local', 'user', 'parent');
  s := pg_temp.mk_user('ny1-s@t.local', 'user', 'student');
  update public.profiles set time_zone = 'America/New_York' where id = p;
  perform pg_temp.mk_order('zt-ny1', p, s,
    '[{"slug":"zt-goal-1m","list":25000,"price":25000}]', 0, c_paid);
  select pg.starts_at, pg.expires_at into g
    from public.program_access_grants pg where pg.order_id = 'zt-ny1';
  perform pg_temp.expect_text('NY1 starts_at', (g.starts_at at time zone 'UTC')::text, '2026-11-22 05:00:00');
  perform pg_temp.expect_text('NY1 expires_at', (g.expires_at at time zone 'UTC')::text, '2026-12-22 05:00:00');

  -- U2 뉴욕 12개월권 환불: 월 단계는 뉴욕 현지 달력. 1개월째 경계(현지 03-28 00:00 EDT = 04:00Z) 1시간 전.
  p := pg_temp.mk_user('ny2-p@t.local', 'user', 'parent');
  s := pg_temp.mk_user('ny2-s@t.local', 'user', 'student');
  update public.profiles set time_zone = 'America/New_York' where id = p;
  perform pg_temp.mk_order('zt-ny2', p, s,
    '[{"slug":"zt-goal-12m","list":300000,"price":180000}]', 120000, '2026-03-01T03:00:00Z');
  perform pg_temp.mark_accessed('zt-ny2', 'zt-goal-12m');
  perform pg_temp.as_user((select id from public.profiles where email = 'admin@t.local'));
  select * into q from public.fn_refund_quote('zt-ny2', null, false, '2026-03-28T03:00:00Z');
  -- k=0, 그 달 안 경과율 > 1/2 이므로 c=1: 180000 - 25000 * 1 = 155000.
  perform pg_temp.expect_int('NY2 refund', q.refund_amount, 155000);
end $$;

-- 구매자 프로필 행이 없으면 날짜가 조용히 null 이 되지 않고 WC010 으로 거부한다.
-- (FK 가 막는 상태라 트리거를 끄고 프로필 행만 지운다. 트랜잭션 로컬이고 마지막에 ROLLBACK.)
do $$
declare
  p uuid; s uuid;
begin
  p := pg_temp.mk_user('ny3-p@t.local', 'user', 'parent');
  s := pg_temp.mk_user('ny3-s@t.local', 'user', 'student');
  perform pg_temp.mk_order('zt-ny3', p, s,
    '[{"slug":"zt-goal-1m","list":25000,"price":25000}]', 0, '2026-11-23T03:00:00Z');
  set local session_replication_role = replica;
  delete from public.profiles where id = p;
  set local session_replication_role = origin;

  begin
    perform public.fn_grant_program_access_for_order('zt-ny3', p, '2026-11-23T03:00:00Z');
    raise exception '[FAIL] NY3 부여가 거부되지 않았다';
  exception when sqlstate 'WC010' then
    raise notice '[PASS] NY3 부여 구매자 프로필 없음 WC010';
  end;

  perform pg_temp.as_user((select id from public.profiles where email = 'admin@t.local'));
  begin
    perform * from public.fn_refund_quote('zt-ny3', null, false, '2026-11-24T03:00:00Z');
    raise exception '[FAIL] NY3 환불 산정이 거부되지 않았다';
  exception when sqlstate 'WC010' then
    raise notice '[PASS] NY3 환불 구매자 프로필 없음 WC010';
  end;
end $$;

do $$ begin raise notice '=== refund-quote-ver10.spec: 전체 통과 ==='; end $$;

rollback;
