// 자기평가서 모델 단계(analyze, write, verify)의 프롬프트 조립. 순수 함수만 둔다.
// 모델 호출은 P4 가 callStructured 로 하고, 여기는 문자열과 응답 스키마만 만든다.
// 학생에게 보이는 생성물의 두 원칙(마크다운 금지, 기록에 없는 경험과 수치와 감정 금지)은
// 여기 프롬프트와 validation.ts 검증기 양쪽에서 강제한다. 프롬프트만 믿으면 새어 나온다.

import {
  CAUSAL_LINK_PHRASES,
  FORBIDDEN_PHRASES,
  SCORE_RUBRIC,
  SENTENCE_STYLE,
} from "./dictionaries.js";
import {
  type ActivityRecordLike,
  ANALYSIS_FIELD_LABELS,
  ANALYSIS_FIELDS,
  type Analysis,
  type AnalysisField,
  AREA_LABELS,
  type Area,
  BODY_EVIDENCE_FIELDS,
  DEFAULT_TARGET_CHARS,
  type ModelStepKey,
  PARAGRAPH_ROLE_LABELS,
  type ParagraphRole,
  SHORT_TARGET_MAX,
  TARGET_TOLERANCE,
  type TargetCharsMode,
} from "./types.js";
import { STAGE_CHECK_TEXTS, type ValidationIssue } from "./validation.js";

export type PromptBundle = {
  system: string;
  user: string;
  responseSchema: Record<string, unknown>;
  maxOutputTokens: number;
};

/** 단계별 응답 최대 출력 토큰. 잘리면 truncated 로 재요청하므로 넉넉히 두되 분량 규칙으로 누른다. */
export const MAX_OUTPUT_TOKENS: Record<
  Exclude<ModelStepKey, "link">,
  number
> = {
  analyze: 2048,
  write: 3072,
  verify: 3072,
};

export const COMMON_RULES = [
  "너는 고등학생이 학교생활 기록과 탐구 활동을 바탕으로 자기평가서를 쓰도록 돕는 도우미다.",
  "응답은 지정한 JSON 객체 하나만 낸다. JSON 밖에 설명이나 코드 블록 표시를 붙이지 않는다.",
  "",
  "기록 원칙",
  "- 입력으로 받은 기록에 있는 내용만 쓴다.",
  "- 기록에 없는 경험, 수치, 감정, 태도 변화를 만들지 않는다. 모자란 부분을 그럴듯하게 채우지 않는다.",
  "- 희망 대학 이름, 학교 이름, 학생 실명을 쓰지 않는다.",
  "- 진로를 억지로 연결하지 않는다. 기록에서 이어지는 만큼만 쓴다.",
  "",
  "표기 원칙",
  "- 마크다운 기호(제목 #, 목록 - 와 *, 번호 목록, 굵게, 코드)와 이모지를 쓰지 않는다. 평문만 쓴다.",
  `- 금지 표현: ${FORBIDDEN_PHRASES.map((p) => `"${p}"`).join(", ")}. 이 표현과 같은 뜻의 말도 쓰지 않는다.`,
  "",
  "글쓰기 원칙",
  "- 활동을 나열하지 않는다. 무엇을 판단했고 어떻게 고쳤는지 수정 과정을 쓴다.",
  "- 같은 문장이나 같은 뜻의 문장을 되풀이하지 않는다.",
].join("\n");

const json = (v: unknown): string => JSON.stringify(v, null, 1);

function withRetry(user: string, retryNotes: string[]): string {
  if (retryNotes.length === 0) return user;
  return `${user}\n\n[이전 응답의 문제]\n${retryNotes.map((n) => `- ${n}`).join("\n")}`;
}

/**
 * 검증 사유를 재요청 메모로 바꾼다. 잘림과 깨진 JSON 은 같은 길이로 다시 쓰면 또 잘리므로
 * 길이를 줄이라는 문장을 더한다. 프롬프트에는 문장 하나씩 목록으로 붙는다.
 */
export function buildRetryNotes(issues: ValidationIssue[]): string[] {
  const notes = issues.map((i) =>
    i.path
      ? `[${i.path}] ${i.message} 이 문제를 고쳐서 다시 작성해 주세요.`
      : `${i.message} 이 문제를 고쳐서 다시 작성해 주세요.`,
  );
  if (issues.some((i) => i.code === "truncated" || i.code === "invalid_json")) {
    notes.push(
      "이전 응답이 출력 한도를 넘어 잘렸다. 글 길이를 절반 이하로 줄여 다시 작성한다. 같은 뜻의 문장을 반복하지 않는다.",
    );
  }
  return notes;
}

