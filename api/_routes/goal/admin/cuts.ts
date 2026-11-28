// /api/goal/admin/cuts 아래 목표관리 컷 관리 라우트. goal 관리자 앱(api/_routes/goal/admin/app.ts)이 .route("/cuts", cuts) 로 붙인다.
// 요청 검증과 응답 모양은 shared/goal/admin-cuts.ts 를 따른다. 메뉴 권한은 goalUniversityCuts(GET 은 view, POST 는 edit).
//   GET  /summary         컷 현황 요약(GoalCutsOverviewBlock). 6,600행짜리 옵션 뷰를 브라우저로 보내지 않는다.
//   GET  /rows?from=      엑셀 일괄 패널이 쓰는 컷 전량 읽기. id 오름차순으로 from 부터 1,000행씩, next 가 null 이면 끝.
//                         노출이 꺼진 행도 포함한다(옛 RLS 는 관리자에게 전부 보였다).
//   GET  /jungsi-missing  정시 컷이 없는 (대학, 학과) 조합. 대학명, 학과명은 뷰의 문자열 그대로다(손으로 치면 완전일치 조회가 깨진다).
//   POST /bulk            엑셀 일괄 반영 한 청크(최대 500행). id 없는 행은 insert, 있는 행은 id 기준 upsert 로 나눠 보낸다.
//                         두 묶음은 컬럼 구성이 달라(update 만 id 를 가진다) 한 요청에 섞으면 PostgREST 가 누락 키를 default 로 해석한다.
//                         청크 반복, 진행 표시, 앞 청크는 되돌리지 않는다는 규칙은 브라우저 몫이다.
//   GET  /backfill        입결(admission_results) 유도 컷 백필 미리보기(쓰지 않는다).
//   POST /backfill        반영. 입결 약 43,000행과 컷 약 6,600행을 읽어 vercel.json 이 /api/app-60 으로 보낸다.

import type { z } from "zod";
import {
  BACKFILL_APPLY_FAILED,
  BACKFILL_PREVIEW_STALE,
  type BackfillPreview,
  backfillApplyBody,
  type backfillApplyResponse,
  backfillPreviewQuery,
  type CutsSummary,
  cutsBulkBody,
  type cutsBulkResponse,
  cutsRowsQuery,
  type cutsRowsResponse,
  type jungsiMissingResponse,
} from "../../../../shared/goal/admin-cuts.js";
import { PROBLEM_CODE } from "../../../../shared/http/codes.js";
import {
  mapDbError,
  writeFailure,
} from "../../../_lib/admin-sections/query.js";
import {
  applyBackfill,
  BackfillApplyError,
  planBackfill,
} from "../../../_lib/goal/cutBackfill.js";
import {
  countCuts,
  fetchOptionRows,
  GOAL_CUTS_READ_CHUNK,
  GOAL_CUTS_TABLE,
} from "../../../_lib/goal/cuts.js";
import { admin } from "../../../_lib/hono/admin.js";
import { adminFactory } from "../../../_lib/hono/factory.js";
import { methodNotAllowed, ProblemError } from "../../../_lib/hono/problem.js";
import { validate } from "../../../_lib/hono/validate.js";
import { VALIDATION_FAILED_MESSAGE } from "../../../_lib/httpResponse.js";

const COLUMNS =
  "id, cut_type, university_name, department_name, avg_cut, source, source_year, is_active, note";

const summaryGuard = admin({
  permission: { key: "goalUniversityCuts" },
  unhandledMessage: "컷 현황을 불러오지 못했습니다.",
  logLabel: "[goal/admin/cuts/summary]",
});
const rowsGuard = admin({
  permission: { key: "goalUniversityCuts" },
  unhandledMessage: "컷 목록을 불러오지 못했습니다.",
  logLabel: "[goal/admin/cuts/rows]",
});
const jungsiMissingGuard = admin({
  permission: { key: "goalUniversityCuts" },
  unhandledMessage: "정시 컷 없는 조합을 불러오지 못했습니다.",
  logLabel: "[goal/admin/cuts/jungsi-missing]",
});
const bulkGuard = admin({
  permission: { key: "goalUniversityCuts" },
  unhandledMessage: "컷을 반영하지 못했습니다.",
  logLabel: "[goal/admin/cuts/bulk]",
});
const backfillGuard = admin({
  permission: { key: "goalUniversityCuts" },
  unhandledMessage: "백필을 처리하지 못했습니다.",
  logLabel: "[goal/admin/cuts/backfill]",
});

