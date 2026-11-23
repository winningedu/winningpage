// Server-side admission cut lookup for the v3 diagnosis (judge-report 3-2, R8).
// Same query as src/lib/diagnosisAdmissionCuts.ts (admission_results, active rows
// of the q15 natural key, latest year with a cut, variant_seq ascending as the
// tie-break) plus competition_rate read from the same row. That module uses the
// browser client, so the lookup is repeated here with the admin client.

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AdmissionTarget,
  DiagnosisV3Context,
} from "../../../src/lib/diagnosis-v3/index.js";

type CutRow = {
  result_year: number;
  university_name: string;
  department_name: string;
  admission_track: string;
  grade_50: number | null;
  grade_70: number | null;
  competition_rate: number | null;
  variant_seq: number | null;
};

const hasCut = (row: CutRow) => row.grade_50 != null || row.grade_70 != null;

function pickLatestCutRow(rows: CutRow[]): CutRow | null {
  const withCuts = rows.filter(hasCut);
  if (withCuts.length === 0) return null;
  return withCuts.reduce((best, row) => {
    if (row.result_year !== best.result_year)
      return row.result_year > best.result_year ? row : best;
    return (row.variant_seq ?? 0) < (best.variant_seq ?? 0) ? row : best;
  });
}

/**
 * @returns the context admission block, or null when nothing with a cut exists.
 * @throws when the query fails: a transient error must not be stored as "no data".
 */
export async function fetchAdmissionInputs(
  supabaseAdmin: SupabaseClient,
  target: AdmissionTarget,
): Promise<DiagnosisV3Context["admission"]> {
  let builder = supabaseAdmin
    .from("admission_results")
    .select(
      "result_year,university_name,department_name,admission_track,grade_50,grade_70,competition_rate,variant_seq",
    )
    .eq("is_active", true)
    .eq("university_key", target.universityKey)
    .eq("department_key", target.departmentKey)
    .eq("main_track", target.mainTrack)
    .eq("admission_track", target.admissionTrack);
  builder =
    target.subjectReflection != null
      ? builder.eq("subject_reflection", target.subjectReflection)
      : builder.is("subject_reflection", null);

  const { data, error } = await builder;
  if (error)
    throw new Error(`admission_results query failed: ${error.message}`);

  const row = pickLatestCutRow((data ?? []) as CutRow[]);
  if (!row) return null;
  return {
    cut50: row.grade_50,
    cut70: row.grade_70,
    competitionRate: row.competition_rate,
    universityName: row.university_name,
    unitName: row.department_name,
    typeName: row.admission_track,
    year: row.result_year,
  };
}
