-- 객체 권한을 확정값으로 수렴한다. 원격 DB 3곳의 실제 권한이 확정값과 같아
-- 원격 동작은 바뀌지 않고, baseline 재생 DB 만 같은 상태가 된다.
-- 1) 서버 전용 함수 25개: service_role 만 EXECUTE
-- 2) 브라우저 함수 2개: authenticated 와 service_role 만 EXECUTE
-- 3) 서버 전용 테이블 5개와 소유 시퀀스: service_role 만 접근
-- 한 문장을 한 줄에 쓴다 (supabase/grants/functionGrants.test.ts 가 줄 단위로 읽는다).

revoke all on function public.consume_growth_credit(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.consume_growth_credit(uuid,uuid,text) to service_role;
revoke all on function public.consume_inquiry_credit(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.consume_inquiry_credit(uuid,uuid,text) to service_role;
revoke all on function public.consume_selfeval_credit(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.consume_selfeval_credit(uuid,uuid,text) to service_role;
revoke all on function public.reverse_growth_credit(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.reverse_growth_credit(uuid,uuid,text) to service_role;
revoke all on function public.reverse_inquiry_credit(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.reverse_inquiry_credit(uuid,uuid,text) to service_role;
revoke all on function public.reverse_selfeval_credit(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.reverse_selfeval_credit(uuid,uuid,text) to service_role;
revoke all on function public.fn_ai_telemetry_citations(timestamp with time zone,timestamp with time zone) from public, anon, authenticated;
grant execute on function public.fn_ai_telemetry_citations(timestamp with time zone,timestamp with time zone) to service_role;
revoke all on function public.fn_generate_tenant_code() from public, anon, authenticated;
grant execute on function public.fn_generate_tenant_code() to service_role;
revoke all on function public.fn_grant_signup_coupons_for_user(uuid) from public, anon, authenticated;
grant execute on function public.fn_grant_signup_coupons_for_user(uuid) to service_role;
revoke all on function public.fn_growth_claim_step(uuid,uuid,smallint,integer) from public, anon, authenticated;
grant execute on function public.fn_growth_claim_step(uuid,uuid,smallint,integer) to service_role;
revoke all on function public.fn_growth_commit_collect(uuid,uuid,text,jsonb,uuid[]) from public, anon, authenticated;
grant execute on function public.fn_growth_commit_collect(uuid,uuid,text,jsonb,uuid[]) to service_role;
revoke all on function public.fn_growth_complete_report(uuid,uuid,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.fn_growth_complete_report(uuid,uuid,jsonb,jsonb,jsonb) to service_role;
revoke all on function public.fn_growth_finish_step(uuid,uuid,smallint,boolean,jsonb,jsonb,integer) from public, anon, authenticated;
grant execute on function public.fn_growth_finish_step(uuid,uuid,smallint,boolean,jsonb,jsonb,integer) to service_role;
revoke all on function public.fn_growth_merge_survey_answers(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.fn_growth_merge_survey_answers(uuid,uuid,jsonb) to service_role;
revoke all on function public.fn_growth_terminate_report(uuid,uuid,smallint,text) from public, anon, authenticated;
grant execute on function public.fn_growth_terminate_report(uuid,uuid,smallint,text) to service_role;
revoke all on function public.fn_inquiry_claim_generation(uuid,uuid,text,integer) from public, anon, authenticated;
grant execute on function public.fn_inquiry_claim_generation(uuid,uuid,text,integer) to service_role;
revoke all on function public.fn_inquiry_finalize(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.fn_inquiry_finalize(uuid,uuid,jsonb) to service_role;
revoke all on function public.fn_inquiry_finish_generation(uuid,uuid,text,boolean,jsonb,integer) from public, anon, authenticated;
grant execute on function public.fn_inquiry_finish_generation(uuid,uuid,text,boolean,jsonb,integer) to service_role;
revoke all on function public.fn_inquiry_terminate_session(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.fn_inquiry_terminate_session(uuid,uuid,text,text) to service_role;
revoke all on function public.fn_knowledge_near_duplicates(vector,text,double precision,integer) from public, anon, authenticated;
grant execute on function public.fn_knowledge_near_duplicates(vector,text,double precision,integer) to service_role;
revoke all on function public.fn_normalize_tenant_code(text) from public, anon, authenticated;
grant execute on function public.fn_normalize_tenant_code(text) to service_role;
revoke all on function public.fn_selfeval_claim_step(uuid,uuid,text,integer) from public, anon, authenticated;
grant execute on function public.fn_selfeval_claim_step(uuid,uuid,text,integer) to service_role;
revoke all on function public.fn_selfeval_finalize(uuid,uuid,jsonb,jsonb,jsonb,integer) from public, anon, authenticated;
grant execute on function public.fn_selfeval_finalize(uuid,uuid,jsonb,jsonb,jsonb,integer) to service_role;
revoke all on function public.fn_selfeval_finish_step(uuid,uuid,text,boolean,jsonb,jsonb,integer) from public, anon, authenticated;
grant execute on function public.fn_selfeval_finish_step(uuid,uuid,text,boolean,jsonb,jsonb,integer) to service_role;
revoke all on function public.fn_selfeval_terminate_session(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.fn_selfeval_terminate_session(uuid,uuid,text,text) to service_role;

revoke all on function public.fn_parent_create_enrollment(text,jsonb) from public, anon;
grant execute on function public.fn_parent_create_enrollment(text,jsonb) to authenticated, service_role;
revoke all on function public.fn_respond_enrollment(text,boolean,text,uuid[]) from public, anon;
grant execute on function public.fn_respond_enrollment(text,boolean,text,uuid[]) to authenticated, service_role;

revoke all on table public.board_views from public, anon, authenticated;
grant all on table public.board_views to service_role;
revoke all on table public.identity_verifications from public, anon, authenticated;
grant all on table public.identity_verifications to service_role;
revoke all on table public.link_code_lookups from public, anon, authenticated;
grant all on table public.link_code_lookups to service_role;
revoke all on table public.phone_verifications from public, anon, authenticated;
grant all on table public.phone_verifications to service_role;
revoke all on table public.tenant_code_attempts from public, anon, authenticated;
grant all on table public.tenant_code_attempts to service_role;
revoke all on sequence public.tenant_code_attempts_id_seq from public, anon, authenticated;
grant all on sequence public.tenant_code_attempts_id_seq to service_role;
