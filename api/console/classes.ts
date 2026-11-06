// GET /api/console/classes?year=
//
// 학급 목록(W13 필터, W13b 선택지, 담임 없는 반 안내). year 가 없으면 기관의 현재 학년도.
// 담임은 담당 학급만, 학교 관리자와 본사 대행은 기관 전체를 본다. 이름이 없는 목록이라 가리지 않는다.

import {
  compareClassName,
  gradeRank,
  loadGroupNames,
  loadHomeroomClassIds,
  loadTenant,
  readAll,
} from "../_lib/console/directory.js";
import { scopeQuery } from "../_lib/console/scope.js";
import { defineHandler } from "../_lib/handler.js";
import { sendError } from "../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

interface ClassRow {
  id: string;
  grade: string;
  group_id: string | null;
  name: string;
}

export default defineHandler({
  methods: ["GET"],
  auth: "console",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "학급 목록을 불러오지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[console/classes]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const actor = ctx.console;
    if (!actor) throw new Error("console actor missing");
    const admin = ctx.supabaseAdmin;

    const rawYear = Array.isArray(req.query.year)
      ? req.query.year[0]
      : req.query.year;
    if (rawYear !== undefined && !/^\d{4}$/.test(rawYear)) {
      sendError(res, "coded", 400, "입력 값을 확인해 주세요.", "BAD_REQUEST");
      return;
    }
    const year = rawYear
      ? Number(rawYear)
      : (await loadTenant(admin, actor.tenantId)).schoolYear;

    const [classes, groupNames, homerooms] = await Promise.all([
      readAll<ClassRow>(admin, "classes", "id, grade, group_id, name", (q) =>
        scopeQuery(q, actor, { classColumn: "id" }).eq("school_year", year),
      ),
      loadGroupNames(admin, actor.tenantId),
      loadHomeroomClassIds(admin, actor.tenantId),
    ]);

    const rows = classes.map((c) => ({
      id: c.id,
      grade: c.grade,
      groupId: c.group_id,
      groupName: c.group_id ? (groupNames.get(c.group_id) ?? null) : null,
      name: c.name,
      hasHomeroom: homerooms.has(c.id),
    }));
    rows.sort(
      (a, b) =>
        gradeRank(a.grade) - gradeRank(b.grade) ||
        (a.groupName ?? "").localeCompare(b.groupName ?? "", "ko") ||
        compareClassName(a.name, b.name),
    );

    res.status(200).json({ classes: rows });
  },
});
