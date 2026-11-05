// GET /api/console/enrollment-requests?page=1&pageSize=50
//
// W13 승인 대기 목록. 범위는 count 와 같다. 담임은 자기 학급으로 오는 신청만, 학교 관리자와 본사 대행은
// 기관 전체를 오래된 순으로 본다. 이름은 담임만 그대로 보고 그 밖에는 서버에서 가려 준다(교 #22).

import {
  loadClassIndex,
  loadProfileNames,
  readAll,
} from "../_lib/console/directory.js";
import { displayNameFor } from "../_lib/console/maskName.js";
import { paginate, parsePageQuery } from "../_lib/console/paging.js";
import { scopeQuery } from "../_lib/console/scope.js";
import { defineHandler } from "../_lib/handler.js";
import { sendError } from "../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

interface ChangeRow {
  id: string;
  student_id: string;
  from_grade: string | null;
  from_class_id: string | null;
  from_number: number | null;
  to_grade: string | null;
  to_class_id: string | null;
  to_number: number | null;
  created_at: string;
}

export default defineHandler({
  methods: ["GET"],
  auth: "console",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "신청 목록을 불러오지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[console/enrollment-requests]",
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

    const changes = await readAll<ChangeRow>(
      admin,
      "enrollment_changes",
      "id, student_id, from_grade, from_class_id, from_number, to_grade, to_class_id, to_number, created_at",
      (q) =>
        scopeQuery(q, actor, { classColumn: "to_class_id" }).eq(
          "status",
          "pending",
        ),
    );
    changes.sort(
      (a, b) =>
        a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
    );

    const paged = paginate(changes, pageQuery);
    const [classes, names] = await Promise.all([
      loadClassIndex(admin, actor.tenantId),
      loadProfileNames(
        admin,
        paged.items.map((c) => c.student_id),
      ),
    ]);
    const slot = (
      grade: string | null,
      classId: string | null,
      number: number | null,
    ) => {
      const cls = classId ? classes.get(classId) : undefined;
      return {
        grade,
        groupName: cls?.groupName ?? null,
        className: cls?.name ?? null,
        number,
      };
    };

    res.status(200).json({
      ...paged,
      items: paged.items.map((c) => ({
        changeId: c.id,
        studentId: c.student_id,
        studentName: displayNameFor(actor, names.get(c.student_id) ?? ""),
        from: slot(c.from_grade, c.from_class_id, c.from_number),
        to: slot(c.to_grade, c.to_class_id, c.to_number),
        gradeChanges: c.from_grade !== c.to_grade,
        createdAt: c.created_at,
      })),
    });
  },
});
