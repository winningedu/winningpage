-- =====================================================================
-- 부산캠퍼스 10월 연장 + 목표관리 증정 SQL 시나리오 스펙
--
-- 실행: 마이그레이션이 전부 적용된 스택에서(데이터 파일 적용 전후 상태를 모두 검증)
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/busan-oct-goal-gift.spec.sql
--
-- 전체가 한 트랜잭션이고 마지막에 ROLLBACK 한다. 어떤 데이터도 남기지
-- 않는다. 단언 실패는 예외로 터져 psql 이 비정상 종료(ON_ERROR_STOP)한다.
--
-- 백필 검증을 위해 "이전 형태" 주문을 직접 만든 뒤 마이그레이션 파일을 같은
-- 트랜잭션 안에서 다시 실행(\ir)한다. 이어서 데이터 파일(scripts/busan-oct-
-- goal-gift-data.sql, bundle_items + 백필 B/C)을 실행한다. 데이터 파일 실행 전
-- (P*)과 후(S*, G*) 두 상태를 단언하고, 마지막에 둘을 다시 실행해 멱등을 본다.
-- 백필 B/C 는 now() 기준 "살아있는 부여"를 보므로 2026-11-30(KST) 이전에만
-- 의미 있게 통과한다(10월 결제분 만료일이 그 날이다).
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
-- p_paid_at 으로 결제 시각을 고정한다.
create function pg_temp.mk_paid_order(
  p_order_id text, p_parent uuid, p_student uuid, p_slug text, p_qty int,
  p_paid_at timestamptz default now()
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
    p_order_id, p_parent, 'paid', p_order_id, v_p.list_price * p_qty,
    (v_p.list_price - v_p.price) * p_qty, v_p.price * p_qty,
    'spec@test.local', p_paid_at, p_paid_at,
    p_student, p_parent,
    'approved', now(), now()
  );
  insert into public.order_items (order_id, product_slug, service_key, name, list_price, price, quantity, product_id)
  values (p_order_id, v_p.slug, v_p.service_key, v_p.name, v_p.list_price, v_p.price, p_qty, v_p.id);
  return public.fn_grant_program_access_for_order(p_order_id, p_parent, p_paid_at);
end $$;


-- 이전 형태(번들 3행) 부산 주문 1건을 부여까지 직접 만든다(백필 입력).
create function pg_temp.mk_legacy_busan(
  p_order_id text, p_parent uuid, p_student uuid, p_paid_at timestamptz
) returns void
language plpgsql as $$
declare
  v_p     public.products;
  v_item  bigint;
  v_start timestamptz := public.fn_kst_day_start(p_paid_at);
begin
  select * into v_p from public.products where slug = 'busan-9900';
  insert into public.orders (
    id, user_id, status, order_name, list_amount, discount_amount, amount,
    customer_email, paid_at, created_at,
    student_profile_id, parent_profile_id,
    approval_status, requested_at, responded_at
  ) values (
    p_order_id, p_parent, 'paid', p_order_id, 9900, 0, 9900,
    'spec@test.local', p_paid_at, p_paid_at,
    p_student, p_parent, 'approved', p_paid_at, p_paid_at
  );
  insert into public.order_items (order_id, product_slug, service_key, name, list_price, price, quantity, product_id)
  values (p_order_id, v_p.slug, v_p.service_key, v_p.name, 9900, 9900, 1, v_p.id)
  returning id into v_item;
  insert into public.program_access_grants (
    profile_id, program_key, order_id, order_item_id, product_id, product_slug,
    granted_by, granted_months, granted_sessions, paid_amount, starts_at, expires_at, validity_days
  ) values
    (p_student, 'diagnose', p_order_id, v_item, v_p.id, v_p.slug, 'payment',
     null, 1, 2475, v_start, v_start + interval '30 days', 30),
    (p_student, 'suhaeng', p_order_id, v_item, v_p.id, v_p.slug, 'payment',
     1, 2, 1238, v_start, public.fn_add_months_kst(v_start, 1), null),
    (p_student, 'target', p_order_id, v_item, v_p.id, v_p.slug, 'payment',
     1, null, 6187, v_start, public.fn_add_months_kst(v_start, 1), null);
end $$;

