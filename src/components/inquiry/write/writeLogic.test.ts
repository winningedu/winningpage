import { describe, expect, test } from "vitest";
import type { ApiResult } from "@/lib/inquiry/api";
import type { SubmissionSections, SubmissionView } from "@/lib/inquiry/types";
import {
  AUTOSAVE_MS,
  buildSectionRows,
  classifyEvaluate,
  EVALUATE_LINES,
  emptyMessage,
  formatSavedTime,
  initialSections,
  isDirty,
  placeholderSummary,
  precheck,
  saveStatusText,
  shouldAutosave,
  tooShortMessage,
} from "./writeLogic";

const EMPTY: SubmissionSections = {
  I: "",
  II: "",
  III: "",
  IV: "",
  V: "",
  VI: "",
  VII: "",
  VIII: "",
};
const long = (n: number) => "가".repeat(n);
const FILLED: SubmissionSections = {
  I: long(60),
  II: long(50),
  III: long(50),
  IV: long(50),
  V: long(30),
  VI: long(10),
  VII: long(10),
  VIII: "자료",
};

describe("initialSections", () => {
  test("작성본이 없으면 빈 8절", () => {
    expect(initialSections(null)).toEqual(EMPTY);
  });
  test("작성본이 있으면 그 8절", () => {
    const sub = { sections: FILLED } as SubmissionView;
    expect(initialSections(sub)).toEqual(FILLED);
  });
});

describe("buildSectionRows", () => {
  test("글자 수와 권장 분량 문구, 부족분", () => {
    const rows = buildSectionRows({ ...EMPTY, I: long(120) });
    const first = rows[0];
    expect(first).toMatchObject({
      id: "I",
      numeral: "Ⅰ",
      title: "탐구 동기",
      count: 120,
      counter: "120자 / 권장 300자 이상",
      shortage: 180,
      short: true,
    });
  });
  test("권장을 채우면 부족하지 않다", () => {
    const rows = buildSectionRows({ ...EMPTY, II: long(150) });
    expect(rows[1]).toMatchObject({ shortage: 0, short: false });
  });
  test("Ⅷ절은 분량 제한 없음이고 부족분이 없다", () => {
    const last = buildSectionRows(EMPTY)[7];
    expect(last).toMatchObject({
      counter: "0자 / 분량 제한 없음",
      shortage: null,
      short: false,
    });
  });
  test("앞뒤 공백은 세지 않는다", () => {
    expect(buildSectionRows({ ...EMPTY, I: "  가나  " })[0]?.count).toBe(2);
  });
});

describe("isDirty, shouldAutosave", () => {
  test("저장분과 같으면 더티가 아니다", () => {
    expect(isDirty(FILLED, { ...FILLED })).toBe(false);
    expect(isDirty({ ...FILLED, I: "x" }, FILLED)).toBe(true);
  });
  test("저장분이 없을 때 모두 빈 절이면 더티가 아니다", () => {
    expect(isDirty(EMPTY, null)).toBe(false);
    expect(isDirty({ ...EMPTY, I: "가" }, null)).toBe(true);
  });
  test("더티이고 다른 요청이 없을 때만 자동 저장한다", () => {
    expect(shouldAutosave({ dirty: true, busy: false })).toBe(true);
    expect(shouldAutosave({ dirty: false, busy: false })).toBe(false);
    expect(shouldAutosave({ dirty: true, busy: true })).toBe(false);
  });
  test("자동 저장 주기는 60초", () => {
    expect(AUTOSAVE_MS).toBe(60_000);
  });
});

describe("저장 시각 문구", () => {
  test("HH:mm", () => {
    expect(formatSavedTime(new Date(2026, 9, 6, 21, 40))).toBe("21:40");
    expect(formatSavedTime(new Date(2026, 9, 6, 9, 5))).toBe("09:05");
  });
  test("아직 저장 전", () => {
    expect(saveStatusText({ savedAt: null, justSaved: false })).toBe(
      "60초마다 자동 저장돼요",
    );
  });
  test("마지막 저장 시각", () => {
    const at = new Date(2026, 9, 6, 21, 40);
    expect(saveStatusText({ savedAt: at, justSaved: false })).toBe(
      "60초마다 자동 저장돼요. 마지막 저장 21:40",
    );
  });
  test("방금 저장했으면 자동 저장됨 표시", () => {
    const at = new Date(2026, 9, 6, 21, 40);
    expect(saveStatusText({ savedAt: at, justSaved: true })).toBe(
      "자동 저장됨. 마지막 저장 21:40",
    );
  });
});

