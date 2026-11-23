-- 반 이름은 학교와 학원 모두 숫자만 쓴다. 바깥 공백을 지우고, 끝의 "반" 한 번을 떼고, 앞의 0 을 뗀 값이
-- 1 이상의 정수 문자열이면 그 값을, 아니면 빈 문자열을 돌려준다(앱의 normalizeClassName 과 같다).
-- 시그니처, 권한, security 설정은 그대로다. fn_class_ensure 는 빈 문자열이면 'invalid class name' 으로 막는다.
create or replace function public.fn_normalize_class_name(p_org_type text, p_raw text)
returns text
language sql
immutable
security definer
set search_path = public, pg_temp
as $$
  select case
    when v.digits ~ '^[1-9][0-9]*$' then v.digits
    else ''
  end
  from (
    select ltrim(
      regexp_replace(
        regexp_replace(coalesce(p_raw, ''), '^\s+|\s+$', '', 'g'),
        '반$', ''),
      '0') as digits
  ) v
$$;
