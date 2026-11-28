// /api/admin/admission 아래 입시 관리 라우트. 관리자 앱(api/_routes/admin/app.ts)이 .route("/admission", admission) 으로 붙인다.
// 요청 검증과 응답 모양은 shared/admission/contract.ts 를 따르고, 일괄 반영의 행 규칙은 shared/admission/resultRow.ts, guidelineRow.ts 가 맡는다.
// 권한: 공개 연도와 대입모집요강은 메뉴 admissionGuidelines, 입결정보는 admissionResults(GET view, 쓰기 edit).
// 일괄 반영의 본문 오류는 400 VALIDATION_FAILED 이고 errors[0].message 가 "n번째 행: 사유" 다. 공개 연도의 본문 오류는 errors 없이 한 줄 사유를 담은 400 이다.

import type { Context } from "hono";
import {
  type ActiveYear,
  activeYearBody,
  type GuidelinesBulk,
  guidelinesBulkBody,
  RESULTS_PAGE_SIZE,
  type ResultsBulk,
  type ResultsCount,
  type ResultsRows,
  resultsBulkBody,
  resultsRowsQuery,
} from "../../../shared/admission/contract.js";
import { PROBLEM_CODE } from "../../../shared/http/codes.js";
import { ADMISSION_RESULT_COLUMNS } from "../../_lib/admission/resultColumns.js";
import { admin } from "../../_lib/hono/admin.js";
import { adminFactory } from "../../_lib/hono/factory.js";
import { methodNotAllowed, ProblemError } from "../../_lib/hono/problem.js";
import { validate } from "../../_lib/hono/validate.js";

const SETTING_KEY = "admission_active_year";
const YEAR_INVALID_MESSAGE = "연도는 2000~2100 사이 정수로 입력해 주세요.";

const invalid = (message: string) =>
  new ProblemError(400, message, PROBLEM_CODE.VALIDATION_FAILED);

/** JSON 이 아니거나 비어 있는 본문은 undefined 로 읽어 본문 스키마가 거르게 한다. */
const bodyOf = (c: Context): Promise<unknown> =>
  c.req.json().catch(() => undefined);

const activeYearGuard = admin({
  permission: { key: "admissionGuidelines" },
  unhandledMessage: "공개 연도를 처리하지 못했습니다.",
  logLabel: "[admin/admission/active-year]",
});
const countGuard = admin({
  permission: { key: "admissionResults" },
  unhandledMessage: "입결정보 건수를 읽지 못했습니다.",
  logLabel: "[admin/admission/results/count]",
});
const rowsGuard = admin({
  permission: { key: "admissionResults" },
  unhandledMessage: "입결정보를 읽지 못했습니다.",
  logLabel: "[admin/admission/results/rows]",
});
const resultsBulkGuard = admin({
  permission: { key: "admissionResults" },
  unhandledMessage: "입결정보를 반영하지 못했습니다.",
  logLabel: "[admin/admission/results/bulk]",
});
const guidelinesBulkGuard = admin({
  permission: { key: "admissionGuidelines" },
  unhandledMessage: "대입모집요강을 반영하지 못했습니다.",
  logLabel: "[admin/admission/guidelines/bulk]",
});

