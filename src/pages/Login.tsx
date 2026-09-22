import { type FormEvent, useState } from "react";
import { useSearchParams } from "react-router";
import {
  AuthLayout,
  AuthTitle,
  PrimaryButton,
  TextField,
  TextLinkButton,
} from "@/components/auth";
import { useRedirectIfAuthenticated } from "@/hooks/useRedirectIfAuthenticated";
import { useSignupEnabled } from "@/hooks/useSignupEnabled";
import { supabase } from "@/lib/supabase";

// 오픈 리다이렉트 방지: 같은 사이트 내부 경로만 허용
function safeRedirect(value: string | null) {
  if (!value) return "/";
  try {
    // origin 비교로 판단해야 백슬래시('/\evil.com')처럼 startsWith('//') 검사를
    // 우회하는 프로토콜 상대 URL도 브라우저의 URL 파싱과 동일하게 차단된다.
    const u = new URL(value, window.location.origin);
    if (u.origin !== window.location.origin) return "/";

    const path = u.pathname + u.search + u.hash;
    // pathname 자체가 '//' 또는 '/\'로 시작하면 브라우저가 프로토콜 상대 URL로 해석해
    // window.location.href 대입 시 외부 사이트로 이동할 수 있으므로 최종 차단한다.
    if (path.startsWith("//") || path.startsWith("/\\")) return "/";

    return path;
  } catch {
    return "/";
  }
}

const LOGIN_TIMEOUT_MS = 12000;

