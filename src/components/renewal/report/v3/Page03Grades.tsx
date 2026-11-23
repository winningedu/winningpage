import type { Page3 } from "@/lib/diagnosis-v3/types";
import CopyText from "./parts/CopyText";
import {
  REPORT_LABELS as L,
  SUBJECT_LABELS,
  VERDICT_LABELS,
} from "./parts/labels";
import ReportCard from "./parts/ReportCard";
import ReportSheet from "./parts/ReportSheet";
import SectionHeader from "./parts/SectionHeader";
import StatusBadge from "./parts/StatusBadge";

const PAGE = 3;

type Page03GradesProps = { page: Page3; tocTitle: string };

/** 3p grades, 22 r38-r46. */
export default function Page03Grades({ page, tocTitle }: Page03GradesProps) {
  const { bars, subjects, examOpsEvidence: evidence } = page;
  const metrics = [
    [L.gpaAll, page.gpa],
    [L.gpaRecent, page.recent],
    [L.gradeTrend, page.trend],
  ] as const;

  return (
    <ReportSheet page={PAGE}>
      <SectionHeader
        page={PAGE}
        tocTitle={tocTitle}
        title={page.title}
        lead={page.lead}
      />
      {/* 22 r40-r42 */}
      <div className="grid grid-cols-3 gap-4">
        {metrics.map(([label, value]) => (
          <ReportCard key={label} title={label}>
            <p className="text-xl font-bold">
              <CopyText text={value} />
            </p>
          </ReportCard>
        ))}
      </div>
      {/* 22 r43: switch on and q6s answered */}
      {bars && (
        <div className="grid grid-cols-2 gap-4">
          <ReportCard title={L.schoolGrades}>
            <GradeList label={L.schoolGrades} grades={bars.school} />
          </ReportCard>
          {bars.mock && bars.mock.grades.length > 0 && (
            <ReportCard
              title={L.mockGrades}
              meta={`${bars.mock.month}${L.month}`}
            >
              <GradeList
                label={`${L.mockGrades} ${bars.mock.month}${L.month}`}
                grades={bars.mock.grades}
              />
            </ReportCard>
          )}
        </div>
      )}
      {/* 22 r44 table or r45 skip note */}
      <ReportCard title={L.subjectTable}>
        {subjects.kind === "table" ? (
          <>
            <table className="w-full text-left text-sm">
              <thead className="border-b border-ink-title text-xs text-ink-sub">
                <tr>
                  <th className="py-2 font-normal">{L.subject}</th>
                  <th className="py-2 font-normal">{L.verdict}</th>
                </tr>
              </thead>
              <tbody>
                {subjects.rows.map((row) => (
                  <tr key={row.subject} className="border-b border-line">
                    <td className="py-2 pr-4 font-semibold">
                      {SUBJECT_LABELS[row.subject]}
                    </td>
                    <td className="flex items-center gap-2 py-2">
                      <StatusBadge>{VERDICT_LABELS[row.verdict]}</StatusBadge>
                      <span>
                        <CopyText text={row.text} />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-ink-sub">
              <CopyText text={subjects.note} />
            </p>
          </>
        ) : (
          <p>
            <CopyText text={subjects.note} />
          </p>
        )}
      </ReportCard>
      {/* 22 r46 */}
      <ReportCard title={page.examOps.heading} meta={page.examOpsVerdict}>
        <p>
          <CopyText text={page.examOps.body} />
        </p>
        {/* spec row 76: 응답 근거 */}
        <p className="text-sm text-ink-sub">
          <CopyText text={`${evidence.item} ${evidence.answer}`} />
          {evidence.examRoom && (
            <CopyText
              text={`${L.joiner}${L.examRoomQuestion} ${evidence.examRoom} ${L.examRoomPicked}`}
            />
          )}
        </p>
      </ReportCard>
    </ReportSheet>
  );
}

function GradeList({
  label,
  grades,
}: {
  label: string;
  grades: readonly { subject: keyof typeof SUBJECT_LABELS; grade: number }[];
}) {
  return (
    <ul aria-label={label} className="flex flex-col gap-2">
      {grades.map((item) => (
        <li key={item.subject} className="flex justify-between">
          <span>{SUBJECT_LABELS[item.subject]}</span>
          <span className="font-semibold tabular-nums">{item.grade}</span>
        </li>
      ))}
    </ul>
  );
}
