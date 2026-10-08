import { describe, expect, it } from "vitest";
import {
  performanceTraceContext,
  retryReasonOf,
  validationOf,
} from "./performanceContext.js";

describe("performanceTraceContext", () => {
  it("service 는 항상 performance 이고 세션이 있으면 대상은 세션이다", () => {
    const ctx = performanceTraceContext({
      feature: "evaluate",
      sessionId: "s-1",
      profileId: "p-1",
      promptVersion: "v3",
      step: "2",
    });
    expect(ctx).toEqual({
      service: "performance",
      feature: "evaluate",
      step: "2",
      targetKind: "performance_session",
      targetId: "s-1",
      profileId: "p-1",
      promptVersion: "v3",
    });
  });

  it("명시한 targetKind 와 targetId 가 세션보다 우선한다", () => {
    const ctx = performanceTraceContext({
      feature: "embed_one",
      sessionId: "s-1",
      targetKind: "knowledge_item",
      targetId: "k-9",
    });
    expect(ctx.targetKind).toBe("knowledge_item");
    expect(ctx.targetId).toBe("k-9");
  });

  it("세션이 없으면 대상과 나머지 선택 값은 null 이다", () => {
    expect(performanceTraceContext({ feature: "session_vectors" })).toEqual({
      service: "performance",
      feature: "session_vectors",
      step: null,
      targetKind: null,
      targetId: null,
      profileId: null,
      promptVersion: null,
    });
  });
});

describe("retryReasonOf", () => {
  it("재시도면 직전 실패 사유를, 첫 시도면 null 을 돌려준다", () => {
    expect(retryReasonOf(true, "parse-failed")).toBe("parse-failed");
    expect(retryReasonOf(false, "parse-failed")).toBeNull();
  });
});

describe("validationOf", () => {
  it("성공이면 ok 만, 실패면 사유를 issueCodes 에 담는다", () => {
    expect(validationOf(true, "")).toEqual({ validation: "ok" });
    expect(validationOf(false, "max-tokens")).toEqual({
      validation: "failed",
      issueCodes: ["max-tokens"],
    });
  });
});
