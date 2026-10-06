-- 심화탐구 programs 행과 회원탈퇴 함수 확장.
--
-- 1) programs 에 'inquiry' 행을 둔다. 앱 코드가 존재를 전제하는 참조 데이터라
--    마이그레이션 insert 허용 대상이다. program_key 가 이미 있으면 건너뛴다
--    (dev 시드가 programs 를 통째로 주입하는 경우와 충돌하지 않는다).
-- 2) fn_delete_account 는 20261006035354 본문을 그대로 두고 맨 위에 심화탐구 테이블 정리만
--    추가한다. inquiry_sessions.ledger_id 가 performance_credit_ledger 를 참조하므로
--    (ON DELETE NO ACTION) 원장 삭제보다 앞, 맨 위에서 지운다. 기존 삭제 순서는 바꾸지 않는다.
--    함수 전문을 다시 쓰므로 같은 함수를 다시 쓰는 다른 서비스 마이그레이션과 순서가 갈리면
--    뒤에 적용되는 쪽이 앞쪽 삭제 블록을 지우지 않는지 머지 때 확인해야 한다.
insert into public.programs (program_key, name, is_active, sort_order)
select 'inquiry', '위닝 심화탐구', true,
       coalesce((select max(sort_order) from public.programs), 0) + 1
where not exists (select 1 from public.programs where program_key = 'inquiry');

CREATE OR REPLACE FUNCTION "public"."fn_delete_account"("p_user_id" "uuid")
    RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_has_retained_records boolean;
begin
  if p_user_id is null then
    raise exception 'user_id_required' using errcode = '22004';
  end if;

  select exists (
    select 1 from public.orders
     where user_id = p_user_id
        or parent_profile_id = p_user_id
        or student_profile_id = p_user_id
    union all
    select 1 from public.refund_requests
     where user_id = p_user_id
        or parent_profile_id = p_user_id
        or student_profile_id = p_user_id
        or requested_by = p_user_id
    union all
    select 1 from public.coupon_redemptions where user_id = p_user_id
  ) into v_has_retained_records;

  -- 심화탐구(FK 역순). inquiry_sessions.ledger_id 가 원장을 참조하므로 원장 삭제보다 먼저.
  -- inquiry_assets 가 activity_records 를 참조하므로 활동 기록 삭제보다도 앞이다.
  delete from public.inquiry_reports where profile_id = p_user_id;
  delete from public.inquiry_submissions where profile_id = p_user_id;
  delete from public.inquiry_topics where profile_id = p_user_id;
  delete from public.inquiry_assets where profile_id = p_user_id;
  delete from public.inquiry_sessions where profile_id = p_user_id;

  -- 성장설계(FK 역순). growth_reports.ledger_id 가 원장을 참조하므로 원장 삭제보다 먼저.
  delete from public.growth_plan_items where profile_id = p_user_id;
  delete from public.growth_uploads where profile_id = p_user_id;
  delete from public.growth_reports where profile_id = p_user_id;
  delete from public.growth_profiles where profile_id = p_user_id;
  delete from public.activity_records where profile_id = p_user_id;
  delete from public.student_profiles where profile_id = p_user_id;
  delete from public.goal_students where profile_id = p_user_id;
  delete from public.performance_sessions where profile_id = p_user_id;
  delete from public.diagnosis_attempts where profile_id = p_user_id;
  delete from public.performance_credit_ledger where profile_id = p_user_id;
  delete from public.performance_session_vectors where profile_id = p_user_id;
  delete from public.program_access_grants where profile_id = p_user_id;
  delete from public.program_access where id = p_user_id;
  delete from public.payments where id = p_user_id;
  delete from public.identity_verifications where user_id = p_user_id;
  delete from public.mentor_applications where user_id = p_user_id;
  delete from public.phone_verifications where user_id = p_user_id;
  delete from public.student_link_codes where student_id = p_user_id;
  delete from public.parent_child_links where parent_id = p_user_id or student_id = p_user_id;
  delete from public.coupon_grants where user_id = p_user_id;
  delete from public.link_code_lookups where actor_id = p_user_id;
  delete from public.user_term_agreements where user_id = p_user_id;
  update public.enrollments set profile_id = null where profile_id = p_user_id;

  if v_has_retained_records then
    update public.profiles
       set name = null,
           phone = null,
           email = null,
           username = null,
           school_type = null,
           school_name = null,
           birth_date = null,
           gender = null,
           landline = null,
           address = null,
           address_detail = null,
           guardian_phone = null,
           memo = null,
           region = null,
           payment_terminal_id = null,
           marketing_agreed = false,
           ads_agreed = false,
           sms_agreed = false,
           guardian_consent = false,
           is_active = false,
           updated_at = now()
     where id = p_user_id;
    return 'anonymized';
  end if;

  delete from public.profiles where id = p_user_id;
  return 'deleted';
end;
$$;

REVOKE ALL ON FUNCTION "public"."fn_delete_account"("uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_delete_account"("uuid") TO "service_role";

COMMENT ON FUNCTION "public"."fn_delete_account"("uuid") IS '회원탈퇴 하드 삭제(QA #2), api/delete-account.ts(service_role) 전용, authenticated/anon 실행 금지. orders/refund_requests/coupon_redemptions 참조가 있으면(전자상거래법 5년 보존 + FK RESTRICT/NOT NULL) 사용자 소유 데이터(성장설계, 심화탐구 포함)만 정리하고 profiles 는 개인식별 필드만 익명화한 뒤 anonymized 를 반환, 참조가 전혀 없으면 profiles 까지 지우고 deleted 를 반환한다. 호출부는 deleted 일 때만 auth.admin.deleteUser 를 이어서 호출하고, anonymized 일 때는 updateUserById(ban) 로 로그인만 막는다.';
