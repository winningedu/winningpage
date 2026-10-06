// GET /api/cron/growth-resume, 멈춘 성장설계 회차 이어가기 (2분마다)
//
// 클라이언트가 단계를 이어 부르지 않아도 진행되도록(명세 No.79) 마지막 활동이
// RESUME_STALE_SECONDS 보다 오래된 in_progress 회차의 다음 단계를 대신 실행한다.
// 같은 호출에서 종결 실패(terminal)로 archived 됐지만 차감이 되돌려지지 않은 회차도 되돌린다.
// 완료 알림은 P8 에서 advanceStep 완료 지점에 붙는다.
//
// 서비스 역할로 실행하므로 사용자 컨텍스트가 없다. userId 인자는 각 행의 profile_id 다.

import { callText } from "../_lib/gemini.js";
import { advanceStep } from "../_lib/growth/report/advance.js";
import {
  loadReportRow,
  reverseCredit,
} from "../_lib/growth/report/reportDb.js";
import {
  pickResumable,
  pickUnreversed,
  type ResumeCandidateRow,
  summarizeOutcome,
  type UnreversedRow,
} from "../_lib/growth/report/resume.js";
import { defineHandler } from "../_lib/handler.js";

export const config = { runtime: "nodejs", maxDuration: 60 };

const CANDIDATE_LIMIT = 50;
const REVERSE_LIMIT = 20;

type ResumedEntry = {
  reportId: string;
  step: number;
  kind: string;
  terminal: boolean;
};

export default defineHandler({
  methods: ["GET"],
  auth: "cron",
  errorShape: "detail",
  authFailureMessage: "Unauthorized",
  unhandledMessage: "성장설계 회차 이어가기 중 오류가 발생했습니다.",
  logLabel: "cron/growth-resume",
  handler: async (_req, res, ctx) => {
    const db = ctx.supabaseAdmin;
    const startedAt = Date.now();
    const now = () => new Date().toISOString();

    const { data: candidates, error: candidateError } = await db
      .from("growth_reports")
      .select("id, profile_id, status, step_state, last_activity_at")
      .eq("status", "in_progress")
      .order("last_activity_at", { ascending: true })
      .limit(CANDIDATE_LIMIT);
    if (candidateError) throw candidateError;

    const picks = pickResumable(
      (candidates ?? []) as ResumeCandidateRow[],
      now(),
    );

    const settled = await Promise.allSettled(
      picks.map(async (pick): Promise<ResumedEntry> => {
        const row = await loadReportRow(db, pick.profileId, pick.reportId);
        if (!row) {
          return {
            reportId: pick.reportId,
            step: pick.step,
            kind: "missing",
            terminal: false,
          };
        }
        const outcome = await advanceStep(db, pick.profileId, row, pick.step, {
          callText,
          now,
          startedAt: Date.now(),
        });
        return {
          reportId: pick.reportId,
          step: pick.step,
          ...summarizeOutcome(outcome),
        };
      }),
    );

    const resumed: ResumedEntry[] = settled.map((result, i) => {
      const pick = picks[i];
      if (result.status === "fulfilled") return result.value;
      console.error(
        `cron/growth-resume 단계 실행 실패 report=${pick?.reportId} step=${pick?.step}`,
        result.reason,
      );
      return {
        reportId: pick?.reportId ?? "",
        step: pick?.step ?? 0,
        kind: "error",
        terminal: false,
      };
    });

    const { data: archived, error: archivedError } = await db
      .from("growth_reports")
      .select(
        "id, profile_id, status, step_state, ledger_id, ledger_reversed_at",
      )
      .eq("status", "archived")
      .not("step_state->terminal", "is", null)
      .not("ledger_id", "is", null)
      .is("ledger_reversed_at", null)
      .limit(REVERSE_LIMIT);
    if (archivedError) throw archivedError;

    let reversed = 0;
    let reverseFailed = 0;
    for (const target of pickUnreversed((archived ?? []) as UnreversedRow[])) {
      try {
        const r = await reverseCredit(db, target.profileId, target.reportId);
        if (r.reversed) reversed += 1;
        else reverseFailed += 1;
      } catch (e) {
        console.error(
          `cron/growth-resume 차감 되돌림 실패 report=${target.reportId}`,
          e,
        );
        reverseFailed += 1;
      }
    }

    const tookMs = Date.now() - startedAt;
    console.log(
      `cron/growth-resume 이어가기 ${resumed.length}건 되돌림 ${reversed}건 실패 ${reverseFailed}건 ${tookMs}ms`,
    );
    res
      .status(200)
      .json({ ok: true, resumed, reversed, reverseFailed, tookMs });
  },
});
