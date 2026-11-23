-- =====================================================================
-- 본사 대시보드 추이와 위닝 B2C 화면 SQL 스펙 (분석 grill Q5 A10, A11)
--   fn_hq_login_buckets 의 p_scope(all, b2c), fn_hq_trend_buckets(가입, 결제 추이), fn_hq_b2c_summary(B2C 회원, 결제)
--
-- 실행: 마이그레이션이 전부 적용된 스택에서
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/b2b-hq-b2c-trends.spec.sql
--
-- 전체가 한 트랜잭션이고 마지막에 ROLLBACK 한다. 날짜는 2002년을 써서 로컬 스택의 기록과 겹치지 않게 한다.
-- =====================================================================
begin;

create function pg_temp.expect_bool(t text, got boolean, want boolean) returns void
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

create function pg_temp.mk_user(p_email text, p_role text, p_type text) returns uuid
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
  insert into public.profiles (id, name, role, email, member_type)
  values (v_id, p_email, p_role, p_email, p_type)
  on conflict (id) do update set role = excluded.role, member_type = excluded.member_type, name = excluded.name;
  return v_id;
end $$;


create temp table fx (k text primary key, v uuid);
insert into fx values
  ('b1', pg_temp.mk_user('hqb-b1@t.local', 'user', 'student')),
  ('b2', pg_temp.mk_user('hqb-b2@t.local', 'user', 'student')),
  ('bp', pg_temp.mk_user('hqb-bp@t.local', 'user', 'parent')),
  ('ca', pg_temp.mk_user('hqb-ca@t.local', 'user', 'student')),
  ('tn', pg_temp.mk_user('hqb-tn@t.local', 'user', 'student')),
  ('tp', pg_temp.mk_user('hqb-tp@t.local', 'user', 'parent')),
  ('qa', pg_temp.mk_user('hqb-qa@t.local', 'user', 'student')),
  ('adm', pg_temp.mk_user('hqb-adm@t.local', 'admin', null)),
  ('off', pg_temp.mk_user('hqb-off@t.local', 'user', 'student')),
  ('del', pg_temp.mk_user('hqb-del@t.local', 'user', 'student'));
create function pg_temp.fx(p_k text) returns uuid language sql as $$ select v from fx where k = p_k $$;
insert into public.qa_accounts (profile_id) values (pg_temp.fx('qa'));
-- B2C 회원 수에서 빼는 계정(Q9 와 같은 기준): 비활성, 이름 "삭제된 학생".
update public.profiles set is_active = false where id = pg_temp.fx('off');
update public.profiles set name = '삭제된 학생' where id = pg_temp.fx('del');

-- 실제 기관 하나와 기타 소속(catch-all) 기관 하나. 기타 소속은 한 사이트에 하나뿐이라 없을 때만 만든다.
insert into public.tenants (code, name, region, org_type, tier) values ('HQBSPEC2', '스펙기관', '서울', '학교', 'S');
insert into public.tenants (code, name, region, org_type, tier, is_catch_all)
  select 'HQBCATCH', '기타 소속', '서울', '기타', 'S', true
   where not exists (select 1 from public.tenants where is_catch_all);
update public.profiles set tenant_id = (select id from public.tenants where code = 'HQBSPEC2')
 where id in (pg_temp.fx('tn'), pg_temp.fx('tp'));
update public.profiles set tenant_id = (select id from public.tenants where is_catch_all)
 where id = pg_temp.fx('ca');

-- 가입 시각. KST 경계: 2002-03-03 14:59:59 UTC = KST 3/3 23:59:59, 15:00 UTC = KST 3/4 00:00
update public.profiles set created_at = timestamptz '2002-03-03 14:59:59+00' where id = pg_temp.fx('b1');
update public.profiles set created_at = timestamptz '2002-03-03 15:00:00+00' where id = pg_temp.fx('b2');
update public.profiles set created_at = timestamptz '2002-03-04 10:00+09' where id = pg_temp.fx('bp');
update public.profiles set created_at = timestamptz '2002-03-04 11:00+09' where id = pg_temp.fx('tn');
update public.profiles set created_at = timestamptz '2002-03-11 09:00+09' where id in (pg_temp.fx('ca'), pg_temp.fx('tp'));
update public.profiles set created_at = timestamptz '2002-03-04 12:00+09' where id in (pg_temp.fx('qa'), pg_temp.fx('adm'));

