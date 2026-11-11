// GET  /api/console/memos?studentId=            학생의 메모 목록(W9 메모 패널)
// POST /api/console/memos { studentId, body, requestId }   메모 저장
//
// 열람: 담임은 담당 학급 학생의 메모를 모두(숨긴 것 제외, 최신순), 학교 관리자는 자기 메모만 본다(교 #61).
// 본사 대행은 학교 관리자처럼 같은 대행 세션에서 쓴 메모만 본다(결정 63). 열 때마다 열람 기록을 남기고(결정 66)
// 남기지 못하면 500 이다. 학생과 학부모에게는 이 라우트도 테이블도 열려 있지 않다.
// 저장: 작성자는 교사이고 본사 대행 중이면 대행 세션이다(결정 63). 같은 작성자의 같은 requestId 는 한 줄만 남는다(UNIQUE).
// 같은 내용이면 저장된 메모를 그대로 돌려주고 감사 로그는 더하지 않으며, 내용이 다르면 400 IDEMPOTENCY_KEY_MISMATCH 다. 범위 밖 학생은 404.

import { writeConsoleAuditLog } from "../../_lib/console/audit.js";
import { readAll } from "../../_lib/console/directory.js";
import { loadScopedEnrollment } from "../../_lib/console/studentScope.js";
import {
  isMemoAuthor,
  loadAuthorNames,
  MEMO_COLUMNS,
  MEMO_MAX_LENGTH,
  type MemoRow,
  memoAuthorOf,
  toMemoItem,
  UUID_RE,
} from "../../_lib/console/teacherMemos.js";
import { defineHandler } from "../../_lib/handler.js";
import { sendError } from "../../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

const first = (raw: string | string[] | undefined) =>
  Array.isArray(raw) ? raw[0] : raw;

export default defineHandler({
  methods: ["GET", "POST"],
  auth: "console",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "메모를 처리하지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[console/memos]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const actor = ctx.console;
    if (!actor) throw new Error("console actor missing");
    const admin = ctx.supabaseAdmin;
    const badRequest = () =>
      sendError(res, "coded", 400, "입력 값을 확인해 주세요.", "BAD_REQUEST");

    if (req.method === "GET") {
      const studentId = first(req.query.studentId);
      if (!studentId) return badRequest();
      if (!(await loadScopedEnrollment(admin, res, actor, studentId))) return;

      const rows = await readAll<MemoRow>(
        admin,
        "teacher_memos",
        MEMO_COLUMNS,
        (q) => q.eq("tenant_id", actor.tenantId).eq("student_id", studentId),
      );
      const visible = rows
        .filter((r) => r.hidden_at === null)
        .filter((r) => actor.kind === "homeroom" || isMemoAuthor(r, actor))
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      const names = await loadAuthorNames(
        admin,
        actor.tenantId,
        visible.map((r) => r.author_teacher_id),
      );
      await writeConsoleAuditLog(
        { ...ctx, console: actor },
        { action: "view", resourceKey: "teacherMemoList", targetId: studentId },
      );
      res
        .status(200)
        .json({ memos: visible.map((r) => toMemoItem(r, actor, names)) });
      return;
    }

    const { studentId, body, requestId } = (req.body ?? {}) as Record<
      string,
      unknown
    >;
    const text = typeof body === "string" ? body.trim() : "";
    if (
      typeof studentId !== "string" ||
      studentId === "" ||
      text === "" ||
      text.length > MEMO_MAX_LENGTH ||
      typeof requestId !== "string" ||
      !UUID_RE.test(requestId)
    ) {
      return badRequest();
    }
    const author = memoAuthorOf(actor);
    if (!author) {
      sendError(res, "coded", 403, "메모를 쓸 수 없습니다.", "FORBIDDEN");
      return;
    }
    if (!(await loadScopedEnrollment(admin, res, actor, studentId))) return;

    const { error } = await admin.from("teacher_memos").insert({
      tenant_id: actor.tenantId,
      student_id: studentId,
      [author.column]: author.id,
      body: text,
      request_id: requestId,
    });
    const replay = (error as { code?: string } | null)?.code === "23505";
    if (error && !replay) throw new Error("memo insert failed");

    const [saved] = await readAll<MemoRow>(
      admin,
      "teacher_memos",
      MEMO_COLUMNS,
      (q) =>
        q
          .eq("tenant_id", actor.tenantId)
          .eq(author.column, author.id)
          .eq("request_id", requestId),
    );
    if (!saved) throw new Error("memo read back failed");
    if (replay && (saved.student_id !== studentId || saved.body !== text)) {
      sendError(
        res,
        "coded",
        400,
        "같은 요청 번호로 다른 내용을 보냈어요.",
        "IDEMPOTENCY_KEY_MISMATCH",
      );
      return;
    }
    if (!replay) {
      await writeConsoleAuditLog(
        { ...ctx, console: actor },
        {
          action: "update",
          resourceKey: "teacherMemo",
          targetId: saved.id,
          meta: { studentId, op: "create" },
        },
      );
    }
    const names = await loadAuthorNames(admin, actor.tenantId, [
      saved.author_teacher_id,
    ]);
    res.status(200).json({ memo: toMemoItem(saved, actor, names) });
  },
});
