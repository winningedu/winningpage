// W11 ③ 미리보기 표. 줄마다 기존 값, 새 값, 결과 칩을 보여준다. 이름은 서버가 가려서 준다.

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Chip, { type ChipTone } from "../Chip";
import type { GradeLabeler } from "../classLabel";
import { useGradeLabel, useIsAcademy } from "../useConsoleMe";

export interface PreviewSlot {
  grade: string | null;
  groupName: string | null;
  className: string | null;
  number: number | null;
  /** 다학년 학급이면 true. */
  mixed?: boolean;
}

export type PreviewResult =
  | "applied"
  | "student_not_found"
  | "graduating"
  | "check_target"
  | "duplicate_target"
  | "same_name"
  | "no_homeroom"
  | "class_changed";

export interface PreviewRow {
  line: number;
  displayName: string;
  from: PreviewSlot | null;
  to: PreviewSlot | null;
  result: PreviewResult;
  /** 반이 바뀌는 줄에서 새 반에 담임이 없을 때. 반 변경 칩 옆에 담임 없음 칩도 보인다. */
  noHomeroom?: boolean;
}

const RESULTS: Record<PreviewResult, { label: string; tone: ChipTone }> = {
  applied: { label: "반영", tone: "Success" },
  class_changed: { label: "반 변경", tone: "Warning" },
  student_not_found: { label: "미회원가입", tone: "Danger" },
  graduating: { label: "3학년은 졸업 처리 대상", tone: "Warning" },
  check_target: { label: "새 반과 번호 확인", tone: "Warning" },
  duplicate_target: { label: "같은 새 반과 번호가 중복", tone: "Danger" },
  same_name: { label: "같은 이름이 2명 이상(사람이 확인)", tone: "Danger" },
  no_homeroom: {
    label: "새 반에 담임 없음(안내만, 반영됨)",
    tone: "Warning",
  },
};

// 졸업 칩은 학교는 "3학년", 학원은 "고3" 으로 말한다.
export const resultLabel = (result: PreviewResult, academy: boolean) =>
  academy && result === "graduating"
    ? "고3은 졸업 처리 대상"
    : RESULTS[result].label;

export const resultLegend = (academy: boolean) =>
  `결과 종류: ${(Object.keys(RESULTS) as PreviewResult[])
    .map((r) => resultLabel(r, academy))
    .join(", ")}`;

/** "{학년}, {그룹 또는 없음}, {반}, {번호}번". 비어 있는 칸은 "-" 또는 "번호 미입력". */
function slotText(slot: PreviewSlot | null, gradeLabel: GradeLabeler): string {
  if (!slot) return "-";
  return [
    slot.mixed || slot.grade ? gradeLabel(slot.grade) : "-",
    slot.groupName ?? "없음",
    slot.className ? `${slot.className}반` : "-",
    slot.number === null ? "번호 미입력" : `${slot.number}번`,
  ].join(", ");
}

export default function RolloverPreviewTable({ rows }: { rows: PreviewRow[] }) {
  const gradeLabel = useGradeLabel();
  const academy = useIsAcademy();
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>이름</TableHead>
          <TableHead>기존 학년그룹, 그룹, 반, 번호</TableHead>
          <TableHead>새 학년그룹, 그룹, 반, 번호</TableHead>
          <TableHead>결과</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.line}>
            <TableCell>{row.displayName}</TableCell>
            <TableCell>{slotText(row.from, gradeLabel)}</TableCell>
            <TableCell>{slotText(row.to, gradeLabel)}</TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-1">
                <Chip tone={RESULTS[row.result].tone}>
                  {resultLabel(row.result, academy)}
                </Chip>
                {row.noHomeroom && (
                  <Chip tone={RESULTS.no_homeroom.tone}>
                    {resultLabel("no_homeroom", academy)}
                  </Chip>
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