-- ---------------------------------------------------------------------
-- 이전 형태 픽스처: LA = 10월 결제 + 아직 살아있음, LB = 9월 결제 + 이미 만료
-- ---------------------------------------------------------------------
create temp table spec_la as select * from pg_temp.mk_pair('la');
create temp table spec_lb as select * from pg_temp.mk_pair('lb');
select pg_temp.mk_legacy_busan('spec-la', o_parent, o_student, '2026-10-05T03:00:00Z') from spec_la;
select pg_temp.mk_legacy_busan('spec-lb', o_parent, o_student, '2026-09-10T03:00:00Z') from spec_lb;

-- ---------------------------------------------------------------------
-- 이전 형태 목표관리 픽스처: 상품(번들 없음), GC1 = 살아있는 3개월권, GC2 = 이미 만료
--   spec-goal-scalar 는 증정 없는 기준 상품(환불 산정 비교용)이다. service_key 가
--   goal 이 아니라 증정 구성 대상이 아니다.
-- ---------------------------------------------------------------------
insert into public.products
  (service_key, service_name, service_desc, name, slug, program_key,
   list_price, price, duration_months, is_recommended) values
  ('goal', 'spec', '목표관리 설명.', 'spec goal 1m',  'goal-1m',  'target',  25000,  25000, 1,  false),
  ('goal', 'spec', '목표관리 설명.', 'spec goal 3m',  'goal-3m',  'target',  75000,  67500, 3,  false),
  ('goal', 'spec', '목표관리 설명.', 'spec goal 6m',  'goal-6m',  'target', 150000, 120000, 6,  false),
  ('goal', 'spec', '목표관리 설명.', 'spec goal 12m', 'goal-12m', 'target', 300000, 180000, 12, true),
  ('spec', 'spec', null,             'spec goal scalar', 'spec-goal-scalar', 'target', 75000, 67500, 3, false)
on conflict (slug) do nothing;

create function pg_temp.mk_legacy_goal(
  p_order_id text, p_parent uuid, p_student uuid, p_slug text, p_start timestamptz
) returns void
language plpgsql as $$
declare
  v_p    public.products;
  v_item bigint;
begin
  select * into v_p from public.products where slug = p_slug;
  insert into public.orders (
    id, user_id, status, order_name, list_amount, discount_amount, amount,
    customer_email, paid_at, created_at,
    student_profile_id, parent_profile_id,
    approval_status, requested_at, responded_at
  ) values (
    p_order_id, p_parent, 'paid', p_order_id, v_p.list_price, v_p.list_price - v_p.price, v_p.price,
    'spec@test.local', p_start, p_start,
    p_student, p_parent, 'approved', p_start, p_start
  );
  insert into public.order_items (order_id, product_slug, service_key, name, list_price, price, quantity, product_id)
  values (p_order_id, v_p.slug, v_p.service_key, v_p.name, v_p.list_price, v_p.price, 1, v_p.id)
  returning id into v_item;
  insert into public.program_access_grants (
    profile_id, program_key, order_id, order_item_id, product_id, product_slug,
    granted_by, granted_months, paid_amount, starts_at, expires_at
  ) values (
    p_student, 'target', p_order_id, v_item, v_p.id, v_p.slug, 'payment',
    v_p.duration_months, v_p.price, p_start, public.fn_add_months_kst(p_start, v_p.duration_months));
end $$;

create temp table spec_gc1 as select * from pg_temp.mk_pair('gc1');
create temp table spec_gc2 as select * from pg_temp.mk_pair('gc2');
select pg_temp.mk_legacy_goal('spec-gc1', o_parent, o_student, 'goal-3m',
  public.fn_kst_day_start(now()) - interval '10 days') from spec_gc1;
select pg_temp.mk_legacy_goal('spec-gc2', o_parent, o_student, 'goal-1m', '2026-08-01T00:00:00Z') from spec_gc2;

-- 마이그레이션 적용(재실행 포함 멱등). 이 시점부터 새 구성/새 함수가 보인다.
\ir ../supabase/migrations/20261021014317_busan_oct_extension_goal_gift.sql

create function pg_temp.same_quote(t text, p_a text, p_b text, p_at timestamptz, p_parent_a uuid, p_parent_b uuid)
returns void
language plpgsql as $$
declare
  qa record;
  qb record;
