-- QA 계정 보호 2: QA 계정이 실제 기관이나 실제 보호자 연결로 넘어가는 RPC 차단.
--
-- QA 학생은 QA 계정이 한 명이라도 있는 기관으로만 소속을 옮길 수 있고, QA 학부모는 QA 자녀만 연결할 수 있다.
-- 어기면 WC103('QA 계정이라 이 기능은 작동하지 않아요.')로 거절한다. QA 계정이 아니면 아래 검사는 바로 끝나서
-- 위닝 DB(qa_accounts 비어 있음)의 동작은 달라지지 않는다.
--
-- 아래 세 함수는 최신 정의(fn_set_my_tenant, request_parent_link: 20261021014317 baseline,
-- fn_catch_all_join_tenant: 20261106045002)를 그대로 다시 만들고 검사 호출 한 줄만 더했다.
-- 소유자, 권한, 주석은 create or replace 가 그대로 유지한다.

create or replace function public.fn_qa_assert_tenant_join(p_user uuid, p_tenant uuid)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.fn_is_qa_account(p_user) then
    return;
  end if;
  -- 기관 구성원 = 소속(profiles.tenant_id)이 그 기관인 계정 또는 그 기관의 교사 계정.
  if exists (
       select 1 from public.profiles pr
         join public.qa_accounts q on q.profile_id = pr.id
        where pr.tenant_id = p_tenant)
     or exists (
       select 1 from public.teachers t
         join public.qa_accounts q on q.profile_id = t.profile_id
        where t.tenant_id = p_tenant and t.deleted_at is null) then
    return;
  end if;
  raise exception 'QA 계정이라 이 기능은 작동하지 않아요.' using errcode = 'WC103';
end $$;

comment on function public.fn_qa_assert_tenant_join(uuid, uuid) is
  'QA 계정이 소속을 옮길 때 대상 기관에 QA 계정 구성원이 없으면 WC103. QA 계정이 아니면 아무것도 하지 않는다. 다른 RPC 안에서만 부른다.';

create or replace function public.fn_qa_assert_parent_link(p_parent uuid, p_student uuid)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if public.fn_is_qa_account(p_parent) and not public.fn_is_qa_account(p_student) then
    raise exception 'QA 계정이라 이 기능은 작동하지 않아요.' using errcode = 'WC103';
  end if;
end $$;

comment on function public.fn_qa_assert_parent_link(uuid, uuid) is
  'QA 학부모가 QA 계정이 아닌 학생과 연결하려 하면 WC103. 다른 RPC 안에서만 부른다.';

