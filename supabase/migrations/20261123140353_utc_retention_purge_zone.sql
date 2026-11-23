-- 보관 기간 정리와 계약 종료 회원 익명화를 시간대 기준으로 바꾼다(UTC 이전). 스키마만 바꾼다.
--
-- 1. fn_purge_b2b_retention: 로그인 기록 profile_login_slots 를 slot_start < now() - 2년 으로 지운다(순간 기준, 시간대 없음).
--    옛 profile_login_days 는 KST 날짜 열이라 그대로 KST 날짜로 지운다(더는 적지 않고 U6 에서 테이블째 지운다).
--    반환 열 login_days_deleted 는 두 테이블에서 지운 행의 합이다. 반환 열과 권한은 그대로다.
-- 2. fn_anonymize_expired_b2b_members: 오늘을 기관별 tenants.time_zone 날짜로 센다(fn_local_date). 계약 종료일, 유예 종료일은 date 그대로다.
-- 3. fn_member_purge_preview: 끝에 local_today(기관 시간대의 오늘)를 더한다. 화면의 D-day 가 실행 함수와 같은 오늘을 쓰게 한다.
--    반환 열이 바뀌어 옛 함수를 지우고 새로 만든다. 권한은 그대로 service_role 만 실행한다.

create or replace function public.fn_purge_b2b_retention()
returns table (
  enrollment_changes_deleted bigint,
  enrollments_deleted bigint,
  access_logs_deleted bigint,
  memos_deleted bigint,
  student_flags_deleted bigint,
  counsel_statuses_deleted bigint,
  login_days_deleted bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenants uuid[];
  v_students uuid[];
  v_changes bigint;
  v_enrollments bigint;
  v_logs bigint;
  v_memos bigint;
  v_flags bigint;
  v_counsel bigint;
  v_login_days bigint;
  v_old_days bigint;
begin
  delete from public.teacher_memos m
   using (
     select e.tenant_id, e.student_id
       from public.student_enrollments e
      where e.status = 'graduated'
      group by e.tenant_id, e.student_id
     having max(e.graduated_at) < now() - interval '1 year'
        and not exists (
          select 1 from public.student_enrollments a
           where a.tenant_id = e.tenant_id and a.student_id = e.student_id and a.status = 'active'
        )
   ) g
   where m.tenant_id = g.tenant_id and m.student_id = g.student_id;
  get diagnostics v_memos = row_count;

  select coalesce(array_agg(g.tenant_id), '{}'), coalesce(array_agg(g.student_id), '{}')
    into v_tenants, v_students
    from (
      select e.tenant_id, e.student_id
        from public.student_enrollments e
       where e.status = 'graduated'
       group by e.tenant_id, e.student_id
      having max(e.graduated_at) < now() - interval '2 years'
         and not exists (
           select 1 from public.student_enrollments a
            where a.tenant_id = e.tenant_id and a.student_id = e.student_id and a.status = 'active'
         )
    ) g;

  delete from public.student_flags f
   where (f.tenant_id, f.student_id) in (select * from unnest(v_tenants, v_students));
  get diagnostics v_flags = row_count;

  delete from public.counsel_statuses c
   where (c.tenant_id, c.student_id) in (select * from unnest(v_tenants, v_students));
  get diagnostics v_counsel = row_count;

  delete from public.enrollment_changes c
   where (c.tenant_id, c.student_id) in (select * from unnest(v_tenants, v_students));
  get diagnostics v_changes = row_count;

  delete from public.student_enrollments e
   where (e.tenant_id, e.student_id) in (select * from unnest(v_tenants, v_students));
  get diagnostics v_enrollments = row_count;

  delete from public.admin_access_logs l
   where l.actor_kind is not null
     and ((l.action = 'member_purge' and l.created_at < now() - interval '1 year')
       or (l.action <> 'member_purge' and l.created_at < now() - interval '2 years'));
  get diagnostics v_logs = row_count;

  -- 로그인 기록은 순간(slot_start) 기준이라 시간대가 없다.
  delete from public.profile_login_slots s
   where s.slot_start < now() - interval '2 years';
  get diagnostics v_login_days = row_count;

  -- 옛 profile_login_days 는 더는 적지 않는다(U6 에서 지운다). KST 날짜 열이라 KST 날짜로 자른다.
  delete from public.profile_login_days d
   where d.kst_date < ((now() at time zone 'Asia/Seoul')::date - interval '2 years')::date; -- tz-literal-ok: 옛 KST 날짜 열, U6 에서 테이블째 지운다
  get diagnostics v_old_days = row_count;
  v_login_days := v_login_days + v_old_days;

  return query select v_changes, v_enrollments, v_logs, v_memos, v_flags, v_counsel, v_login_days;
end;
$$;

revoke all on function public.fn_purge_b2b_retention() from public, anon, authenticated;
grant execute on function public.fn_purge_b2b_retention() to service_role;

-- 계약 종료 회원 익명화. 본문은 20261106084702_b2b_member_purge_targets.sql 과 같고 오늘만 기관 시간대로 센다.
create or replace function public.fn_anonymize_expired_b2b_members(
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
  members_skipped bigint,
  not_processed bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c_name constant text := '삭제된 학생';
  v_default_days integer;
  v_today date;
  v_tenant record;
  v_ids uuid[];
  v_protected bigint;
  v_tenants bigint := 0;
  v_members bigint := 0;
  v_excluded bigint := 0;
  v_skipped_total bigint := 0;
  v_skipped bigint;
  v_not_processed bigint;
  v_not_processed_total bigint := 0;
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
       and public.fn_local_date(now(), t.time_zone) > coalesce(t.grace_ends_on, t.contract_end_date + v_default_days)
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
           (select count(*) from cand c where not c.protected and c.id <> all (p_targets)),
           (select count(*) from public.profiles p
             where p.id = any (p_targets) and p.tenant_id = v_tenant.id and p.member_type = 'student'
               and p.name is distinct from c_name and p.id not in (select c.id from cand c))
      into v_ids, v_protected, v_skipped, v_not_processed;

    v_skipped_total := v_skipped_total + v_skipped;
    v_not_processed_total := v_not_processed_total + v_not_processed;

    -- 유예가 지난 기관이면 지운 학생이 0명이어도 실행 기록을 남긴다.
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
        'not_processed', v_not_processed,
        'member_ids', to_jsonb(v_ids)));
    v_tenants := v_tenants + 1;
    v_members := v_members + cardinality(v_ids);
    v_excluded := v_excluded + v_protected;
  end loop;

  if p_tenant is not null then
    select coalesce(t.grace_ends_on, t.contract_end_date + v_default_days),
           public.fn_local_date(now(), t.time_zone)
      into v_grace, v_today from public.tenants t where t.id = p_tenant and t.contract_end_date is not null;
    v_not_yet := v_grace is null or v_today <= v_grace;
  end if;

  return query select v_tenants, v_members, v_excluded, v_grace, v_not_yet, v_skipped_total, v_not_processed_total;
end;
$$;

revoke all on function public.fn_anonymize_expired_b2b_members(uuid, uuid, text, uuid[]) from public, anon, authenticated;
grant execute on function public.fn_anonymize_expired_b2b_members(uuid, uuid, text, uuid[]) to service_role;