begin
  perform pg_temp.as_user(p_parent_a);
  select * into qa from public.fn_refund_quote(p_a, null, false, p_at);
  perform pg_temp.as_user(p_parent_b);
  select * into qb from public.fn_refund_quote(p_b, null, false, p_at);
  perform pg_temp.expect_int(t || ' refund_amount', qa.refund_amount, qb.refund_amount);
  perform pg_temp.expect_int(t || ' fee_amount', qa.fee_amount, qb.fee_amount);
  perform pg_temp.expect_text(t || ' policy_code', qa.policy_code, qb.policy_code);
  perform pg_temp.expect_text(t || ' scope', qa.scope, qb.scope);
  perform pg_temp.expect_int(t || ' lines 수', jsonb_array_length(qa.lines), jsonb_array_length(qb.lines));
  perform pg_temp.expect_text(t || ' line policy_code',
    qa.lines -> 0 ->> 'policy_code', qb.lines -> 0 ->> 'policy_code');
  perform pg_temp.expect_text(t || ' line refund',
    qa.lines -> 0 ->> 'refund', qb.lines -> 0 ->> 'refund');
end $$;

-- ---------------------------------------------------------------------
-- P 데이터 파일 실행 전: 부산은 3항목 그대로 10월 하한만 적용, 목표관리는 기존 경로
-- ---------------------------------------------------------------------
do $$
declare
  r record;
  ra record;
  rb record;
  v_paid timestamptz := now();
begin
  perform pg_temp.expect_int('P1 부산 bundle_items 행 수(전)',
    (select count(*) from public.bundle_items bi join public.products p on p.id = bi.product_id
      where p.slug = 'busan-9900'), 3);
  perform pg_temp.expect_int('P1 goal 상품 bundle_items 행 수(전)',
    (select count(*) from public.bundle_items bi join public.products p on p.id = bi.product_id
      where p.service_key = 'goal'), 0);

  select * into r from pg_temp.mk_pair('p2');
  perform pg_temp.mk_paid_order('spec-p2', r.o_parent, r.o_student, 'busan-9900', 1, '2026-10-20T03:00:00Z');
  perform pg_temp.expect_int('P2 10월 결제 부여 수(전)',
    (select count(*) from public.program_access_grants where order_id = 'spec-p2'), 3);
  perform pg_temp.expect_int('P2 전부 11/30 만료(전)',
    (select count(*) from public.program_access_grants
      where order_id = 'spec-p2' and expires_at = '2026-11-30T15:00:00Z'), 3);
  perform pg_temp.expect_int('P2 paid_amount 합(전)',
    (select sum(paid_amount) from public.program_access_grants where order_id = 'spec-p2'), 9900);

  perform pg_temp.expect_int('P3 LA 기존 3개 11/30 연장(백필 A)(전)',
    (select count(*) from public.program_access_grants
      where order_id = 'spec-la' and expires_at = '2026-11-30T15:00:00Z'), 3);
  perform pg_temp.expect_int('P3 LA 부여 수 3 유지(전)',
    (select count(*) from public.program_access_grants where order_id = 'spec-la'), 3);
  perform pg_temp.expect_int('P3 GC1 부여 수 1 유지(전)',
    (select count(*) from public.program_access_grants where order_id = 'spec-gc1'), 1);

  select * into r from pg_temp.mk_pair('p4');
  perform pg_temp.mk_paid_order('spec-p4', r.o_parent, r.o_student, 'goal-3m', 1, '2026-10-20T03:00:00Z');
  perform pg_temp.expect_int('P4 goal-3m 부여 수(전)',
    (select count(*) from public.program_access_grants where order_id = 'spec-p4'), 1);
  perform pg_temp.expect_int('P4 target paid_amount(전)',
    (select paid_amount from public.program_access_grants where order_id = 'spec-p4'),
    (select price from public.products where slug = 'goal-3m'));

  select * into ra from pg_temp.mk_pair('p5a');
  select * into rb from pg_temp.mk_pair('p5b');
  perform pg_temp.mk_paid_order('spec-p5a', ra.o_parent, ra.o_student, 'goal-3m', 1, v_paid);
  perform pg_temp.mk_paid_order('spec-p5b', rb.o_parent, rb.o_student, 'spec-goal-scalar', 1, v_paid);
  perform pg_temp.same_quote('P5 환불 산정(전)', 'spec-p5a', 'spec-p5b', v_paid, ra.o_parent, rb.o_parent);