revoke execute on function public.fn_qa_assert_tenant_join(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.fn_qa_assert_parent_link(uuid, uuid) from public, anon, authenticated;
grant execute on function public.fn_qa_assert_tenant_join(uuid, uuid) to service_role;
grant execute on function public.fn_qa_assert_parent_link(uuid, uuid) to service_role;

create or replace function public.fn_set_my_tenant(p_code text)
 RETURNS TABLE(tenant_id uuid, name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_caller   uuid := auth.uid();
  v_existing uuid;
  v_id       uuid;
begin
  if v_caller is null then
    raise exception 'not_authenticated';
  end if;

  select p.tenant_id into v_existing from public.profiles p where p.id = v_caller;

  if v_existing is not null then
    raise exception 'tenant_already_set' using errcode = 'WC071';
  end if;

  -- 코드 정규화·레이트리밋(WC068)은 fn_resolve_tenant_code 가 담당한다.
  -- 못 찾으면 NULL — 여기서 raise 하면 그 함수가 남긴 실패 기록이 같이
  -- 롤백돼 리밋이 무력화되므로, 0행을 돌려주고 "없는 코드" 표기는 프론트
  -- 몫으로 둔다.
  v_id := public.fn_resolve_tenant_code(p_code);

  if v_id is null then
    return;
  end if;

  perform public.fn_qa_assert_tenant_join(v_caller, v_id);

  perform set_config('app.tenant_set_via_rpc', '1', true);

  update public.profiles
     set tenant_id  = v_id,
         updated_at = now()
   where id = v_caller;

  return query
    select t.id, t.name from public.tenants t where t.id = v_id;
end;
$function$;

create or replace function public.fn_catch_all_join_tenant(p_user uuid, p_code text, p_grade text, p_group_name text, p_class_name text, p_number smallint)
 RETURNS TABLE(tenant_id uuid, tenant_name text, enrollment_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
declare
  v_from_tenant uuid;
  v_from_catch_all boolean;
  v_phone_digits text;
  v_target_id uuid;
  v_target public.tenants;
  v_enrollment uuid;
  v_constraint text;
begin
  select p.tenant_id, t.is_catch_all, regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g')
    into v_from_tenant, v_from_catch_all, v_phone_digits
    from public.profiles p left join public.tenants t on t.id = p.tenant_id
   where p.id = p_user
     for update of p;
  if not coalesce(v_from_catch_all, false) then
    raise exception 'only the catch-all tenant can move' using errcode = 'WC098';
  end if;

  v_target_id := public.fn_tenant_code_resolve_for(p_user, p_code);
  if v_target_id is null then
    return;
  end if;
  select * into v_target from public.tenants t where t.id = v_target_id;
  if v_target.is_catch_all then
    return;
  end if;

  perform public.fn_qa_assert_tenant_join(p_user, v_target.id);

  if v_phone_digits <> '' and exists (
    select 1 from public.profiles pr
     where pr.id <> p_user
       and pr.member_type is not null
       and pr.tenant_id = v_target.id
       and regexp_replace(coalesce(pr.phone, ''), '[^0-9]', '', 'g') = v_phone_digits
  ) then
    raise exception 'phone_taken' using errcode = 'WC096';
  end if;

  update public.enrollment_changes c
     set status = 'rejected', reject_reason = '소속 변경', decided_by = p_user, decided_at = now()
   where c.student_id = p_user and c.tenant_id = v_from_tenant and c.status = 'pending';

  -- 기타 기관의 학적 행과, 올해 학적 행이 다른 기관에 남은 경우(본사가 소속만 옮긴 학생)를 함께 지운다.
  -- 학적은 (학생, 학년도)당 하나라 남겨 두면 fn_enrollment_join 이 그 행을 잡아 WC079 나 외래키 오류로 막힌다.
  delete from public.student_enrollments e
   where e.student_id = p_user
     and (e.tenant_id = v_from_tenant or e.school_year = v_target.school_year);

  perform set_config('app.tenant_set_via_rpc', '1', true);
  begin
    update public.profiles pr
       set tenant_id = v_target.id,
           school_name = case when v_target.org_type = '학교' then v_target.name end,
           updated_at = now()
     where pr.id = p_user;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'profiles_tenant_phone_unique_idx' then
      raise exception 'phone_taken' using errcode = 'WC096';
    end if;
    raise;
  end;

  select j.enrollment_id into v_enrollment
    from public.fn_enrollment_join(p_user, v_target.id, p_grade, p_group_name, p_class_name, p_number) j;

  return query select v_target.id, v_target.name, v_enrollment;
end;
$function$;

create or replace function public.request_parent_link(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_parent_id  uuid;
  v_code       text;
  v_code_id    uuid;
  v_student_id uuid;
  v_link_id    uuid;
  v_status     text;
begin
  v_parent_id := auth.uid();

  if v_parent_id is null then
    raise exception 'not_authenticated';
  end if;

  -- 회원유형 검증: FK로는 강제할 수 없어 여기서 본다([5] 주석 참고)
  if not exists (
    select 1 from public.profiles
    where id = v_parent_id and member_type = 'parent'
  ) then
    raise exception 'not_a_parent';
  end if;

  -- 학부모가 소문자로 입력해도 받아준다. 코드 자체는 항상 대문자로 저장된다.
  v_code := upper(trim(coalesce(p_code, '')));

  if v_code !~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$' then
    raise exception 'invalid_code_format';
  end if;

  select id, student_id into v_code_id, v_student_id
  from public.student_link_codes
  where code = v_code
    and is_active;

  if v_student_id is null then
    raise exception 'link_code_not_found';
  end if;

  perform public.fn_qa_assert_parent_link(v_parent_id, v_student_id);

  if v_student_id = v_parent_id then
    raise exception 'cannot_link_self';
  end if;

  -- 자녀 1명 : 학부모 1명 — 이미 승인된 학부모가 있으면 요청 자체를 막는다.
  if exists (
    select 1 from public.parent_child_links
    where student_id = v_student_id and status = 'approved'
  ) then
    raise exception 'student_already_linked';
  end if;

  -- 이 학부모와의 기존 요청 상태를 먼저 확인해 23505 대신 구분되는 예외를 던진다.
  select status into v_status
  from public.parent_child_links
  where parent_id = v_parent_id
    and student_id = v_student_id
    and status in ('pending', 'approved');

  if v_status = 'pending' then
    raise exception 'link_already_requested';
  end if;

  insert into public.parent_child_links (parent_id, student_id, link_code_id, status, responded_at)
  values (v_parent_id, v_student_id, v_code_id, 'approved', now())
  returning id into v_link_id;

  return jsonb_build_object(
    'ok', true,
    'link_id', v_link_id,
    'status', 'approved',
    'student_name', (select name from public.profiles where id = v_student_id)
  );
end;
$function$;
