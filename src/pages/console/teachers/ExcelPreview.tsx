// W15 3단계 행 판정 미리보기. 줄마다 서버 판정을 칩으로 보이고 적용 가능 건수와 오류 건수를 알린다(교 #123, #205).
// 이미 담임이 있는 학급(변경)은 덮어쓰기와 건너뛰기 중에 고른다(교 #124).

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Chip, { type ChipTone } from "../Chip";
import Notice from "../Notice";
import {
  type ApplyMode,
  isErrorVerdict,
  VERDICT_LABEL,
  type Verdict,
} from "./excelImport";
import type { TeacherFileRow } from "./teacherFile";

const TONE: Record<Verdict, ChipTone> = {
  format_error: "Danger",
  group_not_registered: "Danger",
  class_duplicate: "Danger",
  phone_conflict: "Danger",
  same_name_other: "Info",
  shared_login: "Info",
  same: "Neutral",
  changed: "Warning",
  new: "Success",
};

interface ExcelPreviewProps {
  rows: TeacherFileRow[];
  verdicts: Verdict[];
  mode: ApplyMode;
  busy: boolean;
  error: string | null;
  onMode: (mode: ApplyMode) => void;
  onApply: () => void;
  onCancel: () => void;
}

export default function ExcelPreview({
  rows,
  verdicts,
  mode,
  busy,
  error,
  onMode,
  onApply,
  onCancel,
}: ExcelPreviewProps) {
  const errors = verdicts.filter(isErrorVerdict).length;
  const applicable = verdicts.filter(
    (v) =>
      v === "new" ||
      v === "same_name_other" ||
      v === "shared_login" ||
      (v === "changed" && mode === "overwrite"),
  ).length;

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold tracking-[-0.02em] text-ink-strong">
        3. 행 판정 미리보기
      </h2>
      <p className="text-app-label text-ink-sub">
        {`적용 가능 ${applicable}건, 오류 ${errors}건. 오류 행은 적용하지 않아요`}
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>줄</TableHead>
            <TableHead>교사명</TableHead>
            <TableHead>전화번호</TableHead>
            <TableHead>학년</TableHead>
            <TableHead>그룹</TableHead>
            <TableHead>반</TableHead>
            <TableHead>판정</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => {
            const verdict = verdicts[i] as Verdict;
            return (
              // 줄 번호가 곧 정체성이다(파일의 순서).
              // biome-ignore lint/suspicious/noArrayIndexKey: 파일 줄 순서
              <TableRow key={i}>
                <TableCell>{i + 1}</TableCell>
                <TableCell>{row.name}</TableCell>
                <TableCell>{row.phone}</TableCell>
                <TableCell>{row.grade}</TableCell>
                <TableCell>{row.group}</TableCell>
                <TableCell>{row.className}</TableCell>
                <TableCell>
                  <Chip tone={TONE[verdict]}>{VERDICT_LABEL[verdict]}</Chip>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <fieldset className="flex flex-col gap-2">
        <legend className="pb-1 text-app-label font-medium text-ink-sub">
          이미 담임이 있는 학급(변경)은
        </legend>
        {(
          [
            ["skip", "건너뛰기"],
            ["overwrite", "담임 이름 덮어쓰기"],
          ] as const
        ).map(([value, label]) => (
          <label
            key={value}
            className="flex items-center gap-2 text-app-label text-ink"
          >
            <input
              type="radio"
              name="apply-mode"
              checked={mode === value}
              onChange={() => onMode(value)}
            />
            {label}
          </label>
        ))}
      </fieldset>
      {error && <Notice tone="Danger">{error}</Notice>}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          className="h-10 rounded-lg border-line px-5 text-app-label font-semibold text-primary"
        >
          취소
        </Button>
        <Button
          type="button"
          disabled={applicable === 0 || busy}
          onClick={onApply}
          className="h-10 rounded-lg px-5 text-app-label font-semibold disabled:opacity-40"
        >
          적용
        </Button>
      </div>
    </section>
  );
}