end $$;

-- 데이터 파일 적용: 부산 6항목, 목표관리 증정 구성, 백필 B/C.
\ir busan-oct-goal-gift-data.sql

-- P6 백필 C 는 데이터 파일 실행 전에 만든 살아있는 목표관리 주문에도 증정을 보충한다.
do $$
begin
  perform pg_temp.expect_int('P6 spec-p4 부여 수(후)',
    (select count(*) from public.program_access_grants where order_id = 'spec-p4'), 3);
  perform pg_temp.expect_int('P6 spec-p2 부여 수(후)',
    (select count(*) from public.program_access_grants where order_id = 'spec-p2'), 6);
end $$;

-- ---------------------------------------------------------------------
-- S1 부산 상품 구성 6항목, 상품명, 10월 특례 컬럼
-- ---------------------------------------------------------------------
do $$
declare
  v_id uuid;
begin
  select id into v_id from public.products where slug = 'busan-9900';
  perform pg_temp.expect_int('S1 bundle_items 행 수',
    (select count(*) from public.bundle_items where product_id = v_id), 6);
  perform pg_temp.expect_text('S1 구성',
    (select string_agg(program_key || ':' || coalesce(duration_months::text, '-') || ':'
                       || coalesce(session_quota::text, '-') || ':' || coalesce(validity_days::text, '-')
                       || ':' || list_price, ',' order by program_key)
       from public.bundle_items where product_id = v_id),
    'diagnose:-:1:30:10000,growth:-:1:30:18000,inquiry:1:2:-:5000,selfeval:1:2:-:7500,suhaeng:1:2:-:5000,target:1:-:-:25000');
  perform pg_temp.expect_text('S1 상품명',
    (select name from public.products where slug = 'busan-9900'),
    '9,900원 부산캠퍼스 특별할인 학습관리 서비스 (1개월 이용권)');
  perform pg_temp.expect_text('S1 설명',
    (select service_desc from public.products where slug = 'busan-9900'),
    '위닝 부산캠퍼스 소속 회원 전용 특별할인 패키지입니다. 학습진단 1회, 목표관리 1개월, 성장설계 1회, 수행평가 2회, 심화탐구 2회, 자기평가 2회를 한 번의 결제로 이용할 수 있습니다.');
end $$;

-- ---------------------------------------------------------------------
-- S2 10월 결제 주문: 6개 부여 전부 2026-11-30(KST) 까지, 금액 합 9900
-- ---------------------------------------------------------------------
do $$
declare
  r record;
begin
  select * into r from pg_temp.mk_pair('s2');
  perform pg_temp.mk_paid_order('spec-s2', r.o_parent, r.o_student, 'busan-9900', 1, '2026-10-20T03:00:00Z');
  perform pg_temp.expect_int('S2 부여 수',
    (select count(*) from public.program_access_grants where order_id = 'spec-s2'), 6);
  perform pg_temp.expect_int('S2 만료일이 11/30 인 부여 수',
    (select count(*) from public.program_access_grants
      where order_id = 'spec-s2' and expires_at = '2026-11-30T15:00:00Z'), 6);
  perform pg_temp.expect_int('S2 paid_amount 합',
    (select sum(paid_amount) from public.program_access_grants where order_id = 'spec-s2'), 9900);
end $$;

-- ---------------------------------------------------------------------
-- S3 11월 결제 주문: 일반 규칙(1개월 / 30일)
-- ---------------------------------------------------------------------
do $$
declare
  r record;
  v_start timestamptz := public.fn_kst_day_start('2026-11-03T03:00:00Z');
begin
  select * into r from pg_temp.mk_pair('s3');
  perform pg_temp.mk_paid_order('spec-s3', r.o_parent, r.o_student, 'busan-9900', 1, '2026-11-03T03:00:00Z');
  perform pg_temp.expect_bool('S3 target = 시작 + 1개월',
    (select expires_at from public.program_access_grants where order_id = 'spec-s3' and program_key = 'target')
      = public.fn_add_months_kst(v_start, 1), true);
  perform pg_temp.expect_bool('S3 growth = 시작 + 30일',
    (select expires_at from public.program_access_grants where order_id = 'spec-s3' and program_key = 'growth')
      = v_start + interval '30 days', true);
  perform pg_temp.expect_int('S3 11/30 로 끌어올려진 부여 없음',
    (select count(*) from public.program_access_grants
      where order_id = 'spec-s3' and expires_at = '2026-11-30T15:00:00Z'), 0);
