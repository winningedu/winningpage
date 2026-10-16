// 확정 흐름 순수 함수 테스트(부록 B 4번, 개발계획 §2 21, 22).
import { describe, expect, it } from "vitest";
import type { CompleteResult } from "../growth/plan/complete.js";
import {
  mapFinalizeRpc,
  parseFinalizeBody,
  precheckFinalize,
  replyInputFor,
  replyOutcomeOf,
} from "./finalizeFlow.js";

const id = "123e4567-e89b-12d3-a456-426614174000";
const fields = {
  topic: "주제",
  concept: "개념",
  method: "방법",
  result: "결과",
  limitation: "한계",
  numbers: ["12%"],
  sources: ["통계청"],
};

describe("parseFinalizeBody", () => {
  it("sessionId 와 7항목이 맞으면 통과한다", () => {
    expect(parseFinalizeBody({ sessionId: id, fields })).toEqual({
      ok: true,
      sessionId: id,
      fields,
    });
  });

  it("sessionId 가 uuid 가 아니면 이유를 돌려준다", () => {
    const r = parseFinalizeBody({ sessionId: "x", fields });
    expect(r).toMatchObject({ ok: false });
  });

  it("비어 있는 항목은 missing 으로 알린다", () => {
    const r = parseFinalizeBody({
      sessionId: id,
      fields: { ...fields, limitation: " " },
    });
    expect(r).toMatchObject({ ok: false, missing: ["limitation"] });
  });
});

describe("precheckFinalize", () => {
  const session = {
    selectedTopicId: "t",
    designReportId: "d",
    latestEvaluationId: "e",
    status: "in_progress" as const,
  };
  it("평가가 없으면 409 STEP_ORDER", () => {
    expect(
      precheckFinalize({ ...session, latestEvaluationId: null }),
    ).toMatchObject({ ok: false, status: 409, code: "STEP_ORDER" });
  });
  it("닫힌 세션이면 409 SESSION_NOT_OPEN", () => {
    expect(precheckFinalize({ ...session, status: "archived" })).toMatchObject({
      ok: false,
      status: 409,
      code: "SESSION_NOT_OPEN",
    });
  });
  it("조건이 맞으면 통과", () => {
    expect(precheckFinalize(session)).toEqual({ ok: true });
  });
});

describe("mapFinalizeRpc", () => {
  it("completed 와 already_completed 는 성공", () => {
    for (const status of ["completed", "already_completed"]) {
      expect(
        mapFinalizeRpc({ status, activityRecordId: "a", finalReportId: "f" }),
      ).toEqual({
        ok: true,
        status,
        activityRecordId: "a",
        finalReportId: "f",
      });
    }
  });

  it("not_ready 는 409 STEP_ORDER", () => {
    expect(mapFinalizeRpc({ status: "not_ready" })).toMatchObject({
      ok: false,
      status: 409,
      code: "STEP_ORDER",
    });
  });

  it("fields_missing 은 400 INVALID_BODY 와 missing", () => {
    expect(
      mapFinalizeRpc({ status: "fields_missing", missing: ["topic"] }),
    ).toMatchObject({
      ok: false,
      status: 400,
      code: "INVALID_BODY",
      extra: { missing: ["topic"] },
    });
  });

  it("session_not_found 는 404 SESSION_NOT_FOUND", () => {
    expect(mapFinalizeRpc({ status: "session_not_found" })).toMatchObject({
      ok: false,
      status: 404,
      code: "SESSION_NOT_FOUND",
    });
  });

  it("알 수 없는 반환은 던진다", () => {
    expect(() => mapFinalizeRpc({ status: "???" })).toThrow();
    expect(() => mapFinalizeRpc(null)).toThrow();
  });
});

describe("replyInputFor", () => {
  it("과제가 없으면 null", () => {
    expect(replyInputFor(null, "a")).toBeNull();
  });
  it("있으면 deep 프로그램 회신 입력", () => {
    expect(replyInputFor("item", "a")).toEqual({
      itemId: "item",
      program: "deep",
      refId: "a",
    });
  });
  it("활동 기록 id 가 없으면 보낼 수 없어 null", () => {
    expect(replyInputFor("item", null)).toBeNull();
  });
});

describe("replyOutcomeOf", () => {
  const ok = { ok: true, changed: true, item: {} } as CompleteResult;
  const bad = { ok: false, code: "CONFLICT", message: "x" } as CompleteResult;
  it("성공이면 replySent true, 보류 해제", () => {
    expect(replyOutcomeOf(ok)).toEqual({
      replySent: true,
      replyPending: false,
    });
  });
  it("실패면 replySent false, 보류 설정", () => {
    expect(replyOutcomeOf(bad)).toEqual({
      replySent: false,
      replyPending: true,
    });
  });
});
