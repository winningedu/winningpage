// 서비스이용횟수조정 화면의 데이터 호출. 학생 검색은 관리자 RLS 로 클라이언트 Supabase 가 직접 하고,
// 현황 조회와 조정은 /api/admin/service-credit-summary, /api/admin/service-credit-adjust 를 부른다.

import { escapeIlike } from "@/components/growth/survey/surveySearch";
import { supabase } from "@/lib/supabase";
import { getFreshSupabaseAccessTokenOrSignOut } from "@/pages/admin/shared/adminSession";

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string };

export type StudentRow = {
  id: string;
  name: string | null;
  email: string | null;
};

export type ServiceCreditRow = {
  programKey: string;
  label: string;
  periodBased: boolean;
  liveCount: number;
  quotaTotal: number | null;
  quotaUsed: number;
  quotaRemaining: number | null;
  expiresAt: string | null;
};

export type AdjustBody = {
  profileId: string;
  programKey: string;
  delta: number;
  months?: number;
  reason: string;
};

const STUDENT_SEARCH_LIMIT = 20;

export async function searchStudents(
  term: string,
): Promise<ApiResult<StudentRow[]>> {
  // PostgREST or 필터는 콤마와 괄호로 절을 구분하므로 검색어에서 걷어낸다.
  const q = escapeIlike(term.trim().replace(/[,()*"]/g, ""));
  if (!q) return { ok: true, data: [] };
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, email")
    .eq("member_type", "student")
    .or(`email.ilike.%${q}%,name.ilike.%${q}%`)
    .limit(STUDENT_SEARCH_LIMIT);
  if (error) return { ok: false, message: "학생 조회에 실패했습니다." };
  return { ok: true, data: data ?? [] };
}

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
    const message =
      result?.error?.message ??
      result?.detail ??
      result?.message ??
      `요청에 실패했습니다. (HTTP ${response.status})`;
    return { ok: false, message: String(message) };
  }
  return { ok: true, data: result as T };
}

export async function fetchServiceCredits(
  profileId: string,
): Promise<ApiResult<ServiceCreditRow[]>> {
  const result = await call<{ items: ServiceCreditRow[] }>(
    `/api/admin/service-credit-summary?profileId=${encodeURIComponent(profileId)}`,
    { method: "GET" },
  );
  return result.ok ? { ok: true, data: result.data.items } : result;
}

export function postServiceCreditAdjust(body: AdjustBody) {
  return call<{ credit: ServiceCreditRow }>(
    "/api/admin/service-credit-adjust",
    {
      method: "POST",
      body,
    },
  );
}
