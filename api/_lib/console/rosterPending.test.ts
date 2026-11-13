// 가입 전 학생(미회원가입) 줄을 학생 목록에서 가리는 규칙. 읽을 때 걸러 내므로 지울 필요가 없다.

import { describe, expect, test } from "vitest";
import { hiddenPendingIds, type PendingRecord } from "./rosterPending.js";

const pending = (over: Partial<PendingRecord> & { id: string }) => ({
  name: "홍길동",
  classId: "c-1",
  number: null,
  ...over,
});

const active = (
  over: Partial<{
    name: string;
    classId: string | null;
    number: number | null;
  }>,
) => ({
  name: "홍길동",
  classId: "c-1",
  number: 3,
  ...over,
});

describe("hiddenPendingIds", () => {
  test("a pending line without a number is hidden once an active student with the same name is in the same class", () => {
    expect(hiddenPendingIds([pending({ id: "p1" })], [active({})])).toEqual(
      new Set(["p1"]),
    );
  });

  test("with a number, the active student must have that number too", () => {
    const lines = [
      pending({ id: "p1", number: 3 }),
      pending({ id: "p2", number: 4 }),
    ];
    expect(hiddenPendingIds(lines, [active({ number: 3 })])).toEqual(
      new Set(["p1"]),
    );
  });

  test("another class or another name keeps the pending line visible", () => {
    const lines = [pending({ id: "p1" })];
    expect(hiddenPendingIds(lines, [active({ classId: "c-2" })])).toEqual(
      new Set(),
    );
    expect(hiddenPendingIds(lines, [active({ name: "김하늘" })])).toEqual(
      new Set(),
    );
    expect(hiddenPendingIds(lines, [active({ classId: null })])).toEqual(
      new Set(),
    );
  });
});
