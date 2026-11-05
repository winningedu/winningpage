-- B2B 기반 12: 선생님 계정 연결, 비밀번호 설정 완료, 상태 변경, 삭제, 담당 학급 변경 함수.
-- 스키마만 바꾼다(새 함수 5개, service_role 전용). 테이블과 기존 함수는 건드리지 않는다.
-- Auth 사용자 생성, 정지, 삭제는 DB 밖(API)에서 커밋 뒤에 한다. 이 함수들은 DB 쪽 상태만 확정한다.
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
         must_change_password = true
   where id = p_teacher_id;
end;
$$;

revoke all on function public.fn_teacher_attach_account(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.fn_teacher_attach_account(uuid, uuid, text, text) to service_role;

-- 첫 비밀번호 설정(또는 변경)이 끝났음을 기록한다: 임시 해시와 변경 필요 상태를 지우고 password_set_at 을 남긴다.
-- 비밀번호 자체는 Auth 가 가지므로 여기 오지 않는다. 계정이 없는 교사는 WC089.
create function public.fn_teacher_password_set(p_teacher_id uuid)
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
  if v_t.profile_id is null then
    raise exception 'teacher has no account' using errcode = 'WC089';
  end if;

  update public.teachers
     set temp_password_hash = null, must_change_password = false, password_set_at = now()
   where id = p_teacher_id;
end;
$$;

revoke all on function public.fn_teacher_password_set(uuid) from public, anon, authenticated;
grant execute on function public.fn_teacher_password_set(uuid) to service_role;

-- 활성 또는 비활성으로 바꾸고 Auth 정지나 해제에 쓸 profile id 를 돌려준다(계정이 없으면 null).
-- 본인은 바꿀 수 없다(WC091, p_actor 는 요청자의 profile id). 마지막 학교 관리자는 트리거가 WC076 으로 막는다.
-- 상태가 이미 같으면 그대로 두고 같은 값을 돌려주므로 Auth 정지 재시도에도 쓴다.
create function public.fn_teacher_set_status(p_teacher_id uuid, p_status text, p_actor uuid)
returns uuid
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
  if p_actor is not null and v_t.profile_id = p_actor then
    raise exception 'cannot change own status' using errcode = 'WC091';
  end if;

  update public.teachers set status = p_status where id = p_teacher_id and status is distinct from p_status;
  return v_t.profile_id;
end;
$$;

revoke all on function public.fn_teacher_set_status(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.fn_teacher_set_status(uuid, text, uuid) to service_role;
