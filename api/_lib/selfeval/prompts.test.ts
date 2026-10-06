import { describe, expect, it } from "vitest";
import { FORBIDDEN_PHRASES, SCORE_RUBRIC } from "./dictionaries.js";
import {
  buildAnalyzePrompt,
  buildRetryNotes,
  buildVerifyPrompt,
  buildWritePrompt,
  COMMON_RULES,
  MAX_OUTPUT_TOKENS,
  type VerifyPromptInput,
  type WritePromptInput,
} from "./prompts.js";
import {
  type ActivityRecordLike,
  ANALYSIS_FIELDS,
  type Analysis,
  type AnalysisField,
  type FieldSource,
} from "./types.js";

// 리터럴로 쓰면 포맷터가 이스케이프를 실제 문자로 바꾸므로 문자열에서 정규식을 만든다.
const FORBIDDEN_CHARS = /[\u2013\u2014\u00b7\u318d\u2190-\u21ff]/;

const record: ActivityRecordLike = {
  id: "a1",
  sourceProgram: "performance",
  status: "confirmed",
  gradeLabel: "고1",
  semester: 1,
  subjectGroup: null,
  subject: "수학",
  topic: "이차함수 꼭짓점 탐구",
  concept: "판별식",
  method: "그래프 프로그램 사용",
  result: "폭이 좁아짐",
  limitation: "정수 계수만",
  numbers: ["계수 5개"],
  sources: ["교과서"],
  createdAt: "2026-01-01",
};

function analysis(
  filled: Partial<Record<AnalysisField, FieldSource>>,
): Analysis {
  const values = {} as Record<AnalysisField, string>;
  const sources = {} as Record<AnalysisField, FieldSource>;
  for (const f of ANALYSIS_FIELDS) {
    sources[f] = filled[f] ?? "empty";
    values[f] = sources[f] === "empty" ? "" : `${f}값내용`;
  }
  return { values, sources, conflicts: [] };
}

describe("COMMON_RULES", () => {
  it("핵심 규칙과 금지 표현을 담고 금지 문자를 쓰지 않는다", () => {
    for (const p of FORBIDDEN_PHRASES) expect(COMMON_RULES).toContain(p);
    expect(COMMON_RULES).toContain("JSON");
    expect(COMMON_RULES).toContain("마크다운");
    expect(COMMON_RULES).toContain("대학");
    expect(COMMON_RULES).toContain("기록에 없는");
    expect(FORBIDDEN_CHARS.test(COMMON_RULES)).toBe(false);
  });

  it("출력 토큰 상한이 단계별로 정해져 있다", () => {
    expect(MAX_OUTPUT_TOKENS).toEqual({
      analyze: 2048,
      write: 3072,
      verify: 3072,
    });
  });
});

describe("buildRetryNotes", () => {
  it("이슈마다 메모를 만들고 path 를 앞에 붙인다", () => {
    const n = buildRetryNotes([
      { code: "markdown", message: "마크다운이 있다.", path: "p1-s1" },
    ]);
    expect(n[0]).toContain("[p1-s1]");
    expect(n[0]).toContain("마크다운이 있다.");
  });

  it("truncated 와 invalid_json 이면 절반 이하로 줄이라는 문장을 더한다", () => {
    for (const code of ["truncated", "invalid_json"]) {
      const n = buildRetryNotes([{ code, message: "x" }]);
      expect(n.join("\n")).toContain("절반 이하");
    }
  });
});

