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

export type AdmissionTargetResult =
  | { ok: true; target: AdmissionTarget }
  | { ok: false };

/**
 * The q15 cascade holds display names; the server looks admission_results up
 * by university_key and department_key, so the names are mapped back here.
 * A failed lookup or a name missing from the list is a failure, never an
 * absent q15: the stored report would otherwise lose q15..q18 for good.
 */
export async function resolveAdmissionTarget(
  cascade: AdmissionCascadeValue,
): Promise<AdmissionTargetResult> {
  const { university, department, admissionType, detailType } = cascade;
  if (!university || !department || !admissionType || !detailType) {
    return { ok: false };
  }
  const universities = await fetchAdmissionUniversities();
  if (universities.error) return { ok: false };
  const universityKey = universities.data.find(
    (row) => row.university_name === university,
  )?.university_key;
  if (!universityKey) return { ok: false };
  const departments = await fetchAdmissionDepartments(universityKey);
  if (departments.error) return { ok: false };
  const departmentKey = departments.data.find(
    (row) => row.department_name === department,
  )?.department_key;
  if (!departmentKey) return { ok: false };
  const reflection = cascade.subjectReflection;
  return {
    ok: true,
    target: {
      universityKey,
      departmentKey,
      mainTrack: admissionType,
      admissionTrack: detailType,
      subjectReflection:
        !reflection || reflection === NO_SUBJECT_REFLECTION_LABEL
          ? null
          : reflection,
    },
  };
}
