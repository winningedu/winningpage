-- =====================================================================
-- 객체 권한 수렴 SQL 스펙 (grant_converge 마이그레이션)
--
-- 실행: 마이그레이션이 전부 적용된 스택에서
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/b2b-grant-converge.spec.sql
--
-- 세 묶음의 확정 권한을 has_function_privilege / has_table_privilege 로 단언한다.
--   1) 서버 전용 함수 25개: service_role 만 EXECUTE
--   2) 브라우저 함수 2개: authenticated 와 service_role 만 EXECUTE
--   3) 서버 전용 테이블 5개와 소유 시퀀스: service_role 만 접근
--
-- 전체가 한 트랜잭션이고 마지막에 ROLLBACK 한다. 어떤 데이터도 남기지
-- 않는다. 단언 실패는 예외로 터져 psql 이 비정상 종료(ON_ERROR_STOP)한다.
-- =====================================================================
begin;

create function pg_temp.expect_fn(p_sig text, p_anon boolean, p_auth boolean, p_service boolean) returns void
language plpgsql as $$
declare
  v_oid regprocedure := p_sig::regprocedure;
  r record;
begin
  for r in
    select * from (values
      ('anon', has_function_privilege('anon', v_oid, 'EXECUTE'), p_anon),
      ('authenticated', has_function_privilege('authenticated', v_oid, 'EXECUTE'), p_auth),
      ('service_role', has_function_privilege('service_role', v_oid, 'EXECUTE'), p_service)
    ) as t(role_name, got, want)
  loop
    if r.got is distinct from r.want then
      raise exception '[FAIL] % EXECUTE %: got %, want %', r.role_name, p_sig, r.got, r.want;
    end if;
  end loop;
  if exists (
       select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
       where p.oid = v_oid and a.grantee = 0 and a.privilege_type = 'EXECUTE'
     ) then
    raise exception '[FAIL] PUBLIC EXECUTE %: got true, want false', p_sig;
  end if;
  raise notice '[PASS] %', p_sig;
end $$;

create function pg_temp.expect_rel(p_rel text, p_service boolean) returns void
language plpgsql as $$
declare
  v_oid regclass := p_rel::regclass;
  v_kind "char";
  v_roles text[] := array['anon', 'authenticated', 'service_role'];
  v_role text;
  v_got boolean;
begin
  select relkind into v_kind from pg_class where oid = v_oid;
  foreach v_role in array v_roles loop
    if v_kind = 'S' then
      v_got := has_sequence_privilege(v_role, v_oid, 'USAGE')
            or has_sequence_privilege(v_role, v_oid, 'SELECT')
            or has_sequence_privilege(v_role, v_oid, 'UPDATE');
    else
      v_got := has_table_privilege(v_role, v_oid, 'SELECT')
            or has_table_privilege(v_role, v_oid, 'INSERT')
            or has_table_privilege(v_role, v_oid, 'UPDATE')
            or has_table_privilege(v_role, v_oid, 'DELETE');
    end if;
    if v_role = 'service_role' then
      if v_got is distinct from p_service then
        raise exception '[FAIL] % access %: got %, want %', v_role, p_rel, v_got, p_service;
      end if;
    elsif v_got then
      raise exception '[FAIL] % access %: got true, want false', v_role, p_rel;
    end if;
  end loop;
  if exists (
    select 1 from pg_class c, aclexplode(coalesce(c.relacl, acldefault(case when c.relkind = 'S' then 's' else 'r' end, c.relowner))) a
    where c.oid = v_oid and a.grantee = 0
  ) then
    raise exception '[FAIL] PUBLIC access %: got true, want false', p_rel;
  end if;
  raise notice '[PASS] %', p_rel;
end $$;

