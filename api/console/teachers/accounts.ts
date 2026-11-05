// GET /api/console/teachers/accounts?page=
//
// 교사 계정 목록(W16, 교 #126). 계정이 있는 교사만(미발급은 W14와 W16b), 학교 관리자 먼저, 이어서 학년과 반 순이다.
// 비밀번호는 보내지 않는다(화면은 가림 표시). passwordSet 은 임시 비밀번호 재발급 가능 여부(결정 16)에,
// lastLoginAt 은 Auth 의 last_sign_in_at 이다(W16 최근 로그인).
// phoneLast4 는 재발급 안내 파일(교 #125)에 쓴다. 전화번호 전체는 싣지 않는다.
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
    const accounts = teachers.filter((t) => t.hasAccount).sort(compareTeachers);
    const pageOfAccounts = paginate(accounts, paging);
    // 한 쪽(최대 50명)만 Auth 에서 읽는다. 읽지 못한 행은 null 이라 화면이 비워 둔다.
    const lastLogins = await Promise.all(
      pageOfAccounts.items.map(async (t) => {
        if (!t.profileId) return null;
        const { data, error } = await ctx.supabaseAdmin.auth.admin.getUserById(
          t.profileId,
        );
        return error ? null : (data.user?.last_sign_in_at ?? null);
      }),
    );
    const items = pageOfAccounts.items.map((t, i) => ({
      id: t.id,
      name: t.name,
      role: t.role,
      phoneLast4: t.phone.slice(-4),
      loginId: t.loginId,
      status: t.status,
      passwordSet: t.passwordSet,
      lastLoginAt: lastLogins[i] ?? null,
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
    res.status(200).json({ ...pageOfAccounts, items });
  },
});
