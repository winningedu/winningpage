// GET /api/console/coaching/students
//
// W9 학생 고르기 목록. 현재 학년도 재학생을 학년, 그룹, 반, 번호 순으로 모두 준다(걸러내기는 화면이 한다).
// 담임은 담당 학급만, 학교 관리자와 본사 대행은 기관 전체. 이름은 담임만 실명이다.
// q 가 있으면 실명으로 거른다(담임은 부분 일치, 그 밖에는 성과 이름 전체 일치, 결정 61).
// 학생 id 없이 열면 학습진단과 목표관리를 둘 다 쓰는 첫 학생, 없으면 첫 학생을 연다(교 #52).

import { loadProfileNames } from "../../_lib/console/directory.js";
import {
  displayNamesFor,
  nameMatchesQuery,
} from "../../_lib/console/maskName.js";
import { queryValue } from "../../_lib/console/query.js";
import { loadServiceUsage } from "../../_lib/console/serviceUsage.js";
import { loadScopedStudents } from "../../_lib/console/studentScope.js";
import { defineHandler } from "../../_lib/handler.js";

export const config = { runtime: "nodejs" };

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

    const scoped = await loadScopedStudents(admin, actor);
    // q 는 실명으로 이름을 가리기 전에 서버에서 거른다.
    const q = queryValue(req.query.q)?.trim().toLowerCase();
    const ids = scoped.map((s) => s.studentId);
    const [names, usage] = await Promise.all([
      loadProfileNames(admin, ids),
      loadServiceUsage(admin, ids),
    ]);
    const listed = q
      ? scoped.filter((s) =>
          nameMatchesQuery(actor, names.get(s.studentId) ?? "", q),
        )
      : scoped;

    // 같은 학급에서 가린 이름이 겹치면 구분되게 끝에 * 를 붙인다(교 #233).
    const shownNames = displayNamesFor(
      actor,
      listed.map((s) => ({
        id: s.studentId,
        group: s.classId,
        name: names.get(s.studentId) ?? "",
      })),
    );
    const students = listed.map((s) => {
      const used = usage.get(s.studentId) ?? [];
      return {
        studentId: s.studentId,
        name: shownNames.get(s.studentId) ?? "",
        grade: s.grade,
        groupId: s.groupId,
        groupName: s.groupName,
        classId: s.classId,
        className: s.className,
        number: s.number,
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
