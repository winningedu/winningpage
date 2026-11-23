import { describe, expect, test } from "vitest";
import type { VerificationSections } from "@/lib/selfeval/types";
import {
  discriminationLabel,
  linkWarningLines,
  saveBadge,
  summarizeVerification,
} from "./verifyLogic";

const sections = (over: Partial<VerificationSections> = {}) =>
  ({
    items: [
      {
        key: "judgment",
        label: "판단",
        max: 15,
        discrimination: 70,
        score: 10,
        checks: [
          { text: "a", pass: true },
          { text: "b", pass: false },
        ],
      },
      {
        key: "next",
        label: "다음 단계",
        max: 5,
        discrimination: null,
        score: 5,
        checks: [{ text: "c", pass: true }],
      },
    ],
    total: 72,
    format: [],
    mandatoryFixes: [],
    submittable: true,
    improvements: [],
    excluded: [],
    growthFit: null,
    charCount: { withSpace: 500, withoutSpace: 420 },
    sentenceCount: 9,
    clicheDensity: 0.4,
    clicheHits: [],
    numberCount: 3,
    ...over,
  }) as VerificationSections;

describe("discriminationLabel", () => {
  test("값이 있으면 +Np, 없으면 판별력 없음", () => {
    expect(discriminationLabel(70)).toBe("+70p");
    expect(discriminationLabel(null)).toBe("판별력 없음");
  });
});

describe("summarizeVerification", () => {
  test("문항 없이 채점했으면 promptMissing 을 옮긴다", () => {
    expect(
      summarizeVerification(sections({ promptMissing: true })).promptMissing,
    ).toBe(true);
    expect(summarizeVerification(sections()).promptMissing).toBe(false);
  });

  test("확인 문장 수와 통과, 확인 필요, 필수 수정 수를 센다", () => {
    expect(
      summarizeVerification(
        sections({
          mandatoryFixes: [{ key: "cliche", message: "m", detail: null }],
          submittable: false,
        }),
      ),
    ).toMatchObject({
      total: 72,
      submittable: false,
      totalChecks: 3,
      passChecks: 2,
      needChecks: 1,
      mandatoryCount: 1,
      clicheDensity: 0.4,
      numberCount: 3,
      sentenceCount: 9,
    });
  });
});

describe("saveBadge", () => {
  test("필수 수정이 있으면 빨간 필수 수정 N건이다", () => {
    const summary = summarizeVerification(
      sections({
        mandatoryFixes: [{ key: "cliche", message: "m", detail: null }],
        submittable: false,
      }),
    );
    expect(saveBadge(summary)).toEqual({
      tone: "error",
      label: "필수 수정 1건",
    });
  });

  test("필수 수정이 없고 확인 필요만 있으면 노란 배지다", () => {
    expect(saveBadge(summarizeVerification(sections()))).toEqual({
      tone: "warning",
      label: "아직 수정이 덜 된 항목 1건",
    });
  });

  test("둘 다 없으면 초록 제출 가능이다", () => {
    const all = sections({
      items: [
        {
          key: "next",
          label: "다음 단계",
          max: 5,
          discrimination: null,
          score: 5,
          checks: [{ text: "c", pass: true }],
        },
      ],
    } as never);
    expect(saveBadge(summarizeVerification(all))).toEqual({
      tone: "ok",
      label: "제출 가능",
    });
  });
});

describe("linkWarningLines(명세 No.182, 190)", () => {
  const check = (over: Record<string, unknown>) => ({
    recordId: "s1",
    label: "보조탐구",
    status: "checked",
    linkShown: true,
    concreteWordPresent: true,
    listingSuspect: false,
    ...over,
  });
  const lines = (...checks: Record<string, unknown>[]) =>
    linkWarningLines(sections({ linkChecks: checks as never })).map(
      (l) => l.text,
    );

  test("문제가 없는 기록은 경고를 내지 않는다", () => {
    expect(lines(check({}))).toEqual([]);
  });

  test("연계가 드러난 문장이 없으면 그 경고를 낸다", () => {
    expect(lines(check({ linkShown: false }))).toEqual([
      "보조탐구: 연계가 드러난 문장이 없어요",
    ]);
  });

  test("구체물 낱말이 연계 문장에 없으면 그 경고를 낸다", () => {
    expect(lines(check({ concreteWordPresent: false }))).toEqual([
      "보조탐구: 넘어온 구체물 낱말이 연계 문장에 없어요",
    ]);
  });

  test("그 기록 문장을 빼도 글이 성립하면 나열 의심 경고를 낸다", () => {
    expect(lines(check({ listingSuspect: true }))).toEqual([
      "보조탐구: 이 기록 문장을 빼도 글이 성립해요(나열 의심)",
    ]);
  });

  test("판정을 못 낸 칸(null)은 경고하지 않는다", () => {
    expect(
      lines(
        check({
          linkShown: null,
          concreteWordPresent: null,
          listingSuspect: null,
        }),
      ),
    ).toEqual([]);
  });

  test("선택했지만 쓰이지 않은 기록은 미사용으로 알린다", () => {
    expect(
      lines(
        check({
          status: "unused",
          linkShown: null,
          concreteWordPresent: null,
          listingSuspect: null,
        }),
      ),
    ).toEqual(["보조탐구: 선택했지만 본문에 쓰이지 않았어요(미사용)"]);
  });

  test("이전 리포트처럼 linkChecks 가 없으면 빈 목록이다", () => {
    expect(linkWarningLines(sections())).toEqual([]);
  });

  test("연계 경고는 요약의 필수 수정 수와 저장 배지를 바꾸지 않는다", () => {
    const warned = sections({
      linkChecks: [check({ linkShown: false, listingSuspect: true })] as never,
    });
    expect(summarizeVerification(warned)).toEqual(
      summarizeVerification(sections()),
    );
    expect(saveBadge(summarizeVerification(warned))).toEqual(
      saveBadge(summarizeVerification(sections())),
    );
  });
});
