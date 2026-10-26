-- public 함수의 anon EXECUTE 회귀 검사. 로컬 DB(마이그레이션 전체 재생 후)에서
--   supabase db query --local -f scripts/check-function-grants.sql
-- 로 실행한다. 위반이 있으면 예외로 끝나 CI 단계가 실패한다.
--
-- 규칙: 아래 allowlist 밖의 public 함수는 anon 이 실행할 수 없어야 한다.
--   1) SECURITY DEFINER 함수
--   2) uuid 또는 uuid[] 파라미터를 받는 함수 (보안 모드 무관)
-- 트리거, 이벤트 트리거 함수와 extension 소유 함수는 PostgREST 로 호출할 수 없거나
-- 우리가 관리하는 함수가 아니므로 제외한다.
-- allowlist: 로그인 전 흐름이나 공개 RLS 정책에 필요한 함수만 둔다.
do $$
declare
  v_allow constant text[] := array[
    'is_admin',
    'is_winning_admin',
    'check_email_signup_state',
    'increment_board_view'
  ];
  v_bad text;
begin
  select string_agg(p.oid::regprocedure::text, E'\n  ' order by p.oid::regprocedure::text)
    into v_bad
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind = 'f'
    and p.prorettype not in ('trigger'::regtype, 'event_trigger'::regtype)
    and not exists (
      select 1 from pg_depend d
      where d.classid = 'pg_proc'::regclass
        and d.objid = p.oid
        and d.deptype = 'e'
    )
    and p.proname <> all (v_allow)
    and has_function_privilege('anon', p.oid, 'execute')
    and (
      p.prosecdef
      or 'uuid'::regtype::oid = any (p.proargtypes::oid[])
      or 'uuid[]'::regtype::oid = any (p.proargtypes::oid[])
    );

  if v_bad is not null then
    raise exception E'anon 이 실행할 수 있는 위험 public 함수가 있다:\n  %', v_bad;
  end if;
end
$$;
