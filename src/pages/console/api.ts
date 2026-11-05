// 콘솔 화면이 쓰는 API 호출 공용 계층. 세션이 없으면 요청을 보내지 않고 401 로 돌려준다.
// 응답 바디는 서버의 coded 에러 모양({ error: { code, message } })을 그대로 읽는다.

import { apiFetch, getAuthHeader } from "@/lib/apiFetch";

export type ConsoleKind = "homeroom" | "school_admin" | "hq_proxy";

export interface ConsoleClass {
  id: string;
  grade: string;
  name: string;
  group: string | null;
  isPrimary: boolean;
}

export interface ConsoleMe {
  kind: ConsoleKind;
  tenant: { id: string; code: string; name: string };
  teacher: {
    id: string;
    loginId: string | null;
    name: string;
    role: string;
  } | null;
  classIds: string[];
  classes: ConsoleClass[];
  proxySession: { id: string; tenantName: string; expiresAt: string } | null;
  mustChangePassword: boolean;
}

export interface ConsoleResponse {
  status: number;
  body: unknown;
  retryAfterSeconds: number | null;
}

export async function consoleRequest(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<ConsoleResponse> {
  const auth = await getAuthHeader();
  if (!auth) return { status: 401, body: null, retryAfterSeconds: null };
  const res = await apiFetch(path, {
    method: init.method ?? "GET",
    headers: {
      ...auth,
      ...(init.body === undefined
        ? {}
        : { "Content-Type": "application/json" }),
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  const body: unknown = await res.json().catch(() => null);
  const retry = Number(res.headers.get("Retry-After"));
  return {
    status: res.status,
    body,
    retryAfterSeconds: Number.isFinite(retry) && retry > 0 ? retry : null,
  };
}

/** 서버 coded 에러의 code. 없으면 null. */
export function errorCode(body: unknown): string | null {
  const error = (body as { error?: { code?: unknown } } | null)?.error;
  return typeof error?.code === "string" ? error.code : null;
}

/** 서버 coded 에러의 message. 없으면 null. */
export function errorMessage(body: unknown): string | null {
  const error = (body as { error?: { message?: unknown } } | null)?.error;
  return typeof error?.message === "string" ? error.message : null;
}
