// W6 휴대폰 카드 목록. 이름은 줄여 쓰지 않고 줄바꿈한다.

import { Button } from "@/components/ui/button";
import NameCell from "../NameCell";
import RateCell from "./RateCell";
import ServiceIcons from "./ServiceIcons";
import SpecialReasons from "./SpecialReasons";
import { gradeClassOf, joinedLabel, numberOf } from "./studentLabel";
import type { StudentRow } from "./types";
import UrgencyChip from "./UrgencyChip";

interface StudentCardsProps {
  rows: StudentRow[];
  academy: boolean;
  showEdit: boolean;
  showReasons: boolean;
  execRatePct: number | null;
  onOpen: (studentId: string) => void;
  onEdit: (studentId: string) => void;
}

export default function StudentCards({
  rows,
  academy,
  showEdit,
  showReasons,
  execRatePct,
  onOpen,
  onEdit,
}: StudentCardsProps) {
  return (
    <ul className="flex flex-col">
      {rows.map((row) => (
        <li
          key={row.studentId}
          className="flex flex-col gap-3 border-b border-line py-4"
        >
          <div className="flex items-start justify-between gap-3">
            <button
              type="button"
              onClick={() => onOpen(row.studentId)}
              className="flex flex-col gap-1 text-left"
            >
              <NameCell name={row.displayName} />
              <span className="text-app-caption text-ink">
                {`${gradeClassOf(row, academy)} ${numberOf(row)}`}
              </span>
              <span className="text-app-caption text-ink-sub">
                {joinedLabel(row.joinedAt)}
              </span>
            </button>
            <span className="flex w-[4.75rem] shrink-0 flex-col items-start gap-1">
              <span className="text-app-caption text-ink-sub">
                학습진단 긴급도
              </span>
              <UrgencyChip level={row.urgency} />
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-app-caption text-ink-sub">
              주간 목표시간 달성율
            </span>
            <RateCell row={row} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-app-caption text-ink-sub">이용서비스</span>
            <ServiceIcons services={row.services} count={row.serviceCount} />
          </div>
          {showReasons && (
            <SpecialReasons
              reasons={row.specialReasons}
              execRatePct={execRatePct}
            />
          )}
          {showEdit && row.canEdit && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => onEdit(row.studentId)}
              className="h-11 w-full rounded-lg bg-surface-muted text-sm font-medium text-primary"
            >
              편집하기
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
