-- contract 단계: 20261117075145 에서 fn_login_lock_begin/end 로 바꿨으므로 옛 계정 열쇠 함수를 지운다.
-- 앱의 PGRST202 대체 분기도 같은 변경에서 지웠다.

drop function if exists public.fn_login_attempt_begin(bytea);
drop function if exists public.fn_login_attempt_end(bytea, text, smallint);
