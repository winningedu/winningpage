// GET /api/console/graduates?year=&q=&page=&pageSize=
//
// W13 졸업생 탭. 학교 관리자와 본사 대행만. 졸업한 지 2년 안의 학생만 보이고(결정 9, fn_purge_b2b_retention 과
// 같은 기준). year 가 없으면 최근 졸업 학년도를 쓰고 응답의 year 에 쓴 학년도를 담는다(졸업생이 없으면 null).
// years 는 필터와 상관없이 보이는 졸업 학년도 전부다.
// 졸업 학년도는 졸업 학적 행의 학년도다. 이름은 서버에서 가리고 q 는 실명 부분 일치다.

import {
  loadClassIndex,
  loadProfileNames,
  readAll,
} from "../../_lib/console/directory.js";
import { displayNamesFor } from "../../_lib/console/maskName.js";
import { paginate, parsePageQuery } from "../../_lib/console/paging.js";
import { queryValue } from "../../_lib/console/query.js";
import { defineHandler } from "../../_lib/handler.js";
import { sendError } from "../../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

interface EnrollmentRow {
  student_id: string;
  school_year: number;
  status: string;
  grade: string | null;
  class_id: string | null;
  number: number | null;
  graduated_at: string | null;
}

export default defineHandler({
  methods: ["GET"],
  auth: "console",
  consoleRole: "schoolAdmin",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "졸업생 목록을 불러오지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[console/graduates]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const actor = ctx.console;
    if (!actor) throw new Error("console actor missing");
    const admin = ctx.supabaseAdmin;

    const pageQuery = parsePageQuery(req.query);
    const rawYear = queryValue(req.query.year);
    if (!pageQuery || (rawYear !== undefined && !/^\d{4}$/.test(rawYear))) {
      sendError(res, "coded", 400, "입력 값을 확인해 주세요.", "BAD_REQUEST");
      return;
    }
    const requestedYear = rawYear ? Number(rawYear) : undefined;
    const q = queryValue(req.query.q)?.trim().toLowerCase();

    const cutoff = new Date();
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 2);

    const [rows, classes] = await Promise.all([
      readAll<EnrollmentRow>(
        admin,
        "student_enrollments",
        "student_id, school_year, status, grade, class_id, number, graduated_at",
        (query) => query.eq("tenant_id", actor.tenantId),
      ),
      loadClassIndex(admin, actor.tenantId),
    ]);

    const graduates = rows.filter(
      (r) =>
        r.status === "graduated" &&
        r.graduated_at !== null &&
        new Date(r.graduated_at) >= cutoff,
    );
    const years = [...new Set(graduates.map((g) => g.school_year))].sort(
      (a, b) => b - a,
    );

    // year 가 없으면 가장 최근 졸업 학년도를 쓰고, 어느 학년도를 썼는지 응답에 담는다.
    const year = requestedYear ?? years[0];

    const names = await loadProfileNames(
      admin,
      graduates.map((g) => g.student_id),
    );
    const ofYear = graduates.filter((g) => g.school_year === year);
    const shownNames = displayNamesFor(
      actor,
      ofYear.map((g) => ({
        id: g.student_id,
        group: g.class_id,
        name: names.get(g.student_id) ?? "",
      })),
    );
    const shown = ofYear
      .filter(
        (g) => !q || (names.get(g.student_id) ?? "").toLowerCase().includes(q),
      )
      .sort(
        (a, b) =>
          b.school_year - a.school_year ||
          (names.get(a.student_id) ?? "").localeCompare(
            names.get(b.student_id) ?? "",
            "ko",
          ) ||
          a.student_id.localeCompare(b.student_id),
      );

    const paged = paginate(shown, pageQuery);
    const className = (classId: string | null) =>
      (classId ? classes.get(classId)?.name : undefined) ?? null;

    res.status(200).json({
      year: year ?? null,
      years,
      ...paged,
      items: paged.items.map((g) => ({
        studentId: g.student_id,
        name: shownNames.get(g.student_id) ?? "",
        graduatedYear: g.school_year,
        last: {
          grade: g.grade,
          className: className(g.class_id),
          number: g.number,
        },
        history: rows
          .filter((r) => r.student_id === g.student_id)
          .sort((a, b) => b.school_year - a.school_year)
          .map((r) => ({
            schoolYear: r.school_year,
            grade: r.grade,
            className: className(r.class_id),
          })),
      })),
    });
  },
});
