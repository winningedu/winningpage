-- public 함수의 EXECUTE 권한을 호출 경로에 맞게 회수한다.
-- Supabase 는 새 함수마다 anon, authenticated, service_role 에 EXECUTE 를 주고 Postgres 는
-- PUBLIC 에도 준다. 그 결과 SECURITY DEFINER 함수가 anon key 만으로 PostgREST 에서
-- 호출됐고, fn_delete_account(uuid) 처럼 auth.uid() 를 보지 않고 id 인자만 믿는 함수도 열려 있었다.
-- 서버는 service_role 로 모든 함수를 호출하므로 그 권한은 유지하고, 나머지는 호출 경로별로 줄인다.
-- 트리거 함수는 PostgREST 로 호출할 수 없고 영향 범위가 커서 건드리지 않는다.
-- 마지막에 default privileges 를 바꿔 앞으로 만드는 함수는 anon, authenticated 없이 시작하게 한다.

-- 1) service_role 전용: 서버 전용 RPC, 내부 callee, 호출처가 없는 함수
revoke execute on function public.commit_performance_design_report(uuid, uuid, uuid, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.commit_performance_design_report(uuid, uuid, uuid, jsonb, text, text) to service_role;
revoke execute on function public.consume_diagnosis_attempt(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.consume_diagnosis_attempt(uuid, uuid, text) to service_role;
revoke execute on function public.consume_performance_credit(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.consume_performance_credit(uuid, uuid, text) to service_role;
revoke execute on function public.fn_delete_account(uuid) from public, anon, authenticated;
grant execute on function public.fn_delete_account(uuid) to service_role;
revoke execute on function public.fn_finalize_paid_order(text, text, text, text, timestamp with time zone, jsonb, numeric, boolean, boolean) from public, anon, authenticated;
grant execute on function public.fn_finalize_paid_order(text, text, text, text, timestamp with time zone, jsonb, numeric, boolean, boolean) to service_role;
revoke execute on function public.fn_goal_reset_student(uuid) from public, anon, authenticated;
grant execute on function public.fn_goal_reset_student(uuid) to service_role;
revoke execute on function public.fn_program_access_grants_summary(uuid, text) from public, anon, authenticated;
grant execute on function public.fn_program_access_grants_summary(uuid, text) to service_role;
revoke execute on function public.fn_program_access_state(uuid, text[]) from public, anon, authenticated;
grant execute on function public.fn_program_access_state(uuid, text[]) to service_role;
revoke execute on function public.fn_revalidate_order_coupons(text) from public, anon, authenticated;
grant execute on function public.fn_revalidate_order_coupons(text) to service_role;
revoke execute on function public.fn_revoke_program_access_for_order(text, uuid, text, text, bigint[]) from public, anon, authenticated;
grant execute on function public.fn_revoke_program_access_for_order(text, uuid, text, text, bigint[]) to service_role;
revoke execute on function public.fn_sync_program_access_cache(uuid, text, text) from public, anon, authenticated;
grant execute on function public.fn_sync_program_access_cache(uuid, text, text) to service_role;
revoke execute on function public.match_student_performance_sessions(vector, uuid, integer, double precision) from public, anon, authenticated;
grant execute on function public.match_student_performance_sessions(vector, uuid, integer, double precision) to service_role;
revoke execute on function public.match_winning_suhaeng_all_subjects(vector, text, text, integer, double precision, text) from public, anon, authenticated;
grant execute on function public.match_winning_suhaeng_all_subjects(vector, text, text, integer, double precision, text) to service_role;
revoke execute on function public.match_winning_suhaeng_hybrid(vector, text, text, text, integer, double precision, text, double precision, double precision, integer) from public, anon, authenticated;
grant execute on function public.match_winning_suhaeng_hybrid(vector, text, text, text, integer, double precision, text, double precision, double precision, integer) to service_role;
revoke execute on function public.fn_add_months_kst(timestamp with time zone, integer) from public, anon, authenticated;
grant execute on function public.fn_add_months_kst(timestamp with time zone, integer) to service_role;
revoke execute on function public.fn_coupon_global_redeemed(uuid, timestamp with time zone, text) from public, anon, authenticated;
grant execute on function public.fn_coupon_global_redeemed(uuid, timestamp with time zone, text) to service_role;
revoke execute on function public.fn_coupon_grant_valid_months() from public, anon, authenticated;
grant execute on function public.fn_coupon_grant_valid_months() to service_role;
revoke execute on function public.fn_coupon_is_granted(uuid, uuid) from public, anon, authenticated;
grant execute on function public.fn_coupon_is_granted(uuid, uuid) to service_role;
revoke execute on function public.fn_coupon_is_redeemed(uuid, uuid, timestamp with time zone, text) from public, anon, authenticated;
grant execute on function public.fn_coupon_is_redeemed(uuid, uuid, timestamp with time zone, text) to service_role;
revoke execute on function public.fn_coupon_org_matches(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.fn_coupon_org_matches(text, uuid, uuid) to service_role;
revoke execute on function public.fn_coupon_pending_hold_minutes() from public, anon, authenticated;
grant execute on function public.fn_coupon_pending_hold_minutes() to service_role;
revoke execute on function public.fn_grant_program_access_for_order(text, uuid, timestamp with time zone, boolean) from public, anon, authenticated;
grant execute on function public.fn_grant_program_access_for_order(text, uuid, timestamp with time zone, boolean) to service_role;
revoke execute on function public.fn_kst_day_start(timestamp with time zone) from public, anon, authenticated;
grant execute on function public.fn_kst_day_start(timestamp with time zone) to service_role;
revoke execute on function public.fn_refund_completed_amount(text) from public, anon, authenticated;
grant execute on function public.fn_refund_completed_amount(text) to service_role;
revoke execute on function public.generate_link_code_string() from public, anon, authenticated;
grant execute on function public.generate_link_code_string() to service_role;
revoke execute on function public.issue_student_link_code(uuid) from public, anon, authenticated;
grant execute on function public.issue_student_link_code(uuid) to service_role;
revoke execute on function public.fn_admin_requote_refund(bigint, boolean) from public, anon, authenticated;
grant execute on function public.fn_admin_requote_refund(bigint, boolean) to service_role;
revoke execute on function public.fn_coupon_by_code(text, integer, uuid) from public, anon, authenticated;
grant execute on function public.fn_coupon_by_code(text, integer, uuid) to service_role;
revoke execute on function public.fn_matched_org_codes(uuid) from public, anon, authenticated;
grant execute on function public.fn_matched_org_codes(uuid) to service_role;
revoke execute on function public.fn_order_consumption_state(text) from public, anon, authenticated;
grant execute on function public.fn_order_consumption_state(text) to service_role;
revoke execute on function public.fn_product_org_matches(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.fn_product_org_matches(text, uuid, uuid) to service_role;
revoke execute on function public.fn_request_enrollment(text, uuid, uuid, text, text, jsonb, integer, integer) from public, anon, authenticated;
grant execute on function public.fn_request_enrollment(text, uuid, uuid, text, text, jsonb, integer, integer) to service_role;
revoke execute on function public.fn_usable_coupons(integer, uuid) from public, anon, authenticated;
grant execute on function public.fn_usable_coupons(integer, uuid) to service_role;
revoke execute on function public.is_email_available(text) from public, anon, authenticated;
grant execute on function public.is_email_available(text) to service_role;
revoke execute on function public.is_username_available(text) from public, anon, authenticated;
grant execute on function public.is_username_available(text) to service_role;
revoke execute on function public.respond_parent_link(uuid, boolean) from public, anon, authenticated;
grant execute on function public.respond_parent_link(uuid, boolean) to service_role;
