import { describe, expect, it } from "vitest";
import {
  evidenceSchema,
  generationSectionsSchema,
  sentenceSchema,
  verificationSectionsSchema,
} from "./sections.js";

const evidence = {
  sourceType: "P",
  refId: "rec-1",
  item: "result",
  weight: "main",
};

describe("evidenceSchema", () => {
  it("활동 기록 근거를 읽는다", () => {
    expect(evidenceSchema.parse(evidence)).toEqual(evidence);
  });

  it("학생 입력 근거는 refId 가 null 이다", () => {
    const student = {
      sourceType: "S",
      refId: null,
      item: "student_input",
      weight: "sub",
    };
    expect(evidenceSchema.parse(student)).toEqual(student);
  });

  it("모르는 출처 유형, 항목, 가중치는 거절한다", () => {
    expect(
      evidenceSchema.safeParse({ ...evidence, sourceType: "X" }).success,
    ).toBe(false);
    expect(
      evidenceSchema.safeParse({ ...evidence, item: "next2" }).success,
    ).toBe(false);
    expect(
      evidenceSchema.safeParse({ ...evidence, weight: "big" }).success,
    ).toBe(false);
  });

  it("refId 가 빠지면 거절한다", () => {
    const { refId: _refId, ...rest } = evidence;
    expect(evidenceSchema.safeParse(rest).success).toBe(false);
  });
});

describe("sentenceSchema", () => {
  const sentence = {
    id: "s1",
    text: "함수의 극한을 직접 계산해 보았다.",
    evidence: [evidence],
    feeling: false,
    confirmed: false,
  };

  it("근거를 담은 문장을 읽는다", () => {
    expect(sentenceSchema.parse(sentence)).toEqual(sentence);
  });

  it("근거가 없는 문장도 읽는다", () => {
    expect(
      sentenceSchema.parse({ ...sentence, evidence: [] }).evidence,
    ).toEqual([]);
  });

  it("근거가 모양에 맞지 않으면 거절한다", () => {
    expect(
      sentenceSchema.safeParse({ ...sentence, evidence: [{ sourceType: "P" }] })
        .success,
    ).toBe(false);
  });

  it("feeling 이나 confirmed 가 빠지면 거절한다", () => {
    const { feeling: _f, ...noFeeling } = sentence;
    const { confirmed: _c, ...noConfirmed } = sentence;
    expect(sentenceSchema.safeParse(noFeeling).success).toBe(false);
    expect(sentenceSchema.safeParse(noConfirmed).success).toBe(false);
  });
});

describe("generationSectionsSchema", () => {
  const sentence = {
    id: "s1",
    text: "문장이다.",
    evidence: [evidence],
    feeling: false,
    confirmed: false,
  };

  it("문단마다 문장을 담은 본문을 읽는다", () => {
    const sections = { paragraphs: [{ sentences: [sentence] }] };
    expect(generationSectionsSchema.parse(sections)).toEqual(sections);
  });

  it("옛 본문의 문단 역할(role)을 읽는다", () => {
    const sections = { paragraphs: [{ role: "judgment", sentences: [] }] };
    expect(generationSectionsSchema.parse(sections)).toEqual(sections);
  });

  it("모르는 문단 역할은 거절한다", () => {
    expect(
      generationSectionsSchema.safeParse({
        paragraphs: [{ role: "intro", sentences: [] }],
      }).success,
    ).toBe(false);
  });

  it("문장이 모양에 맞지 않으면 거절한다", () => {
    expect(
      generationSectionsSchema.safeParse({
        paragraphs: [{ sentences: [{ id: "s1", text: "x" }] }],
      }).success,
    ).toBe(false);
  });

  it("문단 목록이 없으면 거절한다", () => {
    expect(generationSectionsSchema.safeParse({}).success).toBe(false);
  });
});

describe("verificationSectionsSchema", () => {
  const sections = {
    items: [
      {
        key: "judgment",
        label: "판단",
        max: 20,
        discrimination: 12.5,
        checks: [{ text: "판단 문장이 있다", pass: true }],
        score: 20,
      },
    ],
    total: 20,
    format: [
      {
        key: "min_length",
        label: "최소 분량",
        pass: true,
        detail: "480자",
        skipped: false,
      },
    ],
    mandatoryFixes: [
      { key: "pending_feelings", message: "확인해 주세요", detail: null },
    ],
    submittable: false,
    improvements: [
      {
        key: "limitation",
        label: "한계",
        message: "써 주세요",
        failedChecks: ["a"],
      },
    ],
    excluded: [{ label: "문항 대응", note: "문항 없음" }],
    growthFit: null,
    charCount: { withSpace: 500, withoutSpace: 420 },
    sentenceCount: 6,
    clicheDensity: 0.4,
    clicheHits: ["열정"],
    numberCount: 2,
  };

  it("점수, 형식 검사, 필수 수정을 담은 검증 결과를 읽는다", () => {
    expect(verificationSectionsSchema.parse(sections)).toEqual(sections);
  });

  it("이전 리포트에 없는 칸(promptMissing, linkChecks, applied)은 없어도 읽는다", () => {
    const parsed = verificationSectionsSchema.parse(sections);
    expect(parsed.promptMissing).toBeUndefined();
    expect(parsed.linkChecks).toBeUndefined();
    expect(parsed.items[0]?.applied).toBeUndefined();
  });

  it("연계 경고와 성장설계 적합도를 읽는다", () => {
    const full = {
      ...sections,
      promptMissing: true,
      linkChecks: [
        {
          recordId: "r1",
          label: "수학",
          status: "checked",
          linkShown: true,
          concreteWordPresent: null,
          listingSuspect: false,
        },
      ],
      growthFit: {
        stageChecks: [{ text: "단계", pass: true }],
        axisChecks: [
          {
            axis: "inquiry",
            name: "탐구",
            satisfied: true,
            current: 2,
            required: 1,
            guideline: "안내",
          },
        ],
      },
    };
    expect(verificationSectionsSchema.parse(full)).toEqual(full);
  });

  it("모르는 점수 항목 키나 형식 검사 키는 거절한다", () => {
    const badItem = {
      ...sections,
      items: [{ ...sections.items[0], key: "x" }],
    };
    const badFormat = {
      ...sections,
      format: [{ ...sections.format[0], key: "x" }],
    };
    expect(verificationSectionsSchema.safeParse(badItem).success).toBe(false);
    expect(verificationSectionsSchema.safeParse(badFormat).success).toBe(false);
  });

  it("필수 칸이 빠지면 거절한다", () => {
    const { submittable: _s, ...rest } = sections;
    expect(verificationSectionsSchema.safeParse(rest).success).toBe(false);
  });
});
