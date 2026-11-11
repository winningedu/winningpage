// 성적 관리(#35) PUT/DELETE — 회차 수정·삭제 순수 로직 검증.
//
// delete-account.test.ts와 같은 방침: 핸들러 전체(supabase I/O)는 여기서 돌리지 않고,
// 분리 가능한 순수 함수(validateEntry/findRecordIndex/replaceRecord/removeRecord)만
// 로컬에서 검증한다. 실제 저장 경로(fetchStudentRow → replaceRecord/removeRecord →
// updateStudentGrades)는 로컬 스택 QA로 확인한다.

import { describe, expect, test } from "vitest";
import {
  findRecordIndex,
  removeRecord,
  replaceRecord,
  upsertRecord,
  validateEntry,
} from "./grades.js";

// QA 행290 재설계 — 내신은 4과목 flat에서 6과목군(NAESIN_SUBJECT_KEYS)으로 확장됐다.
const naesinEntry = (overrides: Partial<Record<string, unknown>> = {}) => ({
  term: "고2 2학기 중간",
  enteredAt: "2026-09-01",
  subjects: {
    korean: 2,
    math: 3,
    english: 1,
    social_history: 2,
    science: 2,
    second_language: 2,
  },
  ...overrides,
});

// QA 행291 재설계 — 모의고사는 탐구 단일에서 탐구1・탐구2로 확장됐다(MOCK_SUBJECT_KEYS).
const mockEntry = (overrides: Partial<Record<string, unknown>> = {}) => ({
  term: "고3 6모",
  examDate: "2026-06-04",
  subjects: { korean: 80, math: 80, english: 80, tam1: 80, tam2: 80 },
  ...overrides,
});

describe("validateEntry", () => {
  test("naesin: 정상 입력은 6과목군 평균을 value로 계산한다", () => {
    const result = validateEntry(naesinEntry(), "naesin");
    expect(result.error).toBeUndefined();
    expect(result.record?.value).toBeCloseTo(2, 5);
    expect(result.record?.term).toBe("고2 2학기 중간");
  });

  test("mock: 정상 입력은 5과목(탐구1・탐구2 포함) 평균을 value로 계산한다", () => {
    const result = validateEntry(mockEntry(), "mock");
    expect(result.error).toBeUndefined();
    expect(result.record?.value).toBeCloseTo(80, 5);
  });

  test("mock: 백분위 도메인(0~100)을 벗어나면 400", () => {
    const result = validateEntry(
      mockEntry({
        subjects: { korean: 101, math: 80, english: 80, tam1: 80, tam2: 80 },
      }),
      "mock",
    );
    expect(result.error?.status).toBe(400);
  });

  test("예약된 회차 이름(온보딩 고정 키)은 거부한다", () => {
    const result = validateEntry(naesinEntry({ term: "s1mid" }), "naesin");
    expect(result.error?.status).toBe(400);
  });
});

describe("findRecordIndex", () => {
  const records = [{ term: "A" }, { term: "B" }];

  test("term이 일치하는 원소의 인덱스를 돌려준다", () => {
    expect(findRecordIndex(records, "B")).toBe(1);
  });

  test("일치하는 원소가 없으면 -1", () => {
    expect(findRecordIndex(records, "C")).toBe(-1);
  });

  test("배열이 아닌 값은 빈 목록으로 취급한다", () => {
    expect(findRecordIndex(undefined, "A")).toBe(-1);
  });
});

describe("replaceRecord", () => {
  test("originalTerm 회차를 새 record로 교체하고 examDate/enteredAt 순으로 재정렬한다", () => {
    const records = [
      { term: "3월", enteredAt: "2026-03-01", value: 1 },
      { term: "6월", enteredAt: "2026-06-01", value: 2 },
    ];
    const updated = { term: "3월", enteredAt: "2026-01-01", value: 9 };
    const next = replaceRecord(records, "3월", updated);
    expect(next).not.toBe("collision");
    expect(next).not.toBeNull();
    // enteredAt이 2026-01-01로 당겨졌으니 정렬 결과 맨 앞으로 온다.
    expect((next as Array<{ term: string }>)[0]?.term).toBe("3월");
    expect((next as Array<{ value: number }>)[0]?.value).toBe(9);
  });

  test("originalTerm을 가진 회차가 없으면 null", () => {
    const result = replaceRecord([{ term: "A" }], "B", {
      term: "B",
      enteredAt: "2026-01-01",
    });
    expect(result).toBeNull();
  });

  test("term을 다른 기존 회차 이름으로 바꾸면 collision", () => {
    const records = [{ term: "A" }, { term: "B" }];
    const result = replaceRecord(records, "A", {
      term: "B",
      enteredAt: "2026-01-01",
    });
    expect(result).toBe("collision");
  });

  test("term을 바꾸지 않는 수정(자기 자신과의 충돌)은 정상 처리된다", () => {
    const records = [{ term: "A", enteredAt: "2026-01-01", value: 1 }];
    const updated = { term: "A", enteredAt: "2026-02-01", value: 5 };
    const result = replaceRecord(records, "A", updated);
    expect(result).not.toBe("collision");
    expect(result).not.toBeNull();
  });
});

describe("removeRecord", () => {
  test("term이 일치하는 회차를 제거한다", () => {
    const records = [{ term: "A" }, { term: "B" }];
    const next = removeRecord(records, "A");
    expect(next).toEqual([{ term: "B" }]);
  });

  test("일치하는 회차가 없으면 null", () => {
    expect(removeRecord([{ term: "A" }], "Z")).toBeNull();
  });
});

describe("upsertRecord (회귀 — findRecordIndex 공유 리팩터 이후에도 기존 동작 유지)", () => {
  test("같은 term이면 추가하지 않고 교체한다", () => {
    const records = [{ term: "A", enteredAt: "2026-01-01", value: 1 }];
    const updated = { term: "A", enteredAt: "2026-01-02", value: 7 };
    const next = upsertRecord(records, updated);
    expect(next).toHaveLength(1);
    expect((next[0] as { value: number }).value).toBe(7);
  });

  test("새 term이면 배열에 추가한다", () => {
    const records = [{ term: "A", enteredAt: "2026-01-01" }];
    const next = upsertRecord(records, { term: "B", enteredAt: "2026-02-01" });
    expect(next).toHaveLength(2);
  });
});
