// POST /api/console/school-year/rollover  { toYear, rows?: [{ studentId, groupId?, className, number? }] }
//
// 학년도 넘기기(W11a). 학교 관리자와 본사 대행만, 기관은 행위자에서 정한다.
// 졸업, 진급, 학급 배정은 fn_school_year_rollover 가 한 트랜잭션으로 처리하고, 같은 학년도로 다시
// 부르면 아무것도 바꾸지 않고 0 을 돌려준다(compare-and-set).

import { writeConsoleAuditLog } from "../../../_lib/console/audit.js";
import { sendEnrollmentRpcError } from "../../../_lib/console/enrollmentErrors.js";
import { defineHandler } from "../../../_lib/handler.js";
import { sendError } from "../../../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

interface RolloverRow {
  student_id: string;
  group_id: string | null;
  class_name: string;
  number: number | null;
}

interface RolloverCounts {
  graduated_count: number;
  promoted_count: number;
  skipped_count: number;
  assigned_count: number;
}

function parseRows(rows: unknown): RolloverRow[] | null {
  if (rows == null) return [];
  if (!Array.isArray(rows)) return null;
  const parsed: RolloverRow[] = [];
  for (const raw of rows) {
    const { studentId, groupId, className, number } = (raw ?? {}) as Record<
      string,
      unknown
    >;
    if (typeof studentId !== "string" || studentId === "") return null;
    if (typeof className !== "string" || className.trim() === "") return null;
    if (groupId != null && typeof groupId !== "string") return null;
    if (
      number != null &&
      !(
        Number.isInteger(number) &&
        (number as number) >= 1 &&
        (number as number) <= 99
      )
    ) {
      return null;
    }
    parsed.push({
      student_id: studentId,
      group_id: (groupId as string | null | undefined) ?? null,
      class_name: className,
      number: (number as number | null | undefined) ?? null,
    });
  }
  return parsed;
}

export default defineHandler({
  methods: ["POST"],
  auth: "console",
  consoleRole: "schoolAdmin",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "학년도를 넘기지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[console/school-year/rollover]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const actor = ctx.console;
    if (!actor) throw new Error("console actor missing");
    const { toYear, rows } = (req.body ?? {}) as Record<string, unknown>;
    const parsedRows = parseRows(rows);
    if (!Number.isInteger(toYear) || !parsedRows) {
      sendError(res, "coded", 400, "입력 값을 확인해 주세요.", "BAD_REQUEST");
      return;
    }

    const { data, error } = await ctx.supabaseAdmin.rpc(
      "fn_school_year_rollover",
      {
        p_tenant: actor.tenantId,
        p_to_year: toYear as number,
        p_rows: parsedRows,
        p_actor: ctx.userId as string,
      },
    );
    if (error) {
      if (sendEnrollmentRpcError(res, error)) return;
      throw new Error("fn_school_year_rollover failed");
    }
    const counts = (data as RolloverCounts[] | null)?.[0];
    if (!counts) throw new Error("fn_school_year_rollover returned no row");

    const result = {
      graduated: counts.graduated_count,
      promoted: counts.promoted_count,
      skipped: counts.skipped_count,
      assigned: counts.assigned_count,
    };
    await writeConsoleAuditLog(
      { ...ctx, console: actor },
      {
        action: "update",
        resourceKey: "schoolYear",
        meta: { toYear, ...result },
      },
    );

    res.status(200).json({ ok: true, ...result });
  },
});
