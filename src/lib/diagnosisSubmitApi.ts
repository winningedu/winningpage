// v3 learning diagnosis submit client: the server validates the answers,
// scores them and stores the report (judge-report 3-2). The browser no longer
// scores or saves a report itself.

import type { DiagnosisV3Payload } from "@/lib/diagnosis-v3";
import { apiFetch, getAuthHeader } from "./apiFetch";

export type DiagnosisSubmitResult =
  | {
      ok: true;
      schemaVersion: string;
      payload: DiagnosisV3Payload;
    }
  | { ok: false; reason: "no-session" | "network" }
  | { ok: false; reason: "rejected"; code: string | null };

/** POST /api/diagnosis/submit { attemptId, answers }. Never throws. */
export async function submitDiagnosisV3(input: {
  attemptId: string;
  answers: Record<string, unknown>;
}): Promise<DiagnosisSubmitResult> {
  try {
    const authHeader = await getAuthHeader();
    if (!authHeader) return { ok: false, reason: "no-session" };

    const response = await apiFetch("/api/diagnosis/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader },
      body: JSON.stringify({
        attemptId: input.attemptId,
        answers: input.answers,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (response.ok && body?.ok === true) {
      return {
        ok: true,
        schemaVersion: body.schemaVersion,
        payload: body.payload,
      };
    }
    // api/_lib/httpResponse.ts "coded" shape: { error: { code, message } }
    return { ok: false, reason: "rejected", code: body?.error?.code ?? null };
  } catch {
    return { ok: false, reason: "network" };
  }
}
