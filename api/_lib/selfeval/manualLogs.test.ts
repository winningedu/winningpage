import { describe, expect, test } from "vitest";
import {
  academicYearWindow,
  detectRecordBook,
  isInAcademicYear,
  MEMO_MAX_CHARS,
  needsNameNotice,
  parseExtraction,
  RECORD_BOOK_WORDS,
  splitMemoText,
} from "./manualLogs.js";

describe("academicYearWindow", () => {
  test("학년도는 3월 1일부터 다음 해 2월 말일까지다", () => {
    expect(academicYearWindow(2026)).toEqual({
      start: "2026-03-01",
      end: "2027-02-28",
    });
  });

  test("다음 해가 윤년이면 2월 29일까지다", () => {
    expect(academicYearWindow(2027).end).toBe("2028-02-29");
  });
});

describe("isInAcademicYear", () => {
  test("경계일은 안, 하루 밖은 밖이다", () => {
    expect(isInAcademicYear("2026-03-01", 2026)).toBe(true);
    expect(isInAcademicYear("2027-02-28", 2026)).toBe(true);
    expect(isInAcademicYear("2026-02-28", 2026)).toBe(false);
    expect(isInAcademicYear("2027-03-01", 2026)).toBe(false);
  });
});

describe("detectRecordBook", () => {
  test("명세 예시 두 낱말은 상수에 그대로 있다", () => {
    expect(RECORD_BOOK_WORDS).toContain("세부능력 및 특기사항");
    expect(RECORD_BOOK_WORDS).toContain("행동특성 및 종합의견");
  });

  test("양식 낱말이 있으면 그 낱말을 돌려준다", () => {
    expect(detectRecordBook("2학년 행동특성 및 종합의견 성실함")).toBe(
      "행동특성 및 종합의견",
    );
  });

  test("공백이 달라도 잡는다", () => {
    expect(detectRecordBook("세부능력및특기사항")).toBe("세부능력 및 특기사항");
  });

  test("일반 메모는 null 이다", () => {
    expect(detectRecordBook("오늘 실험에서 pH를 쟀다")).toBeNull();
  });
});

describe("splitMemoText", () => {
  test("300자 이하면 그대로 한 건이다", () => {
    expect(splitMemoText("짧은 글")).toEqual(["짧은 글"]);
  });

  test("길면 문장 끝에서 나누고 내용을 잃지 않는다", () => {
    const sentence = `${"가".repeat(100)}. `;
    const text = sentence.repeat(7).trim();
    const parts = splitMemoText(text);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(MEMO_MAX_CHARS);
    expect(parts.join(" ").replace(/\s+/g, "")).toBe(text.replace(/\s+/g, ""));
  });

  test("문장 끝이 없어도 글자 수로 자르되 내용을 잃지 않는다", () => {
    const text = "나".repeat(650);
    const parts = splitMemoText(text);
    expect(parts.map((p) => p.length)).toEqual([300, 300, 50]);
    expect(parts.join("")).toBe(text);
  });

  test("빈 글은 빈 배열이다", () => {
    expect(splitMemoText("  \n ")).toEqual([]);
  });
});

describe("parseExtraction", () => {
  test("모델 JSON 을 메모와 사람 이름 표시로 바꾼다", () => {
    const raw = JSON.stringify({
      contains_person_name: true,
      memos: [
        { written_at: "2026-04-03", text: "실험을 했다" },
        { written_at: null, text: "날짜 없는 글" },
      ],
    });
    expect(parseExtraction(raw)).toEqual({
      ok: true,
      containsPersonName: true,
      memos: [
        { writtenAt: "2026-04-03", text: "실험을 했다" },
        { writtenAt: null, text: "날짜 없는 글" },
      ],
    });
  });

  test("코드 펜스가 붙어도 읽는다", () => {
    const raw =
      "```json\n" + '{"memos":[{"written_at":null,"text":"a"}]}' + "\n```";
    const r = parseExtraction(raw);
    expect(r.ok && r.memos).toEqual([{ writtenAt: null, text: "a" }]);
  });

  test("없는 날짜와 이상한 형식은 null 로 둔다", () => {
    const raw = JSON.stringify({
      memos: [
        { written_at: "2026-02-31", text: "a" },
        { written_at: "4월 3일", text: "b" },
      ],
    });
    const r = parseExtraction(raw);
    expect(r.ok && r.memos.map((m) => m.writtenAt)).toEqual([null, null]);
  });

  test("긴 메모는 나눠서 같은 날짜를 갖는다", () => {
    const raw = JSON.stringify({
      memos: [{ written_at: "2026-05-01", text: "다".repeat(310) }],
    });
    const r = parseExtraction(raw);
    expect(r.ok && r.memos).toHaveLength(2);
    expect(r.ok && r.memos.every((m) => m.writtenAt === "2026-05-01")).toBe(
      true,
    );
  });

  test("JSON 이 아니거나 메모가 없으면 실패다", () => {
    expect(parseExtraction("읽을 수 없음").ok).toBe(false);
    expect(parseExtraction('{"memos":[]}').ok).toBe(false);
  });
});

describe("needsNameNotice", () => {
  test("학교 이름이 보이면 안내한다", () => {
    expect(needsNameNotice("위닝고등학교 동아리", false)).toBe(true);
  });

  test("모델이 사람 이름을 봤다고 하면 안내한다", () => {
    expect(needsNameNotice("친구와 함께 했다", true)).toBe(true);
  });

  test("둘 다 아니면 안내하지 않는다", () => {
    expect(needsNameNotice("혼자 했다", false)).toBe(false);
  });
});