export const admission = adminFactory
  .createApp()
  // GET, PUT /active-year: 입시 공개 연도(app_settings.admission_active_year). 값이 없을 때 상수로 채우지 않고 404 로 알린다.
  .get("/active-year", activeYearGuard, async (c) => {
    const { data, error } = await c.var.supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", SETTING_KEY)
      .maybeSingle();
    if (error) throw new Error("app_settings read failed");
    const year = data?.value;
    if (typeof year !== "number" || !Number.isInteger(year) || year <= 0) {
      throw new ProblemError(
        404,
        "공개 연도가 아직 지정되지 않았습니다.",
        PROBLEM_CODE.NOT_FOUND,
      );
    }
    return c.json({ year } satisfies ActiveYear);
  })
  .put("/active-year", activeYearGuard, async (c) => {
    const parsed = activeYearBody.safeParse(await bodyOf(c));
    if (!parsed.success) throw invalid(YEAR_INVALID_MESSAGE);
    const { year } = parsed.data;
    const { error } = await c.var.supabaseAdmin.from("app_settings").upsert(
      {
        key: SETTING_KEY,
        value: year,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
    if (error) throw new Error("app_settings upsert failed");
    return c.json({ year } satisfies ActiveYear);
  })
  .all("/active-year", methodNotAllowed("GET", "PUT"))
  // GET /results/count: 입결정보(admission_results) 전체 행 수. 행을 내려받지 않고 head 로 센다.
  .get("/results/count", countGuard, async (c) => {
    const { count, error } = await c.var.supabaseAdmin
      .from("admission_results")
      .select("id", { count: "exact", head: true });
    if (error || typeof count !== "number") {
      throw new Error("admission_results count failed");
    }
    return c.json({ total: count } satisfies ResultsCount);
  })
  .all("/results/count", methodNotAllowed("GET"))
  // GET /results/rows?offset=N&fields=all|id: id 오름차순으로 RESULTS_PAGE_SIZE 행씩 읽는다.
  //   엑셀 내려받기는 fields=all(29컬럼), 업로드 미리보기는 fields=id 로 id 만 읽는다.
  .get(
    "/results/rows",
    rowsGuard,
    validate("query", resultsRowsQuery),
    async (c) => {
      const { offset, fields } = c.req.valid("query");
      const { data, error } = await c.var.supabaseAdmin
        .from("admission_results")
        .select(fields === "all" ? ADMISSION_RESULT_COLUMNS.join(",") : "id")
        .order("id", { ascending: true })
        .range(offset, offset + RESULTS_PAGE_SIZE - 1);
      if (error) throw new Error("admission_results read failed");
      return c.json({
        items: (data ?? []) as unknown as ResultsRows["items"],
      } satisfies ResultsRows);
    },
  )
  .all("/results/rows", methodNotAllowed("GET"))
  // POST /results/bulk: 입결정보 엑셀 업로드 한 청크(최대 RESULTS_BULK_MAX_ITEMS 행). id 없는 행은 insert, id 있는 행은 upsert.
  .post(
    "/results/bulk",
    resultsBulkGuard,
    validate("json", resultsBulkBody),
    async (c) => {
      const { items } = c.req.valid("json");
      const db = c.var.supabaseAdmin;
      const inserts = items.filter((item) => item.id === undefined);
      const updates = items.filter((item) => item.id !== undefined);

      // 아무것도 쓰기 전에 id 존재를 확인해, 없는 id 때문에 insert 만 반영되는 일을 막는다.
      if (updates.length > 0) {
        const ids = [...new Set(updates.map((item) => Number(item.id)))];
        const { data, error } = await db
          .from("admission_results")
          .select("id")
          .in("id", ids);
        if (error) throw new Error("admission_results id read failed");
        const found = new Set((data ?? []).map((r) => r.id));
        const missing = ids.filter((id) => !found.has(id));
        if (missing.length > 0) {
          throw new ProblemError(
            404,
            `없는 id 가 있습니다: ${missing.join(", ")}`,
            PROBLEM_CODE.NOT_FOUND,
          );
        }
      }

      if (inserts.length > 0) {
        const { error } = await db.from("admission_results").insert(inserts);
        if (error) throw new Error("admission_results insert failed");
      }
      if (updates.length > 0) {
        const { error } = await db
          .from("admission_results")
          .upsert(updates, { onConflict: "id" });
        if (error) throw new Error("admission_results upsert failed");
      }
      return c.json({
        inserted: inserts.length,
        updated: updates.length,
      } satisfies ResultsBulk);
    },
  )
  .all("/results/bulk", methodNotAllowed("POST"))
  // PUT /guidelines/bulk: 대입모집요강 엑셀 업로드 결과를 (admission_year, university_key) 키로 한 번에 upsert 한다.
  .put(
    "/guidelines/bulk",
    guidelinesBulkGuard,
    validate("json", guidelinesBulkBody),
    async (c) => {
      const { items } = c.req.valid("json");
      if (items.length > 0) {
        const { error } = await c.var.supabaseAdmin
          .from("admission_university_resources")
          .upsert(items, { onConflict: "admission_year,university_key" });
        if (error) {
          throw new Error("admission_university_resources upsert failed");
        }
      }
      return c.json({ upserted: items.length } satisfies GuidelinesBulk);
    },
  )
  .all("/guidelines/bulk", methodNotAllowed("PUT"));
