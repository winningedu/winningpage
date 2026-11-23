import { describe, expect, test } from "vitest";
import type {
  GenerationSections,
  Sentence,
  SessionActivityView,
} from "@/lib/selfeval/types";
import {
  charChips,
  evidenceOf,
  paragraphSummaries,
  paragraphTexts,
  pendingFeelings,
  repickGroups,
  textsWithoutSentence,
} from "./resultLogic";

const s = (
  id: string,
  text: string,
  over: Partial<Sentence> = {},
): Sentence => ({
  id,
  text,
  evidence: [],
  feeling: false,
  confirmed: false,
  ...over,
});

const P_METHOD: Sentence["evidence"][number] = {
  sourceType: "P",
  refId: "act1",
  item: "method",
  weight: "main",
};
const S_INPUT: Sentence["evidence"][number] = {
  sourceType: "S",
  refId: null,
  item: "student_input",
  weight: "main",
};

const SECTIONS: GenerationSections = {
  paragraphs: [
    {
      role: "link",
      sentences: [
        s("a1", "첫 문장이에요.", {
          evidence: [P_METHOD],
        }),
        s("a2", "학생이 고친 문장이에요.", { evidence: [S_INPUT] }),
      ],
    },
    {
      role: "judgment",
      sentences: [
        s("b1", "뿌듯했다.", { feeling: true }),
        s("b2", "다 확인한 느낌이다.", { feeling: true, confirmed: true }),
      ],
    },
  ],
};

const activity = (over: Partial<SessionActivityView> = {}) =>
  ({
    activityRecordId: "act1",
    role: "core",
    fitScore: null,
    fitReasons: null,
    analysis: null,
    analysisSource: null,
    record: {
      id: "act1",
      topic: "설문 분석",
      concept: null,
      method: "표본 40명에게 설문을 받았다",
      result: null,
      limitation: null,
    },
    ...over,
  }) as SessionActivityView;

describe("charChips", () => {
  test("공백 포함과 제외를 그대로 싣고 목표가 없으면 목표 줄이 없다", () => {
    expect(
      charChips({ withSpace: 520, withoutSpace: 430 }, null, "with_space"),
    ).toEqual({ withSpace: 520, withoutSpace: 430, target: null });
  });

  test("목표 대비 차이를 모드 기준으로 계산하고 5% 이내면 경고가 아니다", () => {
    const chips = charChips(
      { withSpace: 510, withoutSpace: 400 },
      500,
      "with_space",
    );
    expect(chips.target).toEqual({ value: 500, diff: 10, outOfRange: false });
  });

  test("5% 를 넘으면 경고, 공백 제외 모드는 제외 글자 수로 잰다", () => {
    const chips = charChips(
      { withSpace: 520, withoutSpace: 400 },
      500,
      "without_space",
    );
    expect(chips.target).toEqual({ value: 500, diff: -100, outOfRange: true });
  });
});

describe("문단과 문장", () => {
  test("문단 본문은 문장을 공백으로 이은 문자열이다", () => {
    expect(paragraphTexts(SECTIONS)).toEqual([
      "첫 문장이에요. 학생이 고친 문장이에요.",
      "뿌듯했다. 다 확인한 느낌이다.",
    ]);
  });

  test("확인이 필요한 표현은 느낌 문장 중 확인하지 않은 것만이다", () => {
    expect(pendingFeelings(SECTIONS).map((x) => x.id)).toEqual(["b1"]);
  });

  test("문장을 지우면 그 문단 텍스트만 줄고 문단 수는 그대로다", () => {
    expect(textsWithoutSentence(SECTIONS, "b1")).toEqual([
      "첫 문장이에요. 학생이 고친 문장이에요.",
      "다 확인한 느낌이다.",
    ]);
  });
});