// ---------------------------------------------------------------------------
// analyze: 7항목 기록을 11항목으로 재배치
// ---------------------------------------------------------------------------

const ANALYZE_RULES = [
  "이번 작업: 활동 기록 분석",
  "활동 기록(주제, 개념, 방법, 결과, 한계, 수치, 자료)을 아래 11항목으로 옮겨 담는다.",
  "- 기록에서 확인되지 않는 항목은 빈 문자열로 둔다. 추측으로 채우지 않는다.",
  "- 문장을 새로 만들지 않고 기록에 있는 문구를 옮긴다. 필요하면 어미만 다듬는다.",
  "- 진로 연결 항목에 대학 이름을 쓰지 않는다.",
  "- 항목마다 한두 문장 이내로 짧게 쓴다.",
].join("\n");

const analyzeSchema = {
  type: "object",
  properties: {
    values: {
      type: "object",
      properties: Object.fromEntries(
        ANALYSIS_FIELDS.map((f) => [f, { type: "string" }]),
      ),
      required: [...ANALYSIS_FIELDS],
    },
  },
  required: ["values"],
};

export type AnalyzePromptInput = {
  record: ActivityRecordLike;
  area: Area;
  subject: string | null;
  activityName: string | null;
};

export function buildAnalyzePrompt(
  input: AnalyzePromptInput,
  retryNotes: string[] = [],
): PromptBundle {
  const { record } = input;
  const recordView = {
    topic: record.topic,
    concept: record.concept,
    method: record.method,
    result: record.result,
    limitation: record.limitation,
    numbers: record.numbers,
    sources: record.sources,
  };
  const fields = ANALYSIS_FIELDS.map(
    (f) => `- ${f}: ${ANALYSIS_FIELD_LABELS[f]}`,
  ).join("\n");
  const head = [
    `작성 영역: ${AREA_LABELS[input.area]}`,
    input.subject ? `교과: ${input.subject}` : null,
    input.activityName ? `활동 이름: ${input.activityName}` : null,
  ]
    .filter((x): x is string => x !== null)
    .join("\n");
  return {
    system: `${COMMON_RULES}\n\n${ANALYZE_RULES}`,
    user: withRetry(
      `${head}\n\n[활동 기록]\n${json(recordView)}\n\n[채울 11항목]\n${fields}`,
      retryNotes,
    ),
    responseSchema: analyzeSchema,
    maxOutputTokens: MAX_OUTPUT_TOKENS.analyze,
  };
}

// ---------------------------------------------------------------------------
// write: 근거가 붙은 본문 생성
// ---------------------------------------------------------------------------

export type WritePromptInput = {
  core: {
    activityName: string;
    analysis: Analysis;
    activityId: string;
    sourceType: "P" | "D" | "A";
  };
  /** 핵심 활동 밖의 선택 기록(완료된 것만). 7항목, 요약, 성찰을 summary 에 담는다(명세 No.144). */
  supports: {
    activityId: string;
    activityName: string;
    sourceType: "P" | "D" | "A";
    summary: string;
    /** 연계 문장을 쓸 기록이면 연계 유형, 단계, 강도, 인용. 기여 항목으로만 쓰면 null. */
    link: string | null;
    /** link 는 연계 문장을 쓰고, contribute 는 기여 항목으로만 쓴다(명세 No.181, 193~195). */
    linkMode: "link" | "contribute";
    /** 연계 문장에 적을 앞 기록의 구체물 낱말(명세 No.189). */
    carried: string[];
    /** 근거로 쓸 수 있는(값이 있는) 항목. */
    items: AnalysisField[];
  }[];
  /** 학생이 확인했고 포함으로 둔 수기 메모(명세 No.161). */
  memos: { id: string; writtenAt: string | null; text: string }[];
  area: Area;
  subject: string | null;
  activityName: string | null;
  /** 학교 문항이 없으면 null. 문항 블록과 문항 규칙을 빼고 만든다. */
  schoolPrompt: string | null;
  promptKeywords: string[];
  teacherNote: string | null;
  targetChars: number | null;
  mode: TargetCharsMode;
  career: { career: string | null; department: string | null };
  growth: {
    theme: string;
    stageLabel: string | null;
    weakAxisGuidelines: string[];
  } | null;
};