describe("precheck", () => {
  test("빈 절이 있으면 SECTION_EMPTY", () => {
    const r = precheck({ ...FILLED, III: "  ", VIII: "" });
    expect(r).toEqual({ kind: "empty", sections: ["III", "VIII"] });
    expect(emptyMessage(["III", "VIII"])).toBe(
      "Ⅲ, Ⅷ절이 비어 있어요. 8절을 모두 채워야 평가를 받을 수 있어요.",
    );
  });
  test("Ⅰ~Ⅶ 합계가 300자 미만이면 SUBMISSION_TOO_SHORT", () => {
    const r = precheck(FILLED);
    expect(r).toEqual({ kind: "tooShort", total: 260 });
  });
  test("300자 이상이면 통과", () => {
    const r = precheck({ ...FILLED, I: long(300) });
    expect(r.kind).toBe("ok");
  });
  test("자리표시자는 막지 않고 절별 개수만 알린다", () => {
    const r = precheck({
      ...FILLED,
      I: long(300),
      III: `${long(50)} [출처] [연도]`,
    });
    expect(r).toMatchObject({ kind: "ok", placeholders: { III: 2 } });
    expect(placeholderSummary({ III: 2, IV: 1 })).toBe("Ⅲ절 2곳, Ⅳ절 1곳");
  });
  test("자리표시자를 뺀 분량으로 판정한다", () => {
    const r = precheck({
      ...FILLED,
      I: `${long(60)}[${long(40)}]`,
    });
    expect(r.kind).toBe("tooShort");
  });
  test("안내 문구", () => {
    expect(tooShortMessage()).toBe(
      "Ⅰ~Ⅶ절 합계 300자 미만이라 평가를 실행하지 않았어요. 이용 횟수는 차감되지 않았어요.",
    );
  });
});

describe("classifyEvaluate", () => {
  const err = (
    code: string,
    extra?: Record<string, unknown>,
  ): ApiResult<unknown> => ({
    kind: "error",
    status: 422,
    code,
    message: "m",
    ...(extra ? { extra } : {}),
  });
  test("성공", () => {
    expect(classifyEvaluate({ kind: "ok", data: {} } as never, 0)).toEqual({
      type: "ok",
    });
  });
  test("서버 검사 코드", () => {
    expect(classifyEvaluate(err("SECTION_EMPTY"), 0).type).toBe("sectionEmpty");
    expect(classifyEvaluate(err("SUBMISSION_TOO_SHORT"), 0).type).toBe(
      "tooShort",
    );
    expect(classifyEvaluate(err("REEVALUATION_LIMIT"), 0).type).toBe(
      "reevaluationLimit",
    );
  });
  test("생성 공통 분기는 그대로", () => {
    expect(classifyEvaluate(err("GENERATION_RUNNING"), 0).type).toBe("retry");
    expect(classifyEvaluate(err("GENERATION_RUNNING"), 20).type).toBe("failed");
    expect(
      classifyEvaluate(err("GENERATION_VALIDATION_FAILED", { attempts: 3 }), 0),
    ).toMatchObject({ type: "failed", attempts: 3 });
    expect(classifyEvaluate(err("NO_ENTITLEMENT"), 0).type).toBe(
      "noEntitlement",
    );
    expect(classifyEvaluate(err("ATTEMPTS_EXHAUSTED"), 0).type).toBe(
      "terminal",
    );
  });
});

describe("진행 문구", () => {
  test("3줄", () => {
    expect(EVALUATE_LINES).toEqual([
      "설계 리포트와 작성본을 나란히 놓는 중",
      "항목마다 요건 4개를 확인하는 중",
      "먼저 고칠 것을 고르는 중",
    ]);
  });
});
