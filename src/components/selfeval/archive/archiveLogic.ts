// 보관함의 순수 로직(시안 56~57, 명세 No.66, 126, 127, 15).
import { formatDotDate } from "@/components/selfeval/activities/activitiesLogic";
import {
  AREA_LABELS,
  type Area,
  type SessionListItem,
  type SessionStep,
} from "@/lib/selfeval/types";

export type SessionState =
  | "writing"
  | "completed"
  | "expired"
  | "terminal"
  | "discarded";

export const STATE_LABELS: Record<SessionState, string> = {
  writing: "작성 중",
  completed: "완료",
  expired: "만료",
  terminal: "종결",
  discarded: "파기",
};

/** 서버가 내려 준 플래그를 하나의 상태로 모은다. 파기와 완료를 먼저 본다. */
export function sessionState(item: SessionListItem): SessionState {
  if (item.discarded) return "discarded";
  if (item.status === "completed") return "completed";
  if (item.terminal) return "terminal";
  if (item.expired) return "expired";
  return "writing";
}

export function archiveTitle(
  item: Pick<SessionListItem, "subject" | "activityName">,
): string {
  const name = item.subject?.trim() || item.activityName?.trim() || "";
  return name === "" ? "자기평가서" : `${name} 자기평가서`;
}

export type ArchiveFilter = {
  academicYear?: number | undefined;
  semester?: 1 | 2 | undefined;
  area?: Area | undefined;
  state?: SessionState | undefined;
};

export function filterSessions(
  items: SessionListItem[],
  filter: ArchiveFilter,
): SessionListItem[] {
  return items.filter(
    (i) =>
      (filter.academicYear === undefined ||
        i.academicYear === filter.academicYear) &&
      (filter.semester === undefined || i.semester === filter.semester) &&
      (filter.area === undefined || i.area === filter.area) &&
      (filter.state === undefined || sessionState(i) === filter.state),
  );
}

function uniq<T>(values: (T | null)[]): T[] {
  return [...new Set(values.filter((v): v is T => v !== null))];
}

/** select 선택지. 목록에 실제로 있는 값만 보여 준다. */
export function archiveOptions(items: SessionListItem[]) {
  return {
    academicYears: uniq(items.map((i) => i.academicYear)).sort((a, b) => b - a),
    semesters: uniq(items.map((i) => i.semester)).sort(),
    areas: uniq(items.map((i) => i.area)),
    states: uniq(items.map(sessionState)),
  };
}

export type RowAction = "resume" | "view" | "restart";

export function rowAction(item: SessionListItem): RowAction | null {
  switch (sessionState(item)) {
    case "writing":
      return "resume";
    case "completed":
      return "view";
    case "expired":
    case "terminal":
      return "restart";
    case "discarded":
      return null;
  }
}

// 세션 current_step 이 끝낸 마지막 화면 라벨. 숫자는 사이드바 6단계 번호다.
const STEP_LABELS: Record<SessionStep, string> = {
  0: "2단계 기본 입력 중",
  1: "2단계 기본 입력까지",
  2: "3단계 활동 선택까지",
  3: "4단계 분석 확인까지",
  4: "5단계 생성 결과까지",
  5: "6단계 검증까지",
  6: "6단계 검증과 저장까지",
};

/** 메타 줄 조각. 값이 없는 조각은 만들지 않는다. */
export function rowMeta(item: SessionListItem): string[] {
  const parts: string[] = [];
  const where = [
    item.academicYear !== null ? `${item.academicYear}학년도` : null,
    item.semester !== null ? `${item.semester}학기` : null,
    item.area !== null ? AREA_LABELS[item.area] : null,
  ].filter((p): p is string => p !== null);
  if (where.length > 0) parts.push(where.join(" "));

  if (sessionState(item) === "completed") {
    const saved = item.completedAt ? formatDotDate(item.completedAt) : null;
    if (saved) parts.push(`저장 ${saved}`);
    if (item.score !== null) parts.push(`점수 ${item.score}점`);
    return parts;
  }
  if (sessionState(item) === "writing")
    parts.push(STEP_LABELS[item.currentStep]);
  const last = formatDotDate(item.lastActivityAt);
  if (last) parts.push(`마지막 저장 ${last}`);
  return parts;
}
