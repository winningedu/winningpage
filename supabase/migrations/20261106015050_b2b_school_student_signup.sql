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
