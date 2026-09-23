// POST /api/goal/admin/resend-report
// Authorization: Bearer <supabase access token>   (관리자 = is_winning_admin() 미러)
//
// 목표관리 리포트 알림톡(일간·주간·월간)은 크론이 정해진 시각에 자동 발송만
// 한다. 학부모가 알림톡을 거부했거나 번호를 바꿨거나 실수로 지웠을 때 관리자가
// 다시 보낼 방법이 없었다 — 이 라우트가 그 구제 수단이다.
//
// "2주 전까지는" — 기간 시작이 오늘(KST) 기준 14일보다 더 전이면 400.
// 미래 기간도 400(아직 일어나지 않은 일을 리포트할 수 없다).
//
// dedupeKey — 원래 크론이 쓰던 키(`<종류>Report:<parentId>:<studentId>:<periodKey>`)
// 뒤에 `:resend:<발송 시각 ms>` 를 붙인다(sendXFor의 dedupeSuffix). 자동 발송의
// dedupe와 절대 충돌하지 않는다 — 매 재발송 요청이 새 dedupeKey를 받으므로,
// "기록이 없어도 재발송은 허용"(안내 목적) 요구와도 자연히 맞는다.
//
// 발송 자체(기록 조회·변수 조립·sendAndLog)는 크론과 100% 같은 함수
// (api/_lib/goalReportSend.ts)를 쓴다 — 여기서 다시 구현하지 않는다.

import {
  diffDaysYMD,
  getMondayYMD,
  kstYMD,
  toYMD,
} from "../../../src/lib/goal/calc/index.js";
import { MAX_RESEND_DAYS_AGO } from "../../_lib/goalReportResendPolicy.js";
import type { ReportSendResult } from "../../_lib/goalReportSend.js";
import {
  sendDailyReportFor,
  sendMonthlyReportFor,
  sendWeeklyReportFor,
} from "../../_lib/goalReportSend.js";
import { defineHandler } from "../../_lib/handler.js";
import { sendError } from "../../_lib/httpResponse.js";
import { maskPhone } from "../../_lib/phoneCode.js";

export const config = { runtime: "nodejs" };

export type ResendKind = "daily" | "weekly" | "monthly";

const DAILY_PERIOD_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTHLY_PERIOD_RE = /^\d{4}-\d{2}$/;

export type ResendPeriodValidation =
  | { ok: true; startYmd: string }
  | { ok: false; detail: string };

/**
 * kind·periodKey 형식 + "2주 이내" 규칙을 검증한다. DB를 보지 않는 순수 함수라
 * 로컬에서 바로 단언할 수 있다(resend-report.test.ts).
 *
 * @param todayYmd 기준 "오늘"(KST). 생략하면 실제 오늘.
 */
export function validateResendPeriod(
  kind: unknown,
  periodKey: unknown,
  todayYmd: string = kstYMD(),
): ResendPeriodValidation {
  if (kind !== "daily" && kind !== "weekly" && kind !== "monthly") {
    return { ok: false, detail: "kind가 올바르지 않습니다." };
  }
  if (typeof periodKey !== "string" || !periodKey) {
    return { ok: false, detail: "periodKey가 필요합니다." };
  }

  let startYmd: string;

  if (kind === "monthly") {
    if (!MONTHLY_PERIOD_RE.test(periodKey)) {
      return {
        ok: false,
        detail: "periodKey 형식이 올바르지 않습니다(YYYY-MM).",
      };
    }
    const month = Number(periodKey.slice(5, 7));
    if (month < 1 || month > 12) {
      return {
        ok: false,
        detail: "periodKey 형식이 올바르지 않습니다(YYYY-MM).",
      };
    }
    startYmd = `${periodKey}-01`;
  } else {
    // toYMD가 Date 롤오버로 정규화한 값과 원문이 다르면(예: 2월 30일 → 3월 2일)
    // 존재하지 않는 달력 날짜다.
    if (!DAILY_PERIOD_RE.test(periodKey) || toYMD(periodKey) !== periodKey) {
      return {
        ok: false,
        detail: "periodKey 형식이 올바르지 않습니다(YYYY-MM-DD).",
      };
    }
    startYmd = periodKey;

    if (kind === "weekly" && getMondayYMD(periodKey) !== periodKey) {
      return {
        ok: false,
        detail: "주간 periodKey는 그 주의 월요일이어야 합니다.",
      };
    }
  }

  const diff = diffDaysYMD(startYmd, todayYmd);
  if (diff < 0) {
    return { ok: false, detail: "미래 기간은 다시 보낼 수 없습니다." };
  }
  if (diff > MAX_RESEND_DAYS_AGO) {
    return { ok: false, detail: "2주 이내 기간만 다시 보낼 수 있습니다." };
  }

  return { ok: true, startYmd };
}

export type ResendReportResponse = {
  ok: true;
  sent: number;
  failed: number;
  skipped: number;
  recipients: Array<{
    parentProfileId: string;
    phone: string;
    status: "sent" | "failed" | "skipped";
    reason?: string;
  }>;
};

/** sendXFor 결과 → 응답 규격. 전화번호는 여기서 마스킹한다(원본을 응답에 싣지 않는다). */
export function buildResendResponse(
  result: ReportSendResult,
): ResendReportResponse {
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  const recipients = result.outcomes.map((outcome) => {
    if (outcome.status === "sent") sent += 1;
    else if (outcome.status === "failed") failed += 1;
    else skipped += 1;

    return {
      parentProfileId: outcome.parentProfileId,
      phone: maskPhone(outcome.phone),
      status: outcome.status,
      ...(outcome.reason ? { reason: outcome.reason } : {}),
    };
  });

  return { ok: true, sent, failed, skipped, recipients };
}

export default defineHandler({
  methods: ["POST"],
  auth: "winningAdmin",
  errorShape: "detail",
  unhandledMessage: "리포트 알림톡 재발송 중 오류가 발생했습니다.",
  logLabel: "goal/admin/resend-report",
  handler: async (req, res, ctx) => {
    const supabaseAdmin = ctx.supabaseAdmin;
    const { studentProfileId, kind, periodKey } = req.body || {};

    if (!studentProfileId || typeof studentProfileId !== "string") {
      return void sendError(
        res,
        "detail",
        400,
        "studentProfileId가 필요합니다.",
      );
    }

    const validation = validateResendPeriod(kind, periodKey);
    if (!validation.ok) {
      return void sendError(res, "detail", 400, validation.detail);
    }

    // 자동 발송(크론)의 dedupeKey와 절대 겹치지 않게 매 요청마다 새 suffix를 쓴다.
    const dedupeSuffix = `resend:${Date.now()}`;

    let result: ReportSendResult;
    if (kind === "daily") {
      result = await sendDailyReportFor(
        supabaseAdmin,
        studentProfileId,
        validation.startYmd,
        { dedupeSuffix },
      );
    } else if (kind === "weekly") {
      result = await sendWeeklyReportFor(
        supabaseAdmin,
        studentProfileId,
        validation.startYmd,
        { dedupeSuffix },
      );
    } else {
      result = await sendMonthlyReportFor(
        supabaseAdmin,
        studentProfileId,
        String(periodKey),
        { dedupeSuffix },
      );
    }

    return void res.status(200).json(buildResendResponse(result));
  },
});
