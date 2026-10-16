-- 수행평가 지식 DB 하이브리드 검색: 뜻 검색(pgvector)과 단어 검색(PGroonga)을 RRF 로 합친다.
--
-- 이유: 벡터 검색만으로는 과목명, 진로명, 자료 고유명사처럼 글자가 정확히 같아야 하는
--   질의에서 순위가 흔들린다. 단어 일치 행을 함께 끌어올리되 리랭커는 두지 않는다.
--   모양은 Supabase 공식 hybrid search 가이드(두 CTE 의 full outer join 과 RRF)와 같다.
--   기존 벡터 RPC match_winning_suhaeng_all_subjects 는 폴백과 관리자 비교용으로 남긴다.

-- 1. PGroonga 확장. 관리형 Supabase 문서 방식대로 extensions 스키마에 둔다.
create extension if not exists pgroonga with schema extensions;

-- 2. 단어 검색 인덱스. 대상은 임베딩 입력과 같은 search_text 한 컬럼이다.
--
-- 토크나이저 TokenBigramIgnoreBlankSplitSymbolAlphaDigit 를 고른 근거(로컬 PGroonga 3.2.5 실측):
--   한국어 형태소 사전이 없어(TokenMecab 은 일본어 사전) 바이그램 계열 중에서 골랐다.
--   '물리학' 질의는 물리, 리학 두 토큰이 되고 '물리학Ⅰ' 문서 토큰(물리, 리학, 학i, i)에 모두 있어 걸린다.
--   공백을 무시하는 계열만 '항생제내성' 질의가 '항생제 내성' 문서에 걸렸다(나머지 계열은 0건).
--   한국어 복합 명사는 띄어쓰기가 흔들리므로 이 차이가 크다.
--   SplitSymbolAlphaDigit 계열은 영문과 숫자도 바이그램으로 쪼개 'AI' 질의가 4건 걸렸다(TokenBigram 3건).
--   공백 무시는 '학생의 학습' 같은 조사 경계에서 '의학' 이 걸릴 위험이 있으나, 현재 코퍼스에서
--   의학, 약학, 공학, 수학, 과학 등 10개 단어의 적중 건수는 공백 제거 문자열 포함 건수와 같았다.
-- normalizer NormalizerNFKC150 은 설치 버전에서 가장 최신 NFKC 이고 Ⅰ 를 i 로, 영문 대문자를 소문자로 맞춘다.
create index if not exists winning_suhaeng_search_text_pgroonga_idx
  on public.winning_assessment_knowledge_items
  using pgroonga (search_text extensions.pgroonga_text_full_text_search_ops_v2)
  with (
    tokenizer = 'TokenBigramIgnoreBlankSplitSymbolAlphaDigit',
    normalizer = 'NormalizerNFKC150'
  );

