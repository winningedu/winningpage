// 하위 프로그램 확정 수신(명세 No.161). 송신측인 심화탐구(deep)와 자기평가서(self)가
// 산출물을 확정할 때 이 함수를 부른다. 두 송신측은 아직 이 함수를 부르지 않는다(후속 단계에서 연결).
//
// 중복 확정 규칙(decideMutation 의 program-done 판정):
//   - 항목의 program 과 입력 program 이 다르면 PROGRAM_MISMATCH 로 거절한다.
//   - 이미 완료된 항목에 같은 refId 가 다시 오면 변경 없이 성공(reason duplicate_confirm).
//   - 이미 완료된 항목에 다른 refId 나 수동 완료가 있으면 먼저 확정된 것을 유지하고
//     변경 없이 성공(reason already_done).
//   - 낙관적 잠금에서 경쟁에 지면 CONFLICT 를 돌려 호출측이 다시 부르게 한다.

import type { Db } from "../intake/collectDb.js";
import { decideMutation } from "./mutations.js";
import { loadPlanItem, updatePlanItem } from "./planDb.js";
import type { PlanItemRow } from "./types.js";

export type CompleteInput = {
  itemId: string;
  program: "self" | "deep";
  refId: string;
  nowIso?: string;
};

export type CompleteResult =
  | { ok: true; changed: boolean; reason?: string; item: PlanItemRow }
  | {
      ok: false;
      code: "ITEM_NOT_FOUND" | "PROGRAM_MISMATCH" | "CONFLICT";
      message: string;
    };

export async function completePlanItemFromProgram(
  db: Db,
  userId: string,
  input: CompleteInput,
): Promise<CompleteResult> {
  const item = await loadPlanItem(db, userId, input.itemId);
  if (!item) {
    return {
      ok: false,
      code: "ITEM_NOT_FOUND",
      message: "실행계획 항목을 찾을 수 없어요.",
    };
  }
  const decision = decideMutation(
    item,
    {
      action: "program-done",
      itemId: input.itemId,
      program: input.program,
      refId: input.refId,
    },
    input.nowIso ?? new Date().toISOString(),
  );
  if (decision.kind === "reject") {
    return { ok: false, code: "PROGRAM_MISMATCH", message: decision.message };
  }
  if (decision.kind === "noop") {
    return { ok: true, changed: false, reason: decision.reason, item };
  }
  const updated = await updatePlanItem(
    db,
    userId,
    input.itemId,
    decision.patch,
    item.updated_at,
  );
  if (!updated) {
    return {
      ok: false,
      code: "CONFLICT",
      message: "다른 요청이 먼저 바꿨어요. 다시 불러와 주세요.",
    };
  }
  return { ok: true, changed: true, item: updated };
}
