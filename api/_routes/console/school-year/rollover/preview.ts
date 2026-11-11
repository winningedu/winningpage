// POST /api/console/school-year/rollover/preview  { toYear, text }
//
// 학년도 넘기기(W11 ③)의 미리보기. 붙여넣은 명단(탭 또는 쉼표, 이름, 기존 학년그룹, 그룹, 반, 번호, 새 학년그룹, 그룹,
// 반, 번호)을 현재 재학생과 맞춰 줄마다 결과를 돌려준다. 아무것도 쓰지 않는다. 학교 관리자와 본사 대행만.
// applyRows 는 화면이 그대로 POST /rollover 에 넘기는 줄이고, 이름은 서버에서 가려 준다(동명은 끝에 별표).
// toYear 는 기관의 다음 학년도여야 한다(롤오버 RPC 가 한 해씩만 올린다).

import {
  loadClassIndex,
  loadHomeroomClassIds,
  loadProfileNames,
  loadTenant,
  readAll,
} from "../../../../_lib/console/directory.js";
import {
  evaluateRolloverPreview,
  type PreviewStudent,
  parseRolloverText,
} from "../../../../_lib/console/rolloverPreview.js";
import { defineHandler } from "../../../../_lib/handler.js";
import { sendError } from "../../../../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

const MAX_ROWS = 3000;

export default defineHandler({
  methods: ["POST"],
  auth: "console",
  consoleRole: "schoolAdmin",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "미리보기를 만들지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[console/school-year/rollover/preview]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const actor = ctx.console;
    if (!actor) throw new Error("console actor missing");
    const admin = ctx.supabaseAdmin;

    const { toYear, text } = (req.body ?? {}) as Record<string, unknown>;
    const lines = typeof text === "string" ? parseRolloverText(text) : [];
    if (
      !Number.isInteger(toYear) ||
      lines.length === 0 ||
      lines.length > MAX_ROWS
    ) {
      sendError(res, "coded", 400, "입력 값을 확인해 주세요.", "BAD_REQUEST");
      return;
    }

    const { schoolYear, orgType } = await loadTenant(admin, actor.tenantId);
    if (toYear !== schoolYear + 1) {
      sendError(res, "coded", 400, "입력 값을 확인해 주세요.", "BAD_REQUEST");
      return;
    }

    const [enrollments, classes, groups, homerooms] = await Promise.all([
      readAll<{
        student_id: string;
        grade: string | null;
        class_id: string | null;
        number: number | null;
      }>(
        admin,
        "student_enrollments",
        "student_id, grade, class_id, number",
        (q) =>
          q
            .eq("tenant_id", actor.tenantId)
            .eq("school_year", schoolYear)
            .eq("status", "active"),
      ),
      loadClassIndex(admin, actor.tenantId),
      readAll<{ id: string; name: string; deleted_at: string | null }>(
        admin,
        "class_groups",
        "id, name, deleted_at",
        (q) => q.eq("tenant_id", actor.tenantId),
      ),
      loadHomeroomClassIds(admin, actor.tenantId),
    ]);
    const names = await loadProfileNames(
      admin,
      enrollments.map((e) => e.student_id),
    );

    const students: PreviewStudent[] = enrollments.map((e) => {
      const cls = e.class_id ? classes.get(e.class_id) : undefined;
      return {
        studentId: e.student_id,
        name: names.get(e.student_id) ?? "",
        grade: e.grade,
        groupName: cls?.groupName ?? null,
        className: cls?.name ?? null,
        number: e.number,
      };
    });
    const homeroomClasses = new Set(
      [...classes.values()]
        .filter((c) => c.schoolYear === toYear && homerooms.has(c.id))
        .map((c) => `${c.grade}|${c.groupId ?? ""}|${c.name}`),
    );

    res.status(200).json(
      evaluateRolloverPreview({
        lines,
        students,
        orgType,
        graduatingGrades: orgType === "학교" ? ["중3", "고3"] : ["고3"],
        groups: new Map(
          groups
            .filter((g) => g.deleted_at === null)
            .map((g) => [g.name.toLowerCase(), { id: g.id, name: g.name }]),
        ),
        homeroomClasses,
      }),
    );
  },
});
