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
      sourceType: "P",
      analysis: analysis({
        motive: "record",
        method: "student",
        result: "record",
      }),
    },
    supports: [],
    memos: [],
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
  it("문단 수를 고정하지 않고 흐름 순서와 문단 나눔 기준을 적는다(명세 No.44)", () => {
    const sys = buildWritePrompt(
      writeInput({
        supports: [
          {
            activityId: "s1",
            activityName: "보조탐구",
            sourceType: "D",
            summary: "요약",
            link: "연계 유형 이어받음, 핵심에서 1단계, 명시, 학생 확인",
            linkMode: "link",
            carried: ["수요"],
            items: ["method"],
          },
        ],
      }),
    ).system;
    expect(sys).toContain("문단 수는 정하지 않는다");
    expect(sys).toContain("문단 나눔은 분량에 따른다");
    expect(sys).not.toMatch(/[34]문단/);
    const order = ["연계 발전 지점", "과정", "판단", "정리"].map((l) =>
      sys.indexOf(`- ${l}:`),
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(sys).toContain("앞 활동의 이름과 그 활동이 남긴 것");
    expect(sys).toContain("측정 기준이나 방법을 스스로 정하고 바꾼 대목");
    expect(sys).toContain(
      "확인한 값과 그 값으로 무엇을 판단했고 무엇을 포기했는지",
    );
    expect(sys).toContain("개념으로 정리하고 처음 질문으로 돌아오기");
  });

  it("연계된 보조 활동이 없으면 연계 발전 지점을 쓰지 않고 앞 활동을 지어내지 않는다", () => {
    const none = buildWritePrompt(writeInput()).system;
    expect(none).not.toContain("- 연계 발전 지점:");
    expect(none).toContain("연계 발전 지점은 쓰지 않는다");
    expect(none).toContain("없는 앞 활동을 지어내지 않는다");
    const withSupport = buildWritePrompt(
      writeInput({
        supports: [
          {
            activityId: "s1",
            activityName: "보조탐구",
            sourceType: "D",
            summary: "요약",
            link: "연계 유형 이어받음, 핵심에서 1단계, 명시, 학생 확인",
            linkMode: "link",
            carried: ["수요"],
            items: ["method"],
          },
        ],
      }),
    );
    expect(withSupport.system).toContain("- 연계 발전 지점:");
    expect(withSupport.system).not.toContain("연계 발전 지점은 쓰지 않는다");
    expect(withSupport.user).toContain("s1");
    expect(withSupport.user).toContain("보조탐구");
  });

  describe("연계 문장 규칙(명세 No.181, 189, 193~195)", () => {
    const linked = {
      activityId: "s1",
      activityName: "보조탐구",
      sourceType: "D" as const,
      summary: "요약",
      link: "연계 유형 이어받음, 핵심에서 1단계, 명시, 학생 확인",
      linkMode: "link" as const,
      carried: ["수요", "탄력성"],
      items: ["method" as const],
    };
    const contrib = {
      ...linked,
      activityId: "s2",
      activityName: "곁탐구",
      link: null,
      linkMode: "contribute" as const,
      carried: [],
    };

    it("연계 기록은 처음 나오는 문장에서 연계를 드러내고 구체물 낱말을 적게 한다", () => {
      const b = buildWritePrompt(writeInput({ supports: [linked] }));
      expect(b.system).toContain("처음 나오는 문장에서 연계가 드러나게 쓴다");
      expect(b.system).toContain("무엇을 이어받았는지, 빌렸는지, 보완했는지");
      expect(b.system).toContain("기록 이름만 늘어놓는 문장은 쓰지 않는다");
      expect(b.system).toContain("구체물 낱말");
      expect(b.user).toContain("[연계 기록]");
      expect(b.user).toContain(
        "연계 유형 이어받음, 핵심에서 1단계, 명시, 학생 확인",
      );
      expect(b.user).toContain("구체물 낱말: 수요, 탄력성");
    });

    it("기여 항목으로만 쓸 기록은 따로 나누고 연계 문장과 인과 표현을 막는다", () => {
      const b = buildWritePrompt(writeInput({ supports: [linked, contrib] }));
      expect(b.user).toContain("[기여 항목으로만 쓸 기록]");
      expect(b.user.indexOf("곁탐구")).toBeGreaterThan(
        b.user.indexOf("[기여 항목으로만 쓸 기록]"),
      );
      expect(b.user.indexOf("보조탐구")).toBeLessThan(
        b.user.indexOf("[기여 항목으로만 쓸 기록]"),
      );
      expect(b.system).toContain("연계 문장은 만들지 않는다");
      for (const phrase of ["을 바탕으로", "를 바탕으로", "에서 이어"]) {
        expect(b.system).toContain(`'~${phrase}'`);
      }
      expect(b.system).toContain("학생이 지운 연계를 되살려 쓰지 않는다");
    });

    it("연계 기록이 없으면 핵심만으로 쓰고 연계 문장과 연계 발전 지점을 쓰지 않는다", () => {
      for (const supports of [[], [contrib]]) {
        const b = buildWritePrompt(writeInput({ supports }));
        expect(b.system).toContain("핵심 기록만으로 쓰고");
        expect(b.system).toContain("연계 없는 기록으로 분량을 채우지 않는다");
        expect(b.system).not.toContain("- 연계 발전 지점:");
        expect(b.system).not.toContain("처음 나오는 문장에서 연계가 드러나게");
      }
    });

    it("연계 기록만 있으면 기여 항목 구역과 규칙을 넣지 않는다", () => {
      const b = buildWritePrompt(writeInput({ supports: [linked] }));
      expect(b.user).not.toContain("[기여 항목으로만 쓸 기록]");
      expect(b.system).not.toContain("연계 문장은 만들지 않는다");
    });
  });

  it("계획과 예정 문장을 쓰지 않고 후속은 기록 근거가 있는 실제 행동만 쓰게 한다", () => {
    const sys = buildWritePrompt(writeInput()).system;
    expect(sys).toContain("하지 않은 계획이나 예정 문장은 쓰지 않는다");
    expect(sys).toContain("계획을 세움, ~할 예정, ~할 것임, ~하고 싶음");
    expect(sys).toContain("기록 근거가 있는 실제 후속 행동만 쓴다");
  });

  it("다음 단계(next) 항목은 값이 있어도 본문 생성 입력에 싣지 않는다(명세 No.37)", () => {
    const b = buildWritePrompt(
      writeInput({
        core: {
          activityName: "이차함수 탐구",
          activityId: "a1",
          sourceType: "P",
          analysis: analysis({ motive: "record", next: "record" }),
        },
      }),
    );
    expect(b.user).toContain("motive값내용");
    expect(b.user).not.toContain("next값내용");
    expect(b.user).not.toMatch(/next\(/);
    expect(JSON.stringify(b.responseSchema)).not.toContain('"next"');
  });

  it("문체 규칙을 ~함 체 예시와 함께 분명히 적는다", () => {
    const sys = buildWritePrompt(writeInput()).system;
    expect(sys).toContain("모든 문장은 '~함' 처럼 명사형으로 끝낸다");
    expect(sys).toContain("확인함, 세움, 깨달음");
    expect(sys).toContain(
      "'~했다', '~한다', '~합니다', '~해요' 는 쓰지 않는다",
    );
    expect(sys).toContain("한 문장 안에서 어미를 섞어 쓰지 않는다");
    expect(sys).toContain("상관계수를 계산함(맞음)");
    expect(sys).toContain("상관계수를 계산했다(틀림)");
  });

  it("문장마다 끝에 마침표를 찍으라고 적는다", () => {
    const sys = buildWritePrompt(writeInput()).system;
    expect(sys).toContain("모든 문장은 마침표로 끝낸다(예: '확인함.')");
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

  it("300자 이하면 흐름 단계마다 필수 절만 쓰라는 규칙을 넣는다(명세 No.47)", () => {
    const b = buildWritePrompt(writeInput({ targetChars: 300 }));
    expect(b.system).toContain(
      "선택 절은 빼고 흐름 단계마다 꼭 필요한 절만 쓴다",
    );
    expect(b.system).toContain("단계마다 문장 2개 이하");
    expect(b.system).not.toMatch(/문단당/);
    const long = buildWritePrompt(writeInput({ targetChars: 800 })).system;
    expect(long).not.toContain("선택 절은 빼고");
    expect(long).toContain(
      "필수 절을 먼저 채운 뒤 목표 분량에 닿을 때까지 선택 절을 더한다",
    );
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
          stageLabel: "개화",
          weakAxisGuidelines: ["실험 설계를 드러낸다"],
        },
      }),
    );
    expect(b.user).toContain("수학적 모델링");
    expect(b.user).toContain("실험 설계를 드러낸다");
    expect(b.system).toContain("문장에 그대로 옮기지");
    expect(buildWritePrompt(writeInput()).user).not.toContain("성장설계");
  });

  it("응답 스키마는 role 없이 문단과 문장 evidence 배열 구조이고 모델 feeling 신고는 받지 않는다", () => {
    const b = buildWritePrompt(writeInput());
    const json = JSON.stringify(b.responseSchema);
    for (const r of ["link", "process", "judgment", "wrap"])
      expect(json).not.toContain(r);
    expect(json).toContain("evidence");
    expect(json).not.toContain("feeling");
    expect(b.maxOutputTokens).toBe(3072);
    const sentence = (
      b.responseSchema as {
        properties: {
          paragraphs: {
            items: {
              properties: {
                sentences: {
                  items: {
                    properties: {
                      evidence: {
                        type: string;
                        items: { required: string[] };
                      };
                    };
                  };
                };
              };
            };
          };
        };
      }
    ).properties.paragraphs.items.properties.sentences.items.properties;
    expect(sentence.evidence.type).toBe("array");
    expect(sentence.evidence.items.required).toEqual([
      "refId",
      "item",
      "weight",
    ]);
  });

  it("근거 규칙: 후보만 내고 없으면 빈 배열, 수기 메모는 네 항목만, 가까운 기록을 붙이지 않는다", () => {
    const sys = buildWritePrompt(writeInput()).system;
    expect(sys).toContain("evidence 는 배열이고 항목마다 refId, item, weight");
    expect(sys).toContain("근거가 없는 문장은 evidence 를 빈 배열로 둔다");
    expect(sys).toContain("수기 메모는 motive, action, method, limitation");
    expect(sys).toContain("가장 비슷한 기록을 근거로 붙이지 않는다");
  });

  it("핵심 활동 외 기록은 흐름 단계 어디서든 쓸 수 있고 항목, 유형, 연계 정보를 싣는다(명세 No.144)", () => {
    const b = buildWritePrompt(
      writeInput({
        supports: [
          {
            activityId: "s1",
            activityName: "보조탐구",
            sourceType: "D",
            summary: "방법: 표 정리 / 요약: 요약 글 / 성찰: 성찰 글",
            link: '연계 유형 deepen, 인용 "앞 인용"',
            linkMode: "link",
            carried: [],
            items: ["method", "result"],
          },
        ],
      }),
    );
    expect(b.user).not.toContain("연계 발전 지점에서만");
    expect(b.user).toContain("id=s1");
    expect(b.user).toContain("유형=D");
    expect(b.user).toContain("method, result");
    expect(b.user).toContain("성찰 글");
    expect(b.user).toContain('연계 유형 deepen, 인용 "앞 인용"');
  });

  it("확인된 수기 메모를 날짜와 글과 함께 싣는다(명세 No.5, 161)", () => {
    const b = buildWritePrompt(
      writeInput({
        memos: [{ id: "m1", writtenAt: "2026-05-03", text: "계수를 바꿔 봄" }],
      }),
    );
    expect(b.user).toContain("[확인된 수기 메모]");
    expect(b.user).toContain("id=m1 날짜=2026-05-03: 계수를 바꿔 봄");
    expect(buildWritePrompt(writeInput()).user).not.toContain("수기 메모]");
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

describe("학교 문항 없음 프롬프트", () => {
  it("쓰기: 학교 문항 블록, 핵심 낱말, 문항 답변 규칙을 넣지 않는다", () => {
    const b = buildWritePrompt(
      writeInput({ schoolPrompt: null, promptKeywords: [] }),
    );
    expect(b.user).not.toContain("[학교 문항]");
    expect(b.user).not.toContain("[문항의 핵심 낱말]");
    expect(b.system).not.toContain("학교 문항의 핵심 낱말");
  });

  it("쓰기: 문항이 있으면 블록과 규칙이 그대로 있다", () => {
    const b = buildWritePrompt(writeInput({ schoolPrompt: "지원 동기" }));
    expect(b.user).toContain("[학교 문항]\n지원 동기");
    expect(b.system).toContain("학교 문항의 핵심 낱말");
  });

  it("검증: 문항 블록 없이 문항 대응 확인 문장을 요구하지 않는다", () => {
    const b = buildVerifyPrompt({
      text: "계수를 바꿨다.",
      sentences: [{ id: "p1-s1", text: "계수를 바꿨다." }],
      schoolPrompt: null,
      promptKeywords: [],
      teacherNote: null,
      coreTerms: { concepts: [], roles: [], sources: [] },
      supportNames: [],
      linkTargets: [],
      growth: null,
    });
    expect(b.user).not.toContain("[학교 문항]");
    const promptRow = SCORE_RUBRIC.find((r) => r.key === "prompt");
    for (const c of promptRow?.checks ?? []) expect(b.user).not.toContain(c);
    expect(b.user).not.toContain("prompt(");
    expect(b.user).toContain("judgment(");
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
    linkTargets: [],
    growth: null,
  };

  it("연계 점검 대상이 있으면 기록별 판정을 점수와 따로 요구한다(명세 No.182, 190)", () => {
    const b = buildVerifyPrompt({
      ...vin,
      linkTargets: [
        { recordId: "s1", label: "보조탐구", sentenceIds: ["p1-s2", "p1-s3"] },
      ],
    });
    expect(b.user).toContain("[연계 점검 대상]");
    expect(b.user).toContain(
      "recordId=s1 이름=보조탐구 인용한 문장: p1-s2, p1-s3",
    );
    expect(b.system).toContain("linkShown");
    expect(b.system).toContain("standsWithout");
    expect(b.system).toContain("점수와 무관하다");
    const schema = b.responseSchema as {
      required: string[];
      properties: { linkChecks: { items: { required: string[] } } };
    };
    expect(schema.required).toContain("linkChecks");
    expect(schema.properties.linkChecks.items.required).toEqual([
      "recordId",
      "linkShown",
      "standsWithout",
    ]);
  });

  it("연계 점검 대상이 없으면 linkChecks 를 빈 배열로 내게 한다", () => {
    const b = buildVerifyPrompt(vin);
    expect(b.user).not.toContain("[연계 점검 대상]");
    expect(b.user).toContain("linkChecks 는 빈 배열로 낸다");
  });

  it("미래 계획 문장은 인정하지 않는다는 규칙을 넣는다(명세 No.53)", () => {
    const sys = buildVerifyPrompt(vin).system;
    expect(sys).toContain(
      '"계획을 세움", "~할 예정" 같은 미래 계획 문장은 인정하지 않는다',
    );
  });

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
      growth: { stageLabel: "개화", currentSubtheme: "모델링" },
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
      growth: { stageLabel: "개화", currentSubtheme: null },
    });
    expect(FORBIDDEN_CHARS.test(b.system + b.user)).toBe(false);
  });
});
