// POST /api/console/school-year/rollover  { toYear, rows?: [{ studentId, groupId?, className, number?, version? }], pendingRows?: [...] }
//
// 명단 적용(W11a). 학교 관리자와 본사 대행만, 기관은 행위자에서 정한다. 방식은 서버가 학년도로 정한다(rosterModeOf).
//   rollover 졸업, 진급, 학급 배정은 fn_roster_rollover 가 한 트랜잭션으로 처리하고, 같은 학년도로 다시
//            부르면 아무것도 바꾸지 않고 0 을 돌려준다(compare-and-set).
//   midyear  학년은 두고 명단에 있는 학생의 그룹, 반, 번호만 fn_roster_midyear 가 바꾼다. 몇 번이든 부를 수 있다.
//            rows 는 미리보기 때의 학적 version 을 실어야 하고, 그 사이 바뀐 학생이 있으면 409 다.
// pendingRows(가입 전 학생의 명단 줄)는 같은 트랜잭션에서 그 학년도의 기존 가입 전 명단을 갈아 끼운다.
// 감사 기록에는 이름을 남기지 않고 수만 남긴다.

import { writeConsoleAuditLog } from "../../../_lib/console/audit.js";
import { loadTenant } from "../../../_lib/console/directory.js";
import { sendEnrollmentRpcError } from "../../../_lib/console/enrollmentErrors.js";
import { rosterModeOf } from "../../../_lib/console/schoolYear.js";
import { defineHandler } from "../../../_lib/handler.js";
import { sendError } from "../../../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

interface RolloverRow {
  student_id: string;
  group_id: string | null;
  class_name: string;
  number: number | null;
  version?: number;
}

interface PendingInput {
  name: string;
  grade: string | null;
  group_id: string | null;
  class_name: string | null;
  number: number | null;
}

interface RolloverCounts {
  graduated_count: number;
  promoted_count: number;
  skipped_count: number;
  assigned_count: number;
  pending_stored: number;
  pending_skipped: number;
}

interface MidyearCounts {
  updated_count: number;
  skipped_count: number;
  pending_stored: number;
  pending_skipped: number;
}

const MAX_NAME_LENGTH = 50;

const isNumber = (value: unknown) =>
  Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 99;

function parseRows(rows: unknown, needVersion: boolean): RolloverRow[] | null {
  if (rows == null) return [];
  if (!Array.isArray(rows)) return null;
  const parsed: RolloverRow[] = [];
  for (const raw of rows) {
    const { studentId, groupId, className, number, version } = (raw ??
      {}) as Record<string, unknown>;
    if (typeof studentId !== "string" || studentId === "") return null;
    if (typeof className !== "string" || className.trim() === "") return null;
    if (groupId != null && typeof groupId !== "string") return null;
    if (number != null && !isNumber(number)) return null;
    if (needVersion && !(Number.isInteger(version) && (version as number) >= 1))
      return null;
    parsed.push({
      student_id: studentId,
      group_id: (groupId as string | null | undefined) ?? null,
      class_name: className,
      number: (number as number | null | undefined) ?? null,
      ...(needVersion && { version: version as number }),
    });
  }
  return parsed;
}

function parsePending(rows: unknown): PendingInput[] | null {
  if (rows == null) return [];
  if (!Array.isArray(rows)) return null;
  const parsed: PendingInput[] = [];
  for (const raw of rows) {
    const { name, grade, groupId, className, number } = (raw ?? {}) as Record<
      string,
      unknown
    >;
    if (
      typeof name !== "string" ||
      name.trim() === "" ||
      name.length > MAX_NAME_LENGTH
    ) {
      return null;
    }
    if (grade != null && typeof grade !== "string") return null;
    if (groupId != null && typeof groupId !== "string") return null;
    if (className != null && typeof className !== "string") return null;
    if (number != null && !isNumber(number)) return null;
    parsed.push({
      name: name.trim(),
      grade: (grade as string | null | undefined) ?? null,
      group_id: (groupId as string | null | undefined) ?? null,
      class_name: (className as string | null | undefined) ?? null,
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
    const { toYear, rows, pendingRows } = (req.body ?? {}) as Record<
      string,
      unknown
    >;
    const { schoolYear } = await loadTenant(ctx.supabaseAdmin, actor.tenantId);
    const { mode, toYear: expectedYear } = rosterModeOf(schoolYear);
    const parsedRows = parseRows(rows, mode === "midyear");
    const pending = parsePending(pendingRows);
    if (toYear !== expectedYear || !parsedRows || !pending) {
      sendError(res, "coded", 400, "입력 값을 확인해 주세요.", "BAD_REQUEST");
      return;
    }

    const { data, error } =
      mode === "midyear"
        ? await ctx.supabaseAdmin.rpc("fn_roster_midyear", {
            p_tenant: actor.tenantId,
            p_rows: parsedRows,
            p_pending: pending,
            p_actor: ctx.userId as string,
          })
        : await ctx.supabaseAdmin.rpc("fn_roster_rollover", {
            p_tenant: actor.tenantId,
            p_to_year: toYear as number,
            p_rows: parsedRows,
            p_pending: pending,
            p_actor: ctx.userId as string,
          });
    if (error) {
      if (sendEnrollmentRpcError(res, error)) return;
      throw new Error("roster apply failed");
    }
    const counts = (data as (RolloverCounts & MidyearCounts)[] | null)?.[0];
    if (!counts) throw new Error("roster apply returned no row");

    const pendingCounts = {
      pendingStored: counts.pending_stored,
      pendingSkipped: counts.pending_skipped,
    };
    const result =
      mode === "midyear"
        ? {
            mode,
            updated: counts.updated_count,
            skipped: counts.skipped_count,
            ...pendingCounts,
          }
        : {
            graduated: counts.graduated_count,
            promoted: counts.promoted_count,
            skipped: counts.skipped_count,
            assigned: counts.assigned_count,
            mode,
            ...pendingCounts,
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
