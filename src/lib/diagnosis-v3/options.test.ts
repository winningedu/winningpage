import { describe, expect, test } from "vitest";
import { OPTIONS, trackOf } from "./options.js";

describe("option rows (14_선택지코드)", () => {
  test("grade picks the track by its TRACK code", () => {
    expect(OPTIONS.q1.map((o) => trackOf(o.ordinal))).toEqual([
      "M3",
      "M3",
      "H12",
      "H12",
      "H3",
      "H3",
    ]);
  });

  test("q10 options resolve their area code, 16 is exclusive", () => {
    const byOrdinal = new Map(OPTIONS.q10.map((o) => [o.ordinal, o]));
    expect(OPTIONS.q10).toHaveLength(16);
    expect(byOrdinal.get(1)?.area).toBe("P1_PRIO");
    expect(byOrdinal.get(13)?.area).toBe("MIND_RECV");
    expect(byOrdinal.get(15)?.area).toBe("P1_EXEC");
    expect(byOrdinal.get(16)).toMatchObject({ exclusive: true });
    expect(byOrdinal.get(16)?.area).toBeUndefined();
  });

  test("q12 options are per track with track area codes", () => {
    expect(OPTIONS.q12.H12.find((o) => o.ordinal === 5)?.area).toBe("H12_DEEP");
    expect(OPTIONS.q12.H3.find((o) => o.ordinal === 1)?.area).toBe("H3_GPA");
    expect(OPTIONS.q12.M3.find((o) => o.ordinal === 13)?.exclusive).toBe(true);
  });

  test("q3r exclusive is 7 and q21 weekday carries MINLOAD", () => {
    expect(
      OPTIONS.q3r.filter((o) => o.exclusive).map((o) => o.ordinal),
    ).toEqual([7]);
    expect(OPTIONS.q21Weekday.map((o) => o.code)).toEqual([
      "MINLOAD:15",
      "MINLOAD:15",
      "MINLOAD:30",
      "MINLOAD:50",
      "MINLOAD:60",
    ]);
    expect(OPTIONS.q21Weekend).toHaveLength(5);
  });

  test("q13 kinds and q22 types come from their codes", () => {
    expect(OPTIONS.q13.map((o) => o.code)).toEqual([
      "EVENT:EXAM",
      "EVENT:PERF",
      "EVENT:MOCK",
      "EVENT:APPLY",
      "EVENT:ETC",
      "EVENT:NONE",
      "EVENT:UNKNOWN",
    ]);
    expect(OPTIONS.q22).toHaveLength(17);
    expect(OPTIONS.q22[16]?.code).toBe("MBTI:NONE");
  });

  test("q2, q4, q5 options come from 13 and 16 since 14 has none", () => {
    expect(OPTIONS.q2.map((o) => o.label)).toEqual([
      "일반고",
      "자율형 사립고",
      "자율형 공립고",
      "특목고(과학고\u00b7외고\u00b7국제고)",
      "영재학교",
      "특성화고\u00b7마이스터고",
      "중학교",
      "해당 없음",
    ]);
    expect(OPTIONS.q4.map((o) => o.label)).toEqual([
      "9등급제",
      "5등급제",
      "성취평가제 중심",
      "잘 모르겠어요.",
    ]);
    expect(OPTIONS.q5).toHaveLength(7);
    expect(OPTIONS.q5[2]?.code).toBe("5%p 확장");
  });

  test("other single choices keep the sheet ordinal and label", () => {
    expect(OPTIONS.q3).toHaveLength(6);
    expect(OPTIONS.q3[0]?.code).toBe("SCORE:100");
    expect(OPTIONS.q8).toHaveLength(6);
    expect(OPTIONS.q8s).toHaveLength(7);
    expect(OPTIONS.q8d).toHaveLength(3);
    expect(OPTIONS.q14).toHaveLength(10);
    expect(OPTIONS.q16).toHaveLength(5);
    expect(OPTIONS.q17).toHaveLength(7);
    expect(OPTIONS.q18).toHaveLength(7);
  });
});
