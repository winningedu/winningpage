import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearDraft, loadDraft, saveDraft } from "./diagnosisDraft";

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("diagnosisDraft", () => {
  it("저장한 답을 같은 사용자가 다시 읽는다", () => {
    saveDraft("u1", { q1: "중학생" });
    expect(loadDraft("u1")).toEqual({ q1: "중학생" });
    expect(localStorage.getItem("diagnosis-draft:u1")).not.toBeNull();
  });

  it("다른 사용자는 초안을 보지 못한다", () => {
    saveDraft("u1", { q1: "중학생" });
    expect(loadDraft("u2")).toBeNull();
  });

  it("지우면 키가 사라진다", () => {
    saveDraft("u1", { q1: "중학생" });
    clearDraft("u1");
    expect(localStorage.getItem("diagnosis-draft:u1")).toBeNull();
    expect(loadDraft("u1")).toBeNull();
  });
});
