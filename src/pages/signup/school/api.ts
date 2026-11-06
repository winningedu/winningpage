// 학교 학생 가입이 서버와 주고받는 호출 모음. 응답 계약은 api/signup/*.
export interface TenantSummary {
  id: string;
  name: string;
  orgType: string;
}

export type LookupTenantResult =
  | { ok: true; tenant: TenantSummary }
  | { ok: false; reason: "not_found" | "too_many" | "unknown" };

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
