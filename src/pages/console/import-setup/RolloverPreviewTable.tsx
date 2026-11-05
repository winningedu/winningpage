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
import { gradeLabel } from "../classLabel";

export interface PreviewSlot {
  grade: string | null;
  groupName: string | null;
  className: string | null;
  number: number | null;
}

export type PreviewResult =
  | "applied"
  | "student_not_found"
  | "graduating"
  | "check_target"
  | "duplicate_target"
  | "same_name"
  | "no_homeroom";

export interface PreviewRow {
  line: number;
  displayName: string;
  from: PreviewSlot | null;
  to: PreviewSlot | null;
  result: PreviewResult;
}

const RESULTS: Record<PreviewResult, { label: string; tone: ChipTone }> = {
  applied: { label: "반영", tone: "Success" },
  student_not_found: { label: "현재 학생을 찾을 수 없음", tone: "Danger" },
  graduating: { label: "3학년은 졸업 처리 대상", tone: "Warning" },
  check_target: { label: "새 반과 번호 확인", tone: "Warning" },
  duplicate_target: { label: "같은 새 반과 번호가 중복", tone: "Danger" },
  same_name: { label: "같은 이름이 2명 이상(사람이 확인)", tone: "Danger" },
  no_homeroom: {
    label: "새 반에 담임 없음(안내만, 반영됨)",
    tone: "Warning",
  },
};

export const RESULT_LEGEND = `결과 종류: ${Object.values(RESULTS)
  .map((r) => r.label)
  .join(", ")}`;

/** "{학년}, {그룹 또는 없음}, {반}, {번호}번". 비어 있는 칸은 "-" 또는 "번호 미입력". */
function slotText(slot: PreviewSlot | null): string {
  if (!slot) return "-";
  return [
    slot.grade ? gradeLabel(slot.grade) : "-",
    slot.groupName ?? "없음",
    slot.className ? `${slot.className}반` : "-",
    slot.number === null ? "번호 미입력" : `${slot.number}번`,
  ].join(", ");
}

export default function RolloverPreviewTable({ rows }: { rows: PreviewRow[] }) {
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
            <TableCell>{slotText(row.from)}</TableCell>
            <TableCell>{slotText(row.to)}</TableCell>
            <TableCell>
              <Chip tone={RESULTS[row.result].tone}>
                {RESULTS[row.result].label}
              </Chip>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
