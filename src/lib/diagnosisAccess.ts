/**
 * 학습진단 유료 게이팅 — 프런트 모듈. 판정 정본은 서버(api/diagnosis/access.ts,
 * api/diagnosis/consume.ts → consume_diagnosis_attempt RPC)다. 이 파일은 그 두
 * 엔드포인트를 부르고, 실패를 어떻게 흡수할지(fail-open 범위)만 결정한다.
 *
 * ⚠️ 두 함수 모두 **네트워크/서버 오류는 관대하게(fail-open)** 다룬다 — 로컬
 * vite 단독 서버는 /api가 404라 개발 흐름이 막히면 안 되고, 운영에서도 일시
 * 장애로 무료 체험 학생을 막는 쪽보다는 다음 서버 게이트(진입 시 access 재조회)가
 * 뒤늦게 잡는 쪽이 낫다는 정책이다. 반대로 서버가 **명시적으로** 거부한
 * 경우(이용권 없음/만료/회차 소진/attempt 충돌)는 절대 fail-open하지 않는다 —
 * 그건 판정이 됐다는 뜻이라 관대할 이유가 없다.
 */
import { apiFetch, getAuthHeader } from "./apiFetch";
import { parseTenantReason, type TenantBlockReason } from "./tenantBlock";

export type DiagnosisAccessResult = {
  allowed: boolean;
  freeAvailable: boolean | null;
  quotaRemaining: number | null;
  quotaTotal: number | null;
  planEndsAt: string | null;
  /** 스쿨멘토 기관 거부 사유. 위닝 응답에는 없어 null 이다. */
  tenantReason: TenantBlockReason | null;
};

// 판정 불가(세션 없음/네트워크 실패/5xx) 시 반환값. allowed:true로 진입을 열어 준다.
const ACCESS_FAIL_OPEN: DiagnosisAccessResult = {
  allowed: true,
  freeAvailable: null,
  quotaRemaining: null,
  quotaTotal: null,
  planEndsAt: null,
  tenantReason: null,
};

function normalizeQuota(value: unknown): number | null {
  return Number.isInteger(value) ? (value as number) : null;
}

/** 진입 게이트. SurveyStepShell 마운트 시 1회 호출한다. */
export async function checkDiagnosisAccess(): Promise<DiagnosisAccessResult> {
  try {
    const authHeader = await getAuthHeader();
    if (!authHeader) {
      // /app/learning-diagnosis/survey는 requireAuthMiddleware가 이미 비회원을
      // /login으로 보내므로 정상 흐름에서는 여기 도달하지 않는다. 세션 조회
      // 자체가 실패하는 경합만 흡수한다.
      console.warn(
        "[diagnosisAccess] 세션 토큰 없음 — fail-open으로 진입 허용",
      );
      return ACCESS_FAIL_OPEN;
    }

    const response = await apiFetch("/api/diagnosis/access", {
      method: "POST",
      headers: authHeader,
    });

    let result: Partial<Omit<DiagnosisAccessResult, "tenantReason">> & {
      detail?: string;
      tenantReason?: unknown;
    } = {};
    try {
      result = await response.json();
    } catch {
      result = {};
    }

    if (!response.ok) {
      console.warn(
        "[diagnosisAccess] /api/diagnosis/access 실패 — fail-open으로 진입 허용:",
        response.status,
        result?.detail,
      );
      return ACCESS_FAIL_OPEN;
    }

    return {
      allowed: result.allowed === true,
      freeAvailable:
        typeof result.freeAvailable === "boolean" ? result.freeAvailable : null,
      quotaRemaining: normalizeQuota(result.quotaRemaining),
      quotaTotal: normalizeQuota(result.quotaTotal),
      planEndsAt: result.planEndsAt ?? null,
      tenantReason: parseTenantReason(result.tenantReason),
    };
  } catch (error) {
    console.warn(
      "[diagnosisAccess] /api/diagnosis/access 호출 오류 — fail-open으로 진입 허용:",
      error,
    );
    return ACCESS_FAIL_OPEN;
  }
}

// api/diagnosis/consume.ts가 실제로 판정을 거부했을 때만 쓰는 코드 — 이 넷은
// consume_diagnosis_attempt RPC의 status 어휘 중 "무엇도 기록/차감하지 않고
// 막는" 경로에 대응한다(free_used/charged/already_recorded는 전부 진행 허용).
const BLOCKING_ERROR_CODES = new Set([
  "NO_ENTITLEMENT",
  "ENTITLEMENT_EXPIRED",
  "QUOTA_EXHAUSTED",
  "ATTEMPT_CONFLICT",
]);

export type DiagnosisConsumeResult =
  | { outcome: "proceed"; status: string }
  | {
      outcome: "blocked";
      code: string;
      message: string;
      tenantReason: TenantBlockReason | null;
    }
  | { outcome: "fail-open" };

/**
 * 제출 소진. SurveyStepShell.submitDiagnosis가 리포트 정규화·저장 **직전**에
 * 호출한다. attemptId는 호출부가 제출 플로우당 1회 생성해 재사용해야 한다
 * (더블클릭·재시도 멱등은 서버 RPC가 이 id로 잡는다 — 여기서는 그대로 전달만 한다).
 */
export async function consumeDiagnosisAttempt(
  attemptId: string,
): Promise<DiagnosisConsumeResult> {
  try {
    const authHeader = await getAuthHeader();
    if (!authHeader) {
      console.warn(
        "[diagnosisAccess] consume 호출 시 세션 없음 — fail-open으로 제출 진행",
      );
      return { outcome: "fail-open" };
    }

    const response = await apiFetch("/api/diagnosis/consume", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeader,
      },
      body: JSON.stringify({ attemptId }),
    });

    let result: {
      ok?: boolean;
      status?: string;
      error?: { code?: string; message?: string };
      tenantReason?: unknown;
    } = {};
    try {
      result = await response.json();
    } catch {
      result = {};
    }

    if (response.ok && result?.ok === true) {
      return { outcome: "proceed", status: result.status || "" };
    }

    const code = result?.error?.code || "";
    if (BLOCKING_ERROR_CODES.has(code)) {
      return {
        outcome: "blocked",
        code,
        message: result?.error?.message || "이용권을 확인해 주세요.",
        tenantReason: parseTenantReason(result?.tenantReason),
      };
    }

    // 그 외(500 INTERNAL, 400 INVALID_ATTEMPT_ID 등 예상 밖 실패)는 서버 결함이지
    // "판정 결과"가 아니다 — 네트워크 실패와 동일하게 관대히 흡수한다.
    console.warn(
      "[diagnosisAccess] /api/diagnosis/consume 실패 — fail-open으로 제출 진행:",
      response.status,
      code,
    );
    return { outcome: "fail-open" };
  } catch (error) {
    console.warn(
      "[diagnosisAccess] /api/diagnosis/consume 호출 오류 — fail-open으로 제출 진행:",
      error,
    );
    return { outcome: "fail-open" };
  }
}
