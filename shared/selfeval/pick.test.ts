import { describe, expect, test } from "vitest";
import { pickBody } from "./pick.js";

const manual = {
  activityName: " 로봇 제작 ",
  subjectOrArea: "물리학",
  gradeLabel: "고2",
  semester: 1,
  motive: "m",
  concept: "c",
  action: "a",
  method: "me",
  result: "r",
  role: "ro",
  limitation: "l",
  next: "n",
};

const parse = (body: unknown) => pickBody.safeParse(body);

describe("pickBody", () => {
  test("list 와 link 는 sessionId 만 받는다", () => {
    expect(parse({ sessionId: "s1", action: "list" }).data).toEqual({
      sessionId: "s1",
      action: "list",
    });
    expect(parse({ sessionId: "s1", action: "link" }).success).toBe(true);
  });

  test("sessionId 가 없거나 비었거나 모르는 action 이면 거절한다", () => {
    expect(parse({ action: "list" }).success).toBe(false);
    expect(parse({ sessionId: "", action: "list" }).success).toBe(false);
    expect(parse({ sessionId: "s", action: "x" }).success).toBe(false);
    expect(parse(null).success).toBe(false);
  });

  test("select 는 coreId 문자열과 supportIds 문자열 배열이 필요하다", () => {
    expect(
      parse({
        sessionId: "s",
        action: "select",
        coreId: "a",
        supportIds: ["b"],
      }).data,
    ).toEqual({
      sessionId: "s",
      action: "select",
      coreId: "a",
      supportIds: ["b"],
    });
    expect(
      parse({ sessionId: "s", action: "select", coreId: 1, supportIds: [] })
        .success,
    ).toBe(false);
    expect(
      parse({ sessionId: "s", action: "select", coreId: "a", supportIds: [1] })
        .success,
    ).toBe(false);
  });

  test("select 에서 supportIds 를 생략하면 빈 배열이다", () => {
    const r = parse({ sessionId: "s", action: "select", coreId: "a" });
    expect(r.data).toMatchObject({ supportIds: [] });
  });

  test("manual 은 입력을 그대로 두고, 비운 항목은 빈 문자열로 옮긴다", () => {
    const r = parse({
      sessionId: "s",
      action: "manual",
      input: { ...manual, motive: null, next: undefined },
    });
    expect(r.data).toMatchObject({
      input: { activityName: " 로봇 제작 ", motive: "", next: "" },
    });
  });

  test("manual 의 학년, 학기가 잘못되면 거절하고 생략하면 null 이다", () => {
    expect(
      parse({
        sessionId: "s",
        action: "manual",
        input: { ...manual, gradeLabel: "고9" },
      }).success,
    ).toBe(false);
    expect(
      parse({
        sessionId: "s",
        action: "manual",
        input: { ...manual, semester: 3 },
      }).success,
    ).toBe(false);
    const r = parse({
      sessionId: "s",
      action: "manual",
      input: { ...manual, gradeLabel: undefined, semester: undefined },
    });
    expect(r.data).toMatchObject({
      input: { gradeLabel: null, semester: null },
    });
  });

  test("manual 의 텍스트 항목이 문자열이 아니면 거절한다", () => {
    expect(
      parse({
        sessionId: "s",
        action: "manual",
        input: { ...manual, result: 5 },
      }).success,
    ).toBe(false);
    expect(parse({ sessionId: "s", action: "manual" }).success).toBe(false);
  });

  test("delete-link, confirm-link 는 비지 않은 fromId 와 toId 가 필요하다", () => {
    for (const action of ["delete-link", "confirm-link"]) {
      expect(
        parse({ sessionId: "s", action, fromId: "a", toId: "b" }).success,
      ).toBe(true);
      expect(parse({ sessionId: "s", action, fromId: "a" }).success).toBe(
        false,
      );
      expect(
        parse({ sessionId: "s", action, fromId: "", toId: "b" }).success,
      ).toBe(false);
    }
  });

  test("add-link 는 type 이 비지 않아야 하고 note 는 문자열이면 된다", () => {
    const base = { sessionId: "s", action: "add-link", fromId: "a", toId: "b" };
    expect(parse({ ...base, type: "deepen", note: "" }).success).toBe(true);
    expect(parse({ ...base, type: "", note: "x" }).success).toBe(false);
    expect(parse({ ...base, type: "deepen" }).success).toBe(false);
  });
});

describe("pickBody 연계 action", () => {
  const base = { sessionId: "s1" };

  test("link, delete-link, confirm-link, add-link 를 받는다", () => {
    expect(parse({ ...base, action: "link" }).data).toEqual({
      sessionId: "s1",
      action: "link",
    });
    for (const action of ["delete-link", "confirm-link"]) {
      expect(parse({ ...base, action, fromId: "a", toId: "b" }).data).toEqual({
        sessionId: "s1",
        action,
        fromId: "a",
        toId: "b",
      });
    }
    const addLink = {
      ...base,
      action: "add-link",
      fromId: "a",
      toId: "b",
      type: "deepen",
      note: "이어서 했어요",
    };
    expect(parse(addLink).data).toEqual(addLink);
  });

  test("id, type, note 가 없거나 문자열이 아니면 거절한다", () => {
    for (const bad of [
      { action: "delete-link", fromId: "a" },
      { action: "confirm-link", fromId: 1, toId: "b" },
      { action: "add-link", fromId: "a", toId: "b", type: "deepen" },
      { action: "add-link", fromId: "a", toId: "b", note: "x" },
      { action: "add-link", fromId: "", toId: "b", type: "deepen", note: "x" },
    ]) {
      expect(parse({ ...base, ...bad }).success).toBe(false);
    }
  });
});
