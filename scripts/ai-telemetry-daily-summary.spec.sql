-- =====================================================================
-- fn_ai_telemetry_daily_summary 시간대 인자 SQL 스펙
--
-- 하루 경계는 호출자가 넘긴 시간대(p_tz)로 정한다. 전체가 한 트랜잭션이고
-- 마지막에 ROLLBACK 한다. 단언 실패는 예외로 터진다.
-- =====================================================================
begin;

create function pg_temp.expect_text(t text, got text, want text) returns void
language plpgsql as $$
begin
  if got is distinct from want then
    raise exception '[FAIL] %: got %, want %', t, got, want;
  end if;
  raise notice '[PASS] % = %', t, want;
end $$;

-- 2026-11-22T15:30Z 호출 1건. 서울은 11-23, UTC는 11-22.
insert into public.ai_model_calls
  (created_at, started_at, trace_id, kind, service, feature, model,
   status, latency_ms)
values
  ('2026-11-22T15:30:00Z', '2026-11-22T15:30:00Z', gen_random_uuid(),
   'generate', 'goal', 'spec-feature', 'spec-model-tz', 'ok', 100);

select pg_temp.expect_text(
  'Asia/Seoul 은 11-23',
  (select s.day::text from public.fn_ai_telemetry_daily_summary(
     '2026-11-20T00:00:00Z', '2026-11-25T00:00:00Z', 'goal', 'Asia/Seoul') s
    where s.model = 'spec-model-tz'),
  '2026-11-23');

select pg_temp.expect_text(
  'UTC 는 11-22',
  (select s.day::text from public.fn_ai_telemetry_daily_summary(
     '2026-11-20T00:00:00Z', '2026-11-25T00:00:00Z', 'goal', 'UTC') s
    where s.model = 'spec-model-tz'),
  '2026-11-22');

rollback;
