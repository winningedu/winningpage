import type { EntryProfile, EntryResponse } from "@/lib/selfeval/types";
import { ymdIn } from "@/lib/time/day";
import { routeForStep } from "../selfevalPaths";

// 시작 화면 순수 로직. 화면은 이 결과만 읽어 버튼과 안내를 고른다.

type Entry = EntryResponse["entry"];

export type StartMode =
  | { mode: "new" }
  | { mode: "resume"; sessionId: string; resumeTo: string }
  | { mode: "quota_zero" }
  | { mode: "no_activities" };

/**
 * 시작 화면 주 동선 판정(명세 No.14, 15, 101, 102).
 * 열린 세션이 있으면 이용권 잔여와 무관하게 이어쓰기를 허용한다(이미 차감된 작업이다).
 * 잔여가 null 이면(모름) 막지 않는다. 판정은 서버가 세션 생성 때 다시 한다.
 */
export function deriveStartMode(
  entry: Pick<Entry, "openSession" | "activityCount">,
  quotaRemaining: number | null,
): StartMode {
  const open = entry.openSession;
  if (open) {
    return {
      mode: "resume",
      sessionId: open.id,
      resumeTo: routeForStep(open.currentStep, open.id),
    };
  }
  if (quotaRemaining === 0) return { mode: "quota_zero" };
  if (entry.activityCount === 0) return { mode: "no_activities" };
  return { mode: "new" };
}

/** iso 시각부터 now 까지 지난 달 수(내림, tz 달력 날짜 기준). 해석할 수 없으면 null. */
export function monthsSince(iso: string, now: Date, tz: string): number | null {
  if (Number.isNaN(new Date(iso).getTime())) return null;
  const [fy = 0, fm = 0, fd = 0] = ymdIn(iso, tz).split("-").map(Number);
  const [ny = 0, nm = 0, nd = 0] = ymdIn(now, tz).split("-").map(Number);
  let months = (ny - fy) * 12 + (nm - fm);
  if (nd < fd) months -= 1;
  return Math.max(0, months);
}

/** 성장설계 발행이 오래됐을 때 배너에 붙이는 문장. 개월 수를 모르면 null. */
export function staleLabel(
  issuedAt: string,
  now: Date,
  tz: string,
): string | null {
  const months = monthsSince(issuedAt, now, tz);
  return months === null ? null : `발행일이 ${months}개월 지났어요`;
}

/** 학생 카드 둘째 줄. 값 없는 조각은 뺀다. 모두 없으면 null. */
export function studentSummaryLine(
  profile: EntryProfile | null,
): string | null {
  if (!profile) return null;
  const grade = profile.gradeLabel
    ? profile.semester !== null
      ? `${profile.gradeLabel} ${profile.semester}학기`
      : profile.gradeLabel
    : null;
  const goal = profile.department ?? profile.career;
  const parts = [grade, goal ? `${goal} 희망` : null].filter(
    (p): p is string => p !== null,
  );
  return parts.length === 0 ? null : parts.join(", ");
}
