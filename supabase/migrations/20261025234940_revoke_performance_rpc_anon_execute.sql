-- 수행평가 RPC 2개의 EXECUTE 를 service_role 에만 남긴다.
-- 두 함수는 SECURITY DEFINER 이고 서버가 service_role 로만 호출한다. 소유권을
-- auth.uid() 가 아니라 p_profile_id 인자로 검사하므로 anon, authenticated 가
-- 직접 실행하면 남의 profile_id 로 제출본 확정이나 평가 커밋을 할 수 있다.

revoke execute on function public.commit_performance_evaluation_report(uuid, uuid, uuid, jsonb, smallint, text, text, text) from public, anon, authenticated;
grant execute on function public.commit_performance_evaluation_report(uuid, uuid, uuid, jsonb, smallint, text, text, text) to service_role;

revoke execute on function public.finalize_performance_submission(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.finalize_performance_submission(uuid, uuid, uuid, text, jsonb) to service_role;
