// 목표관리 리포트 알림톡 — 크론 3종(일간·주간·월간)이 공유하는 부분.
//
// 여기 모은 것: 수신자 시간대 기준 발송 시각 판정 / 수신자 해석 / 시간·달성률 포맷.
// 크론마다 따로 두면 "누구에게 보내는가"와 "몇 시 기준인가"가 세 군데로 흩어져
// 곧 어긋난다 — 특히 시간대 보정은 한 곳에서 틀리면 하루 밀린 리포트가 나간다.
//
// 수신자 = 학부모 (사용자 확정 2026-08-22)
//   승인 문안이 「OO 학생의 학습 현황을 알려드립니다」로 제3자 보고 톤이고,
//   「학생 한마디: "..."」를 학생 본인에게 되돌려주는 건 어색하다. 그래서
//   parent_child_links 가 approved 인 학부모에게만 보낸다 — 연결된 학부모가
//   없는 학생은 건너뛴다(누락은 로그로 남는다).

import type { SupabaseClient } from "@supabase/supabase-js";
import { addDaysYmd, ymdIn } from "../../../src/lib/time/day.js";
import { localHourIn, type ReportKind } from "./reportResendPolicy.js";

/** 알림톡 발송 현지 시각(시). 일간 22시, 주간·월간 08시. */
const SEND_HOUR = { daily: 22, weekly: 8, monthly: 8 } as const;

/** 'YYYY-MM-DD' 의 요일(0=일 … 6=토). 시간대와 무관한 달력 계산이다. */
function weekdayOfYmd(ymd: string): number {
  return new Date(`${ymd}T00:00:00Z`).getUTCDay();
}

/**
 * 지금이 수신자(tz) 현지 발송 시각이면 그 실행이 보낼 기간 키를, 아니면 null.
 *   daily   — 현지 22시: 오늘 날짜(YYYY-MM-DD)
 *   weekly  — 현지 월요일 08시: 지난 주 월요일(YYYY-MM-DD)
 *   monthly — 현지 1일 08시: 지난 달(YYYY-MM)
 * 크론은 매시 정각에 돌고, 같은 시간 안의 재실행은 같은 기간 키를 만들어
 * dedupeKey 로 한 번만 나간다.
 */
export function dueReportPeriod(
  kind: ReportKind,
  now: Date,
  tz: string,
): string | null {
  if (localHourIn(now, tz) !== SEND_HOUR[kind]) return null;
  const today = ymdIn(now, tz);
  if (kind === "daily") return today;
  if (kind === "weekly") {
    if (weekdayOfYmd(today) !== 1) return null;
    return addDaysYmd(today, -7);
  }
  if (today.slice(8, 10) !== "01") return null;
  return addDaysYmd(today, -1).slice(0, 7);
}

/** 후보 학생을 모을 기록 날짜 창(UTC 오늘 기준 일수). 어떤 시간대든 대상 기간이 들어온다. */
const CANDIDATE_WINDOW_DAYS: Record<ReportKind, [number, number]> = {
  daily: [-1, 1],
  weekly: [-9, 1],
  monthly: [-33, 1],
};

/**
 * 지금 발송 시각인 학생을 기간 키별로 묶어 돌려준다(키 → 학생 id 목록).
 * 최근 기록이 있는 학생만 후보로 삼고, profiles.time_zone 으로 현지 시각을
 * 판정한다. 기간 안에 실제 기록이 있는지는 로더(requireRecords)가 확인한다.
 */
export async function findDueStudents(
  supabaseAdmin: SupabaseClient,
  kind: ReportKind,
  now: Date = new Date(),
): Promise<Map<string, string[]>> {
  const utcToday = ymdIn(now, "UTC");
  const [fromDays, toDays] = CANDIDATE_WINDOW_DAYS[kind];
  const { data: rows, error } = await supabaseAdmin
    .from("goal_daily_records")
    .select("profile_id")
    .gte("record_date", addDaysYmd(utcToday, fromDays))
    .lte("record_date", addDaysYmd(utcToday, toDays));
  if (error) {
    throw new Error(`goal_daily_records 조회 실패: ${error.message}`);
  }
  const candidateIds = Array.from(
    new Set((rows || []).map((row) => String(row.profile_id))),
  );
  const due = new Map<string, string[]>();
  if (candidateIds.length === 0) return due;

  const { data: zones, error: zoneError } = await supabaseAdmin
    .from("profiles")
    .select("id, time_zone")
    .in("id", candidateIds);
  if (zoneError) {
    throw new Error(`프로필 시간대 조회 실패: ${zoneError.message}`);
  }
  for (const zone of zones || []) {
    const periodKey = dueReportPeriod(kind, now, String(zone.time_zone));
    if (!periodKey) continue;
    const list = due.get(periodKey) || [];
    list.push(String(zone.id));
    due.set(periodKey, list);
  }
  return due;
}

