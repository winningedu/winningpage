-- QA 계정 보호 3: 차단 스위치.
--
-- QA 기간에는 QA 계정이 모든 기능을 시험할 수 있어야 하므로 차단을 끈 채로 둔다. 운영 전환 때 켠다.
-- 트리거(WC104)와 RPC 검사(WC103)는 모두 public.fn_is_qa_account 를 거치므로, 이 함수 하나가 스위치를 읽는다.
-- 스위치는 public.app_settings 의 qa_account_guard_enabled 다(signup_enabled 와 같은 방식). 행이 없거나 true 가 아니면 꺼짐이다.
-- 이 마이그레이션은 스키마만 담는다. 설정 행은 만들지 않는다(행이 없으면 꺼짐). 켜는 데이터 SQL 은 supabase/data/README.md 를 본다.
-- 서버 쪽 스위치는 환경 변수 QA_ACCOUNT_GUARD_ENABLED 이고, 둘은 함께 바꾼다.

create or replace function public.fn_is_qa_account(p_profile_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
           (select (s.value #>> '{}')::boolean from public.app_settings s where s.key = 'qa_account_guard_enabled'),
           false)
     and exists (select 1 from public.qa_accounts q where q.profile_id = p_profile_id);
$$;

comment on function public.fn_is_qa_account(uuid) is
  'app_settings.qa_account_guard_enabled 가 true 이고 qa_accounts 에 있는 계정이면 true. 설정이 없거나 false 이거나 인자가 null 이면 false. 서버 라우트(service_role)는 인자를 명시해서 부른다.';

revoke execute on function public.fn_is_qa_account(uuid) from public, anon;
grant execute on function public.fn_is_qa_account(uuid) to authenticated, service_role;
