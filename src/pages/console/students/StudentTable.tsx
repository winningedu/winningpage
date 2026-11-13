// W6 표(데스크톱과 태블릿). 태블릿은 표가 좁아 가로로 밀어 본다(이름 칸은 고정).

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Chip from "../Chip";
import NameCell from "../NameCell";
import RateCell from "./RateCell";
import ServiceIcons from "./ServiceIcons";
import SpecialReasons from "./SpecialReasons";
import { gradeClassOf, joinedLabel, numberOf } from "./studentLabel";
import type { SpecialThresholds, StudentRow } from "./types";
import UrgencyChip from "./UrgencyChip";

interface StudentTableProps {
  rows: StudentRow[];
  academy: boolean;
  showEdit: boolean;
  /** 특이학생만 보는 중이면 사유 열을 더한다. */
  showReasons: boolean;
  thresholds: SpecialThresholds;
  onOpen: (studentId: string) => void;
  onEdit: (studentId: string) => void;
}

export default function StudentTable({
  rows,
  academy,
  showEdit,
  showReasons,
  thresholds,
  onOpen,
  onEdit,
}: StudentTableProps) {
  return (
    // 태블릿에서 표가 가로로 밀리므로 키보드로도 닿게 한다(빌드 로그 구현 메모).
    // biome-ignore lint/a11y/noNoninteractiveTabindex: 스크롤 영역은 키보드 초점을 받아야 한다.
    <section aria-label="학생 목록" tabIndex={0} className="overflow-x-auto">
      <Table className="min-w-[64.25rem]">
        <TableHeader>
          <TableRow>
            <TableHead>학습진단 긴급도</TableHead>
            <TableHead>이름 (가입일)</TableHead>
            <TableHead>학년그룹/반/번호</TableHead>
            <TableHead>주간 목표시간 달성율</TableHead>
            <TableHead>이용서비스</TableHead>
            {showReasons && <TableHead>특이 사유</TableHead>}
            {showEdit && <TableHead />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.studentId}>
              <TableCell>
                <UrgencyChip level={row.urgency} />
              </TableCell>
              <TableCell className="sticky left-0 bg-background">
                {row.pending ? (
                  <span className="flex flex-col items-start gap-0.5">
                    <NameCell name={row.displayName} />
                    <span className="pl-11">
                      <Chip tone="Neutral">미회원가입</Chip>
                    </span>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onOpen(row.studentId)}
                    title={row.displayName}
                    className="flex flex-col items-start gap-0.5 text-left"
                  >
                    <NameCell name={row.displayName} />
                    <span className="pl-11 text-app-caption text-ink-sub">
                      {joinedLabel(row.joinedAt)}
                    </span>
                  </button>
                )}
              </TableCell>
              <TableCell>
                <span className="flex items-center gap-2 text-app-label text-ink">
                  <span>{gradeClassOf(row, academy)}</span>
                  <span aria-hidden className="h-3 w-px bg-border" />
                  <span>{numberOf(row)}</span>
                </span>
              </TableCell>
              <TableCell>
                <RateCell row={row} />
              </TableCell>
              <TableCell>
                <ServiceIcons
                  services={row.services}
                  count={row.serviceCount}
                />
              </TableCell>
              {showReasons && (
                <TableCell>
                  <SpecialReasons
                    reasons={row.specialReasons}
                    thresholds={thresholds}
                  />
                </TableCell>
              )}
              {showEdit && (
                <TableCell className="text-right">
                  {row.canEdit && !row.pending && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => onEdit(row.studentId)}
                      className="h-8 rounded-lg bg-surface-muted px-3 text-sm font-medium text-primary"
                    >
                      편집하기
                    </Button>
                  )}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
