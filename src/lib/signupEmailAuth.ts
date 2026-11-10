// 가입 화면 3종(StudentForm / Under14Form / parent/ParentForm)이 공유하는
// 이메일 인증 시퀀스.
//
// 왜 공용으로 뽑았나
//   세 화면이 "중복확인 → 코드 발송 → 코드 검증"을 그대로 복제하고 있었는데,
//   여기에 "가입 중단 계정 이어가기" 분기가 더해지면 복제본마다 어긋날 위험이
//   커진다. 분기 규칙을 한 곳에만 둔다.
//
// 무엇을 푸는가
//   Supabase Auth는 이메일 OTP를 보내려면 auth.users 행을 먼저 만들어야 한다.
//   그래서 코드까지 받고 "가입 완료"를 누르지 않은 채 나가면 계정만 남는다.
//   예전에는 그 상태를 "이메일 중복"으로 보고 로그인하라고 안내해서, 가입도
//   못 하고 쓸 계정도 없는 막다른 길이 됐다. 이제는 이어서 가입하게 한다.
//
// 상태별 경로 (sql/40_auth_signup.sql [9] check_email_signup_state)
//   available            → signUp        → verifyOtp type 'signup'
//   resumable_unverified → signUp 재호출 → verifyOtp type 'signup'  (확인메일 재발송)
//   resumable_verified   → signInWithOtp → verifyOtp type 'email'   (Magic Link 템플릿)
//   taken                → 로그인 안내
//
// ※ resumable_verified 경로는 "Confirm signup"이 아니라 **Magic Link** 템플릿으로
//   나간다. Supabase 대시보드에서 그 템플릿도 {{ .Token }}을 쓰도록 고쳐두지
//   않으면 이 경로에서만 매직링크가 발송된다.
//
// 비밀번호는 언제 계정에 반영되나 (2026-08-07 변경)
//   예전에는 "비밀번호를 먼저 입력해야 이메일 인증 버튼이 열리는" 구조였다.
//   signUp이 비밀번호를 요구하기 때문인데, 화면 순서상 비밀번호 필드가 이메일
//   아래에 있어서 사용자가 아래로 내려갔다 되돌아와야 했다.
//   이제는 발송 시점에 비밀번호가 없으면 임시 비밀번호로 계정을 만들고, 가입
//   완료 직전(applySignupPassword)에 폼에 입력된 실제 비밀번호로 덮어쓴다.
//   그래서 **가입을 끝내는 화면은 반드시 applySignupPassword를 호출해야 한다** —
//   호출하지 않으면 계정에 임시 비밀번호가 남아 로그인이 불가능해진다.

import { clearAllDrafts } from "./diagnosisDraft";
import { supabase } from "./supabase";

/**
 * 사람에게 읽히지 않는 message 값들. 형식은 문자열이라 truthy 검사를 통과하지만
 * 내용이 없어서 화면에 그대로 나가면 안 되는 것들이다.
 *
 * "{}" 는 어디서 오나 — ⚠️ 우리 코드가 아니다
 *   @supabase/auth-js 의 _getErrorMessage(dist/main/lib/fetch.js)는 응답 본문에서
 *   msg / message / error_description / error 를 차례로 찾고, **넷 다 없으면
 *   `JSON.stringify(err)` 로 폴백**한다. 본문이 빈 객체면 그 결과가 문자열 "{}" 고,
 *   그게 AuthError.message 에 그대로 박힌 채 우리 화면까지 내려온다(QA 33).
 *
 *   "[object Object]" 는 같은 값을 템플릿 리터럴이나 String() 으로 감쌌을 때 나온다.
 */
const UNREADABLE_MESSAGES = new Set([
  "{}",
  "[]",
  "null",
  "undefined",
  "[object Object]",
]);

function isReadableMessage(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed) return false;
  return !UNREADABLE_MESSAGES.has(trimmed);
}

/**
 * 어떤 값이 오든(Error, 문자열, undefined, 예상 밖의 객체) 사용자에게 보여줄 수 있는
 * 문자열로 정규화한다(QA 2026-08-21 / QA 33 "{}" 노출 버그 대응).
 *
 * 왜 필요한가
 *   호출부는 지금까지 error.message를 그대로 읽었다. Supabase의 AuthError/
 *   PostgrestError는 항상 문자열 message를 채워 던지지만, 예상 밖의 예외(네트워크
 *   스택이 던진 순수 객체, message가 빈 문자열인 경우 등)가 섞이면 message가
 *   비거나 존재하지 않는 값으로 남는다. 그 값을 그대로 화면에 내리면 helperText가
 *   빈 문자열이 되어 아무 안내도 없이 막힌다. 여기서 한 곳으로 좁혀 막는다.
 *
 *   ⚠️ "비어 있음"만 막는 걸로는 부족했다 — auth-js 가 넘기는 "{}" 는 길이 2짜리
 *   멀쩡한 문자열이라 truthy 검사를 통과해 화면까지 그대로 나갔다(위 상수 주석).
 *   그래서 "형식은 문자열인데 내용이 없는" 값도 fallback 으로 돌린다.
 */
