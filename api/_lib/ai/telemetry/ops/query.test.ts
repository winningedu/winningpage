import { describe, expect, it } from "vitest";
import {
  parseCallsQuery,
  parseRange,
  parseServiceFilter,
  parseView,
} from "./query.js";

// 2026-10-07 02:00 KST 는 UTC 로 10-06 17:00 이다. KST 날짜 기준 동작을 확인한다.
const NOW = new Date("2026-10-06T17:00:00Z");

describe("parseRange", () => {
  it("기본값은 오늘(KST)까지 30일이며 to 는 다음 날 KST 0시", () => {
    const r = parseRange({}, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.from.toISOString()).toBe("2026-09-07T15:00:00.000Z");
    expect(r.to.toISOString()).toBe("2026-10-07T15:00:00.000Z");
  });

  it("from, to 를 KST 날짜로 해석한다", () => {
    const r = parseRange({ from: "2026-10-01", to: "2026-10-03" }, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.from.toISOString()).toBe("2026-09-30T15:00:00.000Z");
    expect(r.to.toISOString()).toBe("2026-10-03T15:00:00.000Z");
  });

  it("같은 날짜는 하루 구간", () => {
    const r = parseRange({ from: "2026-10-01", to: "2026-10-01" }, NOW);
    expect(r.ok).toBe(true);
  });

  it.each([
    ["형식 오류", { from: "2026/10/01" }],
    ["존재하지 않는 날짜", { to: "2026-02-30" }],
    ["from 이 to 보다 뒤", { from: "2026-10-05", to: "2026-10-01" }],
    ["366일 초과", { from: "2025-10-01", to: "2026-10-02" }],
  ])("거부: %s", (_n, q) => {
    const r = parseRange(q, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.length).toBeGreaterThan(0);
  });

  it("366일은 허용한다", () => {
    expect(parseRange({ from: "2025-10-01", to: "2026-10-01" }, NOW).ok).toBe(
      true,
    );
  });
});

describe("parseServiceFilter", () => {
  it("허용 서비스와 빈 값", () => {
    expect(parseServiceFilter("growth")).toEqual({
      ok: true,
      service: "growth",
    });
    expect(parseServiceFilter(undefined)).toEqual({ ok: true, service: null });
    expect(parseServiceFilter("")).toEqual({ ok: true, service: null });
  });
  it("그 외는 거부", () => {
    expect(parseServiceFilter("billing").ok).toBe(false);
  });
});

describe("parseView", () => {
  it("기본은 summary", () => {
    expect(parseView(undefined)).toBe("summary");
    expect(parseView("calls")).toBe("calls");
    expect(parseView("citations")).toBe("citations");
    expect(parseView("pricing")).toBe("pricing");
  });
  it("알 수 없는 값은 null", () => {
    expect(parseView("x")).toBeNull();
  });
});

describe("parseCallsQuery", () => {
  it("기본값", () => {
    const r = parseCallsQuery({}, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.query).toMatchObject({
      service: null,
      feature: null,
      status: null,
      retried: false,
      kind: null,
      page: 1,
      pageSize: 20,
    });
  });

  it("필터를 해석한다", () => {
    const r = parseCallsQuery(
      {
        service: "inquiry",
        feature: "report",
        status: "error",
        retried: "1",
        kind: "embed",
        page: "3",
        pageSize: "100",
      },
      NOW,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.query).toMatchObject({
      service: "inquiry",
      feature: "report",
      status: "error",
      retried: true,
      kind: "embed",
      page: 3,
      pageSize: 100,
    });
  });

  it.each([
    ["status", { status: "bad" }],
    ["kind", { kind: "bad" }],
    ["page 0", { page: "0" }],
    ["page 소수", { page: "1.5" }],
    ["pageSize 0", { pageSize: "0" }],
    ["pageSize 101", { pageSize: "101" }],
    ["feature 65자", { feature: "x".repeat(65) }],
    ["service", { service: "nope" }],
    ["range", { from: "bad" }],
  ])("거부: %s", (_n, q) => {
    expect(parseCallsQuery(q, NOW).ok).toBe(false);
  });
});
