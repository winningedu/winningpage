// 학생 학적 API 호출. 응답 바디는 서버의 coded 에러 모양({ error: { code, message } })을 읽는다.

import { apiFetch, getAuthHeader } from "@/lib/apiFetch";

export type EnrollmentEndpoint = "self-assign" | "request-change";

export interface EnrollmentInput {
  grade: string;
  groupName?: string;
  className: string;
  number: number;
}

export type SubmitResult = { ok: true } | { ok: false; message: string };

export const SUBMIT_FAILED = "저장하지 못했어요. 잠시 후 다시 시도해 주세요.";

export async function submitEnrollment(
  endpoint: EnrollmentEndpoint,
  input: EnrollmentInput,
): Promise<SubmitResult> {
  const auth = await getAuthHeader();
  if (!auth) return { ok: false, message: "로그인이 필요해요." };
  const res = await apiFetch(`/api/enrollment/${endpoint}`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (res.ok) return { ok: true };
  const body: unknown = await res.json().catch(() => null);
  const message = (body as { error?: { message?: unknown } } | null)?.error
    ?.message;
  return {
    ok: false,
    message: typeof message === "string" ? message : SUBMIT_FAILED,
  };
}

export interface EnrollmentClass {
  grade: string | null;
  groupName: string | null;
  className: string | null;
  number: number | null;
}

export interface MyEnrollment {
  orgType: string | null;
  enrollment: (EnrollmentClass & { schoolYear: number }) | null;
  pending: (EnrollmentClass & { createdAt: string }) | null;
}

/** 올해 학적과 열린 변경 신청. 불러오지 못하면 null(화면은 아무것도 그리지 않는다). */
export async function fetchMyEnrollment(): Promise<MyEnrollment | null> {
  const auth = await getAuthHeader();
  if (!auth) return null;
  const res = await apiFetch("/api/enrollment/me", { headers: auth });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as MyEnrollment | null;
}
