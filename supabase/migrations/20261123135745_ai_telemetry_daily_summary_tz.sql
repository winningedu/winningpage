-- UTC 전환 U2b: AI 텔레메트리 일별 요약의 하루 경계를 호출자 시간대로 정한다.
-- 시그니처가 바뀌므로 옛 함수를 지우고 새로 만든다. 호출부(api/_routes/admin/ai-telemetry.ts)는 항상 p_tz 를 넘긴다.

drop function if exists public.fn_ai_telemetry_daily_summary(timestamptz, timestamptz, text);

create function public.fn_ai_telemetry_daily_summary(
  p_from timestamptz,
  p_to timestamptz,
  p_service text default null,
  p_tz text default 'UTC'
)
returns table (
  day date,
  service text,
  model text,
  calls bigint,
  ok_calls bigint,
  error_calls bigint,
  retried_calls bigint,
  prompt_tokens bigint,
  output_tokens bigint,
  cached_tokens bigint,
  thoughts_tokens bigint,
  p50_ms double precision,
  p95_ms double precision,
  avg_ms double precision
)
language sql
stable
set search_path to 'public'
as $$
  select
    public.fn_local_date(c.created_at, p_tz) as day,
    c.service,
    c.model,
    count(*) as calls,
    count(*) filter (where c.status = 'ok') as ok_calls,
    count(*) filter (where c.status = 'error') as error_calls,
    count(*) filter (where c.attempt > 1) as retried_calls,
    coalesce(sum(c.prompt_tokens), 0)::bigint as prompt_tokens,
    coalesce(sum(c.output_tokens), 0)::bigint as output_tokens,
    coalesce(sum(c.cached_tokens), 0)::bigint as cached_tokens,
    coalesce(sum(c.thoughts_tokens), 0)::bigint as thoughts_tokens,
    percentile_cont(0.5) within group (order by c.latency_ms) as p50_ms,
    percentile_cont(0.95) within group (order by c.latency_ms) as p95_ms,
    avg(c.latency_ms)::double precision as avg_ms
  from public.ai_model_calls c
  where c.created_at >= p_from
    and c.created_at < p_to
    and (p_service is null or c.service = p_service)
    and c.kind = 'generate'
  group by 1, c.service, c.model
  order by 1, c.service, c.model;
$$;

alter function public.fn_ai_telemetry_daily_summary(timestamptz, timestamptz, text, text) owner to postgres;

revoke all on function public.fn_ai_telemetry_daily_summary(timestamptz, timestamptz, text, text) from public;
grant all on function public.fn_ai_telemetry_daily_summary(timestamptz, timestamptz, text, text) to service_role;
