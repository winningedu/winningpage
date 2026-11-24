// GET, POST /api/goal/admin/cuts/backfill
//
// 입결(admission_results) 유도 컷 백필. GET 은 미리보기(쓰지 않는다, 메뉴 view), POST 는 반영(메뉴 edit).
// 입결 약 43,000행과 컷 약 6,600행을 서버에서 읽으므로 manifest-60 에 둔다.

import { z } from "zod";
import { planBackfill } from "../../../../_lib/goal/cutBackfill.js";
import { defineHandler, RouteParamError } from "../../../../_lib/handler.js";

export const config = { runtime: "nodejs", maxDuration: 60 };

const yearMode = z.enum(["prefer2026", "only2026", "only2025"]);
const preserveMode = z.enum(["preserve", "overwrite"]);

const previewQuery = z.object({ yearMode, preserveMode });

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
  methods: ["GET"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "goalUniversityCuts" },
  unhandledMessage: "백필을 처리하지 못했습니다.",
  logLabel: "[goal/admin/cuts/backfill]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
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
