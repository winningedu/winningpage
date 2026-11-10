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

  it("14일이 지난 초안은 버린다", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-01T00:00:00Z"));
    saveDraft("u1", { q1: "중학생" });
    vi.setSystemTime(new Date("2026-11-14T23:59:59Z"));
    expect(loadDraft("u1")).toEqual({ q1: "중학생" });
    vi.setSystemTime(new Date("2026-11-15T00:00:01Z"));
    expect(loadDraft("u1")).toBeNull();
    expect(localStorage.getItem("diagnosis-draft:u1")).toBeNull();
  });

  it("깨진 값이나 모르는 버전은 null 이다", () => {
    localStorage.setItem("diagnosis-draft:u1", "{not json");
    expect(loadDraft("u1")).toBeNull();
    localStorage.setItem(
      "diagnosis-draft:u2",
      JSON.stringify({ v: 2, savedAt: Date.now(), answers: { q1: "x" } }),
    );
    expect(loadDraft("u2")).toBeNull();
  });

  it("저장소가 던져도 세 함수 모두 던지지 않는다", () => {
    const boom = () => {
      throw new DOMException("denied", "SecurityError");
    };
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(boom);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(boom);
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(boom);
    expect(() => saveDraft("u1", { q1: "a" })).not.toThrow();
    expect(loadDraft("u1")).toBeNull();
    expect(() => clearDraft("u1")).not.toThrow();
  });
});
