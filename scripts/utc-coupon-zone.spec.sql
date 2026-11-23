-- =====================================================================
-- UTC 전환 U4b-coupon: 쿠폰 기한 판정과 발급 기한이 쿠폰 사용자의 시간대를 쓰는지
--
-- 실행: 마이그레이션이 전부 적용된 스택에서
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/utc-coupon-zone.spec.sql
--
-- 전체가 한 트랜잭션이고 마지막에 ROLLBACK 한다. 어떤 데이터도 남기지
-- 않는다. 단언 실패는 예외로 터져 psql 이 비정상 종료(ON_ERROR_STOP)한다.
--
-- 시간 축: now() 를 고정할 수 없으므로 "지금 현지 날짜가 항상 다른" 두 시간대를
-- 쓴다. Pacific/Pago_Pago(UTC-11)와 Pacific/Kiritimati(UTC+14)는 25시간
-- 차이라 현지 날짜가 항상 하루 이상 벌어진다. Asia/Seoul 은 기존 결과 불변 확인용.
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

create function pg_temp.as_user(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
end $$;

-- 회원 생성 + 시간대 지정.
create function pg_temp.mk_user(p_email text, p_role text, p_member_type text, p_tz text)
returns uuid
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
  insert into public.profiles (id, name, role, member_type, email, time_zone)
  values (v_id, p_email, p_role, p_member_type, p_email, p_tz)
  on conflict (id) do update
    set role = excluded.role, member_type = excluded.member_type,
        name = excluded.name, time_zone = excluded.time_zone;
  return v_id;
end $$;

-- 발급형 쿠폰 1장과 사용자에게 valid_until 로 발급한 grant 1건.
create function pg_temp.mk_grant(p_slug text, p_user uuid, p_until date) returns uuid
language plpgsql as $$
declare
  v_coupon uuid;
begin
  insert into public.coupons (title, discount_amount, slug, grant_type, max_uses_per_user)
  values (p_slug, 1000, p_slug, 'granted', 1)
  returning id into v_coupon;
  insert into public.coupon_grants (coupon_id, user_id, granted_by, valid_until)
  values (v_coupon, p_user, 'admin', p_until);
  return v_coupon;
end $$;

create temp table fx (k text primary key, v text) on commit drop;

-- 사용자 3명: 서울 / 사모아(UTC-11) / 키리바시(UTC+14)
insert into fx
select 'seoul', pg_temp.mk_user('cz-seoul@t.local', 'user', 'student', 'Asia/Seoul')::text
union all select 'pago', pg_temp.mk_user('cz-pago@t.local', 'user', 'student', 'Pacific/Pago_Pago')::text
union all select 'kiri', pg_temp.mk_user('cz-kiri@t.local', 'user', 'student', 'Pacific/Kiritimati')::text;

-- ---------------------------------------------------------------------
-- fn_coupon_is_granted: 발급분 기한(date, 포함)은 사용자 현지 오늘과 비교한다
-- ---------------------------------------------------------------------
do $$
declare
  v_seoul uuid := (select v::uuid from fx where k = 'seoul');
  v_pago  uuid := (select v::uuid from fx where k = 'pago');
  v_kiri  uuid := (select v::uuid from fx where k = 'kiri');
  v_pago_today  date := public.fn_local_date(now(), 'Pacific/Pago_Pago');
  v_seoul_today date := public.fn_local_date(now(), 'Asia/Seoul');
  c uuid;
begin
  -- 기한 = 사모아 오늘: 사모아 사용자는 마지막 날이라 유효, 키리바시 사용자는 이미 지났다.
  c := pg_temp.mk_grant('cz-g-pago', v_pago, v_pago_today);
  perform pg_temp.expect_bool('is_granted 사모아 마지막 날 유효', public.fn_coupon_is_granted(c, v_pago), true);
  c := pg_temp.mk_grant('cz-g-kiri', v_kiri, v_pago_today);
  perform pg_temp.expect_bool('is_granted 키리바시는 같은 기한이 이미 지남', public.fn_coupon_is_granted(c, v_kiri), false);
  -- 서울: 기존 결과 불변(오늘까지 유효, 어제까지면 무효).
  c := pg_temp.mk_grant('cz-g-seoul-ok', v_seoul, v_seoul_today);
  perform pg_temp.expect_bool('is_granted 서울 마지막 날 유효', public.fn_coupon_is_granted(c, v_seoul), true);
  c := pg_temp.mk_grant('cz-g-seoul-ng', v_seoul, v_seoul_today - 1);
  perform pg_temp.expect_bool('is_granted 서울 어제 기한은 무효', public.fn_coupon_is_granted(c, v_seoul), false);
end $$;

rollback;