const MODE_LABELS: Record<TargetCharsMode, string> = {
  with_space: "공백 포함",
  without_space: "공백 제외",
};

const writeSchema = {
  type: "object",
  properties: {
    paragraphs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          sentences: {
            type: "array",
            items: {
              type: "object",
              properties: {
                text: { type: "string" },
                evidence: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      refId: { type: "string" },
                      item: {
                        type: "string",
                        enum: [...BODY_EVIDENCE_FIELDS],
                      },
                      weight: { type: "string", enum: ["main", "sub"] },
                    },
                    required: ["refId", "item", "weight"],
                  },
                },
              },
              required: ["text", "evidence"],
            },
          },
        },
        required: ["sentences"],
      },
    },
  },
  required: ["paragraphs"],
};

/** 본문 흐름 단계별 안내(명세 No.44). 문단 수와 무관하게 이 순서로 쓴다. */
const FLOW_GUIDES: Record<ParagraphRole, string> = {
  link: "앞 활동의 이름과 그 활동이 남긴 것",
  process: "측정 기준이나 방법을 스스로 정하고 바꾼 대목",
  judgment: "확인한 값과 그 값으로 무엇을 판단했고 무엇을 포기했는지",
  wrap: "개념으로 정리하고 처음 질문으로 돌아오기",
};

function lengthRules(
  targetChars: number | null,
  mode: TargetCharsMode,
  hasLink: boolean,
): string[] {
  const modeLabel = MODE_LABELS[mode];
  const rules: string[] = [];
  if (targetChars === null) {
    rules.push(
      `- 분량은 ${DEFAULT_TARGET_CHARS}자(${modeLabel}) 안팎으로 쓴다.`,
    );
  } else {
    const lo = Math.round(targetChars * (1 - TARGET_TOLERANCE));
    const hi = Math.round(targetChars * (1 + TARGET_TOLERANCE));
    rules.push(
      `- 분량은 ${modeLabel} ${targetChars}자의 오차 5% 안(${lo}자 이상 ${hi}자 이하)으로 맞춘다.`,
    );
  }
  rules.push("- 문장 하나는 40자에서 90자 사이로 쓴다.");
  if (targetChars !== null && targetChars <= SHORT_TARGET_MAX) {
    rules.push(
      `- 분량이 짧으므로 선택 절은 빼고 흐름 단계마다 꼭 필요한 절만 쓴다. 단계마다 문장 2개 이하로 쓰고${hasLink ? ", 연계 발전 지점은 한 문장으로 쓴다" : ""}.`,
    );
  } else {
    rules.push(
      "- 흐름 단계마다 반드시 들어갈 필수 절을 먼저 채운 뒤 목표 분량에 닿을 때까지 선택 절을 더한다. 단계마다 문장은 2개에서 4개로 쓴다.",
    );
  }
  return rules;
}

