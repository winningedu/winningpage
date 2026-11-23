import DiagnosisReportView, {
  type DiagnosisReportData,
} from "@/components/renewal/report/DiagnosisReportView";
import LaterPages from "@/components/renewal/report/v3/LaterPages";
import ReportV3View from "@/components/renewal/report/v3/ReportV3View";
import {
  type DiagnosisV3Payload,
  SCHEMA_VERSION,
} from "@/lib/diagnosis-v3/types";
import { withStoredGradeRaw } from "@/lib/diagnosisReport";
import type { DiagnosisReportRow } from "@/lib/diagnosisReportQueries";

type StoredDiagnosisReportProps = {
  row: Pick<
    DiagnosisReportRow,
    "schema_version" | "payload" | "snapshot" | "diagnosed_at"
  >;
  /** PDF file name student; legacy view falls back to payload student name */
  studentName?: string | null;
};

/**
 * A stored diagnosis_reports row, drawn by the view of its schema version:
 * v3 rows (SCHEMA_VERSION) use ReportV3View, every older row keeps the legacy
 * DiagnosisReportView exactly as before. Shared by the self and parent routes.
 */
export default function StoredDiagnosisReport({
  row,
  studentName,
}: StoredDiagnosisReportProps) {
  if (row.schema_version === SCHEMA_VERSION) {
    const { pages } = row.payload as unknown as DiagnosisV3Payload;
    return (
      <ReportV3View
        pages={pages}
        laterPages={<LaterPages pages={pages} />}
        diagnosedAt={row.diagnosed_at}
        studentName={studentName ?? null}
      />
    );
  }

  return (
    <DiagnosisReportView
      data={
        withStoredGradeRaw(row.payload, row.snapshot) as DiagnosisReportData
      }
      studentName={studentName ?? null}
    />
  );
}
