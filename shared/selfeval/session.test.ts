// 자기평가서 세션 계약: 서버가 검증하는 요청 스키마(생성, 수정, 파기)와 기본 입력 재검증.

import { describe, expect, test } from "vitest";
import { sessionBasicsSchema, sessionBody } from "./session.js";

const valid = {
  academicYear: 2026,
  gradeLabel: "고2",
  semester: 1,
  area: "subject",
  subject: " 생명과학 ",
  activityName: null,
  schoolPrompt: " 탐구 과정을 쓰시오 ",
  teacherNote: "",
  targetChars: 500,
  targetCharsMode: "with_space",
  career: { career: "의사", department: null, universities: ["가대"] },
  growthApplied: true,
  planItemId: null,
};

const create = (over: Record<string, unknown> = {}) =>
  sessionBody.safeParse({ action: "create", ...valid, ...over });

const messages = (result: { error?: { issues: { message: string }[] } }) =>
  result.error?.issues.map((issue) => issue.message) ?? [];

describe("create", () => {
  test("정상 바디를 trim 해서 돌려준다", () => {
    const r = create();
    expect(r.success).toBe(true);
    if (!r.success || r.data.action !== "create") return;
    expect(r.data.subject).toBe("생명과학");
    expect(r.data.schoolPrompt).toBe("탐구 과정을 쓰시오");
    expect(r.data.teacherNote).toBeNull();
    expect(r.data.activityName).toBeNull();
  });

  test("교과인데 과목이 없으면 거절한다", () => {
    const r = create({ subject: "  " });
    expect(r.success).toBe(false);
    expect(messages(r)).toEqual(["과목을 입력해 주세요."]);
  });

  test.each(["autonomy", "career", "club"])(
    "창체(%s)는 활동명이 비면 거절한다",
    (area) => {
      const r = create({ area, subject: null, activityName: "  " });
      expect(r.success).toBe(false);
      expect(messages(r)).toEqual(["활동명을 입력해 주세요."]);
    },
  );

  test("학교 문항이 공백이거나 생략이면 null 이다", () => {
    const blank = create({ schoolPrompt: "   " });
    expect(
      blank.success && "schoolPrompt" in blank.data && blank.data,
    ).toMatchObject({
      schoolPrompt: null,
    });
    const { schoolPrompt: _omit, ...rest } = valid;
    const omitted = sessionBody.safeParse({ action: "create", ...rest });
    expect(
      omitted.success && "schoolPrompt" in omitted.data && omitted.data,
    ).toMatchObject({
      schoolPrompt: null,
    });
  });

  test("학교 문항이 문자열도 null 도 아니면 거절한다", () => {
    expect(create({ schoolPrompt: 3 }).success).toBe(false);
  });

  test.each([99, 3001, 500.5, "500"])("목표 글자 수 %s 는 거절한다", (v) => {
    expect(create({ targetChars: v }).success).toBe(false);
  });

  test.each([null, 100, 3000])("목표 글자 수 %s 는 통과한다", (v) => {
    expect(create({ targetChars: v }).success).toBe(true);
  });

  test("희망 대학은 최대 2개 문자열이다", () => {
    const three = create({
      career: { career: null, department: null, universities: ["a", "b", "c"] },
    });
    expect(three.success).toBe(false);
    expect(messages(three)).toEqual([
      "희망 대학은 최대 2개까지 입력할 수 있어요.",
    ]);
    expect(
      create({ career: { career: null, department: null, universities: [1] } })
        .success,
    ).toBe(false);
  });

  test("희망 대학의 빈 칸은 걷어 내고 개수를 센다", () => {
    const r = create({
      career: { career: " ", department: null, universities: [" a ", "", "b"] },
    });
    expect(r.success && r.data.action === "create" && r.data.career).toEqual({
      career: null,
      department: null,
      universities: ["a", "b"],
    });
  });

  test.each([
    ["gradeLabel", "고4"],
    ["semester", 3],
    ["area", "x"],
    ["academicYear", 1999],
    ["targetCharsMode", "x"],
    ["growthApplied", "yes"],
  ])("%s 가 %s 이면 거절한다", (key, value) => {
    expect(create({ [key]: value }).success).toBe(false);
  });

  test("필수 필드를 빼면 거절한다", () => {
    const { gradeLabel: _omit, ...rest } = valid;
    expect(sessionBody.safeParse({ action: "create", ...rest }).success).toBe(
      false,
    );
  });
});

describe("update", () => {
  test("sessionId 가 없으면 거절한다", () => {
    expect(sessionBody.safeParse({ action: "update" }).success).toBe(false);
  });

  test("보낸 필드만 담는다", () => {
    const r = sessionBody.safeParse({
      action: "update",
      sessionId: "s1",
      targetChars: 800,
    });
    expect(r.success && r.data).toEqual({
      action: "update",
      sessionId: "s1",
      targetChars: 800,
    });
  });

  test("학교 문항을 비우면 null 을 담고, 보내지 않으면 담지 않는다", () => {
    const blank = sessionBody.safeParse({
      action: "update",
      sessionId: "s1",
      schoolPrompt: " ",
    });
    expect(blank.success && blank.data).toMatchObject({ schoolPrompt: null });
    const none = sessionBody.safeParse({
      action: "update",
      sessionId: "s1",
      targetChars: 800,
    });
    expect(none.success && "schoolPrompt" in none.data).toBe(false);
  });

  test("영역 규칙은 수정 바디만으로는 보지 않는다(합친 뒤에 본다)", () => {
    const r = sessionBody.safeParse({
      action: "update",
      sessionId: "s1",
      area: "club",
    });
    expect(r.success).toBe(true);
  });
});

describe("discard", () => {
  test("sessionId 가 있어야 한다", () => {
    expect(
      sessionBody.safeParse({ action: "discard", sessionId: "s1" }).success,
    ).toBe(true);
    expect(sessionBody.safeParse({ action: "discard" }).success).toBe(false);
    expect(
      sessionBody.safeParse({ action: "discard", sessionId: "" }).success,
    ).toBe(false);
  });
});

describe("action", () => {
  test("create, update, discard 가 아니면 거절한다", () => {
    expect(sessionBody.safeParse({ action: "x" }).success).toBe(false);
    expect(sessionBody.safeParse(null).success).toBe(false);
    expect(sessionBody.safeParse({}).success).toBe(false);
  });
});

describe("sessionBasicsSchema (수정할 때 합친 값을 생성과 같은 규칙으로 다시 검증)", () => {
  test("영역을 바꾸면 활동명 규칙을 다시 본다", () => {
    const merged = { ...valid, area: "club" };
    const r = sessionBasicsSchema.safeParse(merged);
    expect(r.success).toBe(false);
    expect(messages(r)).toEqual(["활동명을 입력해 주세요."]);
  });
});