end $$;

-- ---------------------------------------------------------------------
-- S4 체이닝: 기존 부여가 더 늦게 끝나면 10월 특례가 그 만료를 줄이지 않는다
-- ---------------------------------------------------------------------
do $$
declare
  r record;
  v_prev timestamptz := '2027-01-31T15:00:00Z';
begin
  select * into r from pg_temp.mk_pair('s4');
  insert into public.program_access_grants (
    profile_id, program_key, granted_by, granted_months, paid_amount, starts_at, expires_at)
  values (r.o_student, 'suhaeng', 'qa', 3, 0, '2026-10-31T15:00:00Z', v_prev);
  perform pg_temp.mk_paid_order('spec-s4', r.o_parent, r.o_student, 'busan-9900', 1, '2026-10-20T03:00:00Z');
  perform pg_temp.expect_bool('S4 suhaeng 만료가 줄지 않음(기존 만료 + 1개월)',
    (select expires_at from public.program_access_grants where order_id = 'spec-s4' and program_key = 'suhaeng')
      = public.fn_add_months_kst(v_prev, 1), true);
  perform pg_temp.expect_int('S4 다른 5개는 11/30',
    (select count(*) from public.program_access_grants
      where order_id = 'spec-s4' and program_key <> 'suhaeng' and expires_at = '2026-11-30T15:00:00Z'), 5);
end $$;

-- ---------------------------------------------------------------------
-- S5 백필 A: 10월 결제 이전 형태 주문의 3개 부여가 11/30 로 연장, 9월 결제분은 그대로
-- ---------------------------------------------------------------------
do $$
begin
  perform pg_temp.expect_int('S5 LA 기존 3개 11/30 연장',
    (select count(*) from public.program_access_grants
      where order_id = 'spec-la' and expires_at = '2026-11-30T15:00:00Z'
        and program_key in ('diagnose', 'suhaeng', 'target')), 3);
  perform pg_temp.expect_int('S5 LB(9월 결제)는 연장 없음',
    (select count(*) from public.program_access_grants
      where order_id = 'spec-lb' and expires_at = '2026-11-30T15:00:00Z'), 0);
end $$;

-- ---------------------------------------------------------------------
-- S6 백필 B: 살아있는 이전 형태 주문에 growth 1 / inquiry 2 / selfeval 2 보충
-- ---------------------------------------------------------------------
do $$
declare
  g record;
begin
  perform pg_temp.expect_int('S6 LA 부여 수 6',
    (select count(*) from public.program_access_grants where order_id = 'spec-la'), 6);
  for g in
    select * from public.program_access_grants
     where order_id = 'spec-la' and program_key in ('growth', 'inquiry', 'selfeval')
  loop
    perform pg_temp.expect_int('S6 ' || g.program_key || ' 회차',
      g.granted_sessions, case g.program_key when 'growth' then 1 else 2 end);
    perform pg_temp.expect_int('S6 ' || g.program_key || ' paid_amount', g.paid_amount, 0);
    perform pg_temp.expect_bool('S6 ' || g.program_key || ' 시작 = 오늘 KST 자정',
      g.starts_at = public.fn_kst_day_start(now()), true);
    perform pg_temp.expect_bool('S6 ' || g.program_key || ' 만료 = target 만료',
      g.expires_at = '2026-11-30T15:00:00Z', true);
  end loop;
  perform pg_temp.expect_int('S6 LB(만료)는 보충 없음',
    (select count(*) from public.program_access_grants where order_id = 'spec-lb'), 3);
end $$;

-- ---------------------------------------------------------------------
-- G1 goal-3m 주문: 목표관리 3개월(전액) + 수행평가/심화탐구 3개월 6회(무상)
-- ---------------------------------------------------------------------
do $$
declare
  r record;
  g record;
  v_target timestamptz;