function writeSystem(input: WritePromptInput): string {
  const hasLink = input.supports.some((s) => s.linkMode === "link");
  const hasContribute = input.supports.some((s) => s.linkMode === "contribute");
  const steps = hasLink
    ? (["link", "process", "judgment", "wrap"] as const)
    : (["process", "judgment", "wrap"] as const);
  const structure = [
    "이번 작업: 자기평가서 본문 작성. 문단 수는 정하지 않는다. 아래 흐름 순서로 쓰고 문단 나눔은 분량에 따른다.",
    ...steps.map((r) => `- ${PARAGRAPH_ROLE_LABELS[r]}: ${FLOW_GUIDES[r]}`),
    ...(hasLink
      ? []
      : [
          "- 연계된 보조 활동이 없으므로 연계 발전 지점은 쓰지 않는다. 없는 앞 활동을 지어내지 않는다.",
        ]),
    ...(hasLink
      ? [
          "- 연계 기록은 그 기록이 처음 나오는 문장에서 연계가 드러나게 쓴다. 무엇을 이어받았는지, 빌렸는지, 보완했는지를 밝히고, 기록 이름만 늘어놓는 문장은 쓰지 않는다.",
          "- 그 연계 문장에는 입력에 적힌 구체물 낱말(개념명, 자료명, 방법명, 수치) 중 하나를 반드시 적는다.",
          "- 연계 유형과 인용은 입력에 적힌 것만 쓴다. 입력에 없는 연계를 지어내지 않는다.",
        ]
      : [
          "- 연계 문장은 쓰지 않는다. 핵심 기록만으로 쓰고, 연계 없는 기록으로 분량을 채우지 않는다.",
        ]),
    ...(hasContribute
      ? [
          `- [기여 항목으로만 쓸 기록]은 근거로 쓸 수 있는 항목만 문장에 더하고 연계 문장은 만들지 않는다. ${CAUSAL_LINK_PHRASES.map((p) => `'~${p}'`).join(", ")} 처럼 인과나 출처를 말하는 표현으로 그 기록을 잇지 않는다. 학생이 지운 연계를 되살려 쓰지 않는다.`,
        ]
      : []),
    "- 하지 않은 계획이나 예정 문장은 쓰지 않는다(계획을 세움, ~할 예정, ~할 것임, ~하고 싶음). 다음 단계는 기록 근거가 있는 실제 후속 행동만 쓴다.",
    `- 모든 문장은 '~${SENTENCE_STYLE}' 처럼 명사형으로 끝낸다(예: 확인함, 세움, 깨달음, 있음, 없음). '~했다', '~한다', '~합니다', '~해요' 는 쓰지 않는다.`,
    "- 한 문장 안에서 어미를 섞어 쓰지 않는다. 앞 절은 연결형으로 이어 쓰고 문장 끝만 명사형으로 맺는다(예: '표를 만들고 값을 비교함').",
    "- 모든 문장은 마침표로 끝낸다(예: '확인함.'). 문장 사이는 마침표로 나뉜다.",
    `- 예: '상관계수를 계산${SENTENCE_STYLE}(맞음)', '상관계수를 계산했다(틀림)'`,
  ];
  const evidence = [
    "근거 표시",
    "- 모든 문장에 evidence 를 붙인다. evidence 는 배열이고 항목마다 refId, item, weight 를 쓴다. refId 는 입력에 나온 기록 id 또는 수기 메모 id, item 은 그 기록에서 값이 있는 항목 이름이다. 핵심 문장에 쓴 근거는 main, 곁들인 근거는 sub 로 한다.",
    "- 한 문장에 근거가 여럿이면 모두 쓴다. 근거가 없는 문장은 evidence 를 빈 배열로 둔다. 가장 비슷한 기록을 근거로 붙이지 않는다.",
    "- 값이 비어 있는 항목은 쓰지 않고 evidence 로도 가리키지 않는다.",
    "- 수기 메모는 motive, action, method, limitation 항목의 근거로만 쓴다. 수기 메모만으로 결과 수치를 만들지 않는다.",
    "- 출처가 student 인 항목은 학생이 직접 적은 내용이므로 그대로 쓰되 evidence 를 붙인다.",
  ];
  const guide = [
    "내용 원칙",
    ...(input.schoolPrompt !== null
      ? ["- 학교 문항의 핵심 낱말에 직접 답하는 문장을 넣는다."]
      : []),
    "- 선생님 요구사항이 있으면 반드시 지킨다.",
    "- 성장설계 정보가 주어지면 어디에 힘을 줄지 고르는 강조점으로만 쓴다. 방향 문구를 문장에 그대로 옮기지 않는다.",
  ];
  return [
    COMMON_RULES,
    "",
    structure.join("\n"),
    "",
    ["분량 원칙", ...lengthRules(input.targetChars, input.mode, hasLink)].join(
      "\n",
    ),
    "",
    evidence.join("\n"),
    "",
    guide.join("\n"),
  ].join("\n");
}