-- 3. 하이브리드 RPC.
--
-- 의미 CTE 는 기존 벡터 RPC 의 where 절을 threshold 까지 그대로 복제한다.
-- 단어 CTE 는 같은 필터에서 threshold 만 빼고 search_text &@~ query_keywords 로 거른다.
-- query_keywords 가 null 이거나 공백뿐이면 단어 CTE 는 0행이고 결과는 벡터 RPC 순서와 같다.
-- 두 CTE 는 각각 least(match_count, 20) * 2 행까지 뽑고, full outer join 뒤
-- 1 / (rrf_k + rank) 에 가중치를 곱해 더한 값 내림차순으로 least(match_count, 20) 행을 돌려준다.
-- similarity 는 단어로만 걸린 행도 실제 코사인 유사도로 채운다(관측과 프롬프트 직렬화용).
create or replace function public.match_winning_suhaeng_hybrid(
  query_embedding extensions.vector,
  query_keywords text,
  filter_knowledge_type text,
  filter_grade text default null,
  match_count integer default 10,
  match_threshold double precision default 0.52,
  filter_subject text default null,
  full_text_weight double precision default 1,
  semantic_weight double precision default 1,
  rrf_k integer default 60
)
returns table (
  id uuid,
  knowledge_type text,
  grade text,
  subject text,
  career_field text,
  title text,
  content text,
  source text,
  source_link text,
  memo text,
  similarity double precision,
  semantic_rank integer,
  keyword_rank integer,
  keyword_score double precision,
  rrf_score double precision
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with semantic as (
    select
      w.id,
      (row_number() over (order by w.embedding <=> query_embedding asc))::integer as rank_ix
    from public.winning_assessment_knowledge_items w
    where w.is_active = true
      and coalesce(w.rag_use, true) = true
      and w.embedding is not null
      and w.knowledge_type in ('topic_pattern', 'verified_resource')
      and w.knowledge_type = filter_knowledge_type
      and (
        filter_grade is null
        or w.grade = filter_grade
        or w.grade in ('공통', '전체', '확인 필요')
      )
      and (
        filter_subject is null
        or w.subject = filter_subject
        or w.subject in ('공통', '전체', '확인 필요')
      )
      and 1 - (w.embedding <=> query_embedding) >= match_threshold
    order by w.embedding <=> query_embedding asc
    limit least(match_count, 20) * 2
  ),
  keyword_hits as (
    select
      w.id,
      pgroonga_score(w.tableoid, w.ctid) as score
    from public.winning_assessment_knowledge_items w
    where coalesce(btrim(query_keywords), '') <> ''
      and w.search_text &@~ query_keywords
      and w.is_active = true
      and coalesce(w.rag_use, true) = true
      and w.embedding is not null
      and w.knowledge_type in ('topic_pattern', 'verified_resource')
      and w.knowledge_type = filter_knowledge_type
      and (
        filter_grade is null
        or w.grade = filter_grade
        or w.grade in ('공통', '전체', '확인 필요')
      )
      and (
        filter_subject is null
        or w.subject = filter_subject
        or w.subject in ('공통', '전체', '확인 필요')
      )
  ),
  keyword as (
    select
      k.id,
      k.score,
      (row_number() over (order by k.score desc, k.id))::integer as rank_ix
    from keyword_hits k
    order by k.score desc, k.id
    limit least(match_count, 20) * 2
  ),
  fused as (
    select
      coalesce(s.id, k.id) as id,
      s.rank_ix as semantic_rank,
      k.rank_ix as keyword_rank,
      k.score as keyword_score,
      coalesce(1.0 / (rrf_k + s.rank_ix), 0.0) * semantic_weight
        + coalesce(1.0 / (rrf_k + k.rank_ix), 0.0) * full_text_weight as rrf_score
    from semantic s
    full outer join keyword k on k.id = s.id
  )
  select
    w.id,
    w.knowledge_type,
    w.grade,
    w.subject,
    w.career_field,
    w.title,
    w.content,
    w.source,
    w.source_link,
    w.memo,
    1 - (w.embedding <=> query_embedding) as similarity,
    f.semantic_rank,
    f.keyword_rank,
    f.keyword_score::double precision,
    f.rrf_score::double precision
  from fused f
  join public.winning_assessment_knowledge_items w on w.id = f.id
  order by f.rrf_score desc, similarity desc
  limit least(match_count, 20);
$$;

comment on function public.match_winning_suhaeng_hybrid(
  extensions.vector, text, text, text, integer, double precision, text,
  double precision, double precision, integer
) is '수행평가 RAG 하이브리드 검색. pgvector 의미 순위와 PGroonga 단어 순위를 RRF(1/(rrf_k + rank), 가중치 곱)로 합친다. SECURITY INVOKER 이므로 service_role(RLS 우회) 또는 어드민 세션에서만 결과가 나온다.';

-- 4. 계기판 검색 기록 출처에 hybrid 를 더한다. 기존 값은 그대로 둔다.
alter table public.ai_retrieval_events
  drop constraint if exists ai_retrieval_events_source_check;

alter table public.ai_retrieval_events
  add constraint ai_retrieval_events_source_check
  check (source is null or source in ('vector', 'keyword', 'none', 'hybrid'));
