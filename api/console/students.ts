// GET /api/console/students?tab=&grade=&groupId=&classId=&q=&page=&pageSize=
//
// W6 학생 관리. 기관의 현재 학년도 재학생을 학년, 그룹, 반, 번호(번호 없음은 뒤) 순으로 나눠 준다.
// 담임은 담당 학급 학생만 실명으로, 학교 관리자와 본사 대행은 전교를 가린 이름으로 본다(서버가 가린다).
// scopeTotal 은 필터 없이 범위 안의 학생 수라 "학생 없음"과 "조건에 맞는 학생 없음"을 가른다.

import {
  compareClassName,
  gradeRank,
  loadClassIndex,
  loadProfileNames,
  loadTenant,
  readAll,
} from "../_lib/console/directory.js";
import { displayNameFor } from "../_lib/console/maskName.js";
import { paginate, parsePageQuery } from "../_lib/console/paging.js";
import { scopeQuery } from "../_lib/console/scope.js";
import { defineHandler } from "../_lib/handler.js";
import { sendError } from "../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

interface EnrollmentRow {
  student_id: string;
  grade: string | null;
  class_id: string | null;
  number: number | null;
  version: number;
}

const COLUMNS = "student_id, grade, class_id, number, version";

export default defineHandler({
  methods: ["GET"],
  auth: "console",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "학생 목록을 불러오지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[console/students]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const actor = ctx.console;
    if (!actor) throw new Error("console actor missing");
    const admin = ctx.supabaseAdmin;

    const pageQuery = parsePageQuery(req.query);
    if (!pageQuery) {
      sendError(res, "coded", 400, "입력 값을 확인해 주세요.", "BAD_REQUEST");
      return;
    }

    const { schoolYear, orgType } = await loadTenant(admin, actor.tenantId);
    const [current, classes] = await Promise.all([
      readAll<EnrollmentRow>(admin, "student_enrollments", COLUMNS, (query) =>
        scopeQuery(query, actor, { classColumn: "class_id" })
          .eq("school_year", schoolYear)
          .eq("status", "active"),
      ),
      loadClassIndex(admin, actor.tenantId),
    ]);
    const names = await loadProfileNames(
      admin,
      current.map((e) => e.student_id),
    );
    const classOf = (e: EnrollmentRow) =>
      e.class_id ? classes.get(e.class_id) : undefined;
    const matches = [...current];
    matches.sort(
      (a, b) =>
        gradeRank(a.grade) - gradeRank(b.grade) ||
        (classOf(a)?.groupName ?? "").localeCompare(
          classOf(b)?.groupName ?? "",
          "ko",
        ) ||
        compareClassName(classOf(a)?.name ?? "", classOf(b)?.name ?? "") ||
        (a.number ?? 100) - (b.number ?? 100) ||
        a.student_id.localeCompare(b.student_id),
    );

    const paged = paginate(matches, pageQuery);
    res.status(200).json({
      total: paged.total,
      scopeTotal: current.length,
      page: paged.page,
      pageSize: pageQuery.pageSize,
      orgType,
      rows: paged.items.map((e) => {
        const cls = classOf(e);
        return {
          studentId: e.student_id,
          displayName: displayNameFor(actor, names.get(e.student_id) ?? ""),
          grade: e.grade,
          groupName: cls?.groupName ?? null,
          className: cls?.name ?? null,
          number: e.number,
          canEdit: actor.kind === "homeroom",
          enrollmentVersion: e.version,
        };
      }),
    });
  },
});
