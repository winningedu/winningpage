// GET /api/console/teachers/unissued
//
// 계정이 아직 없는 담임 목록(W16b 담임교사용 선택지, 교 #129). 학교 관리자 계정은 이름과 전화번호를
// 넣어 따로 발급하므로 담임만 싣는다. 전화번호는 뒷 네 자리만 보내 같은 이름을 가려 보게 한다.
// 권한: 학교 관리자 또는 본사 대행.

import { loadTeacherDirectory } from "../../../_lib/console/teacherDirectory.js";
import { defineHandler } from "../../../_lib/handler.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["GET"],
  auth: "console",
  consoleRole: "schoolAdmin",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "계정이 없는 선생님을 불러오지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[console/teachers/unissued]",
  headers: { "Cache-Control": "no-store" },
  handler: async (_req, res, ctx) => {
    const actor = ctx.console;
    if (!actor) throw new Error("console actor missing");
    const { teachers } = await loadTeacherDirectory(
      ctx.supabaseAdmin,
      actor.tenantId,
    );
    const items = teachers
      .filter((t) => t.role === "homeroom" && !t.hasAccount)
      .sort((a, b) => a.name.localeCompare(b.name, "ko"))
      .map((t) => ({
        id: t.id,
        name: t.name,
        phoneLast4: t.phone.slice(-4),
        classes: t.classes.map((c) => ({
          grade: c.grade,
          groupName: c.groupName,
          name: c.name,
        })),
      }));
    res.status(200).json({ items });
  },
});
