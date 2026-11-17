// 학교 학생 가입이 서버와 주고받는 호출 모음. 응답 계약은 api/signup/*.
export interface TenantSummary {
  id: string;
  name: string;
  orgType: string;
}

export type LookupTenantResult =
  | { ok: true; tenant: TenantSummary }
  | { ok: false; reason: "not_found" | "too_many" | "unknown" };

async function postJson(
  url: string,
  body: unknown,
  extraHeaders: Record<string, string> = {},
) {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...extraHeaders },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    return { response, payload };
  } catch {
    return { response: null, payload: null };
  }
}

export async function lookupTenant(code: string): Promise<LookupTenantResult> {
  const { response, payload } = await postJson("/api/signup/tenant-lookup", {
    code,
  });

  if (response?.ok) {
    return {
      ok: true,
      tenant: {
        id: payload.tenantId,
        name: payload.name,
        orgType: payload.orgType,
      },
    };
  }

  if (payload?.code === "TENANT_NOT_FOUND") {
    return { ok: false, reason: "not_found" };
  }
  if (payload?.code === "WC068") return { ok: false, reason: "too_many" };

  return { ok: false, reason: "unknown" };
}

export interface SchoolSignupBody {
  name: string;
  // 14세 미만이 본인 번호 없이 가입하면 빠진다.
  phone?: string;
  birthDate: string;
  gender: string;
  // null은 기타 소속.
  // 서버가 코드를 다시 찾는다. null은 기타 소속.
  tenantCode: string | null;
  grade: string;
  groupName?: string;
  className?: string;
  number?: number;
  guardianName?: string;
  guardianPhone?: string;
  guardianRelation?: string;
  guardianConsent: boolean;
  identityRequestId?: string;
  agreeService: boolean;
  agreePrivacy: boolean;
  agreeDbTransfer: boolean;
  agreeMarketing: boolean;
}

export type SchoolSignupResult =
  | { ok: true; linkCode: string; tenantName: string }
  | { ok: false; code: string; field?: string };

// 이메일 인증을 마친 브라우저 세션의 토큰(Authorization 헤더)으로 부른다.
export async function submitSchoolSignup(
  body: SchoolSignupBody,
  authHeader: { Authorization: string },
): Promise<SchoolSignupResult> {
  const { response, payload } = await postJson(
    "/api/signup/school-student",
    body,
    authHeader,
  );

  if (response?.ok) {
    return {
      ok: true,
      linkCode: payload.linkCode,
      tenantName: payload.tenantName,
    };
  }

  return {
    ok: false,
    code: payload?.code || "UNKNOWN",
    ...(typeof payload?.field === "string" && { field: payload.field }),
  };
}
