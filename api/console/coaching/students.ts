// GET /api/console/coaching/students
//
// W9 학생 고르기 목록. 현재 학년도 재학생을 학년, 그룹, 반, 번호 순으로 모두 준다(걸러내기는 화면이 한다).
// 담임은 담당 학급만, 학교 관리자와 본사 대행은 기관 전체. 이름은 담임만 실명이다.
// q 가 있으면 실명으로 거른다(담임은 부분 일치, 그 밖에는 성과 이름 전체 일치, 결정 61).
// 학생 id 없이 열면 학습진단과 목표관리를 둘 다 쓰는 첫 학생, 없으면 첫 학생을 연다(교 #52).

import {
  compareClassName,
  gradeRank,
  loadClassIndex,
  loadProfileNames,
  loadTenant,
  readAll,
} from "../../_lib/console/directory.js";
import {
  displayNameFor,
  nameMatchesQuery,
} from "../../_lib/console/maskName.js";
import { scopeQuery } from "../../_lib/console/scope.js";
import { loadServiceUsage } from "../../_lib/console/serviceUsage.js";
import { defineHandler } from "../../_lib/handler.js";

export const config = { runtime: "nodejs" };

interface EnrollmentRow {
  student_id: string;
  grade: string | null;
  class_id: string | null;
  number: number | null;
}

export default defineHandler({
  methods: ["GET"],
  auth: "console",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "학생 목록을 불러오지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[console/coaching/students]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const actor = ctx.console;
    if (!actor) throw new Error("console actor missing");
    const admin = ctx.supabaseAdmin;

    const { schoolYear } = await loadTenant(admin, actor.tenantId);
    const [enrollments, classes] = await Promise.all([
      readAll<EnrollmentRow>(
        admin,
        "student_enrollments",
        "student_id, grade, class_id, number",
        (q) =>
          scopeQuery(q, actor, { classColumn: "class_id" })
            .eq("school_year", schoolYear)
            .eq("status", "active"),
      ),
      loadClassIndex(admin, actor.tenantId),
    ]);
    // q 는 실명으로 이름을 가리기 전에 서버에서 거른다.
    const rawQ = Array.isArray(req.query.q) ? req.query.q[0] : req.query.q;
    const q = rawQ?.trim().toLowerCase();
    const ids = enrollments.map((e) => e.student_id);
    const [names, usage] = await Promise.all([
      loadProfileNames(admin, ids),
      loadServiceUsage(admin, ids),
    ]);

    if (q) {
      for (let i = enrollments.length - 1; i >= 0; i--) {
        const name = names.get(enrollments[i]?.student_id as string) ?? "";
        if (!nameMatchesQuery(actor, name, q)) enrollments.splice(i, 1);
      }
    }

    const classOf = (e: EnrollmentRow) =>
      e.class_id ? classes.get(e.class_id) : undefined;
    enrollments.sort(
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

    const students = enrollments.map((e) => {
      const used = usage.get(e.student_id) ?? [];
      return {
        studentId: e.student_id,
        name: displayNameFor(actor, names.get(e.student_id) ?? ""),
        grade: e.grade,
        groupId: classOf(e)?.groupId ?? null,
        groupName: classOf(e)?.groupName ?? null,
        classId: e.class_id,
        className: classOf(e)?.name ?? null,
        number: e.number,
        usesDiagnosis: used.includes("diagnosis"),
        usesGoal: used.includes("goal"),
      };
    });
    const first =
      students.find((s) => s.usesDiagnosis && s.usesGoal) ?? students[0];

    res
      .status(200)
      .json({ students, defaultStudentId: first?.studentId ?? null });
  },
});