describe("buildAnalyzePrompt", () => {
  const input = {
    record,
    area: "subject" as const,
    subject: "수학",
    activityName: "이차함수 탐구",
  };

  it("기록 7항목을 user 에 싣고 11항목 스키마를 요구한다", () => {
    const b = buildAnalyzePrompt(input);
    expect(b.maxOutputTokens).toBe(2048);
    for (const t of ["이차함수 꼭짓점 탐구", "판별식", "계수 5개", "교과서"])
      expect(b.user).toContain(t);
    for (const f of ANALYSIS_FIELDS) expect(b.user).toContain(f);
    expect(b.system).toContain(COMMON_RULES);
    expect(b.system).toContain("빈 문자열");
    const values = (
      b.responseSchema as { properties: { values: { required: string[] } } }
    ).properties.values;
    expect([...values.required]).toEqual([...ANALYSIS_FIELDS]);
  });

  it("재요청 메모를 이전 응답의 문제로 붙인다", () => {
    const b = buildAnalyzePrompt(input, ["[motive] 근거가 없다."]);
    expect(b.user).toContain("[이전 응답의 문제]");
    expect(b.user).toContain("- [motive] 근거가 없다.");
    expect(buildAnalyzePrompt(input).user).not.toContain("[이전 응답의 문제]");
  });

  it("금지 문자가 없다", () => {
    const b = buildAnalyzePrompt(input);
    expect(FORBIDDEN_CHARS.test(b.system + b.user)).toBe(false);
  });
});

function writeInput(over: Partial<WritePromptInput> = {}): WritePromptInput {
  return {
    core: {
      activityName: "이차함수 탐구",
      activityId: "a1",
      analysis: analysis({
        motive: "record",
        method: "student",
        result: "record",
      }),
    },
    supports: [],
    area: "subject",
    subject: "수학",
    activityName: null,
    schoolPrompt: "지원 동기를 쓰시오",
    promptKeywords: ["동기"],
    teacherNote: null,
    targetChars: 800,
    mode: "without_space",
    career: { career: "공학자", department: "수학과" },
    growth: null,
    ...over,
  };
}

describe("buildWritePrompt", () => {
  it("보조 활동이 없으면 3문단, 있으면 4문단(link 포함)을 요구한다", () => {
    const three = buildWritePrompt(writeInput());
    expect(three.system).toContain("3문단");
    expect(three.system).not.toContain("연계 발전 지점");
    const four = buildWritePrompt(
      writeInput({
        supports: [
          { activityId: "s1", activityName: "보조탐구", summary: "요약" },
        ],
      }),
    );
    expect(four.system).toContain("4문단");
    expect(four.system).toContain("연계 발전 지점");
    expect(four.user).toContain("s1");
    expect(four.user).toContain("보조탐구");
  });

  it("문체 규칙을 했다 체 예시와 함께 분명히 적는다", () => {
    const sys = buildWritePrompt(writeInput()).system;
    expect(sys).toContain("모든 문장은 '~했다'");
    expect(sys).toContain(
      "'~했습니다', '~합니다', '~해요', '~했어요' 는 쓰지 않는다",
    );
    expect(sys).toContain("상관계수를 계산했다(맞음)");
    expect(sys).toContain("상관계수를 계산했습니다(틀림)");
  });

  it("값이 있는 항목만 싣고 비운 항목은 싣지 않으며 student 출처를 표시한다", () => {
    const b = buildWritePrompt(writeInput());
    expect(b.user).toContain("motive값내용");
    expect(b.user).toContain("result값내용");
    expect(b.user).not.toContain("limitation값내용");
    expect(b.user).not.toContain("collaboration값내용");
    expect(b.user).toMatch(/method.*student/);
  });

  it("목표 글자 수가 있으면 ±5% 범위와 모드를 쓴다", () => {
    const b = buildWritePrompt(writeInput({ targetChars: 800 }));
    expect(b.system).toContain("760");
    expect(b.system).toContain("840");
    expect(b.system).toContain("공백 제외");
  });

  it("300자 이하면 필수 절만 쓰라는 규칙을 넣는다", () => {
    const b = buildWritePrompt(writeInput({ targetChars: 300 }));
    expect(b.system).toContain("문단당 문장 2개 이하");
    expect(
      buildWritePrompt(writeInput({ targetChars: 800 })).system,
    ).not.toContain("문단당 문장 2개 이하");
  });

  it("목표가 null 이면 500자 기준으로 쓴다", () => {
    const b = buildWritePrompt(writeInput({ targetChars: null }));
    expect(b.system).toContain("500자");
  });

  it("문항, 핵심 낱말, 선생님 요구사항, 진로를 user 에 싣는다", () => {
    const b = buildWritePrompt(
      writeInput({ teacherNote: "수치를 꼭 넣을 것" }),
    );
    for (const t of [
      "지원 동기를 쓰시오",
      "동기",
      "수치를 꼭 넣을 것",
      "공학자",
    ])
      expect(b.user).toContain(t);
    expect(buildWritePrompt(writeInput()).user).not.toContain(
      "선생님 요구사항",
    );
  });

  it("성장설계가 있으면 강조점으로만 쓰라고 안내한다", () => {
    const b = buildWritePrompt(
      writeInput({
        growth: {
          theme: "수학적 모델링",
          stageLabel: "꽃",
          weakAxisGuidelines: ["실험 설계를 드러낸다"],
        },
      }),
    );
    expect(b.user).toContain("수학적 모델링");
    expect(b.user).toContain("실험 설계를 드러낸다");
    expect(b.system).toContain("문장에 그대로 옮기지");
    expect(buildWritePrompt(writeInput()).user).not.toContain("성장설계");
  });

  it("응답 스키마는 문단 role enum 과 문장 evidence nullable 구조다", () => {
    const b = buildWritePrompt(writeInput());
    const json = JSON.stringify(b.responseSchema);
    for (const r of ["link", "process", "judgment", "wrap"])
      expect(json).toContain(r);
    expect(json).toContain("evidence");
    expect(json).toContain("feeling");
    expect(b.maxOutputTokens).toBe(3072);
  });

  it("금지 문자가 없다", () => {
    const b = buildWritePrompt(
      writeInput({
        growth: { theme: "t", stageLabel: null, weakAxisGuidelines: [] },
      }),
    );
    expect(FORBIDDEN_CHARS.test(b.system + b.user)).toBe(false);
  });
});

