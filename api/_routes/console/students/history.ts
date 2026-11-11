// GET /api/console/students/history?grade=&groupId=&classId=&q=&page=&pageSize=
//
// W13 학생 조회와 이력. 기관의 현재 학년도 재학생을 학년, 반, 번호(번호 없음은 뒤) 순으로 나눠 준다.
// 담임은 담당 학급 학생만, 학교 관리자와 본사 대행은 전교를 본다. 이름은 담임만 실명이고 그 밖에는 서버에서 가린다.
// q 는 실명 부분 일치다. 이력은 지난 학년도의 학급까지 최신순이고, 이용 서비스 수는 쪽에 보이는 학생만 센다.

import {
  compareClassName,
  gradeRank,
  loadClassIndex,
  loadProfileNames,
  loadTenant,
  readAll,
} from "../../../_lib/console/directory.js";
import { displayNamesFor } from "../../../_lib/console/maskName.js";
import { paginate, parsePageQuery } from "../../../_lib/console/paging.js";
import { queryValue } from "../../../_lib/console/query.js";
import { scopeQuery } from "../../../_lib/console/scope.js";
import {
  loadServiceUsage,
  SERVICE_KEYS,
} from "../../../_lib/console/serviceUsage.js";
import { defineHandler } from "../../../_lib/handler.js";
import { sendError } from "../../../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

interface EnrollmentRow {
  student_id: string;
  school_year: number;
  grade: string | null;
  class_id: string | null;
  number: number | null;
  version: number;
}

const COLUMNS = "student_id, school_year, grade, class_id, number, version";

export default defineHandler({
  methods: ["GET"],
  auth: "console",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "학생 목록을 불러오지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[console/students/history]",
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
    const groupId = queryValue(req.query.groupId);
    const classId = queryValue(req.query.classId);
    const q = queryValue(req.query.q)?.trim().toLowerCase();

    const { schoolYear } = await loadTenant(admin, actor.tenantId);
    const [current, allYears, classes] = await Promise.all([
      readAll<EnrollmentRow>(admin, "student_enrollments", COLUMNS, (query) =>
        scopeQuery(query, actor, { classColumn: "class_id" })
          .eq("school_year", schoolYear)
          .eq("status", "active"),
      ),
      readAll<EnrollmentRow>(admin, "student_enrollments", COLUMNS, (query) =>
        query.eq("tenant_id", actor.tenantId),
      ),
      loadClassIndex(admin, actor.tenantId),
    ]);

    const names = await loadProfileNames(
      admin,
      current.map((e) => e.student_id),
    );
    const shownNames = displayNamesFor(
      actor,
      current.map((e) => ({
        id: e.student_id,
        group: e.class_id,
        name: names.get(e.student_id) ?? "",
      })),
    );
    const matches = current
      .filter((e) => !grade || e.grade === grade)
      .filter((e) => !classId || e.class_id === classId)
      .filter(
        (e) =>
          !groupId ||
          (e.class_id !== null && classes.get(e.class_id)?.groupId === groupId),
      )
      .filter(
        (e) => !q || (names.get(e.student_id) ?? "").toLowerCase().includes(q),
      );
    const classOf = (e: EnrollmentRow) =>
      e.class_id ? classes.get(e.class_id) : undefined;
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
    const shownIds = paged.items.map((e) => e.student_id);
    const services = await loadServiceUsage(admin, shownIds);
    const historyOf = new Map<string, EnrollmentRow[]>();
    for (const e of allYears) {
      if (shownIds.includes(e.student_id)) {
        historyOf.set(e.student_id, [
          ...(historyOf.get(e.student_id) ?? []),
          e,
        ]);
      }
    }

    res.status(200).json({
      ...paged,
      items: paged.items.map((e) => {
        const cls = classOf(e);
        return {
          studentId: e.student_id,
          name: shownNames.get(e.student_id) ?? "",
          grade: e.grade,
          groupName: cls?.groupName ?? null,
          history: (historyOf.get(e.student_id) ?? [])
            .sort((a, b) => b.school_year - a.school_year)
            .map((h) => {
              const hc = h.class_id ? classes.get(h.class_id) : undefined;
              return {
                schoolYear: h.school_year,
                grade: h.grade,
                groupName: hc?.groupName ?? null,
                className: hc?.name ?? null,
              };
            }),
          servicesUsed: services.get(e.student_id)?.length ?? 0,
          servicesTotal: SERVICE_KEYS.length,
          enrollment: {
            grade: e.grade,
            groupId: cls?.groupId ?? null,
            classId: e.class_id,
            className: cls?.name ?? null,
            number: e.number,
            version: e.version,
          },
        };
      }),
    });
  },
});
