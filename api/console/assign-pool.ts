// GET /api/console/assign-pool?grade=&classId=&q=&page=&pageSize=
//
// W12 미배정 목록. 올해 재학 중이면서 학년이나 학급이 비어 있는 학생을 학교 관리자와 본사 대행에게 준다.
// 이름은 서버에서 가린다. 동명 재학생(같은 기관, 같은 실명, 올해 학급이 있는 학생)은 번호 중복을 피해 배치하도록
// 함께 준다. classId 는 동명 재학생 확인만 그 반으로 좁힌다(결정 105). q 는 성과 이름 전체 일치다(결정 61). 배치 쓰기는 PATCH /api/console/students/enrollment 가 한다.

import {
  gradeRank,
  loadClassIndex,
  loadProfileNames,
  loadTenant,
  readAll,
} from "../_lib/console/directory.js";
import { displayNamesFor, nameMatchesQuery } from "../_lib/console/maskName.js";
import { paginate, parsePageQuery } from "../_lib/console/paging.js";
import { queryValue } from "../_lib/console/query.js";
import {
  loadServiceUsage,
  SERVICE_KEYS,
} from "../_lib/console/serviceUsage.js";
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
  consoleRole: "schoolAdmin",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "미배정 목록을 불러오지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[console/assign-pool]",
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
    const grade = queryValue(req.query.grade);
    const classId = queryValue(req.query.classId);
    const q = queryValue(req.query.q)?.trim().toLowerCase();

    const { schoolYear } = await loadTenant(admin, actor.tenantId);
    const [current, classes] = await Promise.all([
      readAll<EnrollmentRow>(admin, "student_enrollments", COLUMNS, (query) =>
        query
          .eq("tenant_id", actor.tenantId)
          .eq("school_year", schoolYear)
          .eq("status", "active"),
      ),
      loadClassIndex(admin, actor.tenantId),
    ]);
    const names = await loadProfileNames(
      admin,
      current.map((e) => e.student_id),
    );
    const nameOf = (id: string) => names.get(id) ?? "";

    const enrolled = current.filter(
      (e) => e.class_id !== null && (!classId || e.class_id === classId),
    );
    const pool = current
      .filter((e) => e.grade === null || e.class_id === null)
      .filter((e) => !grade || e.grade === grade)
      .filter((e) => !q || nameMatchesQuery(actor, nameOf(e.student_id), q));
    pool.sort(
      (a, b) =>
        gradeRank(a.grade) - gradeRank(b.grade) ||
        nameOf(a.student_id).localeCompare(nameOf(b.student_id), "ko") ||
        a.student_id.localeCompare(b.student_id),
    );

    // 미배정 학생은 한 묶음이다. 가린 이름이 같으면 구분되게 한다.
    const shownNames = displayNamesFor(
      actor,
      pool.map((e) => ({
        id: e.student_id,
        group: null,
        name: nameOf(e.student_id),
      })),
    );
    const paged = paginate(pool, pageQuery);
    const sameNameOf = (id: string) =>
      enrolled.filter(
        (e) =>
          e.student_id !== id &&
          nameOf(e.student_id) !== "" &&
          nameOf(e.student_id) === nameOf(id),
      );
    const services = await loadServiceUsage(
      admin,
      paged.items.flatMap((e) =>
        sameNameOf(e.student_id).map((s) => s.student_id),
      ),
    );

    res.status(200).json({
      total: paged.total,
      page: paged.page,
      pageSize: pageQuery.pageSize,
      pageCount: paged.pageCount,
      items: paged.items.map((e) => {
        const sameName = sameNameOf(e.student_id);
        return {
          studentId: e.student_id,
          name: shownNames.get(e.student_id) ?? "",
          enrollmentVersion: e.version,
          grade: e.grade,
          sameNameCount: sameName.length,
          sameNameEnrolled: sameName.map((s) => {
            const cls = s.class_id ? classes.get(s.class_id) : undefined;
            return {
              grade: s.grade,
              groupName: cls?.groupName ?? null,
              className: cls?.name ?? null,
              number: s.number,
              usedServiceCount: services.get(s.student_id)?.length ?? 0,
              serviceTotal: SERVICE_KEYS.length,
            };
          }),
        };
      }),
    });
  },
});
