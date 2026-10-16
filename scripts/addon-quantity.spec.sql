-- =====================================================================
-- 추가 이용권(addon_only) + 회차권 수량 SQL 시나리오 스펙 (T1~T8)
--
-- 실행: 마이그레이션이 전부 적용된 스택에서
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/addon-quantity.spec.sql
--
-- 전체가 한 트랜잭션이고 마지막에 ROLLBACK 한다. 어떤 데이터도 남기지
-- 않는다. 단언 실패는 예외로 터져 psql 이 비정상 종료(ON_ERROR_STOP)한다.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 단언 및 픽스처 헬퍼(pg_temp, 세션 종료와 함께 소멸)
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

-- 주어진 SQL 이 want 로 지정한 SQLSTATE 로 실패하는지 단언한다.
create function pg_temp.expect_error(t text, p_sql text, want text) returns void
language plpgsql as $$
declare
  v_state text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    if v_state is distinct from want then
      raise exception '[FAIL] %: sqlstate %, want %', t, v_state, want;
    end if;
    raise notice '[PASS] % = %', t, want;
    return;
  end;
  raise exception '[FAIL] %: 예외가 나지 않았다, want %', t, want;
end $$;

create function pg_temp.as_user(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
end $$;

create function pg_temp.mk_user(p_email text, p_role text, p_member_type text) returns uuid
language plpgsql as $$
declare
  v_id uuid := gen_random_uuid();
begin
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

-- 학부모-학생 승인 링크.
create function pg_temp.mk_pair(p_tag text, out o_parent uuid, out o_student uuid)
language plpgsql as $$
begin
  o_parent  := pg_temp.mk_user(p_tag || '-p@t.local', 'user', 'parent');
  o_student := pg_temp.mk_user(p_tag || '-s@t.local', 'user', 'student');
  insert into public.parent_child_links (parent_id, student_id, status, responded_at)
  values (o_parent, o_student, 'approved', now());
end $$;

-- 결제 완료 주문 1건(+부여). 운영과 같은 경로(fn_grant_program_access_for_order).
create function pg_temp.mk_paid_order(
  p_order_id text, p_parent uuid, p_student uuid, p_slug text, p_qty int
) returns jsonb
language plpgsql as $$
declare
  v_p public.products;
begin
  select * into v_p from public.products where slug = p_slug;
  insert into public.orders (
    id, user_id, status, order_name, list_amount, discount_amount, amount,
    customer_email, paid_at, created_at,
    student_profile_id, parent_profile_id,
    approval_status, requested_at, responded_at
  ) values (
    p_order_id, p_parent, 'paid', p_order_id, v_p.list_price * p_qty, 0, v_p.price * p_qty,
    'spec@test.local', now(), now(),
    p_student, p_parent,
    'approved', now(), now()
  );
  insert into public.order_items (order_id, product_slug, service_key, name, list_price, price, quantity, product_id)
  values (p_order_id, v_p.slug, v_p.service_key, v_p.name, v_p.list_price, v_p.price, p_qty, v_p.id);
  return public.fn_grant_program_access_for_order(p_order_id, p_parent, now());
end $$;

-- fn_request_enrollment 호출용 p_items 한 줄.
create function pg_temp.item(p_slug text, p_qty int) returns jsonb
language sql as $$
  select jsonb_build_array(jsonb_build_object(
    'product_id', p.id, 'product_slug', p.slug, 'service_key', p.service_key,
    'name', p.name, 'list_price', p.list_price, 'price', p.price, 'quantity', p_qty))
    from public.products p where p.slug = p_slug;
$$;

-- ---------------------------------------------------------------------
-- 픽스처: 상품(기존 program_key 'inquiry' 사용)
-- ---------------------------------------------------------------------
insert into public.products
  (service_key, service_name, name, slug, program_key, list_price, price,
   duration_months, session_quota, validity_days, addon_only) values
  ('inquiry', 'spec', 'spec addon 1',  'spec-addon-1',  'inquiry', 2000, 2000, null, 1, 30, true),
  ('inquiry', 'spec', 'spec month 2',  'spec-month-2',  'inquiry', 5000, 5000, 1,    2, null, false),
  ('inquiry', 'spec', 'spec single 1', 'spec-single-1', 'inquiry', 3500, 3500, null, 1, 30, false);

-- ---------------------------------------------------------------------
-- T1 살아있는 부여가 없는 학생의 추가 이용권 요청은 WC067
-- ---------------------------------------------------------------------
do $$
declare
  r record;
  v_p uuid; v_s uuid;
begin
  select * into r from pg_temp.mk_pair('t1');
  v_p := r.o_parent; v_s := r.o_student;
  perform pg_temp.expect_error('T1 부여 없는 학생 addon 요청',
    format($q$select * from public.fn_request_enrollment('spec-t1', %L, %L, 'a@b.c', 'n', pg_temp.item('spec-addon-1', 1), 2000, 2000)$q$,
           v_s, v_p),
    'WC067');
end $$;

-- ---------------------------------------------------------------------
-- 공통 학생: 월 2회 상품(spec-month-2) 결제로 살아있는 부여 보유
-- ---------------------------------------------------------------------
create temp table spec_ctx as
  select * from pg_temp.mk_pair('base');
select pg_temp.mk_paid_order('spec-base', o_parent, o_student, 'spec-month-2', 1) from spec_ctx;

-- ---------------------------------------------------------------------
-- T2 살아있는 부여가 있는 학생이 addon 수량 2 요청: 주문 생성
-- ---------------------------------------------------------------------
do $$
declare
  c spec_ctx;
  r record;
begin
  select * into c from spec_ctx;
  select * into r from public.fn_request_enrollment(
    'spec-t2', c.o_student, c.o_parent, 'a@b.c', 'n',
    pg_temp.item('spec-addon-1', 2), 4000, 4000);
  perform pg_temp.expect_int('T2 order_items.quantity',
    (select quantity from public.order_items where order_id = 'spec-t2'), 2);
  perform pg_temp.expect_int('T2 orders.amount',
    (select amount from public.orders where id = 'spec-t2'), 4000);
end $$;

-- ---------------------------------------------------------------------
-- T3 결제 완료 후 부여: 회차 2, 금액 4000, 시작은 결제일 KST 자정
-- ---------------------------------------------------------------------
do $$
declare
  c spec_ctx;
  g record;
  v_base_expires timestamptz;
begin
  select * into c from spec_ctx;
  select expires_at into v_base_expires
    from public.program_access_grants where order_id = 'spec-base';

  update public.orders
     set approval_status = 'approved', responded_at = now(),
         status = 'paid', paid_at = now()
   where id = 'spec-t2';
  perform public.fn_grant_program_access_for_order('spec-t2', c.o_parent, now());

  select * into g from public.program_access_grants where order_id = 'spec-t2';
  perform pg_temp.expect_int('T3 granted_sessions', g.granted_sessions, 2);
  perform pg_temp.expect_int('T3 paid_amount', g.paid_amount, 4000);
  perform pg_temp.expect_bool('T3 starts_at = 결제일 KST 자정',
    g.starts_at = public.fn_kst_day_start(now()), true);
  perform pg_temp.expect_bool('T3 기존 부여 만료 뒤로 밀리지 않음',
    g.starts_at < v_base_expires, true);
  perform pg_temp.expect_bool('T3 expires_at = starts_at + 30일',
    g.expires_at = g.starts_at + interval '30 days', true);
end $$;

-- ---------------------------------------------------------------------
-- T4 일반 상품 수량 2 요청은 WC068
-- ---------------------------------------------------------------------
do $$
declare
  c spec_ctx;
begin
  select * into c from spec_ctx;
  perform pg_temp.expect_error('T4 일반 상품 quantity 2',
    format($q$select * from public.fn_request_enrollment('spec-t4', %L, %L, 'a@b.c', 'n', pg_temp.item('spec-single-1', 2), 7000, 7000)$q$,
           c.o_student, c.o_parent),
    'WC068');
end $$;

-- ---------------------------------------------------------------------
-- T5 addon 수량 11 및 0 은 WC068
-- ---------------------------------------------------------------------
do $$
declare
  c spec_ctx;
begin
  select * into c from spec_ctx;
  perform pg_temp.expect_error('T5 addon quantity 11',
    format($q$select * from public.fn_request_enrollment('spec-t5a', %L, %L, 'a@b.c', 'n', pg_temp.item('spec-addon-1', 11), 22000, 22000)$q$,
           c.o_student, c.o_parent),
    'WC068');
  perform pg_temp.expect_error('T5 addon quantity 0',
    format($q$select * from public.fn_request_enrollment('spec-t5b', %L, %L, 'a@b.c', 'n', pg_temp.item('spec-addon-1', 0), 2000, 2000)$q$,
           c.o_student, c.o_parent),
    'WC068');
end $$;

-- ---------------------------------------------------------------------
-- T6 기간 상품(duration_months)에 수량 2 가 직접 들어간 주문은 건너뜀
-- ---------------------------------------------------------------------
do $$
declare
  r record;
  v jsonb;
begin
  select * into r from pg_temp.mk_pair('t6');
  v := pg_temp.mk_paid_order('spec-t6', r.o_parent, r.o_student, 'spec-month-2', 2);
  perform pg_temp.expect_text('T6 skipped reason',
    v -> 'skipped' -> 0 ->> 'reason', 'unsupported_quantity');
  perform pg_temp.expect_int('T6 부여 행 수',
    (select count(*) from public.program_access_grants where order_id = 'spec-t6'), 0);
end $$;

-- ---------------------------------------------------------------------
-- T7 학부모 대체 구성 경로에서는 addon 상품이 WC067
-- ---------------------------------------------------------------------
do $$
declare
  c spec_ctx;
  r record;
begin
  select * into c from spec_ctx;
  select * into r from public.fn_request_enrollment(
    'spec-t7', c.o_student, c.o_parent, 'a@b.c', 'n',
    pg_temp.item('spec-single-1', 1), 3500, 3500);
  perform pg_temp.as_user(c.o_parent);
  perform pg_temp.expect_error('T7 학부모 구성에 addon',
    $q$select * from public.fn_parent_create_enrollment('spec-t7',
        (select jsonb_build_array(jsonb_build_object('product_id', id)) from public.products where slug = 'spec-addon-1'))$q$,
    'WC067');
end $$;

-- ---------------------------------------------------------------------
-- T8 요약이 월 2회와 추가 2회를 quota_total 4 로 합산
-- ---------------------------------------------------------------------
do $$
declare
  c spec_ctx;
begin
  select * into c from spec_ctx;
  perform pg_temp.expect_int('T8 quota_total',
    (select quota_total from public.fn_program_access_grants_summary(c.o_student, 'inquiry')), 4);
  perform pg_temp.expect_int('T8 live_count',
    (select live_count from public.fn_program_access_grants_summary(c.o_student, 'inquiry')), 2);
end $$;

do $$ begin raise notice '=== addon-quantity.spec: 전체 통과 ==='; end $$;

rollback;