-- 1) 서버 전용 함수: service_role 만
select pg_temp.expect_fn('public.consume_growth_credit(uuid,uuid,text)', false, false, true);
select pg_temp.expect_fn('public.consume_inquiry_credit(uuid,uuid,text)', false, false, true);
select pg_temp.expect_fn('public.consume_selfeval_credit(uuid,uuid,text)', false, false, true);
select pg_temp.expect_fn('public.reverse_growth_credit(uuid,uuid,text)', false, false, true);
select pg_temp.expect_fn('public.reverse_inquiry_credit(uuid,uuid,text)', false, false, true);
select pg_temp.expect_fn('public.reverse_selfeval_credit(uuid,uuid,text)', false, false, true);
select pg_temp.expect_fn('public.fn_ai_telemetry_citations(timestamp with time zone,timestamp with time zone)', false, false, true);
select pg_temp.expect_fn('public.fn_generate_tenant_code()', false, false, true);
select pg_temp.expect_fn('public.fn_grant_signup_coupons_for_user(uuid)', false, false, true);
select pg_temp.expect_fn('public.fn_growth_claim_step(uuid,uuid,smallint,integer)', false, false, true);
select pg_temp.expect_fn('public.fn_growth_commit_collect(uuid,uuid,text,jsonb,uuid[])', false, false, true);
select pg_temp.expect_fn('public.fn_growth_complete_report(uuid,uuid,jsonb,jsonb,jsonb)', false, false, true);
select pg_temp.expect_fn('public.fn_growth_finish_step(uuid,uuid,smallint,boolean,jsonb,jsonb,integer)', false, false, true);
select pg_temp.expect_fn('public.fn_growth_merge_survey_answers(uuid,uuid,jsonb)', false, false, true);
select pg_temp.expect_fn('public.fn_growth_terminate_report(uuid,uuid,smallint,text)', false, false, true);
select pg_temp.expect_fn('public.fn_inquiry_claim_generation(uuid,uuid,text,integer)', false, false, true);
select pg_temp.expect_fn('public.fn_inquiry_finalize(uuid,uuid,jsonb)', false, false, true);
select pg_temp.expect_fn('public.fn_inquiry_finish_generation(uuid,uuid,text,boolean,jsonb,integer)', false, false, true);
select pg_temp.expect_fn('public.fn_inquiry_terminate_session(uuid,uuid,text,text)', false, false, true);
select pg_temp.expect_fn('public.fn_knowledge_near_duplicates(vector,text,double precision,integer)', false, false, true);
select pg_temp.expect_fn('public.fn_normalize_tenant_code(text)', false, false, true);
select pg_temp.expect_fn('public.fn_selfeval_claim_step(uuid,uuid,text,integer)', false, false, true);
select pg_temp.expect_fn('public.fn_selfeval_finalize(uuid,uuid,jsonb,jsonb,jsonb,integer)', false, false, true);
select pg_temp.expect_fn('public.fn_selfeval_finish_step(uuid,uuid,text,boolean,jsonb,jsonb,integer)', false, false, true);
select pg_temp.expect_fn('public.fn_selfeval_terminate_session(uuid,uuid,text,text)', false, false, true);

-- 2) 브라우저 함수: authenticated 와 service_role
select pg_temp.expect_fn('public.fn_parent_create_enrollment(text,jsonb)', false, true, true);
select pg_temp.expect_fn('public.fn_respond_enrollment(text,boolean,text,uuid[])', false, true, true);

-- 3) 서버 전용 테이블: service_role 만
select pg_temp.expect_rel('public.board_views', true);
select pg_temp.expect_rel('public.identity_verifications', true);
select pg_temp.expect_rel('public.link_code_lookups', true);
select pg_temp.expect_rel('public.phone_verifications', true);
select pg_temp.expect_rel('public.tenant_code_attempts', true);
select pg_temp.expect_rel('public.tenant_code_attempts_id_seq', true);

do $$ begin raise notice '=== b2b-grant-converge.spec: 전체 통과 ==='; end $$;

rollback;
