// 휴대폰 인증(알림톡/SMS). mockApi.js의 requestPhoneVerificationCode/
// verifyPhoneVerificationCode를 대체한다.
//
// ⚠️ mock과 구조가 다르다 — 단순 치환이 아니다
//   mock은 발송 시점 코드를 클라이언트에 내려주고 프론트가 로컬 비교했다.
//   그러면 응답만 열어봐도 누구나 통과한다. 실제로는 **검증도 서버가** 한다
//   (api/verify-phone-code.js). 그래서 호출부에 mockCode를 들고 있던 상태가
//   사라지고, 검증 결과를 서버 응답으로 받는다.
//
// 시도 횟수 제한
//   6자리 숫자는 경우의 수가 100만뿐이라 서버가 5회로 끊는다. 틀릴 때마다
//   remainingAttempts가 줄고, 소진되면 재발송 외에는 방법이 없다. 호출부는
//   같은 코드를 반복해서 보내지 않도록 주의해야 한다 — 자동 검증을 걸어두면
//   지웠다 다시 입력하는 것만으로 시도가 깎인다.

// 이미 가입에 쓰인 번호일 때의 문구. 발송 API(reason:'phone_taken')와 가입 RPC
// (duplicate_phone) 양쪽에서 같은 말을 해야 해서 상수로 뽑아 export한다.
export const DUPLICATE_PHONE_MESSAGE = "중복된 전화번호입니다.";

// 재발송 쿨타임(초) — 학생/학부모 가입 폼 양쪽이 같은 값을 useCooldown에 넘겨야
// UI 표시가 서버 제한과 어긋나지 않는다(EMAIL_RESEND_COOLDOWN_SECONDS와 동일한
// 이유로 signupEmailAuth.ts에서도 상수로 뽑아 export한 전례를 따른다).
export const PHONE_RESEND_COOLDOWN_SECONDS = 60;

const MESSAGES: Record<string, string> = {
  invalid_phone: "휴대폰 번호 형식이 올바르지 않습니다.",
  phone_taken: DUPLICATE_PHONE_MESSAGE,
  invalid_code_format: "인증번호 6자리를 입력해 주세요.",
  code_not_found: "인증번호를 먼저 요청해 주세요.",
  code_expired: "인증번호가 만료되었습니다. 다시 요청해 주세요.",
  code_mismatch: "인증번호가 일치하지 않습니다.",
  purpose_mismatch: "인증번호를 먼저 요청해 주세요.",
  too_many_attempts: "시도 횟수를 초과했습니다. 인증번호를 다시 요청해 주세요.",
  send_failed: "인증번호 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.",
  network: "연결 상태를 확인한 뒤 다시 시도해 주세요.",
  unknown: "잠시 후 다시 시도해 주세요.",
};

/** 하이픈·공백을 걷어낸다. 서버도 정규화하지만 화면 표시와 비교를 맞추려면 여기서도 한다. */
export function normalizePhone(raw: unknown) {
  return String(raw || "").replace(/[^0-9]/g, "");
}

export function isValidMobile(phone: unknown) {
  return /^01[0-9]{8,9}$/.test(normalizePhone(phone));
}

/**
 * 휴대폰 번호 입력 중 자동 하이픈 포맷 — 010-1234-5678 형태로 만든다(QA 지시 2026-08-21,
 * 멘토신청 지원서 + 프리미엄이용 문의 폼 공용). 숫자만 남기고 11자리로 자른 뒤 3-4-4 로
 * 끊는다. 정규화(제출·비교용, 하이픈 제거)는 normalizePhone 이 이미 맡고 있으므로
 * 이 함수는 화면 표시 전용이다 — 서버로 보낼 때는 반드시 normalizePhone 을 다시 거친다.
 */
export function formatPhoneInput(raw: unknown) {
  const digits = String(raw ?? "")
    .replace(/\D/g, "")
    .slice(0, 11);

  if (digits.length < 4) return digits;
  if (digits.length < 8) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

async function postJson(url: string, body: unknown) {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    return { response, payload };
  } catch {
    return { response: null, payload: null };
  }
}

export type SendPhoneCodeResult =
  | { ok: true; expiresIn: number; cooldown: number; dryRun: boolean }
  | { ok: false; reason: string; message: string; retryAfter?: number };