describe("evidenceOf", () => {
  test("활동 근거는 유형, 활동명, 항목 라벨, 기록 원문을 돌려준다", () => {
    const views = evidenceOf(
      SECTIONS.paragraphs[0]?.sentences[0] as Sentence,
      [activity()],
      [],
    );
    expect(views).toEqual([
      {
        kind: "activity",
        sourceType: "P",
        activityName: "설문 분석",
        fieldLabel: "방법",
        source: "표본 40명에게 설문을 받았다",
      },
    ]);
  });

  test("기록에 그 항목이 없으면 분석 값을 쓰고 둘 다 없으면 원문 줄이 없다", () => {
    const sentence = s("x", "문장", {
      evidence: [{ ...P_METHOD, item: "motive" }],
    });
    const withAnalysis = activity({
      analysis: {
        values: { motive: "계기 값" } as never,
        sources: {} as never,
        conflicts: [],
      },
    });
    expect(evidenceOf(sentence, [withAnalysis], [])[0]).toMatchObject({
      source: "계기 값",
    });
    expect(evidenceOf(sentence, [activity()], [])[0]).toMatchObject({
      source: null,
    });
  });

  test("수기 메모 근거는 메모 날짜와 글을 돌려준다", () => {
    const sentence = s("h", "문장", {
      evidence: [
        { sourceType: "H", refId: "m1", item: "action", weight: "sub" },
      ],
    });
    expect(
      evidenceOf(
        sentence,
        [],
        [{ id: "m1", writtenAt: "2026-05-03", text: "메모 글" }],
      ),
    ).toEqual([
      {
        kind: "memo",
        writtenAt: "2026-05-03",
        fieldLabel: "한 일",
        text: "메모 글",
      },
    ]);
  });

  test("학생 입력은 student, 모르는 활동은 빠지고 근거가 없으면 빈 배열이다", () => {
    expect(
      evidenceOf(SECTIONS.paragraphs[0]?.sentences[1] as Sentence, [], []),
    ).toEqual([{ kind: "student" }]);
    expect(evidenceOf(s("n", "문장"), [], [])).toEqual([]);
    expect(
      evidenceOf(
        s("m", "문장", { evidence: [{ ...P_METHOD, refId: "none" }] }),
        [activity()],
        [],
      ),
    ).toEqual([]);
  });

  test("한 문장의 여러 근거를 모두 돌려준다", () => {
    const views = evidenceOf(
      s("two", "문장", {
        evidence: [P_METHOD, { ...P_METHOD, item: "result", weight: "sub" }],
      }),
      [activity({ record: { ...activity().record, result: "결과 글" } })],
      [],
    );
    expect(views.map((v) => v.kind === "activity" && v.fieldLabel)).toEqual([
      "방법",
      "결과와 근거",
    ]);
  });
});

describe("repickGroups", () => {
  test("선택 기록은 값이 있는 항목만, 수기 메모는 네 항목으로 묶어 돌려준다", () => {
    const groups = repickGroups(
      [activity()],
      [{ id: "m1", writtenAt: null, text: "메모 글" }],
    );
    expect(groups).toEqual([
      { refId: "act1", title: "설문 분석", items: ["method"] },
      {
        refId: "m1",
        title: "수기 메모: 메모 글",
        items: ["motive", "action", "method", "limitation"],
      },
    ]);
  });
});

describe("복사용 본문", () => {
  test("번호와 근거 칩 없이 문장만 잇는다", () => {
    const text = paragraphTexts(SECTIONS).join("\n\n");
    expect(text).not.toMatch(/[\u2460-\u2473]/);
    expect(text).not.toMatch(/\bP |\bS /);
    expect(text).toBe(
      "첫 문장이에요. 학생이 고친 문장이에요.\n\n뿌듯했다. 다 확인한 느낌이다.",
    );
  });
});

describe("paragraphSummaries", () => {
  test("문단 번호와 근거 활동명을 중복 없이 모으고 옛 role 은 쓰지 않는다", () => {
    expect(paragraphSummaries(SECTIONS, [activity()])).toEqual([
      { number: 1, activityNames: ["설문 분석"] },
      { number: 2, activityNames: [] },
    ]);
  });
});
