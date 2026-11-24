// GET, POST /api/goal/admin/cuts/backfill
//
// 입결(admission_results) 유도 컷 백필. GET 은 미리보기(쓰지 않는다, 메뉴 view), POST 는 반영(메뉴 edit).
// 입결 약 43,000행과 컷 약 6,600행을 서버에서 읽으므로 manifest-60 에 둔다.

import { z } from "zod";
import { mapDbError } from "../../../../_lib/admin-sections/query.js";
import {
  applyBackfill,
  BackfillApplyError,
  planBackfill,
} from "../../../../_lib/goal/cutBackfill.js";
import { defineHandler, RouteParamError } from "../../../../_lib/handler.js";
import { sendError } from "../../../../_lib/httpResponse.js";

export const config = { runtime: "nodejs", maxDuration: 60 };

const yearMode = z.enum(["prefer2026", "only2026", "only2025"]);
const preserveMode = z.enum(["preserve", "overwrite"]);

const previewQuery = z.object({ yearMode, preserveMode });
const applyBody = z.object({
  yearMode,
  preserveMode,
  orphanMode: z.enum(["keep", "deactivate"]),
  // 관리자가 미리보기에서 확인한 건수. 반영 직전에 다시 계산한 값과 같아야 한다.
  expectedApplyCount: z.number().int().min(0),
  expectedOrphanCount: z.number().int().min(0),
});

// defineHandler 의 query, body 스키마는 메서드를 가리지 않아 GET 과 POST 가 한 라우트에 있으면 직접 검증한다.
// 실패는 defineHandler 의 검증 실패와 같은 400 VALIDATION_FAILED 로 나간다.
function parseInput<S extends z.ZodType>(
  schema: S,
  input: unknown,
): z.output<S> {
  const parsed = schema.safeParse(input);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  throw new RouteParamError(
    issue ? issue.path.map(String).join(".") || "request" : "request",
    issue?.message ?? "요청 값이 올바르지 않아요.",
  );
}

export default defineHandler({
  methods: ["GET", "POST"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "goalUniversityCuts" },
  unhandledMessage: "백필을 처리하지 못했습니다.",
  logLabel: "[goal/admin/cuts/backfill]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    if (req.method === "POST") {
      const body = parseInput(applyBody, req.body);
      // 반영 직전에 다시 계산한다. 그 사이 입결이나 컷이 바뀌어 건수가 달라졌으면 쓰지 않고 돌려보낸다.
      const plan = await planBackfill(ctx.supabaseAdmin, body);
      if (
        plan.applyPayloads.length !== body.expectedApplyCount ||
        plan.orphanIds.length !== body.expectedOrphanCount
      ) {
        sendError(
          res,
          "problem",
          409,
          "미리보기 이후 데이터가 바뀌었습니다. 미리보기를 다시 계산한 뒤 확인해 주세요.",
          "BACKFILL_PREVIEW_STALE",
          {
            applyCount: plan.applyPayloads.length,
            orphanCount: plan.orphanIds.length,
          },
        );
        return;
      }
      try {
        const result = await applyBackfill(
          ctx.supabaseAdmin,
          plan,
          body.orphanMode === "deactivate",
        );
        res.status(200).json(result);
      } catch (error) {
        if (!(error instanceof BackfillApplyError)) throw error;
        const mapped = mapDbError(error.dbError as { code?: string });
        // 청크는 트랜잭션이 아니다. 앞 청크는 이미 반영돼 있으니 몇 행까지 갔는지 알려 준다.
        // DB 오류가 매핑되면 쓰기 라우트(failWrite)와 같은 코드와 안내를 쓴다. 화면이 코드로 라벨 문구를 만든다.
        sendError(
          res,
          "problem",
          mapped?.status ?? 500,
          mapped?.detail ?? "백필 반영 중 일부 청크가 실패했습니다.",
          mapped?.code ?? "BACKFILL_APPLY_FAILED",
          {
            applied: error.applied,
            step: error.step,
            range: error.range,
            columns: mapped?.columns ?? [],
          },
        );
      }
      return;
    }

    const input = parseInput(previewQuery, req.query);
    const plan = await planBackfill(ctx.supabaseAdmin, input);
    res.status(200).json({
      sourceRowCount: plan.sourceRowCount,
      stats: plan.stats,
      analysis: plan.analysis,
      applyCount: plan.applyPayloads.length,
      orphanCount: plan.orphanIds.length,
    });
  },
});
