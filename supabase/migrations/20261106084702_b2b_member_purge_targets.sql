set local lock_timeout = '5s';

-- 계약 종료 회원 삭제(5번 본사 관리 화면 PR 3, 결정 102). 스키마만 바꾼다. 인자 목록이 바뀌므로 옛 함수를 먼저 지운다.
-- 1) fn_anonymize_expired_b2b_members 에 p_targets 를 더한다. 본사가 미리보기에서 고른 학생 번호만 지운다.
--    p_tenant 와 p_targets 는 둘 다 필수다. null 이면 WC101 로 거절한다(목록이 없다고 전부 지우는 길은 없다. 크론이 부르지도 않는다).
--    고른 학생이어도 실행 때 보호를 다시 보고, 미리보기 뒤에 들어온 학생은 목록에 없으니 지우지 않는다.
--    목록에 없는 보호되지 않은 후보는 members_skipped 와 로그 meta.skipped_count 로 센다.
-- 2) fn_member_purge_preview: 같은 후보 조건으로 학생 목록과 보호 표시를 돌려주는 읽기 전용 함수.
--    잠그지 않는다. 계약 종료일이 없는 기관은 0행이다. 학생이 없는 기관은 날짜만 담은 한 줄(profile_id 가 null)을 돌려준다.
-- 두 함수 모두 service_role 전용이다.
drop function public.fn_anonymize_expired_b2b_members(uuid, uuid, text);

