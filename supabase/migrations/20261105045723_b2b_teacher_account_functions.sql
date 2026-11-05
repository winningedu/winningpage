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
