-- 수행평가 지식 DB 엑셀 일괄 등록의 근사 중복 감지 함수.
--
-- 이유: 관리자가 엑셀로 올린 신규 행이 이미 있는 행과 거의 같은지 임베딩 코사인
--   유사도로 찾는다. 사용 여부와 RAG 사용 여부를 가리지 않는다. 꺼 둔 행과 겹쳐도
--   중복이기 때문이다. security invoker 이지만 execute 는 service_role 에만 열어
--   서버 API(api/performance/admin-knowledge-dedupe.ts)를 거쳐서만 호출한다.
create or replace function public.fn_knowledge_near_duplicates(
  query_embedding extensions.vector,
  filter_knowledge_type text,
  min_similarity double precision,
  match_count integer
)
returns table (
  id uuid,
  title text,
  similarity double precision
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    w.id,
    w.title,
    1 - (w.embedding <=> query_embedding) as similarity
  from public.winning_assessment_knowledge_items w
  where w.embedding is not null
    and w.knowledge_type = filter_knowledge_type
    and 1 - (w.embedding <=> query_embedding) >= min_similarity
  order by w.embedding <=> query_embedding
  limit match_count;
$$;

revoke all on function public.fn_knowledge_near_duplicates(extensions.vector, text, double precision, integer) from public;
revoke all on function public.fn_knowledge_near_duplicates(extensions.vector, text, double precision, integer) from anon, authenticated;
grant execute on function public.fn_knowledge_near_duplicates(extensions.vector, text, double precision, integer) to service_role;
