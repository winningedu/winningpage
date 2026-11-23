-- 반 이름은 학교와 학원 모두 글자와 숫자를 받는다. 바깥 공백만 지우고(안쪽 공백은 둔다), 끝의 "반" 한 번을 떼고,
-- 남은 것이 숫자뿐이면 앞의 0 을 뗀다. 비거나 0 뿐이면 빈 문자열이다(앱의 normalizeClassName 과 같다).
-- 글자가 든 이름의 0 은 그대로 둔다("A01"). 시그니처, 권한, security 설정은 그대로다.
-- fn_class_ensure 는 빈 문자열이면 'invalid class name' 으로 막는다.
-- 대소문자는 그대로 두고, 학급 유일 인덱스가 lower(name) 으로 견준다.
create or replace function public.fn_normalize_class_name(p_org_type text, p_raw text)
returns text
language sql
immutable
security definer
set search_path = public, pg_temp
as $$
  select case when v.rest ~ '^[0-9]+$' then ltrim(v.rest, '0') else v.rest end
  from (
    select regexp_replace(
      regexp_replace(
        regexp_replace(coalesce(p_raw, ''), '^\s+|\s+$', '', 'g'),
        '반$', ''),
      '^\s+|\s+$', '', 'g') as rest
  ) v
$$;
