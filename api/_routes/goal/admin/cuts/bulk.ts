// POST /api/goal/admin/cuts/bulk
//
// 엑셀 일괄 반영 한 청크(최대 500행). id 없는 행은 insert, id 있는 행은 id 기준 upsert 로 두 번에 나눠 보낸다.
// 두 묶음은 컬럼 구성이 달라(update 만 id 를 가진다) 한 요청에 섞으면 PostgREST 가 누락 키를 default 로 해석한다.
// 청크 반복, 진행 표시, 앞 청크는 되돌리지 않는다는 규칙은 브라우저 몫이다.

import { z } from "zod";
import { failWrite } from "../../../../_lib/admin-sections/query.js";
import { cutRowSchema } from "../../../../_lib/goal/cutRows.js";
import { GOAL_CUTS_TABLE } from "../../../../_lib/goal/cuts.js";
import { defineHandler } from "../../../../_lib/handler.js";
import { sendError } from "../../../../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

const GOAL_CUTS_APPLY_CHUNK = 500;

export default defineHandler({
  methods: ["POST"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "goalUniversityCuts" },
  unhandledMessage: "컷을 반영하지 못했습니다.",
  logLabel: "[goal/admin/cuts/bulk]",
  headers: { "Cache-Control": "no-store" },
  body: z.object({
    rows: z
      .array(cutRowSchema)
      .min(1)
      .max(GOAL_CUTS_APPLY_CHUNK)
      .refine(
        (rows) => {
          const ids = rows.flatMap((row) =>
            row.id === undefined ? [] : [row.id],
          );
          return new Set(ids).size === ids.length;
        },
        { message: "같은 id 가 두 번 들어 있습니다." },
      ),
  }),
  handler: async (_req, res, ctx) => {
    const admin = ctx.supabaseAdmin;
    const insertRows = ctx.body.rows.filter((row) => row.id === undefined);
    const updateRows = ctx.body.rows.filter((row) => row.id !== undefined);

    // id 로 보낸 행은 이미 있는 행이어야 한다. upsert 가 없는 id 를 새 행으로 만들지 않게 먼저 확인하고,
    // 컷 종류는 바꿀 수 없다(등급 3.2 짜리 행이 정시로 바뀌면 백분위 3.2 로 읽혀 우열이 뒤집힌다).
    if (updateRows.length > 0) {
      const { data, error } = await admin
        .from(GOAL_CUTS_TABLE)
        .select("id, cut_type")
        .in(
          "id",
          updateRows.map((row) => row.id),
        );
      if (error) throw new Error("goal cuts id lookup failed");
      const cutTypeById = new Map(
        ((data ?? []) as { id: number; cut_type: string }[]).map((row) => [
          row.id,
          row.cut_type,
        ]),
      );
      const missing = updateRows.flatMap((row) =>
        cutTypeById.has(row.id as number) ? [] : [row.id],
      );
      if (missing.length > 0) {
        sendError(
          res,
          "problem",
          404,
          "DB 에 없는 id 가 있습니다(다른 관리자가 삭제했을 수 있습니다).",
          "NOT_FOUND",
          { ids: missing },
        );
        return;
      }
      const changed = ctx.body.rows.flatMap((row, index) =>
        row.id !== undefined && cutTypeById.get(row.id) !== row.cut_type
          ? [
              {
                path: `rows.${index}.cut_type`,
                message: "기존 행의 컷 종류는 바꿀 수 없습니다.",
              },
            ]
          : [],
      );
      if (changed.length > 0) {
        sendError(
          res,
          "problem",
          400,
          "요청 값이 올바르지 않아요.",
          "VALIDATION_FAILED",
          { errors: changed },
        );
        return;
      }
    }

    if (insertRows.length > 0) {
      const { error } = await admin.from(GOAL_CUTS_TABLE).insert(insertRows);
      if (error) {
        failWrite(res, error, "goal cuts insert");
        return;
      }
    }
    if (updateRows.length > 0) {
      const { error } = await admin
        .from(GOAL_CUTS_TABLE)
        .upsert(updateRows, { onConflict: "id" });
      if (error) {
        failWrite(res, error, "goal cuts upsert");
        return;
      }
    }
    res
      .status(200)
      .json({ inserted: insertRows.length, updated: updateRows.length });
  },
});
