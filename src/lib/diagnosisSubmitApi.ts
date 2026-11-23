// v3 learning diagnosis submit client: the server validates the answers,
// scores them and stores the report (judge-report 3-2). The browser no longer
// scores or saves a report itself.

import type { AdmissionTarget, DiagnosisV3Payload } from "@/lib/diagnosis-v3";
import { apiFetch, getAuthHeader } from "./apiFetch";
import { NO_SUBJECT_REFLECTION_LABEL } from "./diagnosisAdmissionCascade";
import {
  fetchAdmissionDepartments,
  fetchAdmissionUniversities,
} from "./diagnosisAdmissionMasterQueries";

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

/** q15 cascade state: display names picked on each step. */
export type AdmissionCascadeValue = {
  readonly university?: string;
  readonly department?: string;
  readonly admissionType?: string;
  readonly detailType?: string;
  readonly subjectReflection?: string;
};

/**
 * The q15 cascade holds display names; the server looks admission_results up
 * by university_key and department_key, so the names are mapped back here.
 * null when a key cannot be found (the report then shows 입결 미진행).
 */
export async function resolveAdmissionTarget(
  cascade: AdmissionCascadeValue,
): Promise<AdmissionTarget | null> {
  const { university, department, admissionType, detailType } = cascade;
  if (!university || !department || !admissionType || !detailType) return null;
  const universities = await fetchAdmissionUniversities();
  const universityKey = universities.data.find(
    (row) => row.university_name === university,
  )?.university_key;
  if (!universityKey) return null;
  const departments = await fetchAdmissionDepartments(universityKey);
  const departmentKey = departments.data.find(
    (row) => row.department_name === department,
  )?.department_key;
  if (!departmentKey) return null;
  const reflection = cascade.subjectReflection;
  return {
    universityKey,
    departmentKey,
    mainTrack: admissionType,
    admissionTrack: detailType,
    subjectReflection:
      !reflection || reflection === NO_SUBJECT_REFLECTION_LABEL
        ? null
        : reflection,
  };
}
