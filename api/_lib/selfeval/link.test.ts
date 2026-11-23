import { describe, expect, it } from "vitest";
import { acceptLink, type LinkJudgment, normalizeSpace } from "./link.js";
import type { ActivityRecordLike } from "./types.js";

const rec = (id: string, p: Partial<ActivityRecordLike> = {}) =>
  ({
    id,
    sourceProgram: "performance",
    status: "confirmed",
    gradeLabel: "고1",
    semester: 1,
    subjectGroup: "수학",
    subject: "공통수학1",
    topic: null,
    concept: null,
    method: null,
    result: null,
    limitation: null,
    numbers: [],
    sources: [],
    createdAt: "2026-01-01T00:00:00Z",
    ...p,
  }) as ActivityRecordLike;

const P1 = rec("p1", {
  topic: "매점 간식 가격과 이익 이차함수 적용",
  concept: "이차함수 꼭짓점",
  method: "가격과 이익 관계를 이차함수로 세움",
  result: "꼭짓점으로 최적 가격을 구함",
  submittedAt: "2026-06-18T00:00:00Z",
});
const P2 = rec("p2", {
  topic: "설문 데이터로 일차 수요식 세우기",
  concept: "일차 수요식",
  method: "설문 결과를 좌표평면에 찍어 직선으로 근사",
  result: "수요식 기울기가 음수로 나옴",
  submittedAt: "2026-07-09T00:00:00Z",
});
const D1 = rec("d1", {
  sourceProgram: "deep",
  topic: "이익 함수 비교",
  concept: "이익 함수 이차함수 꼭짓점",
  method: "P2에서 구한 수요식을 이익 함수에 대입",
  result: "가격 1300원에서 이익 최대",
  submittedAt: "2026-08-20T00:00:00Z",
});
const P5 = rec("p5", {
  subjectGroup: "국어",
  subject: "화법과 작문",
  topic: "학교 매점 운영 개선 논설문",
  concept: "논증 구조",
  method: "주장과 근거를 나누어 서술",
  result: "매점 운영 개선안을 글로 제안함",
  submittedAt: "2026-09-11T00:00:00Z",
});

const judge = (p: Partial<LinkJudgment> = {}): LinkJudgment => ({
  fromId: "p2",
  toId: "d1",
  type: "inherit",
  strength: "explicit",
  quoteFrom: "일차 수요식",
  quoteTo: "P2에서 구한 수요식을 이익 함수에 대입",
  ...p,
});
const subjectCtx = { area: "subject" as const, subject: "공통수학1" };

describe("acceptLink", () => {
  it("accepts a judgment whose quotes, type, order and overlap all hold", () => {
    expect(acceptLink(judge(), P2, D1, subjectCtx)).toEqual({ ok: true });
  });

  it("rejects a quote that is not verbatim in the source record", () => {
    const r = acceptLink(
      judge({ quoteTo: "없는 문장입니다" }),
      P2,
      D1,
      subjectCtx,
    );
    expect(r).toEqual({ ok: false, reason: "quote_missing" });
  });

  it("compares quotes after whitespace normalization and searches summary and reflection", () => {
    const withReflection = rec("d1", {
      ...D1,
      reflection: "수학이  생활 문제에\n쓰인다는 성찰",
    });
    const r = acceptLink(
      judge({ quoteTo: "수학이 생활 문제에 쓰인다는 성찰" }),
      P2,
      withReflection,
      subjectCtx,
    );
    expect(r).toEqual({ ok: true });
    expect(normalizeSpace(" a \n b\t c ")).toBe("a b c");
  });

  it("rejects an empty quote", () => {
    expect(acceptLink(judge({ quoteFrom: "  " }), P2, D1, subjectCtx)).toEqual({
      ok: false,
      reason: "quote_missing",
    });
  });

  it("rejects a type outside the seven allowed", () => {
    expect(acceptLink(judge({ type: "similar" }), P2, D1, subjectCtx)).toEqual({
      ok: false,
      reason: "bad_type",
    });
  });

  it("requires inherit and deepen to run from the earlier to the later submission", () => {
    const reversed = judge({
      fromId: "d1",
      toId: "p2",
      quoteFrom: "P2에서 구한 수요식을 이익 함수에 대입",
      quoteTo: "일차 수요식",
    });
    expect(acceptLink(reversed, D1, P2, subjectCtx)).toEqual({
      ok: false,
      reason: "order",
    });
    expect(
      acceptLink({ ...reversed, type: "deepen" }, D1, P2, subjectCtx),
    ).toEqual({ ok: false, reason: "order" });
    expect(
      acceptLink({ ...reversed, type: "background" }, D1, P2, subjectCtx),
    ).toEqual({ ok: true });
  });

  it("falls back to createdAt when submittedAt is missing", () => {
    const early = rec("p2", {
      ...P2,
      submittedAt: null,
      createdAt: "2026-07-09T00:00:00Z",
    });
    const late = rec("d1", {
      ...D1,
      submittedAt: null,
      createdAt: "2026-08-20T00:00:00Z",
    });
    expect(acceptLink(judge(), early, late, subjectCtx)).toEqual({ ok: true });
  });

  it("rejects a link that shares only the topic material (P5 vs P1 share only 매점)", () => {
    const j = judge({
      fromId: "p1",
      toId: "p5",
      type: "background",
      quoteFrom: "매점 간식 가격과 이익 이차함수 적용",
      quoteTo: "학교 매점 운영 개선 논설문",
    });
    expect(acceptLink(j, P1, P5, subjectCtx)).toEqual({
      ok: false,
      reason: "no_overlap",
    });
  });

  it("limits subject records to borrow_method, background and area_extend in a creative-area session", () => {
    const club = rec("c1", {
      subjectGroup: "동아리 수학탐구",
      subject: null,
      topic: "수학 동아리 발표",
      concept: "일차 수요식 발표",
      method: "수요식을 설명하는 발표",
      submittedAt: "2026-09-20T00:00:00Z",
    });
    const ctx = { area: "club" as const, subject: null };
    const j = judge({
      fromId: "p2",
      toId: "c1",
      type: "complement",
      quoteFrom: "일차 수요식",
      quoteTo: "수요식을 설명하는 발표",
    });
    expect(acceptLink(j, P2, club, ctx)).toEqual({
      ok: false,
      reason: "area_type",
    });
    expect(acceptLink({ ...j, type: "area_extend" }, P2, club, ctx)).toEqual({
      ok: true,
    });
    expect(acceptLink(j, P2, club, subjectCtx)).toEqual({ ok: true });
  });
});
