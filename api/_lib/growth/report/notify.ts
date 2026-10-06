// 성장설계 리포트 완료 알림톡(No.111). 연결된 학부모에게만 보낸다.
// 학부모 조회는 목표관리 선례(resolveParentRecipients)를 그대로 쓴다.
// 카카오 템플릿 등록과 승인 전에는 발송이 실패 로그로 남는다.
//
// 링크 도메인 결정: 같은 repo를 위닝에듀/스쿨멘토 두 Vercel 프로젝트로 배포한다.
// 기존 alimtalkTemplates.ts 는 SITE_WWW(winningedu.com) 고정이라 배포별 구분 수단이
// 없고, site.ts 의 SITE 는 사이트 키만 줄 뿐 도메인을 주지 않는다. 그래서 배포마다
// 환경변수 PUBLIC_SITE_URL 로 도메인을 받는다. 상수 폴백은 두지 않고, 값이 없으면
// 잘못된 도메인 링크를 보내지 않도록 발송을 건너뛰고 console.warn 을 남긴다.

import { sendAndLog } from "../../alimtalkSend.js";
import {
  kstNow,
  resolveParentRecipients,
  toYmd,
} from "../../goalReportNotify.js";
import { getEnv } from "../../supabaseAdmin.js";
import { type Db, must } from "../intake/collectDb.js";

export type GrowthNotifyOutcome =
  | { sent: true; count: number }
  | { sent: false; reason: "no_parent" }
  | { sent: false; reason: "no_site_url" };

/** ISO 시각을 KST 기준 'YYYY.MM.DD'. */
export function formatIssuedDate(iso: string): string {
  return toYmd(kstNow(new Date(iso))).replace(/-/g, ".");
}

export function buildGrowthDoneVariables(input: {
  studentName: string;
  issuedAt: string;
  studentId: string;
  reportId: string;
  siteUrl: string;
}): Record<string, string> {
  return {
    학생이름: input.studentName,
    발행일: formatIssuedDate(input.issuedAt),
    링크: `${input.siteUrl}/mypage/children/${input.studentId}/growth/${input.reportId}`,
  };
}

export async function notifyGrowthReportDone(
  db: Db,
  studentId: string,
  reportId: string,
): Promise<GrowthNotifyOutcome> {
  const siteUrl = getEnv("PUBLIC_SITE_URL").replace(/\/+$/, "");
  if (!siteUrl) {
    console.warn(
      "growth/report 완료 알림 건너뜀: PUBLIC_SITE_URL 이 설정되지 않았어요.",
    );
    return { sent: false, reason: "no_site_url" };
  }
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
        siteUrl,
      }),
      // 학부모가 둘이면 같은 키로 둘째가 중복 처리돼 빠지므로 학부모별로 가른다.
      dedupeKey: `growth-report-done:${reportId}:${r.parentProfileId}`,
    });
  }
  return { sent: true, count: recipients.length };
}
