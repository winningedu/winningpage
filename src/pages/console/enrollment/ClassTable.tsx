// W7 반별 표(768 이상). 서비스 칸은 "25명 (83%)" 형식이다(교 #39). 정원 입력 중에는 정원 칸이 입력 칸이다.

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { type ClassRow, gradeGroupLabel, percent, SERVICES } from "./format";

interface Props {
  rows: ClassRow[];
  /** 정원 입력 중이면 정원 칸이 입력 칸이다(값은 입력한 글 그대로). */
  edit?: {
    values: Record<string, string>;
    onChange: (id: string, v: string) => void;
  };
}

export default function ClassTable({ rows, edit }: Props) {
  return (
    <Table className="min-w-[56rem]">
      <TableHeader>
        <TableRow>
          <TableHead className="text-app-caption text-ink-sub">담임</TableHead>
          <TableHead className="text-app-caption text-ink-sub">
            학년그룹
          </TableHead>
          <TableHead className="text-app-caption text-ink-sub">반</TableHead>
          <TableHead className="text-right text-app-caption text-ink-sub">
            총원 / 정원
          </TableHead>
          <TableHead className="text-right text-app-caption text-ink-sub">
            이용 학생 / 총원
          </TableHead>
          {SERVICES.map((s) => (
            <TableHead
              key={s.key}
              className="text-right text-app-caption text-ink-sub"
            >
              {s.label}
            </TableHead>
          ))}
          <TableHead className="text-right text-app-caption text-ink-sub">
            목표 실행률 평균
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.classId} className="h-[3.25rem]">
            <TableCell className="text-app-label text-ink">
              {r.homeroomName ?? "담임 미배정"}
            </TableCell>
            <TableCell className="text-app-label text-ink">
              {gradeGroupLabel(r)}
            </TableCell>
            <TableCell className="text-app-label text-ink">{`${r.className}반`}</TableCell>
            <TableCell className="text-right text-app-label text-ink">
              {edit ? (
                <span className="inline-flex items-center justify-end gap-1">
                  {`${r.total} /`}
                  <input
                    type="number"
                    min={1}
                    inputMode="numeric"
                    aria-label={`${r.className}반 정원`}
                    value={edit.values[r.classId] ?? ""}
                    onChange={(e) => edit.onChange(r.classId, e.target.value)}
                    className="h-8 w-16 rounded-lg border border-line px-2 text-right text-app-label"
                  />
                </span>
              ) : r.capacity === null ? (
                `${r.total}`
              ) : (
                `${r.total} / ${r.capacity}`
              )}
            </TableCell>
            <TableCell className="text-right text-app-label text-ink">
              {`${r.joined} / ${r.total}`}
            </TableCell>
            {SERVICES.map((s) => (
              <TableCell
                key={s.key}
                className="text-right text-app-label text-ink"
              >
                {`${r.services[s.key]}명 (${percent(r.services[s.key], r.total)}%)`}
              </TableCell>
            ))}
            <TableCell className="text-right text-app-label text-ink">
              {r.goalRateAvg === null ? "-" : `${r.goalRateAvg}%`}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
