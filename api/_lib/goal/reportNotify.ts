// 목표관리 리포트 알림톡 — 크론 3종(일간·주간·월간)이 공유하는 부분.
//
// 여기 모은 것: KST 날짜 계산 / 수신자 해석 / 시간·달성률 포맷.
// 크론마다 따로 두면 "누구에게 보내는가"와 "몇 시 기준인가"가 세 군데로 흩어져
// 곧 어긋난다 — 특히 KST 보정은 한 곳에서 틀리면 하루 밀린 리포트가 나간다.
//
// 수신자 = 학부모 (사용자 확정 2026-08-22)
//   승인 문안이 「OO 학생의 학습 현황을 알려드립니다」로 제3자 보고 톤이고,
//   「학생 한마디: "..."」를 학생 본인에게 되돌려주는 건 어색하다. 그래서
//   parent_child_links 가 approved 인 학부모에게만 보낸다 — 연결된 학부모가
//   없는 학생은 건너뛴다(누락은 로그로 남는다).

import type { SupabaseClient } from "@supabase/supabase-js";

/** KST 는 UTC+9 고정이다(서머타임 없음). */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 지금 시각의 KST 달력 날짜. */
export function kstNow(now: Date = new Date()): Date {
  return new Date(now.getTime() + KST_OFFSET_MS);
}

/** Date → 'YYYY-MM-DD' (KST 로 이미 보정된 값을 넣을 것). */
export function toYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
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
