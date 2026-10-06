import { getFreshSupabaseAccessTokenOrSignOut } from "@/pages/admin/shared/adminSession";
import type {
  SelfevalSessionDetail,
  SelfevalSessionItem,
} from "./selfevalSessionsRow";

export type SelfevalSessionsPage = {
  items: SelfevalSessionItem[];
  total: number;
  page: number;
  pageSize: number;
};

type ApiResult<T> = { ok: true; data: T } | { ok: false; message: string };

async function call<T>(
  url: string,
  init: { method: "GET" | "POST"; body?: unknown },
): Promise<ApiResult<T>> {
  const accessToken = await getFreshSupabaseAccessTokenOrSignOut();
  const response = await fetch(url, {
    method: init.method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.ok) {
    // 서버 400/409 메시지를 그대로 표시한다.
    const message =
      result?.error?.message ??
      result?.detail ??
      result?.message ??
      `요청에 실패했습니다. (HTTP ${response.status})`;
    return { ok: false, message: String(message) };
  }
  return { ok: true, data: result as T };
}

export function fetchSelfevalSessions(search: string) {
  return call<SelfevalSessionsPage>(`/api/admin/selfeval-sessions?${search}`, {
    method: "GET",
  });
}

export function fetchSelfevalSessionDetail(sessionId: string) {
  return call<SelfevalSessionDetail>(
    `/api/admin/selfeval-sessions?sessionId=${encodeURIComponent(sessionId)}`,
    { method: "GET" },
  );
}

export function postSelfevalGrant(body: unknown) {
  return call<{ grantId: string; quota: unknown }>(
    "/api/admin/selfeval-grant",
    { method: "POST", body },
  );
}

export function postSelfevalRecover(sessionId: string) {
  return call<{ newSessionId: string }>("/api/admin/selfeval-recover", {
    method: "POST",
    body: { sessionId },
  });
}