export default function Login() {
  const [params] = useSearchParams();
  const redirectTo = safeRedirect(params.get("redirect"));
  // 가입 오픈 여부(app_settings.signup_enabled) — false/로딩 중(null)이면
  // 회원가입 안내 문단을 숨긴다(Header.tsx와 동일 원칙).
  const signupEnabled = useSignupEnabled();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  // 이미 로그인된 사용자에게 로그인 폼이 잠깐 노출되는 것을 막는 게이트.
  const sessionChecking = useRedirectIfAuthenticated(redirectTo);

  function getFriendlyError(errorMessage?: string) {
    if (!errorMessage) return "로그인 중 문제가 발생했습니다.";

    if (errorMessage.includes("Invalid login credentials")) {
      return "이메일 또는 비밀번호가 올바르지 않습니다.";
    }

    if (errorMessage.includes("Email not confirmed")) {
      return "이메일 인증이 완료되지 않았습니다. 받은 메일함을 확인해 주세요.";
    }

    return errorMessage;
  }

  async function handleLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (loading) return;

    setLoading(true);
    setMessage("");

    try {
      const normalizedEmail = email.trim().toLowerCase();

      const loginPromise = supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        window.setTimeout(
          () => reject(new Error("login_timeout")),
          LOGIN_TIMEOUT_MS,
        );
      });

      const { data, error } = await Promise.race([
        loginPromise,
        timeoutPromise,
      ]);

      if (error) {
        setMessage(getFriendlyError(error.message));
        setLoading(false);
        return;
      }

      if (!data?.user) {
        setMessage("사용자 정보를 불러오지 못했습니다. 다시 시도해 주세요.");
        setLoading(false);
        return;
      }

      setLoading(false);
      // href가 아닌 replace: 로그인 성공 후 뒤로가기로 /login에 다시 진입하면
      // 방금 추가된 세션 확인 게이트가 세션을 발견해 즉시 재이동시키는 헷갈리는
      // 바운스가 생긴다. replace로 히스토리에서 /login 자체를 지워 이를 막는다.
      window.location.replace(redirectTo);
    } catch (error) {
      console.error("로그인 처리 오류:", error);

      if (error?.message === "login_timeout") {
        setMessage(
          "로그인 응답이 지연되고 있습니다. 새로고침 후 다시 시도해 주세요.",
        );
      } else {
        setMessage("로그인 처리 중 문제가 발생했습니다. 다시 시도해 주세요.");
      }

      setLoading(false);
    }
  }

  const canSubmit = email.trim().length > 0 && password.length > 0;

  if (sessionChecking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F7F4EF] pt-16 text-[#0D1B2A]">
        <div className="rounded-2xl border border-[#0D1B2A]/10 bg-white px-6 py-4 text-sm font-extrabold shadow-[0_1.125rem_2.8125rem_rgba(13,27,42,0.10)]">
          로그인 상태 확인 중...
        </div>
      </main>
    );
  }

  // width="login": 로그인만 콘텐츠 컬럼 460px(28.75rem) — 시안 실측.
  // 회원가입·약관 화면은 AuthLayout 기본값(400px)을 그대로 쓴다.
  return (
    <AuthLayout width="login">
      {/* variant="login": 시안 실측 타입 스케일(390 24px w700 lh34 / 1920 36px w700 lh50,
          ls -0.02em)을 로그인에만 적용한다 — AuthTitle 기본값은 회원가입·약관 20여 화면이
          공유하므로 건드리지 않는다.
          line1Color="title": 시안 1882:9058 픽셀 실측이 1줄 #181d24(ink.title) +
          2줄 #013262(primary)다. 2줄은 컴포넌트 기본값 primary 그대로라 생략한다.
          문구는 코드값 유지(시안 1882 계열의 '로그인 후 …' 는 구버전 목업 — 사용자 확정). */}
      <AuthTitle
        variant="login"
        line1Color="title"
        line1="진학의 첫단추,"
        line2="위닝에듀에서 시작해요"
      />

      {/* placeholder 색: 시안 실측 #d7d7d7 = line 토큰. TextField 기본값은 ink-sub(#808080)
          인데, 이 컴포넌트는 회원가입·약관 폼 전체가 공유하므로 전역 기본값을 바꾸지 않고
          로그인 폼 안에서만 자식 input 에 얹는다(tailwind.config.js 의 line 토큰 주석도
          placeholder 를 이 색으로 규정하고 있어, 전역 정리는 별도 판단 사안).
          입력 글자 크기는 390 시안이 14px 이지만 16px 를 유지한다 — iOS Safari 는 16px
          미만 입력에 포커스하면 페이지를 확대해 결제 직전 화면이 튄다. */}
      <form
        onSubmit={handleLogin}
        className="flex w-full flex-col gap-3 [&_input]:placeholder:font-medium [&_input]:placeholder:text-line"
      >
        <TextField
          id="login-email"
          name="email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="이메일을 입력해 주세요."
          autoComplete="email"
          required
        />

        <TextField
          id="login-password"
          name="password"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="비밀번호를 입력해 주세요."
          autoComplete="current-password"
          required
          // helperText는 string(exactOptionalPropertyTypes, undefined 불가) —
          // TextField가 내부에서 truthy 체크만 하므로 ""는 undefined와 동일하게 렌더된다.
          helperText={message}
          status={message ? "error" : "default"}
        />

        {/* 버튼 라벨 시안 실측: 390 16px w700 lh20 / 1920 20px w700 lh20.
            PrimaryButton 기본값은 16px w600(회원가입 플로우 공용)이라 로그인에서만
            무게·sm 크기를 덮어쓴다. 높이(3.25rem)는 그대로 두므로 lh 20px 는 1줄
            수직 중앙 정렬에 영향이 없다. 비활성 라벨색은 시안 #fbfbfb 이지만
            토큰이 없고 백색과 육안 구분이 안 되는 값이라 text-white 를 유지한다. */}
        <PrimaryButton
          type="submit"
          disabled={!canSubmit || loading}
          loading={loading}
          weight="bold"
          className="leading-5 sm:text-xl sm:leading-5 md:mt-8"
        >
          {loading ? "로그인 처리 중..." : "로그인"}
        </PrimaryButton>
      </form>

      {/* 아이디·비밀번호 찾기(QA 지시 2026-08-21) — 로그인 박스 하단, 회원가입 안내
          위에 배치한다. 색·굵기는 하단 회원가입 안내와 같은 톤(ink, xs)으로 맞춘다. */}
      <p className="flex items-center justify-center gap-2 text-xs font-medium text-ink sm:text-base">
        <TextLinkButton as="link" to="/login/find-id" tone="ink" size="xs">
          아이디 찾기
        </TextLinkButton>
        <span aria-hidden="true" className="text-line">
          |
        </span>
        <TextLinkButton
          as="link"
          to="/login/find-password"
          tone="ink"
          size="xs"
        >
          비밀번호 찾기
        </TextLinkButton>
      </p>

      {/* 하단 안내 시안 실측: 390 12px w500 / 1920 16px w500, 링크는 같은 크기의 w700.
          색은 두 요소 모두 #36393e 로 토큰이 없다 — sRGB 거리상 ink(#525252)가
          ink.title(#181d24)보다 가까워(약 42.5 vs 48.6) ink 로 맞춘다. 시안이 링크를
          네이비가 아닌 본문색 + 굵기로만 구분하므로 tone 도 primary → ink 로 되돌린다. */}
      {signupEnabled && (
        <p className="whitespace-nowrap text-center text-xs font-medium text-ink sm:text-base">
          아직 위닝에듀 회원이 아니신가요?{" "}
          <TextLinkButton
            as="link"
            to="/signup"
            tone="ink"
            size="xs"
            weight="bold"
            className="sm:text-base"
          >
            회원가입
          </TextLinkButton>
        </p>
      )}
    </AuthLayout>
  );
}
