-- B2B 기반 12: 보관 기간 정리 함수. 스키마만 바꾼다(새 함수 2개, service_role 전용). 테이블과 기존 함수는 건드리지 않는다.
-- 크론 라우트(/api/cron/b2b-retention-purge)가 하루 한 번 부른다. 지운 행 수를 돌려준다.
--
-- 졸업 2년: 졸업한 지 2년이 지난 학생(졸업 학적의 graduated_at 기준)의 학적 변경 이력(enrollment_changes)과
-- 학적(student_enrollments, 모든 학년도)을 지운다. 지금 재학 중인 학적이 있는 학생은 건드리지 않는다.
-- 접근 로그: B2B 행(actor_kind 있음)만 대상이다. 2년이 지난 행을 지우되 member_purge 행은 1년이 지나면 지운다.
-- 본사 행(actor_kind 없음)은 기존 위닝 본사 감사 기록이라 건드리지 않는다.
-- 선생님 메모(teacher_memos)는 아직 없는 테이블이라 여기서 다루지 않는다. 메모를 만드는 마이그레이션이 이 함수에 더한다.
create function public.fn_purge_b2b_retention()
returns table (
  enrollment_changes_deleted bigint,
  enrollments_deleted bigint,
  access_logs_deleted bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_students uuid[];
  v_changes bigint;
  v_enrollments bigint;
  v_logs bigint;
begin
  select coalesce(array_agg(distinct e.student_id), '{}')
    into v_students
    from public.student_enrollments e
   where e.status = 'graduated'
     and e.graduated_at < now() - interval '2 years'
     and not exists (
       select 1 from public.student_enrollments a
        where a.student_id = e.student_id and a.status = 'active'
     );

  delete from public.enrollment_changes c where c.student_id = any (v_students);
  get diagnostics v_changes = row_count;

  delete from public.student_enrollments e where e.student_id = any (v_students);
  get diagnostics v_enrollments = row_count;

  delete from public.admin_access_logs l
   where l.actor_kind is not null
     and ((l.action = 'member_purge' and l.created_at < now() - interval '1 year')
       or (l.action <> 'member_purge' and l.created_at < now() - interval '2 years'));
  get diagnostics v_logs = row_count;

  return query select v_changes, v_enrollments, v_logs;
end;
$$;

revoke all on function public.fn_purge_b2b_retention() from public, anon, authenticated;
grant execute on function public.fn_purge_b2b_retention() to service_role;

-- 계약 종료 회원 익명화(사 #162, #176, 사 결정 r16 ① ⑤, 설계 P23). 크론이 fn_purge_b2b_retention 뒤에 하루 한 번 부른다.
-- 대상: 계약 종료일이 있는 기관 중 유예 종료일이 지난 기관의 학생(member_type = student).
-- 유예 종료일은 tenants.grace_ends_on, 없으면 계약 종료일 + app_settings.contract_grace_days(숫자, 사 결정 r15)다.
-- 둘 다 없으면 지우지 않는다(fn_tenant_usage_state 는 유예가 없으면 바로 막지만, 정보 삭제는 유예가 정해진 기관만 한다).
-- 계약 칸이 비어 있는 기관(위닝 사이트)은 아예 대상이 아니다. 교사와 학부모 계정은 건드리지 않는다.
-- 보호: 지금 유효한 개인 유료 이용권(paid_amount > 0, 취소되지 않았고 만료 전)이 있는 학생.
-- 익명화: 이름은 '삭제된 학생', 연락처와 생년월일 등은 NULL, is_active = false, Auth 계정은 정지한다.
-- 학적, 서비스 기록, 리포트는 남긴다(결정 r16). 이름이 '삭제된 학생'인 프로필은 이미 처리된 것으로 본다(다시 하지 않는다).
-- 기관마다 한 번, 처리한 학생이 있으면 member_purge 접근 로그를 한 줄 남긴다. 이름과 연락처는 넣지 않는다(사 #177).
-- 행은 SKIP LOCKED 로 잠가 두 실행이 겹쳐도 같은 학생을 두 번 처리하지 않는다.
-- 유료 전환 신청 표(#167)와 보호 해제 뒤 30일 재기산(#176-q1)은 결제가 열릴 때 함께 만든다.
create function public.fn_anonymize_expired_b2b_members()
returns table (
  tenants_processed bigint,
  members_anonymized bigint,
  members_protected bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c_name constant text := '삭제된 학생';
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_default_days integer;
  v_tenant record;
  v_ids uuid[];
  v_protected bigint;
  v_tenants bigint := 0;
  v_members bigint := 0;
  v_excluded bigint := 0;
begin
  select case when jsonb_typeof(a.value) = 'number' then (a.value #>> '{}')::integer end
    into v_default_days
    from public.app_settings a where a.key = 'contract_grace_days';

  for v_tenant in
    select t.id, t.contract_end_date,
           coalesce(t.grace_ends_on, t.contract_end_date + v_default_days) as grace_end
      from public.tenants t
     where t.contract_end_date is not null
       and v_today > coalesce(t.grace_ends_on, t.contract_end_date + v_default_days)
     order by t.id
  loop
    with cand as (
      select p.id,
             exists (
               select 1 from public.program_access_grants g
                where g.profile_id = p.id and g.paid_amount > 0
                  and g.revoked_at is null and (g.expires_at is null or g.expires_at > now())
             ) as protected
        from public.profiles p
       where p.tenant_id = v_tenant.id and p.member_type = 'student' and p.name is distinct from c_name
       order by p.id
         for update of p skip locked
    ), done as (
      update public.profiles p
         set name = c_name, phone = null, email = null, username = null, birth_date = null, gender = null,
             landline = null, address = null, address_detail = null, memo = null, guardian_phone = null,
             payment_terminal_id = null, is_active = false
       where p.id in (select c.id from cand c where not c.protected)
      returning p.id
    ), ban as (
      update auth.users u set banned_until = now() + interval '100 years'
       where u.id in (select d.id from done d)
    )
    select coalesce((select array_agg(d.id order by d.id) from done d), '{}'),
           (select count(*) from cand c where c.protected)
      into v_ids, v_protected;

    if cardinality(v_ids) > 0 then
      insert into public.admin_access_logs (actor_login_id, actor_kind, action, resource_key, tenant_id, row_count, meta)
      values ('system:b2b-retention-purge', 'hq', 'member_purge', 'tenants', v_tenant.id, cardinality(v_ids),
        jsonb_build_object(
          'contract_end_date', v_tenant.contract_end_date,
          'grace_ends_on', v_tenant.grace_end,
          'deleted_count', cardinality(v_ids),
          'excluded_count', v_protected,
          'member_ids', to_jsonb(v_ids)));
      v_tenants := v_tenants + 1;
      v_members := v_members + cardinality(v_ids);
      v_excluded := v_excluded + v_protected;
    end if;
  end loop;

  return query select v_tenants, v_members, v_excluded;
end;
$$;

revoke all on function public.fn_anonymize_expired_b2b_members() from public, anon, authenticated;
grant execute on function public.fn_anonymize_expired_b2b_members() to service_role;