begin
  select * into r from pg_temp.mk_pair('g1');
  perform pg_temp.mk_paid_order('spec-g1', r.o_parent, r.o_student, 'goal-3m', 1, '2026-10-20T03:00:00Z');
  perform pg_temp.expect_int('G1 부여 수',
    (select count(*) from public.program_access_grants where order_id = 'spec-g1'), 3);
  select * into g from public.program_access_grants where order_id = 'spec-g1' and program_key = 'target';
  perform pg_temp.expect_int('G1 target 개월', g.granted_months, 3);
  perform pg_temp.expect_int('G1 target paid_amount',
    g.paid_amount, (select price from public.products where slug = 'goal-3m'));
  v_target := g.expires_at;
  for g in
    select * from public.program_access_grants
     where order_id = 'spec-g1' and program_key in ('suhaeng', 'inquiry')
  loop
    perform pg_temp.expect_int('G1 ' || g.program_key || ' 개월', g.granted_months, 3);
    perform pg_temp.expect_int('G1 ' || g.program_key || ' 회차', g.granted_sessions, 6);
    perform pg_temp.expect_int('G1 ' || g.program_key || ' paid_amount', g.paid_amount, 0);
    perform pg_temp.expect_bool('G1 ' || g.program_key || ' 만료 = target 만료', g.expires_at = v_target, true);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- G2 기간별 증정 회차: 1개월 2회, 6개월 12회, 12개월 24회
-- ---------------------------------------------------------------------
do $$
declare
  r record;
  v_slug text;
  v_months int;
begin
  foreach v_slug in array array['goal-1m', 'goal-6m', 'goal-12m'] loop
    select * into r from pg_temp.mk_pair('g2' || v_slug);
    perform pg_temp.mk_paid_order('spec-g2-' || v_slug, r.o_parent, r.o_student, v_slug, 1, '2026-10-20T03:00:00Z');
    select duration_months into v_months from public.products where slug = v_slug;
    perform pg_temp.expect_int('G2 ' || v_slug || ' suhaeng 회차',
      (select granted_sessions from public.program_access_grants
        where order_id = 'spec-g2-' || v_slug and program_key = 'suhaeng'), v_months * 2);
    perform pg_temp.expect_int('G2 ' || v_slug || ' inquiry 회차',
      (select granted_sessions from public.program_access_grants
        where order_id = 'spec-g2-' || v_slug and program_key = 'inquiry'), v_months * 2);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- G3 환불 산정(데이터 파일 적용 후)은 증정이 없는 기준 상품(spec-goal-scalar)과 같다
--   같은 시각 결제, 같은 금액. 개시 전 / 개시 후 40일 / 만료 후 세 시점과
--   order_item 지정(부분환불 경로)을 비교한다.
-- ---------------------------------------------------------------------

do $$
declare
  ra record;
  rb record;
  v_paid timestamptz := now();
  v_item_a bigint;
  v_item_b bigint;
  qa record;
  qb record;
begin
  select * into ra from pg_temp.mk_pair('g3a');
  select * into rb from pg_temp.mk_pair('g3b');
  perform pg_temp.mk_paid_order('spec-g3a', ra.o_parent, ra.o_student, 'goal-3m', 1, v_paid);
  perform pg_temp.mk_paid_order('spec-g3b', rb.o_parent, rb.o_student, 'spec-goal-scalar', 1, v_paid);

  perform pg_temp.same_quote('G3 개시 전', 'spec-g3a', 'spec-g3b', v_paid, ra.o_parent, rb.o_parent);

  update public.program_access_grants
     set first_accessed_at = v_paid
   where order_id in ('spec-g3a', 'spec-g3b') and program_key = 'target';
  perform pg_temp.same_quote('G3 개시 후 40일', 'spec-g3a', 'spec-g3b',
    v_paid + interval '40 days', ra.o_parent, rb.o_parent);
  perform pg_temp.same_quote('G3 만료 후', 'spec-g3a', 'spec-g3b',
    v_paid + interval '200 days', ra.o_parent, rb.o_parent);

  -- 부분환불 경로: order_item 을 직접 지정해도 같다.
  select id into v_item_a from public.order_items where order_id = 'spec-g3a';
  select id into v_item_b from public.order_items where order_id = 'spec-g3b';
  perform pg_temp.as_user(ra.o_parent);
  select refund_amount, scope into qa
    from public.fn_refund_quote('spec-g3a', array[v_item_a], false, v_paid + interval '40 days');
  perform pg_temp.as_user(rb.o_parent);
  select refund_amount, scope into qb
    from public.fn_refund_quote('spec-g3b', array[v_item_b], false, v_paid + interval '40 days');
  perform pg_temp.expect_int('G3 item 지정 refund_amount', qa.refund_amount, qb.refund_amount);
  perform pg_temp.expect_text('G3 item 지정 scope', qa.scope, 'order');
