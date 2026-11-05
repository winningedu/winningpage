-- B2B 기반 12: 선생님 계정 연결, 비밀번호 설정 완료, 상태 변경, 삭제, 담당 학급 변경 함수.
-- 스키마만 바꾼다(새 함수 5개, service_role 전용). 테이블과 기존 함수는 건드리지 않는다.
-- Auth 사용자 생성, 정지, 삭제는 DB 밖(API)에서 커밋 뒤에 한다. 이 함수들은 DB 쪽 상태만 확정한다.
--
-- 기관 범위: 상태 변경, 삭제, 담당 학급 변경은 p_tenant 를 받아 행을 잠근 뒤 교사의 기관과 다르면 WC088(없는 것처럼 숨긴다).
-- fn_teacher_password_set 의 p_tenant 는 선택이며 주면 같은 검사를 한다.
--
-- 에러 코드(WC088 부터): WC088 교사 없음 또는 삭제됨, WC089 계정 또는 로그인 아이디 불일치,
-- WC090 비밀번호 설정이 끝난 계정에는 임시 비밀번호를 다시 줄 수 없음, WC091 본인 상태 변경 불가,
-- WC092 담임의 마지막 학급 제거 불가, WC093 주담당으로 지정할 학급이 배정되어 있지 않음.

-- 교사 행에 Auth 계정을 연결하고 임시 비밀번호 해시를 저장한다. 재시도와 재발급은 같은 계정으로 다시 부르면 된다.
-- 로그인 아이디는 이미 등록 때 정해져 있으므로 일치만 확인한다. profiles 는 없으면 만들고 있으면 교사 값으로 맞춘다
-- (email, phone 은 비운다: 설계 P1, P5). 비밀번호 설정이 끝난 계정은 WC090.
create function public.fn_teacher_attach_account(
  p_teacher_id uuid,
  p_profile_id uuid,
  p_login_id text,
  p_temp_hash text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_t public.teachers;
begin
  select * into v_t from public.teachers where id = p_teacher_id and deleted_at is null for update;
  if not found then
    raise exception 'teacher not found' using errcode = 'WC088';
  end if;
  if v_t.login_id is distinct from p_login_id
     or (v_t.profile_id is not null and v_t.profile_id <> p_profile_id) then
    raise exception 'teacher account mismatch' using errcode = 'WC089';
  end if;
  if v_t.password_set_at is not null then
    raise exception 'password already set' using errcode = 'WC090';
  end if;

  insert into public.profiles (id, role, member_type, username, tenant_id, name)
  values (p_profile_id, 'user', 'teacher', p_login_id, v_t.tenant_id, v_t.name)
  on conflict (id) do update
    set role = 'user', member_type = 'teacher', username = excluded.username,
        tenant_id = excluded.tenant_id, name = excluded.name, email = null, phone = null,
        updated_at = now();

  update public.teachers
     set profile_id = p_profile_id,
         temp_password_hash = p_temp_hash,
         temp_password_issued_at = now(),
         must_change_password = true,
         issue_claimed_at = null
   where id = p_teacher_id;
end;
$$;

revoke all on function public.fn_teacher_attach_account(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.fn_teacher_attach_account(uuid, uuid, text, text) to service_role;

-- 첫 비밀번호 설정(또는 변경)이 끝났음을 기록한다: 임시 해시와 변경 필요 상태를 지우고 password_set_at 을 남긴다.
-- 비밀번호 자체는 Auth 가 가지므로 여기 오지 않는다. 계정이 없는 교사는 WC089.
create function public.fn_teacher_password_set(p_teacher_id uuid, p_tenant uuid default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_t public.teachers;
begin
  select * into v_t from public.teachers where id = p_teacher_id and deleted_at is null for update;
  if not found or (p_tenant is not null and v_t.tenant_id <> p_tenant) then
    raise exception 'teacher not found' using errcode = 'WC088';
  end if;
  if v_t.profile_id is null then
    raise exception 'teacher has no account' using errcode = 'WC089';
  end if;

  update public.teachers
     set temp_password_hash = null, must_change_password = false, password_set_at = now()
   where id = p_teacher_id;
end;
$$;

revoke all on function public.fn_teacher_password_set(uuid, uuid) from public, anon, authenticated;
grant execute on function public.fn_teacher_password_set(uuid, uuid) to service_role;

-- 활성 또는 비활성으로 바꾸고 Auth 정지나 해제에 쓸 profile id 를 돌려준다(계정이 없으면 null).
-- 본인은 바꿀 수 없다(WC091, p_actor 는 요청자의 profile id). 마지막 학교 관리자는 트리거가 WC076 으로 막는다.
-- 상태가 이미 같으면 그대로 두고 같은 값을 돌려주므로 Auth 정지 재시도에도 쓴다.
create function public.fn_teacher_set_status(p_teacher_id uuid, p_status text, p_actor uuid, p_tenant uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_t public.teachers;
begin
  select * into v_t from public.teachers where id = p_teacher_id and deleted_at is null for update;
  if not found or v_t.tenant_id <> p_tenant then
    raise exception 'teacher not found' using errcode = 'WC088';
  end if;
  if p_actor is not null and v_t.profile_id = p_actor then
    raise exception 'cannot change own status' using errcode = 'WC091';
  end if;

  update public.teachers set status = p_status where id = p_teacher_id and status is distinct from p_status;
  return v_t.profile_id;
end;
$$;

revoke all on function public.fn_teacher_set_status(uuid, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.fn_teacher_set_status(uuid, text, uuid, uuid) to service_role;

-- 교사를 soft delete 하고 담당 학급을 모두 지운다. 교사마다 (id, Auth 삭제에 쓸 profile id, 담당 학급의 재학생 수)를 돌려준다.
-- 재학생 기록은 건드리지 않는다. login_id 는 행에 남아 다시 쓰이지 않는다(teachers_login_id_idx, is_username_available).
-- 이미 삭제된 교사는 profile id 와 0명을 다시 돌려줘 Auth 삭제 재시도에 쓸 수 있다. 없는 id 는 행이 없다.
-- 마지막 학교 관리자는 트리거가 WC076 으로 막고 호출 전체가 취소된다.
-- 행을 잠근 뒤 다른 기관의 교사가 하나라도 있으면 WC088 이고 호출 전체가 취소된다.
create function public.fn_teacher_soft_delete(p_teacher_ids uuid[], p_actor uuid, p_tenant uuid)
returns table (teacher_id uuid, profile_id uuid, active_students bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_t public.teachers;
  v_count bigint;
begin
  for v_t in
    select * from public.teachers t where t.id = any (p_teacher_ids) order by t.id for update
  loop
    if v_t.tenant_id <> p_tenant then
      raise exception 'teacher not found' using errcode = 'WC088';
    end if;
    if v_t.deleted_at is not null then
      return query select v_t.id, v_t.profile_id, 0::bigint;
      continue;
    end if;

    select count(*) into v_count
      from public.student_enrollments e
      join public.teacher_class_assignments a on a.class_id = e.class_id
     where a.teacher_id = v_t.id and e.status = 'active';

    update public.teachers set deleted_at = now(), deleted_by = p_actor where id = v_t.id;
    delete from public.teacher_class_assignments a where a.teacher_id = v_t.id;

    return query select v_t.id, v_t.profile_id, v_count;
  end loop;
end;
$$;

revoke all on function public.fn_teacher_soft_delete(uuid[], uuid, uuid) from public, anon, authenticated;
grant execute on function public.fn_teacher_soft_delete(uuid[], uuid, uuid) to service_role;

-- 담당 학급 변경: 더하고, 지우고, 주담당을 정한다(한 트랜잭션).
-- p_add: fn_teacher_register 의 p_classes 와 같은 모양. 다른 교사가 이미 담임이면 23505 로 호출 전체가 취소된다.
-- 담임은 학급을 지워서 0개가 되면 WC092(더하면서 바꾸는 것은 가능). p_primary 는 학급 id 이고 배정되어 있지 않으면 WC093.
-- 주담당을 지우고 p_primary 가 없으면 남은 학급 중 먼저 배정된 학급이 주담당이 된다.
create function public.fn_assignment_set(
  p_teacher_id uuid,
  p_add jsonb,
  p_remove_class_ids uuid[],
  p_primary uuid,
  p_tenant uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_t public.teachers;
  v_year integer;
  v_row jsonb;
  v_class uuid;
  v_removed integer;
  v_left integer;
begin
  select * into v_t from public.teachers where id = p_teacher_id and deleted_at is null for update;
  if not found or v_t.tenant_id <> p_tenant then
    raise exception 'teacher not found' using errcode = 'WC088';
  end if;
  select school_year into v_year from public.tenants where id = v_t.tenant_id;

  for v_row in select * from jsonb_array_elements(coalesce(p_add, '[]'::jsonb)) loop
    v_class := public.fn_class_ensure(
      v_t.tenant_id,
      coalesce((v_row ->> 'school_year')::integer, v_year),
      v_row ->> 'grade',
      nullif(v_row ->> 'group_id', '')::uuid,
      v_row ->> 'name'
    );
    insert into public.teacher_class_assignments (teacher_id, tenant_id, class_id, is_primary)
    values (
      v_t.id, v_t.tenant_id, v_class,
      not exists (select 1 from public.teacher_class_assignments a where a.teacher_id = v_t.id and a.is_primary)
    )
    on conflict (teacher_id, class_id) do nothing;
  end loop;

  delete from public.teacher_class_assignments a
   where a.teacher_id = v_t.id and a.class_id = any (coalesce(p_remove_class_ids, '{}'::uuid[]));
  get diagnostics v_removed = row_count;

  select count(*) into v_left from public.teacher_class_assignments a where a.teacher_id = v_t.id;
  if v_t.role = 'homeroom' and v_removed > 0 and v_left = 0 then
    raise exception 'cannot remove the last class of a homeroom teacher' using errcode = 'WC092';
  end if;

  if p_primary is not null then
    if not exists (select 1 from public.teacher_class_assignments a where a.teacher_id = v_t.id and a.class_id = p_primary) then
      raise exception 'primary class is not assigned' using errcode = 'WC093';
    end if;
    update public.teacher_class_assignments a set is_primary = false
     where a.teacher_id = v_t.id and a.is_primary and a.class_id <> p_primary;
    update public.teacher_class_assignments a set is_primary = true
     where a.teacher_id = v_t.id and a.class_id = p_primary and not a.is_primary;
  elsif v_left > 0 and not exists (select 1 from public.teacher_class_assignments a where a.teacher_id = v_t.id and a.is_primary) then
    update public.teacher_class_assignments a set is_primary = true
     where a.teacher_id = v_t.id
       and a.class_id = (select b.class_id from public.teacher_class_assignments b
                          where b.teacher_id = v_t.id order by b.created_at, b.class_id limit 1);
  end if;
end;
$$;

revoke all on function public.fn_assignment_set(uuid, jsonb, uuid[], uuid, uuid) from public, anon, authenticated;
grant execute on function public.fn_assignment_set(uuid, jsonb, uuid[], uuid, uuid) to service_role;

-- 이메일로 Auth 사용자 id 를 찾는다. 발급 도중 끊긴 뒤 재시도(createUser 의 email_exists)에서 쓴다.
-- GoTrue 는 이메일을 소문자로 저장하므로 입력만 소문자로 맞춰 users_email_partial_key 를 탄다.
create function public.fn_auth_user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select u.id from auth.users u where u.email = lower(btrim(p_email)) limit 1
$$;

revoke all on function public.fn_auth_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.fn_auth_user_id_by_email(text) to service_role;

-- 계정 발급을 한 요청에만 허용한다. Auth 호출은 DB 밖이라 트랜잭션 잠금이 이어지지 않으므로 claim 시각으로 나눈다.
-- 행을 잠그고 보아 한 번에 하나만 'claimed' 를 얻는다. 이미 계정이 붙었으면 'attached'(비밀번호를 다시 쓰지 않는다),
-- 2분 안에 다른 요청이 얻었으면 'busy'. 끊긴 시도의 claim 은 2분 뒤 다시 얻을 수 있다(재시도).
-- fn_teacher_attach_account 가 성공하면 claim 을 지운다. p_tenant 가 교사의 기관과 다르면 WC088.
create function public.fn_teacher_issue_claim(p_teacher_id uuid, p_tenant uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_t public.teachers;
begin
  select * into v_t from public.teachers where id = p_teacher_id and deleted_at is null for update;
  if not found or v_t.tenant_id <> p_tenant then
    raise exception 'teacher not found' using errcode = 'WC088';
  end if;
  if v_t.profile_id is not null then
    return 'attached';
  end if;
  if v_t.issue_claimed_at is not null and v_t.issue_claimed_at > now() - interval '2 minutes' then
    return 'busy';
  end if;
  update public.teachers set issue_claimed_at = now() where id = p_teacher_id;
  return 'claimed';
end;
$$;

revoke all on function public.fn_teacher_issue_claim(uuid, uuid) from public, anon, authenticated;
grant execute on function public.fn_teacher_issue_claim(uuid, uuid) to service_role;
