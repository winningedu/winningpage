// PATCH /api/console/classes/capacity  { items: [{ classId, capacity: 1~32767 | null }] }
//
// W7 정원 입력(사 #150). 학교 관리자와 본사 대행만. 현재 학년도 학급의 정원을 절대값으로 정한다(null 은 비움).
// 값이 같은 학급은 쓰지 않아 같은 요청을 다시 보내도 결과가 같다. 학급 하나라도 범위 밖이면 아무것도 쓰지 않고 404.
// 학급별 update 는 따로 커밋되므로 중간에 실패하면 일부만 반영될 수 있다. 그때는 저장된 학급의 접근 로그를 남긴 뒤 오류를 돌려주고(결정 67),
// 절대값이라 같은 요청을 다시 보내 마무리한다. 접근 로그는 변경 뒤에 쓴다(결정 18).

import { writeConsoleAuditLog } from "../../_lib/console/audit.js";
import { loadTenant, readAll } from "../../_lib/console/directory.js";
import { defineHandler } from "../../_lib/handler.js";
import { sendError } from "../../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

const MAX_ITEMS = 500;
const MAX_CAPACITY = 32767;

interface Item {
  classId: string;
  capacity: number | null;
}

function parseItems(body: unknown): Item[] | null {
  const raw = (body as { items?: unknown } | null)?.items;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_ITEMS) {
    return null;
  }
  const items: Item[] = [];
  for (const entry of raw) {
    const { classId, capacity } = (entry ?? {}) as Record<string, unknown>;
    if (typeof classId !== "string" || classId === "") return null;
    if (capacity !== null) {
      if (
        typeof capacity !== "number" ||
        !Number.isInteger(capacity) ||
        capacity < 1 ||
        capacity > MAX_CAPACITY
      ) {
        return null;
      }
    }
    items.push({ classId, capacity });
  }
  return new Set(items.map((i) => i.classId)).size === items.length
    ? items
    : null;
}

export default defineHandler({
  methods: ["PATCH"],
  auth: "console",
  consoleRole: "schoolAdmin",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "정원을 저장하지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[console/classes/capacity]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const actor = ctx.console;
    if (!actor) throw new Error("console actor missing");
    const admin = ctx.supabaseAdmin;

    const items = parseItems(req.body);
    if (!items) {
      sendError(res, "coded", 400, "입력 값을 확인해 주세요.", "BAD_REQUEST");
      return;
    }

    const { schoolYear } = await loadTenant(admin, actor.tenantId);
    const current = new Map(
      (
        await readAll<{ id: string; capacity: number | null }>(
          admin,
          "classes",
          "id, capacity",
          (q) =>
            q.eq("tenant_id", actor.tenantId).eq("school_year", schoolYear),
        )
      ).map((c) => [c.id, c.capacity]),
    );
    if (items.some((i) => !current.has(i.classId))) {
      sendError(res, "coded", 404, "대상을 찾을 수 없습니다.", "NOT_FOUND");
      return;
    }

    const changed = items.filter((i) => current.get(i.classId) !== i.capacity);
    const saved: Item[] = [];
    let failure: Error | null = null;
    for (const item of changed) {
      const { error } = await admin
        .from("classes")
        .update({ capacity: item.capacity })
        .eq("id", item.classId)
        .eq("tenant_id", actor.tenantId);
      if (error) {
        failure = new Error("class capacity update failed");
        break;
      }
      saved.push(item);
    }
    // 일부만 저장돼도 저장된 학급은 기록을 남긴 뒤 오류를 돌려준다(결정 67). 다시 보내면 나머지가 들어간다.
    if (saved.length > 0) {
      await writeConsoleAuditLog(
        { ...ctx, console: actor },
        {
          action: "update",
          resourceKey: "classCapacity",
          rowCount: saved.length,
          meta: { items: saved },
        },
      );
    }
    if (failure) throw failure;
    res.status(200).json({ ok: true, updated: saved.length });
  },
});