-- 계약 종료 회원 익명화(사 #162, #176, 사 결정 r16 ① ⑤, 설계 P23). 크론은 부르지 않는다. 본사 관리자가 수동으로 실행한다(POST /api/admin/tenants/member-purge, 사 #162, #176).
-- p_tenant 로 준 그 기관만, 유예 종료일이 지났을 때만 처리한다(안 지났으면 not_yet = true 와 유예 종료일만 돌려준다).
-- p_actor_profile, p_actor_email 을 주면 member_purge 로그의 실행자가 그 본사 관리자다. 없으면 시스템 아이디로 남긴다.
-- 대상: 계약 종료일이 있는 기관 중 유예 종료일이 지난 기관의 학생(member_type = student).
-- 유예 종료일은 tenants.grace_ends_on, 없으면 계약 종료일 + app_settings.contract_grace_days(숫자, 사 결정 r15)다.
-- 둘 다 없으면 지우지 않는다(fn_tenant_usage_state 는 유예가 없으면 바로 막지만, 정보 삭제는 유예가 정해진 기관만 한다).
-- 계약 칸이 비어 있는 기관(위닝 사이트)은 아예 대상이 아니다. 교사와 학부모 계정은 건드리지 않는다.
-- 보호: 지금 유효한 개인 유료 이용권(paid_amount > 0, 취소되지 않았고 만료 전)이 있는 학생.
-- 익명화: 이름은 '삭제된 학생', 연락처와 생년월일 등은 NULL, is_active = false, Auth 계정은 정지한다.
-- 학적, 서비스 기록, 리포트는 남긴다(결정 r16). 이름이 '삭제된 학생'인 프로필은 이미 처리된 것으로 본다(다시 하지 않는다).
-- 기관마다 한 번, 처리한 학생이 있으면 member_purge 접근 로그를 한 줄 남긴다. 이름과 연락처는 넣지 않는다(사 #177).
-- 행은 SKIP LOCKED 로 잠가 두 실행이 겹쳐도 같은 학생을 두 번 처리하지 않는다.
-- p_targets 안에 있는 보호되지 않은 후보만 지운다(위 설명). 목록 밖 후보는 지우지 않고 센다.
-- 유료 전환 신청 표(#167)와 보호 해제 뒤 30일 재기산(#176-q1)은 결제가 열릴 때 함께 만든다.
create function public.fn_anonymize_expired_b2b_members(
  p_tenant uuid default null,
  p_actor_profile uuid default null,
  p_actor_email text default null,
  p_targets uuid[] default null
)
returns table (
  tenants_processed bigint,
  members_anonymized bigint,
  members_protected bigint,
  grace_end date,
  not_yet boolean,
  members_skipped bigint
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
  v_skipped_total bigint := 0;
  v_skipped bigint;
  v_grace date;
  v_not_yet boolean := false;
begin
  if p_tenant is null or p_targets is null then
    raise exception 'tenant_and_targets_required' using errcode = 'WC101';
  end if;

  select case when jsonb_typeof(a.value) = 'number' then (a.value #>> '{}')::integer end
    into v_default_days
    from public.app_settings a where a.key = 'contract_grace_days';

  for v_tenant in
    select t.id, t.contract_end_date,
           coalesce(t.grace_ends_on, t.contract_end_date + v_default_days) as grace_end
      from public.tenants t
     where t.id = p_tenant
       and t.contract_end_date is not null
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
       where p.id in (select c.id from cand c where not c.protected and c.id = any (p_targets))
      returning p.id
    ), ban as (
      update auth.users u set banned_until = now() + interval '100 years'
       where u.id in (select d.id from done d)
    )
    select coalesce((select array_agg(d.id order by d.id) from done d), '{}'),
           (select count(*) from cand c where c.protected),
           (select count(*) from cand c where not c.protected and c.id <> all (p_targets))
      into v_ids, v_protected, v_skipped;

    v_skipped_total := v_skipped_total + v_skipped;

    if cardinality(v_ids) > 0 then
      insert into public.admin_access_logs (profile_id, actor_email, actor_login_id, actor_kind, action, resource_key, tenant_id, row_count, meta)
      values (p_actor_profile, p_actor_email,
        case when p_actor_profile is null then 'system:b2b-retention-purge' end,
        'hq', 'member_purge', 'tenants', v_tenant.id, cardinality(v_ids),
        jsonb_build_object(
          'contract_end_date', v_tenant.contract_end_date,
          'grace_ends_on', v_tenant.grace_end,
          'deleted_count', cardinality(v_ids),
          'excluded_count', v_protected,
          'skipped_count', v_skipped,
          'member_ids', to_jsonb(v_ids)));
      v_tenants := v_tenants + 1;
      v_members := v_members + cardinality(v_ids);
      v_excluded := v_excluded + v_protected;
    end if;
  end loop;

  if p_tenant is not null then
    select coalesce(t.grace_ends_on, t.contract_end_date + v_default_days)
      into v_grace from public.tenants t where t.id = p_tenant and t.contract_end_date is not null;
    v_not_yet := v_grace is null or v_today <= v_grace;
  end if;

  return query select v_tenants, v_members, v_excluded, v_grace, v_not_yet, v_skipped_total;
end;
$$;

revoke all on function public.fn_anonymize_expired_b2b_members(uuid, uuid, text, uuid[]) from public, anon, authenticated;
grant execute on function public.fn_anonymize_expired_b2b_members(uuid, uuid, text, uuid[]) to service_role;

-- 계약 종료 회원 삭제 미리보기(사 #162, 결정 102.1, 102.4). 이름은 마스킹하지 않고 돌려준다. 가리는 일은 API 가 한다.
-- 후보와 보호 조건은 위 함수와 같다(학생, 이름이 '삭제된 학생'이 아님, 지금 유효한 개인 유료 이용권이면 protected).
-- 학년, 반, 번호는 기관의 올해 활성 학적에서 읽는다. 반 이름 앞에 그룹 이름이 있으면 붙인다.
-- 유예 종료일 식은 위 함수와 같다(tenants.grace_ends_on, 없으면 계약 종료일 + app_settings.contract_grace_days).
create function public.fn_member_purge_preview(p_tenant uuid)
returns table (
  profile_id uuid,
  name text,
  grade text,
  class_label text,
  number smallint,
  protected boolean,
  contract_end date,
  grace_end date
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with t as (
    select x.id, x.school_year, x.contract_end_date,
           coalesce(x.grace_ends_on, x.contract_end_date + (
             select case when jsonb_typeof(a.value) = 'number' then (a.value #>> '{}')::integer end
               from public.app_settings a where a.key = 'contract_grace_days')) as grace_end
      from public.tenants x
     where x.id = p_tenant and x.contract_end_date is not null
  ), cand as (
    select p.id as profile_id, p.name, e.grade,
           case when c.id is null then null else coalesce(g.name || ' ', '') || c.name end as class_label,
           e.number,
           exists (
             select 1 from public.program_access_grants pg
              where pg.profile_id = p.id and pg.paid_amount > 0
                and pg.revoked_at is null and (pg.expires_at is null or pg.expires_at > now())
           ) as protected,
           t.contract_end_date as contract_end, t.grace_end
      from t
      join public.profiles p on p.tenant_id = t.id and p.member_type = 'student' and p.name is distinct from '삭제된 학생'
      left join public.student_enrollments e
        on e.student_id = p.id and e.tenant_id = t.id and e.school_year = t.school_year and e.status = 'active'
      left join public.classes c on c.id = e.class_id
      left join public.class_groups g on g.id = c.group_id
  )
  select * from cand
  union all
  select null, null, null, null, null, null, t.contract_end_date, t.grace_end
    from t where not exists (select 1 from cand)
  order by 4 nulls last, 5 nulls last, 1;
$$;

revoke all on function public.fn_member_purge_preview(uuid) from public, anon, authenticated;
grant execute on function public.fn_member_purge_preview(uuid) to service_role;