/** 그 날짜가 속한 주의 월요일. 리포트 주간 키다(api/goal/report 의 period). */
export function mondayOf(d: Date): Date {
  const copy = new Date(d.getTime());
  // getUTCDay: 0=일 … 6=토. 월요일 기준으로 되돌린다(일요일은 6일 전).
  const dayOfWeek = copy.getUTCDay();
  const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  copy.setUTCDate(copy.getUTCDate() - diff);
  return copy;
}

/**
 * 그 달의 몇 번째 주인가. 승인 문안의 `#{N주차}` 자리.
 * 그 달 1일이 속한 주를 1주차로 세는 흔한 방식이다(달력 주 기준).
 */
export function weekOfMonth(monday: Date): number {
  const first = new Date(
    Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), 1),
  );
  const firstMonday = mondayOf(first);
  const diffDays = Math.round(
    (monday.getTime() - firstMonday.getTime()) / (24 * 60 * 60 * 1000),
  );
  return Math.floor(diffDays / 7) + 1;
}

/** 소수 시간 → '3시간 20분'. 승인 문안이 자유 텍스트라 사람이 읽는 형태로 쓴다. */
export function formatHours(value: number | null | undefined): string {
  const hours = Number(value || 0);
  if (!Number.isFinite(hours) || hours <= 0) return "0분";
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}분`;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}

/** 달성률(%) — 목표가 0이거나 없으면 0으로 본다(0 나눗셈 방지). */
export function achievementRate(
  actual: number | null | undefined,
  target: number | null | undefined,
): number {
  const a = Number(actual || 0);
  const t = Number(target || 0);
  if (!Number.isFinite(t) || t <= 0) return 0;
  return Math.round((a / t) * 100);
}

export type ReportRecipient = {
  studentProfileId: string;
  studentName: string;
  parentProfileId: string;
  parentPhone: string;
};

/**
 * 학생 id 목록 → 그 학생의 승인된 학부모 연락처.
 *
 * 한 학생에 학부모가 둘 이상 연결돼 있으면 전부 반환한다(각각 한 통씩 간다).
 * 연결이 없거나 학부모 연락처가 비어 있으면 그 학생은 결과에 없다 — 호출부가
 * 건너뛴 수를 로그로 남긴다.
 */
export async function resolveParentRecipients(
  supabaseAdmin: SupabaseClient,
  studentProfileIds: string[],
): Promise<ReportRecipient[]> {
  if (studentProfileIds.length === 0) return [];

  const { data: links, error: linkError } = await supabaseAdmin
    .from("parent_child_links")
    .select("parent_id, student_id")
    .eq("status", "approved")
    .in("student_id", studentProfileIds);

  if (linkError) {
    throw new Error(`학부모 연결 조회 실패: ${linkError.message}`);
  }
  if (!links || links.length === 0) return [];

  const ids = Array.from(
    new Set([
      ...links.map((l) => String(l.parent_id)),
      ...links.map((l) => String(l.student_id)),
    ]),
  );

  const { data: profiles, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, name, phone")
    .in("id", ids);

  if (profileError) {
    throw new Error(`프로필 조회 실패: ${profileError.message}`);
  }

  const byId = new Map((profiles || []).map((p) => [String(p.id), p]));

  const recipients: ReportRecipient[] = [];
  for (const link of links) {
    const parent = byId.get(String(link.parent_id));
    const student = byId.get(String(link.student_id));
    const phone = String(parent?.phone || "").replace(/[^0-9]/g, "");
    if (!parent || !student || !phone) continue;

    recipients.push({
      studentProfileId: String(link.student_id),
      // 이름이 비어 있으면 문구의 v() 가 던져서 발송이 실패 로그로 남는다.
      // 여기서 '학생' 같은 값으로 메우지 않는다 — 이름 없는 계정을 조용히
      // 넘기면 데이터 결손을 영영 모른다.
      studentName: String(student.name || ""),
      parentProfileId: String(link.parent_id),
      parentPhone: phone,
    });
  }

  return recipients;
}
