import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadDraft, saveDraft } from "./diagnosisDraft";

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
});
