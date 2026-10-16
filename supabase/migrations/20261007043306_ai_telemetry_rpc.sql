-- AI 호출 계기판 집계 함수 2종.
--
-- 이유: 관리자 화면이 일별 호출 요약과 지식 자료 인용 현황을 한 번에 받도록 DB 에서 집계한다.
--   security invoker 이지만 execute 는 service_role 에만 열어 서버 API 를 거쳐서만 호출한다.

-- 일별 생성 호출 요약. 날짜는 한국 시간 기준이다.
create or replace function public.fn_ai_telemetry_daily_summary(
  p_from timestamptz,
  p_to timestamptz,
  p_service text default null
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
security invoker
set search_path = public
as $$
  select
    (c.created_at at time zone 'Asia/Seoul')::date as day,
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

-- 지식 자료별 적중과 인용 횟수. 0회 자료도 큐레이션 신호라 활성 항목은 모두 포함한다.
create or replace function public.fn_ai_telemetry_citations(
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  resource_id uuid,
  title text,
  knowledge_type text,
  is_active boolean,
  hit_count bigint,
  cited_count bigint,
  last_hit_at timestamptz,
  last_cited_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  with ev as (
    select e.created_at, e.hit_resource_ids, e.cited_resource_ids
    from public.ai_retrieval_events e
    where e.created_at >= p_from
      and e.created_at < p_to
      and e.kind = 'knowledge'
  ),
  hits as (
    select h.rid as rid, count(*) as n, max(ev.created_at) as last_at
    from ev, unnest(ev.hit_resource_ids) as h(rid)
    group by h.rid
  ),
  cites as (
    select c.rid as rid, count(*) as n, max(ev.created_at) as last_at
    from ev, unnest(ev.cited_resource_ids) as c(rid)
    group by c.rid
  ),
  agg as (
    select
      coalesce(hits.rid, cites.rid) as rid,
      coalesce(hits.n, 0) as hit_count,
      coalesce(cites.n, 0) as cited_count,
      hits.last_at as last_hit_at,
      cites.last_at as last_cited_at
    from hits
    full outer join cites on cites.rid = hits.rid
  )
  select
    k.id as resource_id,
    k.title,
    k.knowledge_type,
    k.is_active,
    coalesce(agg.hit_count, 0)::bigint as hit_count,
    coalesce(agg.cited_count, 0)::bigint as cited_count,
    agg.last_hit_at,
    agg.last_cited_at
  from public.winning_assessment_knowledge_items k
  left join agg on agg.rid = k.id
  order by cited_count asc, hit_count asc, k.title;
$$;

revoke all on function public.fn_ai_telemetry_daily_summary(timestamptz, timestamptz, text) from public;
revoke all on function public.fn_ai_telemetry_daily_summary(timestamptz, timestamptz, text) from anon, authenticated;
grant execute on function public.fn_ai_telemetry_daily_summary(timestamptz, timestamptz, text) to service_role;

revoke all on function public.fn_ai_telemetry_citations(timestamptz, timestamptz) from public;
revoke all on function public.fn_ai_telemetry_citations(timestamptz, timestamptz) from anon, authenticated;
grant execute on function public.fn_ai_telemetry_citations(timestamptz, timestamptz) to service_role;
