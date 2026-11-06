// GET /api/console/teachers/connect-preview?name=&grade=&groupId=&className=&number=
//
// 학생 가입 연결 미리보기(W14, 교 #119, 결정 6). 학생 한 명의 이름, 학년, 그룹, 반, 번호로 가입 결과를 시험한다.
// 결과 세 가지: already_signed_up(같은 반에 같은 이름), number_taken(그 번호를 다른 학생이 씀, 가린 이름을 함께),
// ok(정상 연결). 가입 화면에 없는 학급이면 no_class. 담임 이름을 함께 준다. 읽기만 한다.
// 권한: 학교 관리자 또는 본사 대행. 다른 학생 이름은 가려서 보낸다(결정 8, 30).

import {
  loadHomeroomName,
  loadProfileNames,
  loadTenant,
  readAll,
} from "../../_lib/console/directory.js";
import { maskName } from "../../_lib/console/maskName.js";
import { normalizeClassName } from "../../_lib/console/teacherImport.js";
import { defineHandler } from "../../_lib/handler.js";
import { sendError } from "../../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

function first(raw: string | string[] | undefined): string {
  return (Array.isArray(raw) ? raw[0] : raw) ?? "";
}

export default defineHandler({
  methods: ["GET"],
  auth: "console",
  consoleRole: "schoolAdmin",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "연결 미리보기를 만들지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[console/teachers/connect-preview]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const actor = ctx.console;
    if (!actor) throw new Error("console actor missing");
    const admin = ctx.supabaseAdmin;

    const name = first(req.query.name).trim();
    const grade = first(req.query.grade);
    const groupId = first(req.query.groupId);
    const rawNumber = first(req.query.number);
    const { schoolYear, orgType } = await loadTenant(admin, actor.tenantId);
    const className = normalizeClassName(
      orgType ?? "",
      first(req.query.className).trim(),
    );
    const number = /^[1-9]\d?$/.test(rawNumber) ? Number(rawNumber) : null;
    if (name === "" || grade === "" || className === "" || number === null) {
      sendError(
        res,
        "coded",
        400,
        "이름, 학년, 반, 번호를 확인해 주세요.",
        "BAD_REQUEST",
      );
      return;
    }

    const classes = await readAll<{
      id: string;
      group_id: string | null;
      name: string;
    }>(admin, "classes", "id, group_id, name", (q) =>
      q
        .eq("tenant_id", actor.tenantId)
        .eq("school_year", schoolYear)
        .eq("grade", grade),
    );
    const cls = classes.find(
      (c) =>
        c.name.toLowerCase() === className.toLowerCase() &&
        (c.group_id ?? "") === groupId,
    );
    if (!cls) {
      res.status(200).json({ result: "no_class" });
      return;
    }

    const [homeroomName, enrollments] = await Promise.all([
      loadHomeroomName(admin, actor.tenantId, cls.id),
      readAll<{ student_id: string; number: number | null }>(
        admin,
        "student_enrollments",
        "student_id, number",
        (q) =>
          q
            .eq("tenant_id", actor.tenantId)
            .eq("school_year", schoolYear)
            .eq("status", "active")
            .eq("class_id", cls.id),
      ),
    ]);

    const names = await loadProfileNames(
      admin,
      enrollments.map((e) => e.student_id),
    );
    if (enrollments.some((e) => names.get(e.student_id) === name)) {
      res.status(200).json({ result: "already_signed_up", homeroomName });
      return;
    }
    const taken = enrollments.find((e) => e.number === number);
    if (taken) {
      res.status(200).json({
        result: "number_taken",
        homeroomName,
        holderName: maskName(names.get(taken.student_id) ?? ""),
      });
      return;
    }
    res.status(200).json({ result: "ok", homeroomName });
  },
});
