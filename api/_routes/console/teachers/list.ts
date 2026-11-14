// GET /api/console/teachers/list?grade=&groupId=&page=
//
// 교사 목록(W14). 한 줄이 학급 하나이고 같은 선생님은 같은 아이디로 여러 줄에 나온다(교 #222).
// 담임이 없는 학급은 teacher 가 null("(미등록)"), 학급이 없는 담임은 classId 가 null 인 한 줄이다.
// teachers 는 W14e 선택 삭제와 조건 일괄 삭제 후보(학교 관리자 포함, 재학생 수와 담당 학급)다. 쪽에 걸리지 않는다.
// 권한: 학교 관리자 또는 본사 대행. 선생님 이름은 가리지 않는다(교사 정보 관리 화면).

import { gradeFilterMatches } from "../../../_lib/console/enrollmentInput.js";
import { paginate, parsePageQuery } from "../../../_lib/console/paging.js";
import {
  type DirectoryTeacher,
  loadTeacherDirectory,
} from "../../../_lib/console/teacherDirectory.js";
import { defineHandler } from "../../../_lib/handler.js";
import { sendError } from "../../../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

type AccountStatus = "active" | "inactive" | "unissued";

function accountStatusOf(t: DirectoryTeacher): AccountStatus {
  if (!t.hasAccount) return "unissued";
  return t.status;
}

function first(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw;
}

export default defineHandler({
  methods: ["GET"],
  auth: "console",
  consoleRole: "schoolAdmin",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "교사 목록을 불러오지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[console/teachers/list]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const actor = ctx.console;
    if (!actor) throw new Error("console actor missing");
    const paging = parsePageQuery(req.query);
    if (!paging) {
      sendError(res, "coded", 400, "입력 값을 확인해 주세요.", "BAD_REQUEST");
      return;
    }
    const grade = first(req.query.grade);
    const groupId = first(req.query.groupId);

    const directory = await loadTeacherDirectory(
      ctx.supabaseAdmin,
      actor.tenantId,
    );
    const rows = directory.classes
      .filter(
        (c) =>
          gradeFilterMatches(grade, c.grade, c.grade) &&
          (!groupId || c.groupId === groupId),
      )
      .map((c) => {
        const holder = directory.holderByClassId.get(c.id) ?? null;
        return {
          classId: c.id as string | null,
          grade: c.grade as string | null,
          groupName: c.groupName,
          className: c.name as string | null,
          activeStudents: c.activeStudents,
          teacher: holder && { id: holder.id, name: holder.name },
          loginId: holder?.loginId ?? null,
          accountStatus: holder ? accountStatusOf(holder) : null,
          classCount: holder?.classes.length ?? 0,
        };
      });
    // 학급이 없는 담임은 학년이나 그룹으로 거를 때는 빼고 전체 목록의 끝에 둔다.
    if (!grade && !groupId) {
      for (const t of directory.teachers) {
        if (t.role !== "homeroom" || t.classes.length > 0) continue;
        rows.push({
          classId: null,
          grade: null,
          groupName: null,
          className: null,
          activeStudents: 0,
          teacher: { id: t.id, name: t.name },
          loginId: t.loginId,
          accountStatus: accountStatusOf(t),
          classCount: 0,
        });
      }
    }

    res.status(200).json({
      ...paginate(rows, paging),
      teachers: directory.teachers.map((t) => ({
        id: t.id,
        name: t.name,
        role: t.role,
        status: t.status,
        hasAccount: t.hasAccount,
        activeStudents: t.classes.reduce((sum, c) => sum + c.activeStudents, 0),
        classes: t.classes.map((c) => ({
          grade: c.grade,
          groupId: c.groupId,
          groupName: c.groupName,
          name: c.name,
        })),
      })),
    });
  },
});