export function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && isReadableMessage(error.message)) {
    return error.message;
  }
  if (typeof error === "string" && isReadableMessage(error)) return error;
  return fallback;
}

const UNEXPECTED_SEND_ERROR =
  "이메일 인증코드 발송 중 예상하지 못한 문제가 발생했습니다.";

export const EMAIL_STATE = {
  AVAILABLE: "available",
  RESUMABLE_UNVERIFIED: "resumable_unverified",
  RESUMABLE_VERIFIED: "resumable_verified",
  TAKEN: "taken",
};

// verifyOtp에 넘길 타입. 발송에 쓴 API에 따라 달라서 발송 결과로 함께 돌려준다.
const OTP_MODE = {
  SIGNUP: "signup",
  EMAIL: "email",
};

// Supabase Auth의 "Minimum interval between emails"(기본 60초)와 맞춘다.
// 이 값을 대시보드에서 바꿨다면 여기도 같이 바꿔야 안내가 어긋나지 않는다.
export const EMAIL_RESEND_COOLDOWN_SECONDS = 60;

export const MESSAGES = {
  taken: "이미 가입된 이메일입니다. 로그인 페이지에서 로그인해 주세요.",
  cooldown: (left: number) => `인증번호는 ${left}초 후에 다시 보낼 수 있어요.`,
  resumed: "이전에 진행하던 가입이 있어 인증코드를 다시 보냈습니다.",
  sent: "입력한 이메일로 인증코드를 발송했습니다.",
  checkFailed:
    "중복확인 기능을 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.",
  codeMismatch: "인증번호가 틀립니다.",
};

/**
 * 이메일 가입 상태를 조회한다.
 */
async function checkEmailSignupState(
  email: string,
): Promise<{ state?: string; error?: Error }> {
  const { data, error } = await supabase.rpc("check_email_signup_state", {
    p_email: email,
  });

  if (error) return { error };
  return { state: data };
}

/**
 * signUp에 넘길 임시 비밀번호를 만든다.
 *
 * 이메일 인증만 하려는 시점에는 사용자가 아직 비밀번호를 입력하지 않았을 수 있는데,
 * Supabase signUp은 비밀번호를 반드시 요구한다. 추측 가능한 고정값을 쓰면 인증만
 * 마치고 이탈한 계정에 누구나 로그인할 수 있으므로 매번 난수로 만든다.
 * (영문 대·소문자 + 숫자 + 특수문자를 모두 포함해 폼과 같은 정책을 만족시킨다)
 */
function generateTempPassword() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);

  const body = Array.from(bytes, (byte) => byte.toString(36)).join("");

  return `Aa1!${body}`;
}

type SendSignupEmailCodeParams = {
  /** 정규화된(소문자·trim) 이메일 */
  email: string;
  /** 폼에 입력된 비밀번호. 비어 있으면 임시 비밀번호로 계정을 만들고, 실제 값은
   *  applySignupPassword가 채운다. */
  password?: string;
  name: string;
  /** 'student' | 'parent' | 'mentor' */
  memberType: string;
};

/**
 * 인증코드를 발송한다. 상태에 따라 신규 가입/이어가기를 알아서 고른다.
 * state가 'taken'이면 발송하지 않는다. mode는 검증 단계에 그대로 넘긴다.
 */
