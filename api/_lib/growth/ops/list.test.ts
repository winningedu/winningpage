import { describe, expect, it } from "vitest";
import { escapeIlike, parseListQuery, toReportListItem } from "./list.js";

describe("parseListQuery", () => {
  it("값이 없으면 page 1, pageSize 20, 필터 없음", () => {
    expect(parseListQuery({})).toEqual({
      ok: true,
      query: { status: null, q: null, page: 1, pageSize: 20 },
    });
  });

  it("pageSize 는 100 으로 자른다", () => {
    const r = parseListQuery({ pageSize: "500" });
    expect(r.ok && r.query.pageSize).toBe(100);
  });

  it("page, pageSize 가 숫자가 아니거나 1 미만이면 거부한다", () => {
    expect(parseListQuery({ page: "0" }).ok).toBe(false);
    expect(parseListQuery({ page: "abc" }).ok).toBe(false);
    expect(parseListQuery({ pageSize: "-3" }).ok).toBe(false);
    expect(parseListQuery({ page: "1.5" }).ok).toBe(false);
  });

  it("status 는 허용 값만 받고 빈 문자열은 필터 없음이다", () => {
    const ok = parseListQuery({ status: "archived" });
    expect(ok.ok && ok.query.status).toBe("archived");
    const empty = parseListQuery({ status: "" });
    expect(empty.ok && empty.query.status).toBeNull();
    expect(parseListQuery({ status: "deleted" }).ok).toBe(false);
  });

  it("q 는 공백을 다듬고 빈 값이면 null 이다", () => {
    const a = parseListQuery({ q: "  김위닝 " });
    expect(a.ok && a.query.q).toBe("김위닝");
    const b = parseListQuery({ q: "   " });
    expect(b.ok && b.query.q).toBeNull();
  });

  it("배열로 들어온 값은 첫 값을 쓴다", () => {
    const r = parseListQuery({ page: ["2", "3"] });
    expect(r.ok && r.query.page).toBe(2);
  });
});

describe("escapeIlike", () => {
  it("와일드카드와 이스케이프 문자를 이스케이프한다", () => {
    expect(escapeIlike("a%b_c\\d")).toBe("a\\%b\\_c\\\\d");
  });

  it("필터 구문을 깨는 쉼표와 괄호는 지운다", () => {
    expect(escapeIlike("a,b(c)")).toBe("abc");
  });
});

describe("toReportListItem", () => {
  const row = {
    id: "r1",
    profile_id: "p1",
    status: "archived",
    current_step: 3,
    track: "고2",
    issued_at: null,
    last_activity_at: "2026-10-01T00:00:00Z",
    ledger_id: "l1",
    ledger_reversed_at: "2026-10-02T00:00:00Z",
    step_state: {
      steps: { 1: { status: "ok", attempts: 1 } },
      terminal: {
        reason: "3단계 시도 상한 초과",
        at: "2026-10-02T00:00:00Z",
        step: 3,
      },
    },
  };

  it("프로필과 합쳐 응답 모양으로 바꾼다", () => {
    const item = toReportListItem(row, { name: "김위닝", email: "a@b.c" });
    expect(item).toMatchObject({
      id: "r1",
      profileId: "p1",
      studentName: "김위닝",
      email: "a@b.c",
      status: "archived",
      currentStep: 3,
      track: "고2",
      issuedAt: null,
      lastActivityAt: "2026-10-01T00:00:00Z",
      ledgerId: "l1",
      ledgerReversedAt: "2026-10-02T00:00:00Z",
      terminal: {
        reason: "3단계 시도 상한 초과",
        at: "2026-10-02T00:00:00Z",
        step: 3,
      },
    });
    expect(item.progress).toHaveLength(8);
    expect(item.progress[0]).toMatchObject({ step: 1, status: "ok" });
  });

  it("프로필이 없으면 이름과 이메일은 null, 종결 정보가 없으면 terminal 은 null 이다", () => {
    const item = toReportListItem({ ...row, step_state: {} }, undefined);
    expect(item.studentName).toBeNull();
    expect(item.email).toBeNull();
    expect(item.terminal).toBeNull();
  });
});
