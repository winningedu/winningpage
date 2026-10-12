-- 지식 검색 품질 평가: 기준 문제집(골든 질의)과 평가 실행 이력.
--
-- 이유: 관리자가 질의마다 나와야 할 지식 자료를 정해 두고, 같은 문제집으로 검색 설정별
--   recall@k 와 MRR 을 재서 비교한다. 운영 검색 설정은 바꾸지 않고 평가 실행에서만 덮어쓴다.
-- 쓰기: 문제집은 관리자 화면이 클라이언트 Supabase 로 직접 쓰고, 실행 이력은 서버
--   (/api/admin/knowledge-eval, service_role)가 insert 한다. 둘 다 관리자만 읽고 쓴다.
-- 회원탈퇴: created_by 는 FK 가 없는 기록용 값이라 fn_delete_account 는 건드리지 않는다.

-- 1) 기준 문제집 ---------------------------------------------------------------
create table public.knowledge_golden_queries (
  id uuid primary key default gen_random_uuid(),
  knowledge_type text not null
    check (knowledge_type in ('topic_pattern', 'verified_resource')),
  grade text not null,
  subject text not null,
  career text,
  selected_topic text,
  assessment_info text,
  expected_resource_ids uuid[] not null
    check (array_length(expected_resource_ids, 1) >= 1),
  note text,
  is_active boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index knowledge_golden_queries_type_active_idx
  on public.knowledge_golden_queries (knowledge_type, is_active, created_at);

create trigger trg_knowledge_golden_queries_updated_at
  before update on public.knowledge_golden_queries
  for each row execute function public.set_updated_at();

-- 2) 평가 실행 이력 -------------------------------------------------------------
-- params: 실행에 쓴 matchThreshold, rrfK, fullTextWeight, semanticWeight, matchCount.
-- metrics: recall(k 별 값) 과 mrr. per_query: 질의 id 별 기대 자료 id 와 그 순위 목록.
create table public.knowledge_eval_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid,
  knowledge_type text not null
    check (knowledge_type in ('topic_pattern', 'verified_resource')),
  mode text not null check (mode in ('vector', 'hybrid')),
  params jsonb not null,
  query_count integer not null,
  metrics jsonb not null,
  per_query jsonb not null,
  note text
);

create index knowledge_eval_runs_type_created_idx
  on public.knowledge_eval_runs (knowledge_type, created_at desc);

-- 3) RLS ------------------------------------------------------------------------
alter table public.knowledge_golden_queries enable row level security;
alter table public.knowledge_eval_runs enable row level security;

create policy knowledge_golden_queries_admin_all on public.knowledge_golden_queries
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy knowledge_eval_runs_admin_all on public.knowledge_eval_runs
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on public.knowledge_golden_queries to authenticated;
grant select, insert, update, delete on public.knowledge_eval_runs to authenticated;
grant all on public.knowledge_golden_queries to service_role;
grant all on public.knowledge_eval_runs to service_role;

-- 4) 어드민 메뉴 등록 -------------------------------------------------------------
-- key 는 코드의 ADMIN_SECTION_KEYS 와 같은 문자열이다(코드가 정본, 이 테이블은 사본).
-- 그룹: 서비스 관리 그룹에서 AI 호출 계기판(610) 다음인 620 을 쓴다.
-- 권한: admin_role_permissions 행은 넣지 않는다. 최고 관리자는 자동 포함이고, 실무 관리자는
--   권한 화면에서 준다. 재실행 안전(on conflict do update).
insert into public.admin_resources (key, group_title, label, sort_order) values
  ('knowledgeEvals', '서비스 관리', '지식 검색 품질 평가', 620)
on conflict (key) do update
  set group_title = excluded.group_title,
      label       = excluded.label,
      sort_order  = excluded.sort_order,
      is_active   = true;