export async function sendSignupEmailCode({
  email,
  password,
  name,
  memberType,
}: SendSignupEmailCodeParams): Promise<{
  state?: string | undefined;
  mode?: string;
  resumed?: boolean;
  error?: Error;
}> {
  // 이 함수 안에서 무엇이 던져지든(네트워크 예외, 예상 밖의 비-Error 값 등) 호출부에는
  // 항상 message가 채워진 Error만 넘긴다 — QA 2026-08-21 "이메일 인증번호 보내기"가
  // 붉은 "{}"만 남기던 버그 대응. 호출부 네 화면(StudentForm/ParentForm/Under14Form/
  // ParentForm)이 error.message를 그대로 읽으므로, 정규화를 여기 한 곳에 두면
  // 화면마다 다시 방어할 필요가 없다.
  try {
    const { state, error: stateError } = await checkEmailSignupState(email);

    if (stateError)
      return {
        error: new Error(
          toErrorMessage(
            stateError,
            "이메일 중복확인 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.",
          ),
        ),
      };
    if (state === EMAIL_STATE.TAKEN) return { state };

    // 이전 세션이 남아 있으면 OTP 검증이 엉뚱한 계정에 붙을 수 있어 먼저 끊는다.
    // 공용 PC에 학습진단 초안(성적, 목표 학교)이 남지 않게 함께 지운다.
    clearAllDrafts();
    try {
      await supabase.auth.signOut({ scope: "global" });
    } catch (_error) {
      // 세션이 없으면 실패하는 게 정상이라 무시한다.
    }

    // 이메일이 이미 확인된 계정은 signUp이 "이미 등록됨"으로 막힌다.
    // 이 경우에만 OTP 로그인으로 코드를 보낸다.
    if (state === EMAIL_STATE.RESUMABLE_VERIFIED) {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false },
      });

      if (error)
        return {
          error: new Error(toErrorMessage(error, UNEXPECTED_SEND_ERROR)),
          state,
        };
      return { state, mode: OTP_MODE.EMAIL, resumed: true };
    }

    // available / resumable_unverified 는 둘 다 signUp으로 처리된다.
    // 미확인 계정에 대한 signUp 재호출은 확인메일을 다시 보낸다.
    const { error } = await supabase.auth.signUp({
      email,
      // 비밀번호 입력 여부와 무관하게 인증을 진행시키기 위한 임시값(파일 상단 주석).
      password: password || generateTempPassword(),
      options: {
        data: {
          email,
          name,
          full_name: name,
          member_type: memberType,
          role: "user",
        },
      },
    });

    if (error)
      return {
        error: new Error(toErrorMessage(error, UNEXPECTED_SEND_ERROR)),
        state,
      };

    return {
      state,
      mode: OTP_MODE.SIGNUP,
      resumed: state === EMAIL_STATE.RESUMABLE_UNVERIFIED,
    };
  } catch (error) {
    // 여기까지 오면 supabase-js가 반환이 아니라 진짜로 예외를 던진 것이다(순수 Error가
    // JSON.stringify되면 "{}"가 되는 그 경로) — Error로 감싸 항상 문자열 message를 보장한다.
    console.error("이메일 인증코드 발송 중 예외:", error);
    return { error: new Error(toErrorMessage(error, UNEXPECTED_SEND_ERROR)) };
  }
}

/**
 * "새 비밀번호가 기존과 같다"는 거부인지 판별한다.
 *
 * 이어가기에서 사용자가 이전 시도와 같은 비밀번호를 입력하면 Supabase가
 * same_password로 거부한다. 하지만 우리 목적은 "계정 비밀번호를 방금 입력한
 * 값과 일치시키는 것"이고, 이미 같다면 그 목적은 달성된 상태다. 실패로
 * 취급하면 같은 비밀번호를 쓴 사용자가 가입을 끝낼 수 없게 된다.
 */
function isSamePasswordError(
  error:
    | { code?: string | undefined; message?: string | undefined }
    | null
    | undefined,
) {
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();

  return (
    code === "same_password" ||
    message.includes("different from the old password")
  );
}

/**
 * 인증코드를 검증한다.
 *
 * 비밀번호는 여기서 건드리지 않는다. 발송 시점의 계정 비밀번호는 임시값이거나
 * 이전 시도의 값일 수 있는데, 그걸 맞추는 일은 가입을 끝내는 순간에
 * applySignupPassword가 한다. 검증 단계에서 같이 처리하면 "인증은 됐는데
 * 비밀번호 설정만 실패" 같은 어중간한 상태가 생기고, OTP는 이미 소모된 뒤라
 * 사용자가 손쓸 방법이 없다.
 *
 * mode: sendSignupEmailCode가 돌려준 mode
 */
export async function verifySignupEmailCode({
  email,
  token,
  mode,
}: {
  email: string;
  token: string;
  mode?: string;
}): Promise<{ ok?: boolean; error?: Error }> {
  const { error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: mode || OTP_MODE.SIGNUP,
  });

  if (error) return { error };

  return { ok: true };
}

/**
 * 폼에 입력된 비밀번호를 계정에 반영한다. 가입 완료 직전에 호출한다.
 *
 * 발송 시점에는 임시 비밀번호였을 수도, 이어가기라면 이전 시도의 비밀번호가
 * 남아 있을 수도 있다. 어느 쪽이든 여기서 사용자가 실제로 입력한 값으로 맞춘다.
 * 이 호출을 빠뜨리면 사용자가 방금 정한 비밀번호로 로그인할 수 없다.
 *
 */
export async function applySignupPassword(
  password: string | null | undefined,
): Promise<{ ok?: boolean; error?: Error }> {
  if (!password) return { ok: true };

  const { error } = await supabase.auth.updateUser({ password });

  // 이미 같은 비밀번호면 목적이 달성된 것이므로 성공으로 본다.
  if (error && !isSamePasswordError(error)) {
    console.error("비밀번호 설정 실패:", error);
    return { error };
  }

  return { ok: true };
}
