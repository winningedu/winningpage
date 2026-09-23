// GET /api/cron/monthly-report — 월간 학습 리포트 발행 안내 (매월 1일 08:00 KST)
//
// 시각이 까다로운 이유
//   1일 08:00 KST = **전월 마지막 날 23:00 UTC** 다. cron 표현식에는 "그 달의
//   마지막 날"이 없다(Vercel 은 표준 5필드만 받고 `L` 을 지원하지 않는다).
//   그래서 28~31일 23:00 UTC 에 매번 깨우고(vercel.json "0 23 28-31 * *"),
//   여기서 **KST 기준 내일이 1일인지**를 보고 아니면 즉시 종료한다.
//   28일을 포함하는 이유는 2월(윤년이면 29일) 때문이다.
//
// 대상: **지난 달**에 기록이 하나라도 있는 학생의 연결된 학부모.
// 링크의 reportId: 월간 키 = 'YYYY-MM' (api/goal/report).
//
// 조회(지난 달 기록이 있는 학생·수신자)와 발송(sendAndLog)은
// api/_lib/goalReportSend.ts 의 loadMonthlyReportInputs/sendMonthlyReport 로
// 옮겼다 — 관리자 재발송(api/goal/admin/resend-report.ts)이 같은 함수를
// 재사용한다. 조회는 학생 수와 무관하게 고정 횟수(배치)로 돈다.

import { kstNow, toYmd } from "../_lib/goalReportNotify.js";
import {
  loadMonthlyReportInputs,
  sendMonthlyReport,
} from "../_lib/goalReportSend.js";
import { defineHandler } from "../_lib/handler.js";

export const config = { runtime: "nodejs", maxDuration: 300 };

export default defineHandler({
  methods: ["GET"],
  auth: "cron",
  errorShape: "detail",
  // dev 원본은 { detail: "Unauthorized" }였다 — 공통 CRON_REQUIRED_MESSAGE
  // ("인증이 필요합니다.")는 performance/cleanup-attachments 등 다른 cron 라우트
  // 기준이라 여기서만 override한다.
  authFailureMessage: "Unauthorized",
  unhandledMessage: "월간 학습 리포트 발송 중 오류가 발생했습니다.",
  logLabel: "cron/monthly-report",
  handler: async (req, res, ctx) => {
    const now = kstNow();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const forcedMonth =
      typeof req.query.month === "string" ? req.query.month : null;

    // 손으로 메우는 경우(?month=2026-07)가 아니면, 내일이 1일일 때만 돈다.
    // ctx.supabaseAdmin은 여기서 아직 건드리지 않는다 — dev 원본이 이 skip
    // 분기를 createSupabaseAdmin() 호출보다 먼저 두어, env 미설정이어도 이
    // 경로는 그대로 200을 낸다(ctx.supabaseAdmin은 lazy getter라 실제로 접근할
    // 때만 클라이언트를 만든다).
    if (!forcedMonth && tomorrow.getUTCDate() !== 1) {
      res
        .status(200)
        .json({ ok: true, skipped: "not_month_end", today: toYmd(now) });
      return;
    }

    const supabaseAdmin = ctx.supabaseAdmin;

    // 지난 달 = 지금(=말일 밤) 이 속한 달. 발송 시점이 1일 아침이지만 KST 로는
    // 아직 말일이므로 now 의 달이 곧 대상 달이다.
    const targetMonth = forcedMonth || toYmd(now).slice(0, 7);
    // split 결과가 undefined 일 수 있다고 보므로(noUncheckedIndexedAccess) 명시적으로
    // 좁힌다. targetMonth 형식이 깨지면 여기서 400 으로 끊는 편이 낫다 —
    // NaN 이 그대로 흘러가면 조회 범위가 조용히 어긋난 채 발송된다. year/month
    // 자체(monthStart/monthEnd 계산)는 loadMonthlyReportInputs 내부에서 targetMonth로
    // 다시 계산한다 — 여기서는 형식 검증에만 쓴다.
    const [yearPart, monthPart] = targetMonth.split("-");
    const year = Number(yearPart);
    const month = Number(monthPart);

    if (
      !Number.isInteger(year) ||
      !Number.isInteger(month) ||
      month < 1 ||
      month > 12
    ) {
      res
        .status(400)
        .json({ detail: `month 형식이 올바르지 않습니다: ${targetMonth}` });
      return;
    }

    // studentIds=null → 그 달에 기록이 있는 학생을 loadMonthlyReportInputs가
    // 직접 찾는다(수신자 조회가 학생 수와 무관하게 고정 횟수로 돈다).
    const inputs = await loadMonthlyReportInputs(
      supabaseAdmin,
      null,
      targetMonth,
    );

    if (inputs.size === 0) {
      res.status(200).json({ ok: true, month: targetMonth, students: 0 });
      return;
    }

    const summary = { sent: 0, failed: 0, skipped: 0 };

    for (const [studentId, input] of inputs) {
      const result = await sendMonthlyReport(supabaseAdmin, input);

      for (const outcome of result.outcomes) {
        if (outcome.status === "sent") summary.sent += 1;
        else if (outcome.status === "failed") {
          summary.failed += 1;
          console.error(
            `cron/monthly-report 발송 실패 student=${studentId}: ${outcome.reason}`,
          );
        } else summary.skipped += 1;
      }
    }

    console.log(
      `cron/monthly-report ${targetMonth} — 학생 ${inputs.size}명, ${JSON.stringify(summary)}`,
    );

    res.status(200).json({
      ok: true,
      month: targetMonth,
      students: inputs.size,
      ...summary,
    });
  },
});