-- 로그인 기록(실측). 이 스펙의 기록만 보이게 비운다.
delete from public.profile_login_days;
insert into public.profile_login_days (profile_id, kst_date, first_seen_at) values
  (pg_temp.fx('b1'), date '2002-03-10', timestamptz '2002-03-10 09:00+09'),
  (pg_temp.fx('ca'), date '2002-03-10', timestamptz '2002-03-10 09:10+09'),
  (pg_temp.fx('tn'), date '2002-03-10', timestamptz '2002-03-10 09:20+09'),
  (pg_temp.fx('qa'), date '2002-03-10', timestamptz '2002-03-10 09:30+09'),
  (pg_temp.fx('bp'), date '2002-03-11', timestamptz '2002-03-11 09:00+09'),
  (pg_temp.fx('tp'), date '2002-03-11', timestamptz '2002-03-11 09:00+09');

-- 주문. 결제자(user_id)는 학부모, 이용 학생은 student_profile_id.
create function pg_temp.mk_order(p_id text, p_student uuid, p_parent uuid, p_status text, p_paid_at timestamptz,
  p_list integer, p_discount integer) returns void
language plpgsql as $$
begin
  insert into public.orders (id, user_id, parent_profile_id, student_profile_id, status, approval_status, responded_at,
    list_amount, discount_amount, amount, customer_email, paid_at)
  values (p_id, p_parent, p_parent, p_student, p_status,
    case when p_status in ('paid', 'refunded') then 'approved' else 'requested' end,
    case when p_status in ('paid', 'refunded') then p_paid_at else null end,
    p_list, p_discount, p_list - p_discount, 'x@t.local', p_paid_at);
  insert into public.order_items (order_id, name, list_price, price, quantity, service_key)
  values (p_id, '스펙 상품', p_list, p_list, 1, 'goal');
end $$;
-- KST 경계: 2002-03-04 14:59:59 UTC = KST 3/4 23:59:59
select pg_temp.mk_order('hqb-o1', pg_temp.fx('b1'), pg_temp.fx('bp'), 'paid', timestamptz '2002-03-04 14:59:59+00', 10000, 0);
select pg_temp.mk_order('hqb-o2', pg_temp.fx('b2'), pg_temp.fx('bp'), 'paid', timestamptz '2002-03-05 10:00+09', 20000, 2000);
select pg_temp.mk_order('hqb-o3', pg_temp.fx('b1'), pg_temp.fx('bp'), 'refunded', timestamptz '2002-03-06 10:00+09', 5000, 0);
select pg_temp.mk_order('hqb-o4', pg_temp.fx('b1'), pg_temp.fx('bp'), 'pending', null, 7000, 0);
select pg_temp.mk_order('hqb-o5', pg_temp.fx('tn'), pg_temp.fx('tp'), 'paid', timestamptz '2002-03-05 11:00+09', 30000, 0);
select pg_temp.mk_order('hqb-o6', pg_temp.fx('qa'), pg_temp.fx('bp'), 'paid', timestamptz '2002-03-05 12:00+09', 40000, 0);
select pg_temp.mk_order('hqb-o7', pg_temp.fx('ca'), pg_temp.fx('tp'), 'paid', timestamptz '2002-03-12 10:00+09', 8000, 0);
-- 환불 완료는 fn_complete_refund 로만 된다(트리거). 스펙은 트리거를 잠시 끄고 원장 행만 만든다.
set local session_replication_role = replica;
insert into public.refund_requests (user_id, order_id, order_item_id, amount, status, student_profile_id, parent_profile_id,
  requested_by, approval_status, approval_responded_at)
values (pg_temp.fx('bp'), 'hqb-o3', (select id from public.order_items where order_id = 'hqb-o3'), 5000, 'completed',
  pg_temp.fx('b1'), pg_temp.fx('bp'), pg_temp.fx('bp'), 'approved', now());
set local session_replication_role = origin;

-- ---------------------------------------------------------------------
-- fn_hq_login_buckets 범위(p_scope): all 은 전부, b2c 는 기관 없음 또는 기타 소속만
-- ---------------------------------------------------------------------
create function pg_temp.lb(p_from date, p_to date, p_grain text, p_inc boolean, p_scope text)
returns table (bucket_start date, bucket_end date, source text, members bigint, by_member_type jsonb)
language sql as $$ select * from public.fn_hq_login_buckets(p_from, p_to, p_grain, 'calendar', p_inc, p_scope) $$;

select pg_temp.expect_text('all 은 기관 학생도 센다(QA 제외)',
  (select members::text from pg_temp.lb('2002-03-10', '2002-03-10', 'day', false, 'all')), '3');
select pg_temp.expect_text('b2c 는 기관 없음과 기타 소속만 센다',
  (select source || ':' || members from pg_temp.lb('2002-03-10', '2002-03-10', 'day', false, 'b2c')), 'measured:2');
