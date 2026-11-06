set local lock_timeout = '5s';

-- 본사 관리자가 학생을 다른 기관으로 옮긴다(스쿨멘토, 결정 96, 101, 102). 스키마만 있고 데이터는 건드리지 않는다.
-- 지금의 fn_admin_set_profile_tenant 는 profiles.tenant_id 만 바꿔 학생이 옛 기관 콘솔에 남고 새 기관에서는 보이지 않는다.
-- 이 함수는 fn_catch_all_join_tenant 와 같은 순서로 한 트랜잭션에서 소속과 학적을 함께 옮긴다.
-- fn_admin_set_profile_tenant 는 그대로 둔다(위닝은 바뀌지 않는다).
--
-- 순서: 프로필 행 잠금과 학생 확인(WC094), 대상 기관 확인(없으면 P0002, 같은 기관이면 WC099 새 코드),
-- 대상 기관 전화번호 유일성(WC096), 옛 기관의 대기 신청 거절(결정자는 실행한 본사 관리자),
-- 옛 기관 활성 학적 행과 올해 학적 행 삭제, 소속과 school_name 갱신,
-- 대상 기관 학적 만들기(fn_enrollment_join: WC077, WC080, WC079, WC094).
-- 반을 비우면 반 없는 학적 행이 생기고 학생이 마이페이지에서 반을 입력한다(결정 102.14).
-- 졸업 학적 행과 옛 기관의 메모, 플래그, 이력은 옛 기관에 그대로 둔다(결정 102.15, 98.11).
create function public.fn_admin_move_student_tenant(
  p_actor uuid,
  p_student uuid,
  p_tenant uuid,
  p_grade text,
  p_group_name text,
  p_class_name text,
  p_number smallint
)
returns table (from_tenant_id uuid, tenant_id uuid, enrollment_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_member_type text;
  v_from_tenant uuid;
  v_phone_digits text;
  v_target public.tenants;
  v_enrollment uuid;
  v_constraint text;
begin
  select p.member_type, p.tenant_id, regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g')
    into v_member_type, v_from_tenant, v_phone_digits
    from public.profiles p
   where p.id = p_student
     for update of p;
  if v_member_type is distinct from 'student' then
    raise exception 'not a student account' using errcode = 'WC094';
  end if;

  select * into v_target from public.tenants t where t.id = p_tenant;
  if not found then
    raise exception 'tenant_not_found' using errcode = 'P0002';
  end if;
  if v_target.id is not distinct from v_from_tenant then
    raise exception 'same_tenant' using errcode = 'WC099';
  end if;

  if v_phone_digits <> '' and exists (
    select 1 from public.profiles pr
     where pr.id <> p_student
       and pr.member_type is not null
       and pr.tenant_id = v_target.id
       and regexp_replace(coalesce(pr.phone, ''), '[^0-9]', '', 'g') = v_phone_digits
  ) then
    raise exception 'phone_taken' using errcode = 'WC096';
  end if;

  update public.enrollment_changes c
     set status = 'rejected', reject_reason = '소속 변경', decided_by = p_actor, decided_at = now()
   where c.student_id = p_student and c.tenant_id = v_from_tenant and c.status = 'pending';

  -- 옛 기관의 활성 학적 행과, 올해 학적 행이 다른 기관에 남은 경우를 함께 지운다. 학적은 (학생, 학년도)당 하나라
  -- 남겨 두면 fn_enrollment_join 이 그 행을 잡아 WC079 나 외래키 오류로 막힌다. 졸업 행은 남긴다.
  delete from public.student_enrollments e
   where e.student_id = p_student
     and e.status = 'active'
     and (e.tenant_id = v_from_tenant or e.school_year = v_target.school_year);

  perform set_config('app.tenant_set_via_rpc', '1', true);
  begin
    update public.profiles pr
       set tenant_id = v_target.id,
           school_name = case when v_target.org_type = '학교' then v_target.name end,
           updated_at = now()
     where pr.id = p_student;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'profiles_tenant_phone_unique_idx' then
      raise exception 'phone_taken' using errcode = 'WC096';
    end if;
    raise;
  end;

  select j.enrollment_id into v_enrollment
    from public.fn_enrollment_join(p_student, v_target.id, p_grade, p_group_name, p_class_name, p_number) j;

  return query select v_from_tenant, v_target.id, v_enrollment;
end;
$$;

revoke all on function public.fn_admin_move_student_tenant(uuid, uuid, uuid, text, text, text, smallint) from public, anon, authenticated;
grant execute on function public.fn_admin_move_student_tenant(uuid, uuid, uuid, text, text, text, smallint) to service_role;

comment on function public.fn_admin_move_student_tenant(uuid, uuid, uuid, text, text, text, smallint) is '본사 관리자의 학생 기관 이동(service_role 전용, 한 트랜잭션). 학생이 아니면 WC094, 없는 기관 P0002, 같은 기관 WC099, 대상 기관 전화번호 중복 WC096, 번호 중복 WC077, 없는 그룹 WC080. 옛 기관의 대기 신청은 소속 변경 사유로 거절하고(결정자는 p_actor) 활성 학적 행과 올해 학적 행을 지운 뒤 대상 기관 학적을 만든다. 반은 비워도 된다. 졸업 학적과 옛 기관의 메모, 플래그, 이력은 그대로 둔다.';
