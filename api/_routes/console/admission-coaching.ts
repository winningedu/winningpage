// GET /api/console/admission-coaching?grade=&groupId=&classId=&page=&pageSize=
//
// W10 입시 상담코칭. 입시를 앞둔 중3, 고3 학생만 현재 학년도 학년, 반, 번호 순으로 나눠 준다(교 #48, #215).
// 담임은 담당 학급만, 학교 관리자와 본사 대행은 전교를 본다. 이름은 담임만 실명이고 그 밖에는 서버에서 가린다.
// hasGrade3InScope 는 범위 안에 중3, 고3 학급이 하나라도 있는지다(없으면 화면이 안내만 보인다, 교 #148).
// 상담 상태(counselStatus)는 현재 학년도 counsel_statuses 행이 없으면 unset 이고 변경 일자(counselChangedAt)는 null 이다.

import { loadDiagnosisStatus } from "../../_lib/console/diagnosisStatus.js";
import {
  loadProfileNames,
  loadTenant,
  readAll,
} from "../../_lib/console/directory.js";
import { loadGoalStatus } from "../../_lib/console/goalStatus.js";
import { displayNamesFor } from "../../_lib/console/maskName.js";
import { paginate, parsePageQuery } from "../../_lib/console/paging.js";
import { scopeQuery } from "../../_lib/console/scope.js";
import {
  ADMISSION_GRADES,
  loadScopedStudents,
} from "../../_lib/console/studentScope.js";
import { defineHandler } from "../../_lib/handler.js";
import { sendError } from "../../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

function queryValue(raw: string | string[] | undefined): string | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === undefined || value === "" ? undefined : value;
}

export default defineHandler({
  methods: ["GET"],
  auth: "console",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "입시 상담코칭 목록을 불러오지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[console/admission-coaching]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const actor = ctx.console;
    if (!actor) throw new Error("console actor missing");
    const admin = ctx.supabaseAdmin;

    const pageQuery = parsePageQuery(req.query);
    const grade = queryValue(req.query.grade);
    if (
      !pageQuery ||
      (grade !== undefined &&
        !(ADMISSION_GRADES as readonly string[]).includes(grade))
    ) {
      sendError(res, "coded", 400, "입력 값을 확인해 주세요.", "BAD_REQUEST");
      return;
    }

    const { schoolYear } = await loadTenant(admin, actor.tenantId);
    const [scopedClasses, students] = await Promise.all([
      readAll<{ id: string; grade: string }>(
        admin,
        "classes",
        "id, grade",
        (q) =>
          scopeQuery(q, actor, { classColumn: "id" }).eq(
            "school_year",
            schoolYear,
          ),
      ),
      loadScopedStudents(admin, actor, {
        grades: ADMISSION_GRADES,
        grade,
        groupId: queryValue(req.query.groupId),
        classId: queryValue(req.query.classId),
      }),
    ]);
    const hasGrade3InScope = scopedClasses.some((c) =>
      (ADMISSION_GRADES as readonly string[]).includes(c.grade),
    );

    const paged = paginate(students, pageQuery);
    const ids = paged.items.map((s) => s.studentId);
    const [names, goal, diagnosis, counsel] = await Promise.all([
      // 이름은 쪽과 상관없이 같은 학급의 겹침을 알려고 범위 전체를 읽는다.
      loadProfileNames(
        admin,
        students.map((s) => s.studentId),
      ),
      loadGoalStatus(admin, ids, new Date(), { streak: true }),
      loadDiagnosisStatus(admin, ids),
      readAll<{ student_id: string; status: string; changed_at: string }>(
        admin,
        "counsel_statuses",
        "student_id, status, changed_at",
        (q) =>
          q
            .eq("tenant_id", actor.tenantId)
            .eq("school_year", schoolYear)
            .in("student_id", ids),
        "student_id",
      ),
    ]);

    const counselOf = new Map(counsel.map((c) => [c.student_id, c]));
    const shownNames = displayNamesFor(
      actor,
      students.map((s) => ({
        id: s.studentId,
        group: s.classId,
        name: names.get(s.studentId) ?? "",
      })),
    );

    res.status(200).json({
      ...paged,
      hasGrade3InScope,
      items: paged.items.map((s) => {
        const g = goal.get(s.studentId);
        const d = diagnosis.get(s.studentId);
        return {
          studentId: s.studentId,
          name: shownNames.get(s.studentId) ?? "",
          grade: s.grade,
          groupName: s.groupName,
          className: s.className,
          number: s.number,
          idealTarget: g?.ideal
            ? { university: g.ideal.university, department: g.ideal.department }
            : null,
          minTarget: g?.min
            ? { university: g.min.university, department: g.min.department }
            : null,
          execScore: d?.executionAvg ?? null,
          urgency: d?.urgency ?? null,
          counselStatus: counselOf.get(s.studentId)?.status ?? "unset",
          counselChangedAt: counselOf.get(s.studentId)?.changed_at ?? null,
        };
      }),
    });
  },
});