select pg_temp.expect_text('b2c 도 포함 스위치를 켜면 QA 를 센다',
  (select members::text from pg_temp.lb('2002-03-10', '2002-03-10', 'day', true, 'b2c')), '3');
select pg_temp.expect_text('b2c 유형별 인원',
  (select by_member_type::text from pg_temp.lb('2002-03-10', '2002-03-11', 'month', false, 'b2c')), '{"parent": 1, "student": 2}');
select pg_temp.expect_error('모르는 범위는 거부',
  $$select * from public.fn_hq_login_buckets('2002-03-10', '2002-03-11', 'day', 'calendar', false, 'b2b')$$, '22023');
select pg_temp.expect_error('범위가 비면 거부',
  $$select * from public.fn_hq_login_buckets('2002-03-10', '2002-03-11', 'day', 'calendar', false, null)$$, '22023');
select pg_temp.expect_bool('5개 인자 옛 함수는 없다',
  to_regprocedure('public.fn_hq_login_buckets(date, date, text, text, boolean)') is null, true);

-- ---------------------------------------------------------------------
-- fn_hq_trend_buckets: 묶음마다 새 가입(유형별)과 결제 주문 수(A10)
-- ---------------------------------------------------------------------
create function pg_temp.tb(p_from date, p_to date, p_grain text, p_mode text, p_inc boolean)
returns table (bucket_start date, bucket_end date, signups bigint, signups_by_member_type jsonb, paid_orders bigint)
language sql as $$ select * from public.fn_hq_trend_buckets(p_from, p_to, p_grain, p_mode, p_inc) $$;

select pg_temp.expect_text('KST 3/3 23:59:59 가입은 3/3, UTC 3/3 15:00 가입은 3/4',
  (select string_agg(bucket_start::text || ':' || signups, ',' order by bucket_start)
     from pg_temp.tb('2002-03-03', '2002-03-04', 'day', 'calendar', false)),
  '2002-03-03:1,2002-03-04:3');
select pg_temp.expect_text('가입 유형별 인원(QA, 관리자 제외)',
  (select signups_by_member_type::text from pg_temp.tb('2002-03-04', '2002-03-04', 'day', 'calendar', false)),
  '{"parent": 1, "student": 2}');
select pg_temp.expect_text('포함 스위치를 켜면 QA 와 유형 없는 관리자도 센다',
  (select signups_by_member_type::text from pg_temp.tb('2002-03-04', '2002-03-04', 'day', 'calendar', true)),
  '{"none": 1, "parent": 1, "student": 3}');
select pg_temp.expect_text('가입이 없는 날은 0 과 빈 객체',
  (select signups || ':' || signups_by_member_type::text from pg_temp.tb('2002-03-05', '2002-03-05', 'day', 'calendar', false)),
  '0:{}');
select pg_temp.expect_text('결제 주문은 paid 와 refunded 를 결제일(KST)로 센다, pending 과 QA 학생 주문은 뺀다',
  (select string_agg(bucket_start::text || ':' || paid_orders, ',' order by bucket_start)
     from pg_temp.tb('2002-03-04', '2002-03-06', 'day', 'calendar', false)),
  '2002-03-04:1,2002-03-05:2,2002-03-06:1');
select pg_temp.expect_text('포함 스위치를 켜면 QA 학생 주문도 센다',
  (select paid_orders::text from pg_temp.tb('2002-03-05', '2002-03-05', 'day', 'calendar', true)), '3');
select pg_temp.expect_text('주 묶음은 월요일 시작이고 기간 양 끝에서 자른다',
  (select string_agg(bucket_start::text || '=' || bucket_end::text || ':' || signups || ':' || paid_orders, ',' order by bucket_start)
     from pg_temp.tb('2002-03-03', '2002-03-12', 'week', 'calendar', false)),
  '2002-03-03=2002-03-03:1:0,2002-03-04=2002-03-10:3:4,2002-03-11=2002-03-12:2:1');
select pg_temp.expect_text('달 묶음 최근 30일 기준은 로그인 묶음과 같은 창',
  (select string_agg(bucket_start::text || '=' || bucket_end::text, ',' order by bucket_start)
     from pg_temp.tb('2002-02-01', '2002-03-12', 'month', 'rolling30', false)),
  (select string_agg(bucket_start::text || '=' || bucket_end::text, ',' order by bucket_start)
     from public.fn_hq_login_buckets('2002-02-01', '2002-03-12', 'month', 'rolling30', false, 'all')));
select pg_temp.expect_error('추이도 시작일이 종료일보다 늦으면 거부',
  $$select * from public.fn_hq_trend_buckets('2002-03-05', '2002-03-04', 'day', 'calendar', false)$$, '22023');