describe("buildVerifyPrompt", () => {
  const vin: VerifyPromptInput = {
    text: "계수를 바꿨다.",
    sentences: [{ id: "p1-s1", text: "계수를 바꿨다." }],
    schoolPrompt: "지원 동기",
    promptKeywords: ["동기"],
    teacherNote: null,
    coreTerms: { concepts: ["판별식"], roles: ["조장"], sources: ["교과서"] },
    supportNames: ["보조탐구"],
    growth: null,
  };

  it("루브릭 8항목의 확인 문장을 모두 싣고 pass 만 내게 한다", () => {
    const b = buildVerifyPrompt(vin);
    for (const r of SCORE_RUBRIC) {
      expect(b.user + b.system).toContain(r.key);
      for (const c of r.checks) expect(b.system + b.user).toContain(c);
    }
    expect(b.system).toContain("점수는 내지 않");
    expect(b.system).toContain("협업");
    expect(b.user).toContain("판별식");
    expect(b.user).toContain("보조탐구");
    expect(b.user).toContain("p1-s1");
    expect(b.maxOutputTokens).toBe(3072);
  });

  it("성장설계가 있을 때만 stageChecks 문장을 요구한다", () => {
    const without = buildVerifyPrompt(vin);
    expect(without.user).not.toContain("부족 축을 이 글에서 채웠는가");
    const withG = buildVerifyPrompt({
      ...vin,
      growth: { stageLabel: "꽃", currentSubtheme: "모델링" },
    });
    expect(withG.user).toContain(
      "학년 단계에 맞게 출발점에서 도착점으로 나아갔는가",
    );
    expect(withG.user).toContain(
      "성장설계가 지목한 부족 축을 이 글에서 채웠는가",
    );
    expect(withG.user).toContain("모델링");
  });

  it("응답 스키마는 8개 key enum 과 stageChecks 를 갖는다", () => {
    const json = JSON.stringify(buildVerifyPrompt(vin).responseSchema);
    for (const r of SCORE_RUBRIC) expect(json).toContain(r.key);
    expect(json).toContain("stageChecks");
    expect(json).toContain("pass");
  });

  it("금지 문자가 없다", () => {
    const b = buildVerifyPrompt({
      ...vin,
      growth: { stageLabel: "꽃", currentSubtheme: null },
    });
    expect(FORBIDDEN_CHARS.test(b.system + b.user)).toBe(false);
  });
});
