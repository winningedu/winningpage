// 프롬프트 캐시 순서 재배치 회귀 테스트.
//
// 재배치는 블록 순서만 바꾸고 블록 안 문자열은 한 글자도 바꾸지 않는다. 그래서 재배치
// 전 출력(fixture)과 지금 출력을 빈 줄로 나눈 문단 묶음으로 비교하면 순서만 다르고
// 내용은 같아야 한다. fixture 는 재배치 직전 커밋의 prompts.ts 로 한 번 생성했다.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildDesignReportSystem,
  buildEvaluationSystem,
  buildTopicRecommendationSystem,
  DESIGN_PROMPT_VERSIONS,
  EVALUATION_PROMPT_VERSION,
  resolveDesignPromptVersion,
  TOPIC_PROMPT_VERSION,
} from "./prompts.js";

type Pair<T> = [T, T];

type DesignInput = {
  structureType: string;
  structureReason: string;
  writingFrame: string;
  resourceKnowledgeText: string;
  allowedResources: Array<{ id: string; title: string }>;
  studentHistoryText: string;
};

type Fixture = {
  inputs: {
    topic: Pair<{ topicKnowledgeText: string; studentHistoryText: string }>;
    design: Pair<DesignInput>;
    evaluation: Pair<{
      structureType: string;
      structureReason: string;
      writingFrame: string;
    }>;
  };
  outputs: {
    topic: Pair<string>;
    designWithoutCore: Pair<string>;
    designWithCore: Pair<string>;
    evaluation: Pair<string>;
  };
};

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const fixture: Fixture = JSON.parse(
  fs.readFileSync(
    path.join(CURRENT_DIR, "__fixtures__/prompts-before-cache-order.json"),
    "utf8",
  ),
);

function mapPair<T, U>(pair: Pair<T>, fn: (value: T) => U): Pair<U> {
  return [fn(pair[0]), fn(pair[1])];
}

function paragraphs(text: string): string[] {
  return text
    .split(/\n\n/)
    .map((block) => block.trim())
    .filter(Boolean);
}

function sortedParagraphs(text: string): string[] {
  return paragraphs(text).sort();
}

function commonPrefixLength(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let i = 0;
  while (i < max && a[i] === b[i]) i += 1;
  return i;
}

// 두 입력 모두에서 똑같이 나온 문단(=고정 문단) 가운데 공통 프리픽스 밖에 남은 것을 돌려준다.
function fixedParagraphsAfterPrefix(
  a: string,
  b: string,
  allowed: string[] = [],
): string[] {
  const prefixLength = commonPrefixLength(a, b);
  const inB = new Set(paragraphs(b));
  return paragraphs(a).filter((block) => {
    if (!inB.has(block)) return false;
    if (allowed.some((allow) => block.startsWith(allow))) return false;
    return a.indexOf(block) + block.length > prefixLength;
  });
}

describe("주제 추천 system 캐시 순서", () => {
  const before = fixture.outputs.topic;
  const after = mapPair(fixture.inputs.topic, (input) =>
    buildTopicRecommendationSystem(input),
  );

  it("재배치 전과 문단 내용이 같다", () => {
    expect(after.map(sortedParagraphs)).toEqual(before.map(sortedParagraphs));
  });

  it("공통 프리픽스가 길어지고 그 뒤에 고정 문단이 남지 않는다", () => {
    expect(commonPrefixLength(after[0], after[1])).toBeGreaterThan(
      commonPrefixLength(before[0], before[1]),
    );
    expect(fixedParagraphsAfterPrefix(after[0], after[1])).toEqual([]);
  });

  it("버전을 topic-v2 로 올린다", () => {
    expect(TOPIC_PROMPT_VERSION).toBe("topic-v2");
  });
});

// 설계 리포트의 `주의:` 문단은 고정 문자열이지만 `위 [사용 허용 자료명 목록]`을 가리키므로
// 그 가변 블록 바로 뒤에 붙어 다닌다. 그래서 프리픽스 밖에 남는 것을 허용한다.
const DESIGN_ATTACHED_DIRECTIVES = ["주의: chosen_resources 필드에는"];

describe.each([
  ["WITHOUT_CORE", "designWithoutCore"],
  ["WITH_CORE", "designWithCore"],
] as const)("설계 리포트 system 캐시 순서 (%s)", (key, fixtureKey) => {
  const before = fixture.outputs[fixtureKey];
  const after = mapPair(fixture.inputs.design, (input) =>
    buildDesignReportSystem({
      ...input,
      promptVersion: DESIGN_PROMPT_VERSIONS[key],
    }),
  );

  it("재배치 전과 문단 내용이 같다", () => {
    expect(after.map(sortedParagraphs)).toEqual(before.map(sortedParagraphs));
  });

  it("공통 프리픽스가 길어지고 그 뒤에 고정 문단이 남지 않는다", () => {
    expect(commonPrefixLength(after[0], after[1])).toBeGreaterThan(
      commonPrefixLength(before[0], before[1]),
    );
    expect(
      fixedParagraphsAfterPrefix(
        after[0],
        after[1],
        DESIGN_ATTACHED_DIRECTIVES,
      ),
    ).toEqual([]);
  });

  it("허용 자료 목록을 가리키는 주의 문단이 목록 바로 뒤에 온다", () => {
    const blocks = paragraphs(after[0]);
    const listIndex = blocks.findIndex((block) =>
      block.startsWith("[사용 허용 자료명 목록]"),
    );
    expect(listIndex).toBeGreaterThan(-1);
    expect(blocks[listIndex + 1]).toMatch(/^주의: chosen_resources 필드에는/);
  });
});

describe("설계 리포트 프롬프트 버전", () => {
  it("재배치판 두 값을 새로 쓰고 A/B 스위치 구조는 그대로 둔다", () => {
    expect(DESIGN_PROMPT_VERSIONS).toEqual({
      WITHOUT_CORE: "design-v3",
      WITH_CORE: "design-v4",
    });
    expect(resolveDesignPromptVersion({})).toBe("design-v4");
    expect(
      resolveDesignPromptVersion({
        PERFORMANCE_DESIGN_PROMPT_VERSION: "design-v3",
      }),
    ).toBe("design-v3");
    expect(
      resolveDesignPromptVersion({
        PERFORMANCE_DESIGN_PROMPT_VERSION: "design-v1",
      }),
    ).toBe("design-v4");
  });

  it("주입본은 미주입본으로 끝난다", () => {
    const input = fixture.inputs.design[0];
    const withoutCore = buildDesignReportSystem({
      ...input,
      promptVersion: DESIGN_PROMPT_VERSIONS.WITHOUT_CORE,
    });
    const withCore = buildDesignReportSystem({
      ...input,
      promptVersion: DESIGN_PROMPT_VERSIONS.WITH_CORE,
    });
    expect(withCore.endsWith(`\n\n${withoutCore}`)).toBe(true);
  });
});

// 평가 system 은 연결 블록 규칙이 `아래 평가 형식`을 가리켜 순서를 바꾸면 뜻이 틀어지므로
// 재배치하지 않는다. 출력과 버전이 재배치 전과 같아야 한다.
describe("평가 system 은 재배치하지 않는다", () => {
  it("출력이 재배치 전과 글자 단위로 같고 버전도 그대로다", () => {
    expect(fixture.inputs.evaluation.map(buildEvaluationSystem)).toEqual(
      fixture.outputs.evaluation,
    );
    expect(EVALUATION_PROMPT_VERSION).toBe("eval-v1");
  });
});
