// GET /api/console/teachers/accounts?page=
//
// 교사 계정 목록(W16, 교 #126). 계정이 있는 교사만(미발급은 W14와 W16b), 학교 관리자 먼저, 이어서 학년과 반 순이다.
// 비밀번호는 보내지 않는다(화면은 가림 표시). passwordSet 은 임시 비밀번호 재발급 가능 여부(결정 16)에 쓴다.
// 권한: 학교 관리자 또는 본사 대행.

import { paginate, parsePageQuery } from "../../_lib/console/paging.js";
import {
  compareClasses,
  type DirectoryTeacher,
  loadTeacherDirectory,
} from "../../_lib/console/teacherDirectory.js";
import { defineHandler } from "../../_lib/handler.js";
import { sendError } from "../../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

// 학급이 없으면 맨 뒤. 담당 학급 중 가장 앞선 학급으로 순서를 정한다.
function compareTeachers(a: DirectoryTeacher, b: DirectoryTeacher): number {
  if (a.role !== b.role) return a.role === "school_admin" ? -1 : 1;
  const [ca, cb] = [a.classes[0], b.classes[0]];
  if (ca && cb) return compareClasses(ca, cb);
  if (ca || cb) return ca ? -1 : 1;
  return a.name.localeCompare(b.name, "ko");
}

export default defineHandler({
  methods: ["GET"],
  auth: "console",
  consoleRole: "schoolAdmin",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "교사 계정 목록을 불러오지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[console/teachers/accounts]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const actor = ctx.console;
    if (!actor) throw new Error("console actor missing");
    const paging = parsePageQuery(req.query);
    if (!paging) {
      sendError(res, "coded", 400, "입력 값을 확인해 주세요.", "BAD_REQUEST");
      return;
    }
    const { teachers } = await loadTeacherDirectory(
      ctx.supabaseAdmin,
      actor.tenantId,
    );
    const items = teachers
      .filter((t) => t.hasAccount)
      .sort(compareTeachers)
      .map((t) => ({
        id: t.id,
        name: t.name,
        role: t.role,
        loginId: t.loginId,
        status: t.status,
        passwordSet: t.passwordSet,
        classes: t.classes.map((c) => ({
          id: c.id,
          grade: c.grade,
          groupId: c.groupId,
          groupName: c.groupName,
          name: c.name,
          isPrimary: c.isPrimary,
          activeStudents: c.activeStudents,
        })),
      }));
    res.status(200).json(paginate(items, paging));
  },
});