end $$;

-- ---------------------------------------------------------------------
-- G4 추천 배지: goal-6m 해제, goal-12m 지정 / G5 설명 두 번째 문장
-- ---------------------------------------------------------------------
do $$
begin
  perform pg_temp.expect_bool('G4 goal-6m is_recommended',
    (select is_recommended from public.products where slug = 'goal-6m'), true);
  perform pg_temp.expect_bool('G4 goal-12m is_recommended',
    (select is_recommended from public.products where slug = 'goal-12m'), false);
  perform pg_temp.expect_text('G5 goal-3m 설명',
    (select service_desc from public.products where slug = 'goal-3m'),
    E'목표관리 설명.\n목표관리서비스를 이용하면 수행평가 월 2회권, 심화탐구 월 2회권을 함께 이용할 수 있습니다.');
end $$;

-- ---------------------------------------------------------------------
-- G6 백필 C: 살아있는 목표관리 주문에 수행평가/심화탐구 증정 보충, 만료 주문은 제외
-- ---------------------------------------------------------------------
do $$
declare
  g record;
  v_target timestamptz;
begin
  select expires_at into v_target
    from public.program_access_grants where order_id = 'spec-gc1' and program_key = 'target';
  perform pg_temp.expect_int('G6 GC1 부여 수',
    (select count(*) from public.program_access_grants where order_id = 'spec-gc1'), 3);
  for g in
    select * from public.program_access_grants
     where order_id = 'spec-gc1' and program_key in ('suhaeng', 'inquiry')
  loop
    perform pg_temp.expect_int('G6 ' || g.program_key || ' 회차', g.granted_sessions, 6);
    perform pg_temp.expect_int('G6 ' || g.program_key || ' 개월', g.granted_months, 3);
    perform pg_temp.expect_int('G6 ' || g.program_key || ' paid_amount', g.paid_amount, 0);
    perform pg_temp.expect_bool('G6 ' || g.program_key || ' 시작 = 오늘 KST 자정',
      g.starts_at = public.fn_kst_day_start(now()), true);
    perform pg_temp.expect_bool('G6 ' || g.program_key || ' 만료 = target 만료', g.expires_at = v_target, true);
  end loop;
  perform pg_temp.expect_int('G6 GC2(만료) 부여 수',
    (select count(*) from public.program_access_grants where order_id = 'spec-gc2'), 1);
end $$;

-- ---------------------------------------------------------------------
-- I1 재실행 멱등: 마이그레이션과 데이터 파일을 한 번 더 돌려도 부여 원장이 그대로다
-- ---------------------------------------------------------------------
create temp table spec_snap as
  select order_id, program_key, expires_at, granted_sessions, paid_amount
    from public.program_access_grants where order_id like 'spec-%';

\ir ../supabase/migrations/20261021014317_busan_oct_extension_goal_gift.sql
\ir busan-oct-goal-gift-data.sql

do $$
begin
  perform pg_temp.expect_int('I1 행 수 동일',
    (select count(*) from public.program_access_grants where order_id like 'spec-%'),
    (select count(*) from spec_snap));
  perform pg_temp.expect_int('I1 변경된 행 없음',
    (select count(*) from (
       select order_id, program_key, expires_at, granted_sessions, paid_amount
         from public.program_access_grants where order_id like 'spec-%'
       except select * from spec_snap) d), 0);
  perform pg_temp.expect_int('I1 bundle_items 행 수',
    (select count(*) from public.bundle_items bi join public.products p on p.id = bi.product_id
      where p.slug = 'busan-9900' or p.service_key = 'goal'), 6 + 3 * 4);
  perform pg_temp.expect_int('I1 goal 설명 문장 중복 없음',
    (select (length(service_desc) - length(replace(service_desc, '월 2회권', ''))) / length('월 2회권')
       from public.products where slug = 'goal-3m'), 2);
end $$;

do $$ begin raise notice '=== busan-oct-goal-gift.spec: 전체 통과 ==='; end $$;

rollback;