function writeUser(input: WritePromptInput): string {
  const { core } = input;
  const filled = BODY_EVIDENCE_FIELDS.filter(
    (f) =>
      core.analysis.sources[f] !== "empty" && core.analysis.values[f] !== "",
  );
  const fieldLines = filled.map(
    (f) =>
      `- ${f}(${ANALYSIS_FIELD_LABELS[f]}) 출처 ${core.analysis.sources[f]}: ${core.analysis.values[f]}`,
  );
  const parts: string[] = [
    [
      `작성 영역: ${AREA_LABELS[input.area]}`,
      input.subject ? `교과: ${input.subject}` : null,
      input.activityName ? `활동 이름: ${input.activityName}` : null,
    ]
      .filter((x): x is string => x !== null)
      .join("\n"),
    `[핵심 활동] id=${core.activityId} 유형=${core.sourceType} 이름=${core.activityName}\n근거로 쓸 수 있는 항목(field): ${filled.join(", ")}\n${fieldLines.join("\n")}`,
  ];
  const supportLine = (s: WritePromptInput["supports"][number]) =>
    `- id=${s.activityId} 유형=${s.sourceType} 이름=${s.activityName}: ${s.summary}\n  근거로 쓸 수 있는 항목(field): ${s.items.join(", ")}${s.link === null ? "" : `\n  ${s.link}`}${s.carried.length === 0 ? "" : `\n  구체물 낱말: ${s.carried.join(", ")}`}`;
  const linked = input.supports.filter((s) => s.linkMode === "link");
  const contributeOnly = input.supports.filter(
    (s) => s.linkMode === "contribute",
  );
  if (linked.length > 0) {
    parts.push(
      `[연계 기록] 흐름 단계 어디서든 근거가 있는 만큼 쓰되, 처음 나오는 문장에서 연계를 드러낸다.\n${linked.map(supportLine).join("\n")}`,
    );
  }
  if (contributeOnly.length > 0) {
    parts.push(
      `[기여 항목으로만 쓸 기록] 연계 문장 없이 근거로 쓸 수 있는 항목만 쓴다.\n${contributeOnly.map(supportLine).join("\n")}`,
    );
  }
  if (input.memos.length > 0) {
    parts.push(
      `[확인된 수기 메모] 근거 항목은 motive, action, method, limitation 만 쓴다.\n${input.memos
        .map((m) => `- id=${m.id} 날짜=${m.writtenAt ?? "없음"}: ${m.text}`)
        .join("\n")}`,
    );
  }
  if (input.schoolPrompt !== null) {
    parts.push(`[학교 문항]\n${input.schoolPrompt}`);
    if (input.promptKeywords.length > 0) {
      parts.push(`[문항의 핵심 낱말]\n${input.promptKeywords.join(", ")}`);
    }
  }
  if (input.teacherNote) {
    parts.push(`[선생님 요구사항]\n${input.teacherNote}`);
  }
  const careerLines = [
    input.career.career ? `희망 진로: ${input.career.career}` : null,
    input.career.department ? `희망 학과: ${input.career.department}` : null,
  ].filter((x): x is string => x !== null);
  if (careerLines.length > 0) parts.push(`[진로]\n${careerLines.join("\n")}`);
  if (input.growth) {
    const g = input.growth;
    parts.push(
      [
        "[성장설계 강조점]",
        `주제: ${g.theme}`,
        g.stageLabel ? `현재 단계: ${g.stageLabel}` : null,
        g.weakAxisGuidelines.length > 0
          ? `보완할 방향:\n${g.weakAxisGuidelines.map((x) => `- ${x}`).join("\n")}`
          : null,
      ]
        .filter((x): x is string => x !== null)
        .join("\n"),
    );
  }
  return parts.join("\n\n");
}

export function buildWritePrompt(
  input: WritePromptInput,
  retryNotes: string[] = [],
): PromptBundle {
  return {
    system: writeSystem(input),
    user: withRetry(writeUser(input), retryNotes),
    responseSchema: writeSchema,
    maxOutputTokens: MAX_OUTPUT_TOKENS.write,
  };
}

// ---------------------------------------------------------------------------
// verify: 확인 문장별 pass 판정
// ---------------------------------------------------------------------------

export type VerifyPromptInput = {
  text: string;
  sentences: { id: string; text: string }[];
  /** 학교 문항이 없으면 null. 문항 대응 확인 문장을 요구하지 않는다. */
  schoolPrompt: string | null;
  promptKeywords: string[];
  teacherNote: string | null;
  coreTerms: { concepts: string[]; roles: string[]; sources: string[] };
  supportNames: string[];
  /** 연계 문장을 써야 하고 본문이 인용한 기록. 모델이 연계 판정을 낸다(명세 No.182, 190). */
  linkTargets: { recordId: string; label: string; sentenceIds: string[] }[];
  growth: { stageLabel: string | null; currentSubtheme: string | null } | null;
};

