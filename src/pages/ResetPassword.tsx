// [신규] 새 비밀번호 설정 — QA 지시 2026-08-21, FindPassword.tsx가 보낸 이메일의
// 재설정 링크가 도착하는 화면(redirectTo: `${origin}/login/reset-password`).
//
// 두 가지 경로를 동시에 지원한다(2026-09-23 token_hash 전환).
//
// ① token_hash 모드(신규, Supabase 공식 가이드 권장) — 메일 링크가
//   ?token_hash=...&type=recovery 로 온다. 세션을 미리 만들지 않고, 사용자가
//   폼을 "제출하는 순간"에만 verifyOtp({ token_hash, type: "recovery" })를
//   불러 세션을 만든다. 메일 보안 스캐너가 링크를 미리 열어 GET 한 번에
//   토큰을 소모해 버리는 문제(otp_expired)를 이렇게 피한다.
//
// ② 레거시(해시 링크) 모드 — Supabase 기본 ConfirmationURL 템플릿이 여기 붙는
//   경로다. 관리자 초대 링크(api/admin/invite-member.ts:159)도 이 경로를 그대로
//   쓴다. Supabase 클라이언트는 이 URL을 열면(detectSessionInUrl 기본값 true)
//   링크에 담긴 recovery 토큰을 스스로 감지해 임시 세션을 만들고
//   'PASSWORD_RECOVERY' 이벤트를 쏜다. 그 세션이 있어야만
//   updateUser({ password })가 통과한다 — 로그인 세션이 아니라 이 한 번의
//   비밀번호 변경만을 위한 임시 세션이다. 링크가 만료됐거나 이미 사용된 경우
//   이벤트가 오지 않으므로, 일정 시간 안에 세션이 감지되지 않으면(또는 Supabase가
//   실패를 나타내는 해시를 바로 돌려주면) "링크가 유효하지 않다"는 안내로 전환한다.
//
// 메일 템플릿이 ①로 전면 교체되기 전까지는 ②를 폴백으로 유지해야 한다.
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  AuthLayout,
  AuthTitle,
  InfoCard,
  PrimaryButton,
  TextField,
} from "@/components/auth";
import { supabase } from "@/lib/supabase";

const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{6,}$/;
// 이메일 링크 클릭 → 이 페이지 로드 → Supabase가 세션을 만드는 데 걸리는 시간을
// 넉넉히 준다. 이 시간이 지나도 세션이 없으면 링크 자체가 무효한 것으로 본다.
const RECOVERY_WAIT_TIMEOUT_MS = 4000;

/**
 * 레거시(해시 링크) 경로에서 Supabase가 실패로 돌려보낸 경우를 감지한다.
 *
 * Supabase는 recovery 토큰이 만료됐거나 이미 쓰였으면 detectSessionInUrl이
 * 아무것도 하지 않는 대신 `#error=access_denied&error_code=otp_expired&...`
 * 형태로 해시만 남긴다 — 이벤트가 오지 않으므로 기존 4초 타임아웃으로도
 * 결국 만료 화면에 도달하지만, 이미 실패가 확정된 값이 해시에 있는데 4초를
 * 그냥 흘려보낼 이유가 없다.
 */