export type VerifyPhoneCodeResult =
  | { ok: true }
  | { ok: false; reason: string; message: string; remainingAttempts?: number };

/**
 * 인증번호를 발송한다.
 *
 * guardian_signup/guardian_change(2026-09-03)는 학생이 본인 명의 휴대폰이 없어
 * profiles.guardian_phone에 저장하는 학부모 번호 인증 경로다 — api/send-phone-code.ts
 * ALLOWED_PURPOSES와 동일한 값이어야 한다.
 */
export async function sendPhoneCode(
  phone: unknown,
  purpose:
    | "signup"
    | "parent_signup"
    | "phone_change"
    | "mentor_apply"
    | "find_account"
    | "reset_password"
    | "guardian_signup"
    | "guardian_change" = "parent_signup",
  // 스쿨멘토 가입(2026-11-06): 번호 중복을 소속 안에서만 보게 하는 범위. 위닝 호출부는 넘기지 않는다.
  scope: { tenantId?: string; catchAll?: boolean } = {},
): Promise<SendPhoneCodeResult> {
  const normalized = normalizePhone(phone);

  if (!isValidMobile(normalized)) {
    return {
      ok: false,
      reason: "invalid_phone",
      // MESSAGES는 Record<string,string>이라 인덱스 시그니처상 undefined 가능 취급되지만
      // invalid_phone 키는 항상 정의돼 있다.
      message: MESSAGES.invalid_phone!,
    };
  }

  const { response, payload } = await postJson("/api/send-phone-code", {
    phone: normalized,
    purpose,
    ...(scope.tenantId ? { tenant_id: scope.tenantId } : {}),
    ...(scope.catchAll ? { catch_all: true } : {}),
  });

  if (!response)
    // network 키는 항상 정의돼 있다.
    return { ok: false, reason: "network", message: MESSAGES.network! };

  if (!response.ok || !payload?.ok) {
    const reason = payload?.reason || "unknown";
    return {
      ok: false,
      reason,
      // 한도 관련 문구는 서버가 남은 시간까지 담아 보내므로 그대로 쓴다.
      message: payload?.detail || MESSAGES[reason] || MESSAGES.unknown,
      retryAfter: payload?.retry_after,
    };
  }

  return {
    ok: true,
    expiresIn: payload.expires_in,
    cooldown: payload.cooldown,
    // 운영에서 true면 문자가 실제로 안 나간 것이다(ALIGO_TEST_MODE/DRY_RUN).
    dryRun: Boolean(payload.dry_run),
  };
}

/**
 * 인증번호를 검증한다. 판정은 서버가 한다.
 *
 * purpose(선택, 2026-09-03) — 넘기면 서버가 대상 인증 행의 purpose와 일치하는지
 * 함께 확인한다(api/verify-phone-code.ts). 같은 번호로 목적이 다른 인증이 동시에
 * 진행 중일 때(예: 본인 번호 변경 중 학부모 번호도 바꾸는 경우) 엉뚱한 코드로
 * 통과되는 것을 막는다. 생략하면 기존 동작 그대로다 — 기존 호출부는 고칠 필요 없다.
 */
export async function verifyPhoneCode(
  phone: unknown,
  code: unknown,
  purpose?: string,
): Promise<VerifyPhoneCodeResult> {
  const normalized = normalizePhone(phone);
  const trimmed = String(code || "").trim();

  const { response, payload } = await postJson("/api/verify-phone-code", {
    phone: normalized,
    code: trimmed,
    ...(purpose ? { purpose } : {}),
  });

  if (!response)
    // network 키는 항상 정의돼 있다.
    return { ok: false, reason: "network", message: MESSAGES.network! };

  if (!response.ok || !payload?.ok) {
    const reason = payload?.reason || "unknown";
    const remaining = payload?.remaining_attempts;

    let message = payload?.detail || MESSAGES[reason] || MESSAGES.unknown;
    // 남은 기회를 알려주지 않으면 사용자가 몇 번 더 시도할 수 있는지 모른 채
    // 갑자기 차단된다.
    if (reason === "code_mismatch" && Number.isInteger(remaining)) {
      message = `인증번호가 일치하지 않습니다. (${remaining}회 남음)`;
    }

    return { ok: false, reason, message, remainingAttempts: remaining };
  }

  return { ok: true };
}