const VERIFY_RULES = [
  "이번 작업: 자기평가서 본문 점검",
  "아래 채점 항목마다 확인 문장이 본문에서 충족되는지 pass 로 판정한다.",
  "- 점수는 내지 않는다. 확인 문장마다 true 또는 false 만 낸다.",
  "- 글의 구조를 보고 판정한다. 특정 활동의 표현이 있어야만 통과로 보는 식으로 조건을 만들지 않는다.",
  "- 개념, 역할, 자료 이름은 입력의 핵심 낱말 목록에 있는 낱말과 대조해 판정한다.",
  "- 협업을 서술했는지는 채점하지 않는다.",
  '- "계획을 세움", "~할 예정" 같은 미래 계획 문장은 인정하지 않는다. 후속 항목은 실제로 한 후속 행동만 통과로 본다.',
  "- 확인 문장의 text 는 바꾸지 않고 순서도 그대로 둔다.",
  "- 연계 점검 대상이 있으면 linkChecks 에 대상마다 recordId, linkShown, standsWithout 을 낸다. 이 판정은 점수와 무관하다. linkShown 은 그 기록이 처음 나오는 문장에서 무엇을 이어받았는지, 빌렸는지, 보완했는지가 드러나면 true 다. standsWithout 은 그 기록을 인용한 문장을 모두 빼도 나머지 문장이 그대로 성립하면 true 다.",
].join("\n");

const checkSchema = {
  type: "object",
  properties: { text: { type: "string" }, pass: { type: "boolean" } },
  required: ["text", "pass"],
};

const verifySchema = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string", enum: SCORE_RUBRIC.map((r) => r.key) },
          checks: { type: "array", items: checkSchema },
        },
        required: ["key", "checks"],
      },
    },
    stageChecks: { type: "array", items: checkSchema },
    linkChecks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          recordId: { type: "string" },
          linkShown: { type: "boolean" },
          standsWithout: { type: "boolean" },
        },
        required: ["recordId", "linkShown", "standsWithout"],
      },
    },
  },
  required: ["items", "stageChecks", "linkChecks"],
};

export function buildVerifyPrompt(
  input: VerifyPromptInput,
  retryNotes: string[] = [],
): PromptBundle {
  const rubric = SCORE_RUBRIC.filter(
    (r) => r.key !== "prompt" || input.schoolPrompt !== null,
  )
    .map(
      (r) =>
        `${r.key}(${r.label})\n${r.checks.map((c) => `  - ${c}`).join("\n")}`,
    )
    .join("\n");
  const parts: string[] = [
    `[채점 항목과 확인 문장]\n${rubric}`,
    `[본문]\n${input.text}`,
    `[문장 목록]\n${input.sentences.map((s) => `${s.id}: ${s.text}`).join("\n")}`,
  ];
  if (input.schoolPrompt !== null) {
    parts.push(`[학교 문항]\n${input.schoolPrompt}`);
  }
  if (input.schoolPrompt !== null && input.promptKeywords.length > 0) {
    parts.push(`[문항의 핵심 낱말]\n${input.promptKeywords.join(", ")}`);
  }
  if (input.teacherNote) {
    parts.push(`[선생님 요구사항]\n${input.teacherNote}`);
  }
  parts.push(
    `[핵심 낱말 목록]\n${json({ concepts: input.coreTerms.concepts, roles: input.coreTerms.roles, sources: input.coreTerms.sources })}`,
  );
  if (input.supportNames.length > 0) {
    parts.push(`[앞선 활동 이름]\n${input.supportNames.join(", ")}`);
  }
  parts.push(
    input.linkTargets.length > 0
      ? `[연계 점검 대상]\n${input.linkTargets
          .map(
            (t) =>
              `- recordId=${t.recordId} 이름=${t.label} 인용한 문장: ${t.sentenceIds.join(", ")}`,
          )
          .join("\n")}`
      : "linkChecks 는 빈 배열로 낸다.",
  );
  if (input.growth) {
    parts.push(
      [
        "[성장설계 점검]",
        input.growth.stageLabel
          ? `현재 단계: ${input.growth.stageLabel}`
          : null,
        input.growth.currentSubtheme
          ? `이번 학년 하위 주제: ${input.growth.currentSubtheme}`
          : null,
        "stageChecks 에 아래 확인 문장을 이 순서대로 판정해 담는다.",
        ...STAGE_CHECK_TEXTS.map((t) => `  - ${t}`),
      ]
        .filter((x): x is string => x !== null)
        .join("\n"),
    );
  } else {
    parts.push("stageChecks 는 빈 배열로 낸다.");
  }
  return {
    system: `${COMMON_RULES}\n\n${VERIFY_RULES}`,
    user: withRetry(parts.join("\n\n"), retryNotes),
    responseSchema: verifySchema,
    maxOutputTokens: MAX_OUTPUT_TOKENS.verify,
  };
}