function hashHasExpiredError(): boolean {
  if (typeof window === "undefined") return false;
  const raw = window.location.hash;
  if (!raw) return false;
  const params = new URLSearchParams(raw.startsWith("#") ? raw.slice(1) : raw);
  return (
    params.get("error_code") === "otp_expired" ||
    params.get("error") === "access_denied"
  );
}

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Supabase 공식 가이드(passwords "Resetting a password")가 권장하는 신규
  // 경로 — 메일 링크가 ?token_hash=...&type=recovery로 온다. 이 값이 있으면
  // 세션이 이미 있는지 기다릴 필요가 없다: 사용자가 폼을 제출하는 순간에만
  // verifyOtp를 불러 세션을 만든다(handleSubmit 참고). 그래야 메일 보안
  // 스캐너가 링크를 미리 열어도 토큰이 소모되지 않는다.
  const tokenHash = searchParams.get("token_hash");
  const isTokenHashMode = Boolean(tokenHash) && searchParams.get("type") === "recovery";

  const [ready, setReady] = useState(isTokenHashMode);
  const [expired, setExpired] = useState(
    () => !isTokenHashMode && hashHasExpiredError(),
  );
  const readyRef = useRef(isTokenHashMode);

  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    readyRef.current = ready;
  }, [ready]);

  useEffect(() => {
    // token_hash 모드는 세션 대기 자체가 필요 없다 — handleSubmit이 제출
    // 순간에 verifyOtp로 세션을 직접 만든다.
    if (isTokenHashMode) return;

    let cancelled = false;

    // onAuthStateChange 구독 전에 이미 세션이 만들어졌을 수 있어(마운트 타이밍),
    // 초기 상태를 한 번 직접 확인한다.
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session) setReady(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });

    const timer = window.setTimeout(() => {
      if (!cancelled && !readyRef.current) setExpired(true);
    }, RECOVERY_WAIT_TIMEOUT_MS);

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      window.clearTimeout(timer);
    };
  }, [isTokenHashMode]);

  const passwordValid = password ? PASSWORD_REGEX.test(password) : null;
  const canSubmit =
    !submitting &&
    password.length > 0 &&
    passwordValid === true &&
    password === passwordConfirm;

  async function handleSubmit() {
    setFormError("");

    if (passwordValid === false) {
      setFormError(
        "비밀번호는 영문, 숫자, 특수문자를 모두 포함해 6자 이상 입력해 주세요.",
      );
      return;
    }

    if (password !== passwordConfirm) {
      setFormError("비밀번호가 서로 일치하지 않습니다.");
      return;
    }

    setSubmitting(true);

    try {
      if (isTokenHashMode) {
        // 사용자가 실제로 제출하는 이 순간에만 토큰을 소모한다 — 마운트
        // 시점에 미리 소모하면 메일 보안 스캐너가 링크를 먼저 열었을 때
        // 정작 사용자가 열면 이미 만료된 상태가 된다(otp_expired, 파일
        // 상단 배경 참고).
        const { error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: tokenHash as string,
          type: "recovery",
        });

        if (verifyError) {
          if (verifyError.code === "otp_expired" || verifyError.status === 403) {
            setExpired(true);
          } else {
            setFormError("링크 확인에 실패했습니다. 다시 시도해 주세요.");
          }
          return;
        }
      }

      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        // supabase 에러는 영문 원문이라 그대로 내보내면 안 된다(실동작 QA
        // 2026-08-23 — "New password should be different from the old password."
        // 가 노출됐다). 사용자가 실제로 만나는 코드만 한글로 매핑하고, 나머지는
        // 일반 실패 문구로 뭉뚱그린다.
        setFormError(
          error.code === "same_password"
            ? "이전과 다른 비밀번호를 입력해 주세요."
            : "비밀번호 변경에 실패했습니다. 다시 시도해 주세요.",
        );
        return;
      }

      setDone(true);

      // 초대받은 관리자라면 여기서 활성화한다 — ⚠️ 이 한 줄이 빠지면 초대가
      // 끝나지 않는다.
      //
      //   관리자 초대는 admin_members 에 status='invited' 행만 만든다.
      //   profiles.role 은 아직 'user' 라서 헤더의 「관리자 페이지」 버튼이 안 뜬다
      //   (Header.tsx 는 profiles.role 로 판정한다).
      //   fn_activate_admin_member 가 invited → active 로 올리면
      //   admin_members_sync_role 트리거가 profiles.role 을 'admin' 으로 올린다
      //   (20260822000014).
      //
      //   원래는 초대 링크가 /admin 으로 돌아와서 requireAdminMiddleware 가 이걸
      //   대신 불러줬다. 그런데 /admin 에는 비밀번호를 정하는 화면이 없어 링크를
      //   눌러도 아무것도 못 하는 문제가 있었고, 도착지를 이 화면으로 옮겼다.
      //   그러면서 활성화를 부르는 유일한 통로가 끊겼다 — 여기서 다시 잇는다.
      //
      //   일반 사용자가 비밀번호를 재설정할 때도 이 호출은 그대로 일어나지만
      //   무해하다. 이 함수는 **자기 행이 invited 일 때만** 바꾸고, 그런 행이
      //   없으면 아무것도 하지 않는다(권한이 새로 생기지 않는다).
      //
      //   ⚠️ signOut 보다 먼저 불러야 한다. 로그아웃한 뒤엔 auth.uid() 가 없어
      //     함수가 not_authenticated 로 거부한다.
      const { error: activateError } = await supabase.rpc(
        "fn_activate_admin_member",
      );
      if (activateError) {
        // 실패해도 비밀번호는 이미 바뀌었으므로 화면 흐름은 막지 않는다.
        // 관리자라면 /admin 에 들어갈 때 미들웨어가 한 번 더 시도한다.
        console.error("관리자 초대 활성화 실패:", activateError);
      }

      // 재설정에 쓰인 임시 recovery 세션을 남겨두지 않는다 — 방금 정한
      // 비밀번호로 다시 로그인하게 한다(로그인 폼의 signInWithPassword가
      // 세션을 새로 만든다).
      await supabase.auth.signOut();
    } finally {
      setSubmitting(false);
    }
  }

  if (expired) {
    return (
      <AuthLayout>
        <AuthTitle line1="링크가 만료됐어요" />

        <InfoCard variant="info">
          비밀번호 재설정 링크가 만료됐거나 이미 사용됐어요. 다시 요청해 주세요.
        </InfoCard>

        <PrimaryButton onClick={() => navigate("/login/find-password")}>
          재설정 링크 다시 받기
        </PrimaryButton>
      </AuthLayout>
    );
  }

  if (!ready) {
    return (
      <AuthLayout>
        <AuthTitle line1="링크를 확인하고 있어요" />
        <p className="text-center text-sm text-ink-sub">
          잠시만 기다려 주세요...
        </p>
      </AuthLayout>
    );
  }

  if (done) {
    return (
      <AuthLayout>
        <AuthTitle line1="비밀번호가 변경됐어요" />

        <p className="text-center text-sm text-ink">
          새 비밀번호로 다시 로그인해 주세요.
        </p>

        <PrimaryButton onClick={() => navigate("/login")}>
          로그인하러 가기
        </PrimaryButton>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <AuthTitle line1="새 비밀번호를 설정해 주세요" />

      <div className="flex w-full flex-col gap-5">
        <TextField
          label="새 비밀번호"
          id="reset-password"
          name="password"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="새 비밀번호를 입력해 주세요"
          helperText="영문/숫자/특수문자 포함 6자 이상"
          status={
            passwordValid === null
              ? "default"
              : passwordValid
                ? "success"
                : "error"
          }
          autoComplete="new-password"
          required
        />

        <TextField
          label="새 비밀번호 확인"
          id="reset-password-confirm"
          name="passwordConfirm"
          type="password"
          value={passwordConfirm}
          onChange={setPasswordConfirm}
          placeholder="새 비밀번호를 한 번 더 입력해 주세요"
          status={
            passwordConfirm.length === 0
              ? "default"
              : passwordConfirm === password
                ? "success"
                : "error"
          }
          autoComplete="new-password"
          required
        />
      </div>

      {formError && (
        <p role="alert" className="w-full text-center text-sm text-error">
          {formError}
        </p>
      )}

      <PrimaryButton
        disabled={!canSubmit}
        loading={submitting}
        onClick={handleSubmit}
      >
        {submitting ? "변경 처리 중..." : "비밀번호 변경하기"}
      </PrimaryButton>
    </AuthLayout>
  );
}