select pg_temp.expect_error('추이도 모르는 묶음 단위는 거부',
  $$select * from public.fn_hq_trend_buckets('2002-03-04', '2002-03-05', 'year', 'calendar', false)$$, '22023');

-- ---------------------------------------------------------------------
-- fn_hq_b2c_summary: B2C 회원 수(유형별), 기간 결제(admin_revenue_items 그대로 합)
-- ---------------------------------------------------------------------
select pg_temp.expect_text('B2C 회원 수는 비활성과 "삭제된 학생"을 포함 스위치와 무관하게 뺀다',
  (select member_total::text from public.fn_hq_b2c_summary('2002-03-01', '2002-03-31', true)), '6');
select pg_temp.expect_text('B2C 회원은 기관 없음과 기타 소속, QA 와 관리자 제외',
  (select member_total || ' ' || by_member_type::text
     from public.fn_hq_b2c_summary('2002-03-01', '2002-03-31', false)
    where true),
  (select (count(*) filter (where k in ('b1', 'b2', 'bp', 'ca')))::text from fx) || ' ' || '{"parent": 1, "student": 3}');
select pg_temp.expect_text('B2C 결제: 학생 3명, 주문 4건, 결제 41000(주문 할인 2000 안분) 환불 5000 순매출 36000',
  (select paying_members || ' ' || order_count || ' ' || paid_amount || ' ' || refunded_amount || ' ' || net_amount
     from public.fn_hq_b2c_summary('2002-03-01', '2002-03-31', false)),
  '3 4 41000 5000 36000');
select pg_temp.expect_text('결제 합은 admin_revenue_items 의 같은 행 합과 같다',
  (select net_amount::text from public.fn_hq_b2c_summary('2002-03-01', '2002-03-31', false)),
  (select sum(net_amount)::text from public.admin_revenue_items where order_id in ('hqb-o1', 'hqb-o2', 'hqb-o3', 'hqb-o7')));
select pg_temp.expect_text('기간은 결제일 KST 로 자른다(3/4 23:59:59 KST 결제는 3/4 에 든다)',
  (select order_count || ' ' || paid_amount from public.fn_hq_b2c_summary('2002-03-04', '2002-03-04', false)),
  '1 10000');
select pg_temp.expect_text('포함 스위치를 켜면 QA 회원과 QA 학생 결제도 센다',
  (select member_total || ' ' || order_count from public.fn_hq_b2c_summary('2002-03-01', '2002-03-31', true)),
  (select (count(*) filter (where k in ('b1', 'b2', 'bp', 'ca', 'qa', 'adm')))::text from fx) || ' 5');
select pg_temp.expect_text('결제가 없는 기간은 0',
  (select paying_members || ' ' || order_count || ' ' || paid_amount || ' ' || net_amount
     from public.fn_hq_b2c_summary('2002-01-01', '2002-01-31', false)),
  '0 0 0 0');
select pg_temp.expect_error('요약도 시작일이 종료일보다 늦으면 거부',
  $$select * from public.fn_hq_b2c_summary('2002-03-05', '2002-03-04', false)$$, '22023');

-- ---------------------------------------------------------------------
-- 권한
-- ---------------------------------------------------------------------
create temp table fns (sig text);
insert into fns values
  ('public.fn_hq_login_buckets(date, date, text, text, boolean, text)'),
  ('public.fn_hq_trend_buckets(date, date, text, text, boolean)'),
  ('public.fn_hq_b2c_summary(date, date, boolean)'),
  ('public.fn_hq_buckets(date, date, text, text)'),
  ('public.fn_hq_is_b2c_tenant(uuid)');
select pg_temp.expect_bool('통계 함수 셋은 security definer',
  (select bool_and(prosecdef) from pg_proc where oid in (
    'public.fn_hq_login_buckets(date, date, text, text, boolean, text)'::regprocedure,
    'public.fn_hq_trend_buckets(date, date, text, text, boolean)'::regprocedure,
    'public.fn_hq_b2c_summary(date, date, boolean)'::regprocedure)), true);
select pg_temp.expect_bool('anon, authenticated 는 새 함수를 실행할 수 없다',
  (select bool_and(not has_function_privilege('anon', sig, 'execute')
               and not has_function_privilege('authenticated', sig, 'execute')) from fns), true);
select pg_temp.expect_bool('service_role 은 새 함수를 실행할 수 있다',
  (select bool_and(has_function_privilege('service_role', sig, 'execute')) from fns), true);

do $$ begin raise notice '=== b2b-hq-b2c-trends.spec: 전체 통과 ==='; end $$;

rollback;
