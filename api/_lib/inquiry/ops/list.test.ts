import { describe, expect, it } from "vitest";
import { escapeIlike, parseListQuery, toSessionListItem } from "./list.js";

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

describe("toSessionListItem", () => {
  const terminal = {
    reason: "시도 상한 초과",
    at: "2026-10-02T00:00:00Z",
    mode: "design_report",
  };
  const row = {
    id: "s1",
    profile_id: "p1",
    status: "archived",
    current_step: 3,
    subject: "물리",
    selected_topic_id: "t1",
    completed_at: null,
    last_activity_at: "2026-10-01T00:00:00Z",
    ledger_id: "l1",
    ledger_reversed_at: "2026-10-02T00:00:00Z",
    generation_state: {
      modes: {
        design_report: {
          status: "failed",
          attempts: 3,
          issues: ["x"],
        },
      },
      terminal,
    },
    evaluation_count: 1,
    topic_round_count: 2,
  };

  it("프로필, 선택 주제 제목과 합쳐 응답 모양으로 바꾼다", () => {
    const item = toSessionListItem(
      row,
      { name: "김위닝", email: "a@b.c" },
      "빛의 간섭",
    );
    expect(item).toMatchObject({
      id: "s1",
      profileId: "p1",
      studentName: "김위닝",
      email: "a@b.c",
      status: "archived",
      currentStep: 3,
      subject: "물리",
      topicTitle: "빛의 간섭",
      completedAt: null,
      lastActivityAt: "2026-10-01T00:00:00Z",
      ledgerId: "l1",
      ledgerReversedAt: "2026-10-02T00:00:00Z",
      terminal,
      evaluationCount: 1,
      topicRoundCount: 2,
    });
  });

  it("생성 상태는 3개 mode 를 모두 담는다", () => {
    const item = toSessionListItem(row, undefined, null);
    expect(Object.keys(item.generation.modes)).toEqual([
      "topic_recommendation",
      "design_report",
      "evaluation_report",
    ]);
    expect(item.generation.modes.design_report).toMatchObject({
      status: "failed",
      attempts: 3,
      issues: ["x"],
    });
    expect(item.generation.modes.topic_recommendation.status).toBe("pending");
  });

  it("프로필과 주제가 없으면 null, 종결 정보가 없으면 terminal 은 null 이다", () => {
    const item = toSessionListItem(
      { ...row, generation_state: {} },
      undefined,
      null,
    );
    expect(item.studentName).toBeNull();
    expect(item.email).toBeNull();
    expect(item.topicTitle).toBeNull();
    expect(item.terminal).toBeNull();
  });
});