export const cuts = adminFactory
  .createApp()
  .get("/summary", summaryGuard, async (c) => {
    const db = c.var.supabaseAdmin;
    const [total, active, normal, special, jungsi, missing] = await Promise.all(
      [
        countCuts(db),
        countCuts(db, (q) => q.eq("is_active", true)),
        countCuts(db, (q) => q.eq("cut_type", "normal")),
        countCuts(db, (q) => q.eq("cut_type", "special")),
        countCuts(db, (q) => q.eq("cut_type", "jungsi")),
        countCuts(db, (q) => q.is("avg_cut", null)),
      ],
    );
    const options = await fetchOptionRows(db);
    return c.json({
      total,
      active,
      normal,
      special,
      jungsi,
      missing,
      comboTotal: options.length,
      comboNoJungsi: options.filter((o) => !o.has_jungsi).length,
    } satisfies CutsSummary);
  })
  .all("/summary", methodNotAllowed("GET"))
  .get("/rows", rowsGuard, validate("query", cutsRowsQuery), async (c) => {
    const { from } = c.req.valid("query");
    const { data, error } = await c.var.supabaseAdmin
      .from(GOAL_CUTS_TABLE)
      .select(COLUMNS)
      .order("id", { ascending: true })
      .range(from, from + GOAL_CUTS_READ_CHUNK - 1);
    if (error) throw new Error("goal cuts rows read failed");
    const items = (data ?? []) as Record<string, unknown>[];
    return c.json({
      items,
      next: items.length === GOAL_CUTS_READ_CHUNK ? from + items.length : null,
    } satisfies z.output<typeof cutsRowsResponse>);
  })
  .all("/rows", methodNotAllowed("GET"))
  .get("/jungsi-missing", jungsiMissingGuard, async (c) => {
    const options = await fetchOptionRows(c.var.supabaseAdmin);
    return c.json({
      items: options
        .filter((o) => !o.has_jungsi)
        .map((o) => ({
          university_name: o.university_name,
          department_name: o.department_name,
        })),
    } satisfies z.output<typeof jungsiMissingResponse>);
  })
  .all("/jungsi-missing", methodNotAllowed("GET"))
  .post("/bulk", bulkGuard, validate("json", cutsBulkBody), async (c) => {
    const db = c.var.supabaseAdmin;
    const { rows } = c.req.valid("json");
    const insertRows = rows.filter((row) => row.id === undefined);
    const updateRows = rows.filter((row) => row.id !== undefined);

    // id 로 보낸 행은 이미 있는 행이어야 한다. upsert 가 없는 id 를 새 행으로 만들지 않게 먼저 확인하고,
    // 컷 종류는 바꿀 수 없다(등급 3.2 짜리 행이 정시로 바뀌면 백분위 3.2 로 읽혀 우열이 뒤집힌다).
    if (updateRows.length > 0) {
      const { data, error } = await db
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
        throw new ProblemError(
          404,
          "DB 에 없는 id 가 있습니다(다른 관리자가 삭제했을 수 있습니다).",
          PROBLEM_CODE.NOT_FOUND,
          { ids: missing },
        );
      }
      const changed = rows.flatMap((row, index) =>
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
        throw new ProblemError(
          400,
          VALIDATION_FAILED_MESSAGE,
          PROBLEM_CODE.VALIDATION_FAILED,
          { errors: changed },
        );
      }
    }

    if (insertRows.length > 0) {
      const { error } = await db.from(GOAL_CUTS_TABLE).insert(insertRows);
      if (error) throw writeFailure(error, "goal cuts insert");
    }
    if (updateRows.length > 0) {
      const { error } = await db
        .from(GOAL_CUTS_TABLE)
        .upsert(updateRows, { onConflict: "id" });
      if (error) throw writeFailure(error, "goal cuts upsert");
    }
    return c.json({
      inserted: insertRows.length,
      updated: updateRows.length,
    } satisfies z.output<typeof cutsBulkResponse>);
  })
  .all("/bulk", methodNotAllowed("POST"))
  .get(
    "/backfill",
    backfillGuard,
    validate("query", backfillPreviewQuery),
    async (c) => {
      const plan = await planBackfill(
        c.var.supabaseAdmin,
        c.req.valid("query"),
      );
      return c.json({
        sourceRowCount: plan.sourceRowCount,
        stats: plan.stats,
        analysis: plan.analysis,
        applyCount: plan.applyPayloads.length,
        orphanCount: plan.orphanIds.length,
      } satisfies BackfillPreview);
    },
  )
  .post(
    "/backfill",
    backfillGuard,
    validate("json", backfillApplyBody),
    async (c) => {
      const db = c.var.supabaseAdmin;
      const body = c.req.valid("json");
      // 반영 직전에 다시 계산한다. 그 사이 입결이나 컷이 바뀌어 건수가 달라졌으면 쓰지 않고 돌려보낸다.
      const plan = await planBackfill(db, body);
      if (
        plan.applyPayloads.length !== body.expectedApplyCount ||
        plan.orphanIds.length !== body.expectedOrphanCount
      ) {
        throw new ProblemError(
          409,
          "미리보기 이후 데이터가 바뀌었습니다. 미리보기를 다시 계산한 뒤 확인해 주세요.",
          BACKFILL_PREVIEW_STALE,
          {
            applyCount: plan.applyPayloads.length,
            orphanCount: plan.orphanIds.length,
          },
        );
      }
      try {
        const result = await applyBackfill(
          db,
          plan,
          body.orphanMode === "deactivate",
        );
        return c.json(result satisfies z.output<typeof backfillApplyResponse>);
      } catch (error) {
        if (!(error instanceof BackfillApplyError)) throw error;
        const mapped = mapDbError(error.dbError as { code?: string });
        // 청크는 트랜잭션이 아니다. 앞 청크는 이미 반영돼 있으니 몇 행까지 갔는지 알려 준다.
        // DB 오류가 매핑되면 쓰기 라우트(writeFailure)와 같은 코드와 안내를 쓴다. 화면이 코드로 라벨 문구를 만든다.
        throw new ProblemError(
          mapped?.status ?? 500,
          mapped?.detail ?? "백필 반영 중 일부 청크가 실패했습니다.",
          mapped?.code ?? BACKFILL_APPLY_FAILED,
          {
            applied: error.applied,
            step: error.step,
            range: error.range,
            columns: mapped?.columns ?? [],
          },
        );
      }
    },
  )
  .all("/backfill", methodNotAllowed("GET", "POST"));
