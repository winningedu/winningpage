// 성장설계 리포트 완료 알림톡(No.111). 연결된 학부모에게만 보낸다.
// 학부모 조회는 목표관리 선례(resolveParentRecipients)를 그대로 쓴다.
// 카카오 템플릿 등록과 승인 전에는 발송이 실패 로그로 남는다.

import { sendAndLog } from "../../alimtalkSend.js";
import { SITE_WWW } from "../../alimtalkTemplates.js";
import {
  kstNow,
  resolveParentRecipients,
  toYmd,
} from "../../goalReportNotify.js";
import { type Db, must } from "../intake/collectDb.js";

export type GrowthNotifyOutcome =
  | { sent: true; count: number }
  | { sent: false; reason: "no_parent" };

/** ISO 시각을 KST 기준 'YYYY.MM.DD'. */
export function formatIssuedDate(iso: string): string {
  return toYmd(kstNow(new Date(iso))).replace(/-/g, ".");
}

export function buildGrowthDoneVariables(input: {
  studentName: string;
  issuedAt: string;
  studentId: string;
  reportId: string;
}): Record<string, string> {
  return {
    학생이름: input.studentName,
    발행일: formatIssuedDate(input.issuedAt),
    링크: `${SITE_WWW}/mypage/children/${input.studentId}/growth/${input.reportId}`,
  };
}

export async function notifyGrowthReportDone(
  db: Db,
  studentId: string,
  reportId: string,
): Promise<GrowthNotifyOutcome> {
  const recipients = await resolveParentRecipients(db, [studentId]);
  if (recipients.length === 0) return { sent: false, reason: "no_parent" };

  const row = must(
    await db
      .from("growth_reports")
      .select("issued_at")
      .eq("id", reportId)
      .eq("profile_id", studentId)
      .maybeSingle(),
    "growth_reports 조회 실패",
  ) as { issued_at: string | null } | null;
  if (!row?.issued_at) throw new Error("완료된 회차의 발행일을 찾지 못했어요.");

  for (const r of recipients) {
    await sendAndLog({
      supabaseAdmin: db,
      templateKey: "growthReportDone",
      phone: r.parentPhone,
      profileId: r.parentProfileId,
      variables: buildGrowthDoneVariables({
        studentName: r.studentName,
        issuedAt: row.issued_at,
        studentId,
        reportId,
      }),
      // 학부모가 둘이면 같은 키로 둘째가 중복 처리돼 빠지므로 학부모별로 가른다.
      dedupeKey: `growth-report-done:${reportId}:${r.parentProfileId}`,
    });
  }
  return { sent: true, count: recipients.length };
}
