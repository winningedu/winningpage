-- 스쿨멘토 학생 가입(소속코드 가입, 계정 생성 전 소속 조회, 가입 확정 함수).
-- 새 컬럼은 모두 NULL 허용이고 새 함수는 service_role 만 부르며 기존 가입 경로(complete_signup_profile)는 바꾸지 않는다.
-- 위닝 사이트는 행을 쓰지 않으므로 동작이 그대로다.

-- 1) 전화번호 유일성을 기관(tenant) 안으로 좁힌다.
-- 같은 번호가 다른 기관에 있을 수 있다(결정 r8). 소속 없는 계정끼리는 NULL 을 같은 값으로 보아 전체에서 하나만 허용한다.
-- 기존 행은 숫자 기준 전역 유일이므로 (tenant, 숫자) 기준으로도 위반이 없다.
-- 이름에 phone 을 유지한다: StudentForm 이 'duplicate key' 와 'phone' 을 함께 보고 안내 문구를 고른다.
create unique index profiles_tenant_phone_unique_idx
  on public.profiles (tenant_id, regexp_replace(phone, '[^0-9]', '', 'g')) nulls not distinct
  where member_type is not null
    and phone is not null
    and regexp_replace(phone, '[^0-9]', '', 'g') <> '';

drop index public.profiles_phone_unique_idx;

comment on index public.profiles_tenant_phone_unique_idx is '가입 완료 계정의 전화번호(숫자만)는 기관 안에서 유일하다. tenant_id 가 NULL 인 계정끼리는 전체에서 유일하다(NULLS NOT DISTINCT).';

-- 2) 학부모 정보(선택 입력). 모두 NULL 허용이고 기존 행은 그대로다.
alter table public.profiles
  add column guardian_name text,
  add column guardian_relation text,
  add column guardian_phone_verified_at timestamptz,
  add constraint profiles_guardian_relation_check check (guardian_relation in ('아버지', '어머니', '기타'));

comment on column public.profiles.guardian_name is '학부모 이름(스쿨멘토 가입 4단계, 선택).';
comment on column public.profiles.guardian_relation is '학부모 관계(아버지, 어머니, 기타).';
comment on column public.profiles.guardian_phone_verified_at is '학부모 휴대폰 SMS 인증을 통과한 시각. 14세 미만 PASS 번호는 비운다.';

-- 3) 소속코드 시도 기록을 계정 없이 ip 로도 남긴다. 가입 전에는 계정이 없다.
-- 기존 행은 모두 user_id 가 있어 check 를 만족한다.
alter table public.tenant_code_attempts
  alter column user_id drop not null,
  add column ip text,
  add constraint tenant_code_attempts_actor_check check (user_id is not null or ip is not null);

create index tenant_code_attempts_ip_attempted_at_idx on public.tenant_code_attempts (ip, attempted_at);

-- 4) 계정 만들기 전 소속코드 조회. fn_resolve_tenant_code 는 로그인한 사용자(auth.uid)가 있어야 해서 따로 둔다.
-- 같은 ip 의 최근 1시간 실패가 10회 이상이면 WC068(맞는 코드도 막는다). 못 찾으면 실패 기록을 남기고 0행을 돌려준다.
-- raise 하지 않는 이유는 fn_resolve_tenant_code 와 같다: 예외로 끝나면 기록 insert 가 같이 롤백돼 제한이 무력화된다.
-- id, name, org_type 만 돌려주고 tier 같은 내부 컬럼은 내보내지 않는다.
create function public.fn_signup_tenant_lookup(p_code text, p_ip text)
returns table (id uuid, name text, org_type text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ip text := nullif(btrim(p_ip), '');
  v_code text;
  v_failures integer;
  v_tenant public.tenants;
begin
  if v_ip is null then
    raise exception 'ip required' using errcode = '22023';
  end if;

  -- 1시간 지난 기록은 판정 재료가 아니므로 이 ip 것만 이 기회에 지운다.
  delete from public.tenant_code_attempts a
   where a.ip = v_ip and a.attempted_at <= now() - interval '1 hour';

  select count(*) into v_failures from public.tenant_code_attempts a where a.ip = v_ip;
  if v_failures >= 10 then
    raise exception 'tenant_code_attempts_exceeded' using errcode = 'WC068';
  end if;

  v_code := public.fn_normalize_tenant_code(p_code);
  select * into v_tenant from public.tenants t where t.code = v_code;

  if v_tenant.id is null then
    insert into public.tenant_code_attempts (ip) values (v_ip);
    return;
  end if;

  return query select v_tenant.id, v_tenant.name, v_tenant.org_type;
end;
$$;

revoke all on function public.fn_signup_tenant_lookup(text, text) from public, anon, authenticated;
grant execute on function public.fn_signup_tenant_lookup(text, text) to service_role;

comment on function public.fn_signup_tenant_lookup(text, text) is '계정 만들기 전 소속코드 조회(service_role 전용). ip 당 1시간 실패 10회면 WC068. 못 찾으면 실패 기록을 남기고 0행(raise 하지 않는다). ip 가 비면 22023.';
