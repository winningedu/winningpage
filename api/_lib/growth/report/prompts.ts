// 성장설계 리포트 모델 단계(1, 3, 4, 5, 6, 7)의 프롬프트 조립, 응답 파싱, 앱 검증.
// 순수 함수만 둔다. 모델 호출과 저장은 호출자가 맡는다.

import type { callText } from "../../gemini.js";
import {
  AXIS_NAMES,
  AXIS_TO_UNIVERSITY_FACTORS,
  type AxisEvaluation,
} from "../axes.js";
import type { ConsistencyResult } from "../consistency.js";
import {
  NARRATIVE_STAGE_LABELS,
  type Narrative,
  NO_DATA_TEXT,
  SECTION_REGISTRY,
  type SectionItem,
  validateNarrative,
} from "../sections.js";
import { capPlanItems } from "../tracks.js";
import type { Axis } from "../types.js";
import {
  EVIDENCE_EXEMPT_SECTION_IDS,
  FORBIDDEN_PHRASES,
  type StepValidationResult,
  type ValidationIssue,
  validateStep,
} from "../validation.js";
import {
  type AliasTable,
  buildAliasTable,
  restoreEvidenceIds,
  scrubAliasText,
  toAlias,
} from "./evidenceAlias.js";
import type {
  ActivitySignal,
  Classification,
  ContextActivity,
  MatchSignals,
  PlanItemDraft,
  ReportContext,
  StepOutput,
} from "./types.js";

export type ModelStep = 1 | 3 | 4 | 5 | 6 | 7;

export type ResponseSchema = NonNullable<
  NonNullable<Parameters<typeof callText>[2]>["responseSchema"]
>;

/**
 * 단일 호출 단계(1, 3, 5)의 응답 최대 출력 토큰(1단계는 묶음 한 번당).
 * 실측 정상 출력 최대(1단계 묶음 약 1800, 3단계 708, 5단계 565)의 약 2배다.
 * 반복 루프는 한도까지 같은 문장을 되풀이하므로 한도가 낮을수록 빨리 잘려 단계 예산 안에서 재요청할 수 있다.
 * 4, 6, 7단계는 호출을 섹션별로 나누므로 아래 호출별 한도를 쓴다.
 */
export const STEP_MAX_OUTPUT_TOKENS: Record<1 | 3 | 5, number> = {
  1: 4096,
  3: 2048,
  5: 2048,
};

/**
 * 섹션 호출 1회의 최대 출력 토큰. 섹션 하나의 정상 출력(분량 원칙 최대치 약 700)의 약 2배다.
 * 일반 본문에서 나는 반복 루프를 낮은 한도로 일찍 끊어 재요청하게 한다.
 */
export const SECTION_CALL_MAX_OUTPUT_TOKENS = 1536;
/**
 * 표 형식 섹션 호출의 최대 출력 토큰. 표 섹션의 반복 루프는 칸 하나가 끝없는 문단이 되는 형태라 일반 섹션보다 한도를 낮게 둔다.
 * 5행에 칸 60자면 정상 응답은 약 400토큰이고, 루프는 1024토큰 한도에서 약 4초 안에 잘려 재요청할 예산이 남는다.
 */
export const TABLE_SECTION_CALL_MAX_OUTPUT_TOKENS = 1024;
/** 4단계 match 호출의 최대 출력 토큰. aligned, conflicting 각 text 120자 이내 목록이라 섹션 호출과 같게 둔다. */
export const MATCH_CALL_MAX_OUTPUT_TOKENS = 1536;
/** 7단계 planDraft 호출의 최대 출력 토큰. 필수 3건, 권장 3건(항목당 약 250토큰)의 약 1.3배다. */
export const PLAN_DRAFT_CALL_MAX_OUTPUT_TOKENS = 2048;

/** 호출을 섹션별로 나누는 단계. 3, 5단계와 1단계는 나누지 않는다. */
export type SplitStep = 4 | 6 | 7;

/** 나눈 호출 하나가 만드는 것. 섹션 하나, 4단계 match, 7단계 planDraft 중 하나다. */
export type StepCall =
  | { kind: "section"; id: string }
  | { kind: "match" }
  | { kind: "planDraft" };

const AXIS_LIST: readonly Axis[] = ["A", "B", "C", "D", "E"];
const KEYWORD_LIMIT = 5;
const SUMMARY_LIMIT = 80;

const STEP_SECTION_IDS: Record<ModelStep, string[]> = {
  1: [],
  3: ["1-8"],
  4: ["1-2", "1-6", "1-7", "1-11"],
  5: ["1-9"],
  6: ["2-1", "2-2", "2-3", "2-4", "2-5", "2-6", "2-7", "2-8", "2-9", "2-10"],
  7: ["3-2", "3-3", "3-4", "3-5", "3-6", "3-7", "3-11", "3-12", "3-13"],
};

/** 이 단계가 만들어야 할 섹션 id(트랙 제외분 제거). */
export function stepSectionIds(
  step: ModelStep,
  context: ReportContext,
): string[] {
  const omitted = new Set(context.omitted.ids);
  return STEP_SECTION_IDS[step].filter((id) => !omitted.has(id));
}

/**
 * 나눈 단계의 호출 목록. 섹션 호출은 stepSectionIds 순서이고, 4단계는 match, 7단계는 planDraft 호출이 뒤따른다.
 * 6단계에서 근거 활동이 없는 축 섹션은 앱이 no_data 로 확정하므로 부르지 않는다(axes 를 넘기면 거른다).
 */
export function stepCalls(
  step: SplitStep,
  context: ReportContext,
  axes?: readonly AxisEvaluation[],
): StepCall[] {
  const skipped = new Set(
    step === 6
      ? (axes ?? [])
          .filter((e) => e.count === 0)
          .map((e) => AXIS_SECTION[e.axis])
      : [],
  );
  const calls: StepCall[] = stepSectionIds(step, context)
    .filter((id) => !skipped.has(id))
    .map((id) => ({ kind: "section", id }));
  if (step === 4) calls.push({ kind: "match" });
  if (step === 7) calls.push({ kind: "planDraft" });
  return calls;
}

const strings = { type: "array", items: { type: "string" } } as const;

const SIGNALS_SCHEMA = {
  type: "object",
  properties: {
    signals: {
      type: "array",
      items: {
        type: "object",
        properties: {
          activityId: { type: "string" },
          axes: {
            type: "array",
            items: { type: "string", enum: [...AXIS_LIST] },
          },
          method: { type: "string" },
          keywords: strings,
          summary: { type: "string" },
        },
        required: ["activityId", "axes", "method", "keywords", "summary"],
      },
    },
  },
  required: ["signals"],
} as const;

const rowSchema = {
  type: "object",
  properties: {
    label: { type: "string" },
    value: { type: "string" },
    subject: { type: "string" },
    direction: { type: "string" },
    record_to_leave: { type: "string" },
    evidence_ids: strings,
  },
} as const;

// 섹션 본문은 형식마다 모양이 달라 한 객체에 필드를 모두 열어 둔다.
// prose 는 text, list 는 items, table 은 rows, diagram 은 나머지 필드를 쓴다.
const bodySchema = {
  type: "object",
  properties: {
    text: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: { text: { type: "string" }, evidence_ids: strings },
        required: ["text", "evidence_ids"],
      },
    },
    rows: { type: "array", items: rowSchema },
  },
} as const;

const sectionsSchema = {
  type: "array",
  items: {
    type: "object",
    properties: {
      id: { type: "string" },
      status: { type: "string", enum: ["ok", "no_data"] },
      body: bodySchema,
      evidence_ids: strings,
      no_data_reason: { type: "string" },
    },
    required: ["id", "status", "evidence_ids"],
  },
} as const;

const narrativeSchema = {
  type: "object",
  properties: {
    theme: { type: "string" },
    subthemes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          grade: { type: "string", enum: ["고1", "고2", "고3"] },
          stage: { type: "string", enum: ["seed", "flower", "bloom"] },
          text: { type: "string" },
        },
        required: ["grade", "stage", "text"],
      },
    },
    previous: {
      type: "object",
      properties: { theme: { type: "string" } },
    },
  },
  required: ["theme", "subthemes"],
} as const;

const matchListSchema = {
  type: "array",
  items: {
    type: "object",
    properties: { text: { type: "string" }, evidenceIds: strings },
    required: ["text", "evidenceIds"],
  },
} as const;

const planDraftSchema = {
  type: "array",
  items: {
    type: "object",
    properties: {
      program: { type: "string", enum: ["school", "self", "deep"] },
      title: { type: "string" },
      description: { type: "string" },
      priority: { type: "string", enum: ["required", "recommended"] },
      period: {
        type: "string",
        enum: ["course_selection", "semester", "vacation"],
      },
      periodLabel: { type: "string" },
      axis: { type: "string", enum: [...AXIS_LIST] },
      category: { type: "string" },
    },
    required: ["program", "title", "priority", "period"],
  },
} as const;

const matchSchema = {
  type: "object",
  properties: { aligned: matchListSchema, conflicting: matchListSchema },
  required: ["aligned", "conflicting"],
} as const;

export const STEP_RESPONSE_SCHEMAS = {
  1: SIGNALS_SCHEMA,
  3: {
    type: "object",
    properties: { narrative: narrativeSchema, sections: sectionsSchema },
    required: ["narrative", "sections"],
  },
  5: {
    type: "object",
    properties: { sections: sectionsSchema },
    required: ["sections"],
  },
} as Record<1 | 3 | 5, ResponseSchema>;

/** 나눈 호출 종류별 응답 스키마. 섹션 호출은 { sections }(항목 1개는 프롬프트로 지시, 스키마에 maxItems 는 쓰지 않는다), match 와 planDraft 호출은 그 필드 하나만 받는다. */
const CALL_RESPONSE_SCHEMAS = {
  section: {
    type: "object",
    properties: { sections: sectionsSchema },
    required: ["sections"],
  },
  match: {
    type: "object",
    properties: { match: matchSchema },
    required: ["match"],
  },
  planDraft: {
    type: "object",
    properties: { planDraft: planDraftSchema },
    required: ["planDraft"],
  },
} as Record<StepCall["kind"], ResponseSchema>;

/** 호출 하나의 최대 출력 토큰. 섹션 호출은 표 형식이면 표 한도, 아니면 섹션 한도다. */
function callMaxOutputTokens(call: StepCall): number {
  switch (call.kind) {
    case "section":
      return SECTION_REGISTRY.find((d) => d.id === call.id)?.format === "table"
        ? TABLE_SECTION_CALL_MAX_OUTPUT_TOKENS
        : SECTION_CALL_MAX_OUTPUT_TOKENS;
    case "match":
      return MATCH_CALL_MAX_OUTPUT_TOKENS;
    case "planDraft":
      return PLAN_DRAFT_CALL_MAX_OUTPUT_TOKENS;
  }
}

/**
 * 모델 호출 하나가 무엇인지 알리는 정보. 호출 기록(계기판)을 붙일 때 읽는다.
 * kind 는 1단계 묶음 batch, 4, 6, 7단계 섹션 section, match, planDraft, 나뉘지 않은 3, 5단계 step 이다.
 * sectionId 는 section 호출에서만, batchIndex(0부터)는 batch 호출에서만 값이 있다.
 * attempt 는 첫 호출 0, 같은 요청 안 재요청 1이다.
 */
export type CallInfo = {
  step: ModelStep;
  kind: "batch" | "section" | "match" | "planDraft" | "step";
  sectionId: string | null;
  batchIndex: number | null;
  attempt: 0 | 1;
};

export type PromptBundle = {
  system: string;
  user: string;
  responseSchema: ResponseSchema;
  maxOutputTokens: number;
  callInfo: CallInfo;
};

export type StepPromptInput = {
  context: ReportContext;
  /**
   * 1단계 묶음 호출에서 이 호출이 읽을 활동. 없으면 context 의 활동 전부다.
   * 별칭은 묶음과 상관없이 전체 context 기준으로 유지한다.
   */
  batch?: ReportContext["activities"];
  /** 1단계 묶음 번호(0부터). 호출 정보에만 쓴다. */
  batchIndex?: number;
  /** 4, 6, 7단계에서 이 호출이 만들 것. 이 단계들은 필수다. */
  call?: StepCall;
  prior: {
    signals?: ActivitySignal[];
    classification?: Classification;
    narrative?: Narrative;
    match?: MatchSignals;
    consistency?: ConsistencyResult;
    axes?: AxisEvaluation[];
    /** 1-8 반복 문제의식 항목의 text. 섹션 간 서술이 어긋나지 않게 모든 호출에 싣는다. */
    problems?: string[];
  };
};

const json = (v: unknown): string => JSON.stringify(v, null, 1);

const COMMON_RULES = [
  "너는 고등학생의 학교생활 기록과 탐구 활동을 읽고 성장설계 리포트의 일부를 쓰는 분석가다.",
  "응답은 지정한 JSON 객체 하나만 낸다. JSON 밖에 설명이나 코드 블록 표시를 붙이지 않는다.",
  "문체는 존댓말이 아닌 리포트 평서문(예: 탐구가 이어진다, 확인된다)으로 쓴다.",
  "",
  "근거 표시 원칙",
  "- 판단의 근거(evidence_ids)에는 그 판단을 가장 직접 뒷받침하는 활동만 최대 3개 쓰고 활동 전체를 나열하지 않는다. 입력에 없는 id 를 만들지 않는다.",
  "- 학생에게 보이는 글에는 활동 별칭이나 id 를 쓰지 않는다. 활동은 주제로 가리키고, 근거는 evidence_ids 와 evidenceIds 에만 단다.",
  "- 활동 id 는 a1, a2 같은 짧은 별칭이다. 근거에는 입력에 있는 별칭만 그대로 쓰고 다른 글자를 붙이지 않는다.",
  "- 확인된 사실과 제안을 섞지 않는다. 각 항목의 badge 는 안내된 값 그대로 따른다.",
  "- 자료가 없으면 status 를 no_data 로 두고 no_data_reason 에 자료 없음 이라고 쓴다. 지어내지 않는다.",
  "- 점수가 아니라 서술로 쓴다. 학생을 등급이나 점수로 평가하는 문장을 쓰지 않는다.",
  "- 항목의 format 은 안내된 값 그대로 쓴다. prose 는 body.text, list 는 body.items, table 은 body.rows, diagram 은 안내된 필드를 쓴다.",
  `금지 표현: ${FORBIDDEN_PHRASES.map((p) => `"${p}"`).join(", ")}. 이 표현과 같은 뜻의 말을 어떤 필드에도 쓰지 않는다.`,
  "",
  "분량 원칙",
  "- prose 항목의 body.text 는 2~4문장, 350자 이내로 쓴다.",
  "- list 항목의 body.items 는 3~5개, 항목당 120자 이내로 쓴다.",
  "- table 항목의 body.rows 는 항목마다 안내한 행 수만 쓰고, 칸(label, value, subject, direction, record_to_leave)은 각각 한 문장 60자 이내(항목 안내에서 길이를 따로 정하면 그 길이)로 줄바꿈과 괄호 부연 없이 쓴다.",
  "- narrative 의 theme 은 60자 이내, subthemes 의 text 는 120자 이내로 쓴다. match 의 각 text 는 120자 이내로 쓴다. planDraft 의 title 은 40자 이내, description 은 160자 이내로 쓴다.",
  "- 같은 문장이나 같은 뜻의 문장을 되풀이하지 않는다. 또한 으로 시작하는 문장을 연달아 쓰지 않는다. 할 말이 없으면 짧게 끝낸다.",
].join("\n");

const SECTION_SPECS: Record<string, string> = {
  "1-8":
    "활동들에서 되풀이된 문제의식을 items 로 쓴다. 항목마다 text 와 evidence_ids 를 단다.",
  "1-2":
    "설문의 진로 답에서 학생이 말한 장기 목표를 서술한다. 진로 답이 비어 있으면 no_data 로 둔다. 이 항목은 활동 근거 없이 쓴다. evidence_ids 는 비워 둔다.",
  "1-6":
    "활동에서 드러난 지적 성향을 rows 로 쓴다. rows 는 정확히 3행이다. 행마다 label(성향 이름, 12자 이내), value(그 성향을 보여 주는 명사형이나 짧은 평서문 한 문장), evidence_ids 를 단다. 칸마다 60자 이내, 줄바꿈과 괄호 부연 없이 쓴다. 예시 행: label 은 관찰 중심, value 는 현상을 먼저 살피고 원인을 묻는다.",
  "1-7":
    "활동에서 드러난 선호 탐구 방식을 rows 로 쓴다. rows 는 정확히 3행이다. 행마다 label(탐구 방식 이름, 12자 이내), value(그 방식이 드러난 모습을 담은 명사형이나 짧은 평서문 한 문장), evidence_ids 를 단다. 칸마다 60자 이내, 줄바꿈과 괄호 부연 없이 쓴다. 예시 행: label 은 실험 설계, value 는 가설을 세우고 조건을 바꿔 확인한다.",
  "1-11": "활동과 설문 답을 함께 읽어 현재 핵심 정체성을 서술한다.",
  "1-9":
    "rows 에 분석 범위의 학기별 연계 여부를 쓴다. label 은 학기 키(예: 고1-1), value 는 연계, 단절, 자료 없음 중 하나다. evidence_ids 는 앱이 채우니 비워 둔다.",
  "2-1":
    "rows 에 해석 한 행(label 은 해석, value 는 120자 이내 한두 문장)을 쓴다. 부족하면 부족한 점 한 행(label 은 부족한 점, value 는 120자 이내)을 더한다. 판정, 근거 활동, 대학 평가요소 대응 행은 앱이 만드므로 쓰지 않는다.",
  "2-2": "2-1 과 같은 구성으로 쓴다.",
  "2-3": "2-1 과 같은 구성으로 쓴다.",
  "2-4": "2-1 과 같은 구성으로 쓴다.",
  "2-5": "2-1 과 같은 구성으로 쓴다.",
  "2-6":
    "교과별 역할을 rows 로 쓴다. rows 는 과목 수만큼, 최대 5행이다. 행마다 label(과목), value(그 과목 활동이 맡은 역할을 담은 명사형이나 짧은 평서문 한 문장), evidence_ids 를 단다. 칸마다 60자 이내, 줄바꿈과 괄호 부연 없이 쓴다. 예시 행: label 은 과학, value 는 탐구의 기초 개념을 쌓는 역할을 맡는다.",
  "2-7":
    "자율 및 자치 활동의 의미를 서술한다. 해당 활동이 없으면 no_data 로 둔다.",
  "2-8": "동아리 활동의 의미를 서술한다. 해당 활동이 없으면 no_data 로 둔다.",
  "2-9": "진로 활동의 의미를 서술한다. 해당 활동이 없으면 no_data 로 둔다.",
  "2-10":
    "독서 활동과 후속 질문을 rows 로 쓴다. label 은 독서 활동, value 는 후속 질문이다. 독서 활동이 없으면 no_data 로 둔다.",
  "3-2": "1학년 활동을 평가하는 서술이다.",
  "3-3": "2학년에서 보완할 방향을 서술한다.",
  "3-4": "3학년 콘셉트를 서술한다.",
  "3-5":
    "rows 에 과목별 빌드업 지도를 쓴다. rows 는 과목 수만큼, 최대 5행이다. 행마다 subject(과목), direction(앞으로 쌓을 방향 한 문장), record_to_leave(남기면 좋은 기록 한 문장), evidence_ids 를 단다. 칸마다 60자 이내, 줄바꿈과 괄호 부연 없이 쓴다. 과목별 방향은 새로 제안하는 것이므로 제안으로 표시된다. 예시 행: subject 는 과학, direction 은 실험 결과를 비교하는 탐구로 넓힌다, record_to_leave 는 비교 기준과 결론이 드러나는 기록을 남긴다.",
  "3-6": "자율 및 동아리 활동의 발전 방향을 서술한다.",
  "3-7":
    "진로활동을 구체화하는 방향을 rows 로 쓴다. rows 는 정확히 3행이다. 행마다 label(방향 이름, 12자 이내), value(그 방향의 실행 내용을 담은 명사형이나 짧은 평서문 한 문장), evidence_ids 를 단다. 칸마다 60자 이내, 줄바꿈과 괄호 부연 없이 쓴다. 예시 행: label 은 직무 탐색, value 는 관심 분야 종사자의 하루를 조사해 정리한다.",
  "3-11": "반드시 필요한 다음 활동을 items 로 쓴다.",
  "3-12": "있으면 좋은 활동을 items 로 쓴다.",
  "3-13": "피해야 할 반복을 items 로 쓴다.",
};

function sectionGuide(
  step: ModelStep,
  context: ReportContext,
  /** 나눈 호출이면 그 섹션 하나만 싣는다. */
  onlyId?: string,
): string {
  const ids = onlyId ? [onlyId] : stepSectionIds(step, context);
  if (ids.length === 0) return "";
  const rows = ids.map((id) => {
    const def = SECTION_REGISTRY.find((d) => d.id === id);
    return {
      id,
      title: def?.title,
      format: def?.format,
      badge: def?.badge,
      instruction: SECTION_SPECS[id],
    };
  });
  const lead = onlyId
    ? "작성할 항목(이 id 하나만 쓴다)"
    : "작성할 항목(이 id 를 모두, 이 id 만 쓴다)";
  return `${lead}:\n${json(rows)}`;
}

function activityBrief(
  a: ReportContext["activities"][number],
  table: AliasTable,
) {
  return {
    id: toAlias(table, a.id),
    period: a.gradeLabel
      ? `${a.gradeLabel}${a.semester ? ` ${a.semester}학기` : ""}`
      : null,
    group: a.group,
    subject: a.subject,
    topic: a.topic,
  };
}

function signalBrief(signals: ActivitySignal[], table: AliasTable) {
  return signals.map((s) => ({
    activityId: toAlias(table, s.activityId),
    axes: s.axes,
    method: s.method,
    keywords: s.keywords,
    linkage: s.linkage,
    summary: s.summary,
  }));
}

function matchBrief(match: MatchSignals, table: AliasTable): MatchSignals {
  const alias = (list: MatchSignals["aligned"]) =>
    list.map((m) => ({
      ...m,
      evidenceIds: m.evidenceIds.map((id) => toAlias(table, id)),
    }));
  return {
    aligned: alias(match.aligned),
    conflicting: alias(match.conflicting),
  };
}

function need<T>(value: T | undefined, step: ModelStep, name: string): T {
  if (value === undefined)
    throw new Error(
      `${step}단계 프롬프트에는 prior.${name} 이(가) 필요합니다.`,
    );
  return value;
}

const STEP_RULES: Record<1 | 3 | 5, string> = {
  1: [
    "1단계: 활동 읽기",
    "활동마다 axes(A부터 E 중 해당하는 축 0개 이상), method(탐구 방식 한 단어), keywords(최대 5개), summary(80자 이내 한 줄)를 쓴다.",
    "A 학업역량, B 진로 및 전공적합성, C 탐구 및 자기주도성, D 공동체역량, E 발전가능성이다. 근거가 없는 축은 달지 않는다.",
    "입력의 모든 활동에 대해 한 건씩 signals 에 담는다. 입력에 없는 activityId 는 쓰지 않는다.",
  ].join("\n"),
  3: [
    "3단계: 반복 주제와 흐름 찾기",
    "활동 전체를 관통하는 반복 주제 theme 와, 고1 seed, 고2 flower, 고3 bloom 의 하위 주제 subthemes 3개를 쓴다.",
    `단계 이름은 seed ${NARRATIVE_STAGE_LABELS.seed}, flower ${NARRATIVE_STAGE_LABELS.flower}, bloom ${NARRATIVE_STAGE_LABELS.bloom}이며 학년과 짝이 맞아야 한다.`,
    "항목 1-8 에는 활동에서 반복된 문제의식을 근거와 함께 쓴다.",
    "구체적인 탐구 주제를 새로 만들지 않고 활동에서 드러난 흐름만 쓴다.",
  ].join("\n"),
  5: [
    "5단계: 학기별 연계 여부",
    "항목 1-9 에 학기마다 연계 여부를 쓴다. 숫자를 계산하지 않는다.",
    "연계 여부는 입력의 활동별 연계 신호를 따른다.",
  ].join("\n"),
};

const AXIS_SECTION_IDS: readonly string[] = ["2-1", "2-2", "2-3", "2-4", "2-5"];

/** 나눈 호출의 단계 규칙. 그 호출 종류에 해당하는 지시만 담는다. */
function callRules(step: SplitStep, call: StepCall): string {
  if (call.kind === "match") {
    return [
      "4단계: 학생 조사 응답 대조",
      "설문 답과 활동 신호를 대조해 match.aligned(맞는 신호)와 match.conflicting(어긋나는 신호)을 쓴다. 각 항목은 text 와 evidenceIds 를 가진다.",
      "어긋남은 학생을 탓하지 않고 확인된 차이로만 쓴다.",
    ].join("\n");
  }
  if (call.kind === "planDraft") {
    return [
      "7단계: 학년별 방향 설계 중 실행계획",
      "구체적인 탐구 주제를 쓰지 말고 방향과 조건까지만 쓴다. 탐구 주제: 처럼 주제를 못 박는 표현을 쓰지 않는다.",
      "planDraft 에 실행계획 항목을 쓴다. program 은 school, self, deep 중 하나, priority 는 required 또는 recommended, period 는 course_selection, semester, vacation 중 하나다.",
      "required 는 최대 3건, recommended 도 최대 3건이며 required 는 1건 이상 둔다. deadline 은 쓰지 않는다.",
      "planDraft 의 title 과 description 에는 등급이나 점수 숫자를 쓰지 않는다. 학부모가 읽는 글이다. 퍼센트 숫자도 쓰지 않는다.",
      "트랙의 제외 항목은 요청하지 않았으니 쓰지 않는다. 분석 범위 밖의 학기는 평가하지 않는다.",
    ].join("\n");
  }
  switch (step) {
    case 4:
      return [
        "4단계: 학생 조사 응답 대조",
        "설문 답과 활동 신호를 읽고 지정한 항목 하나만 쓴다. sections 에는 그 항목 하나만 담는다.",
      ].join("\n");
    case 6: {
      const lines = [
        "6단계: A부터 E 5축 진단",
        "앱이 계산한 축별 판정을 바탕으로 지정한 항목 하나만 쓴다. sections 에는 그 항목 하나만 담는다.",
      ];
      if (AXIS_SECTION_IDS.includes(call.id)) {
        lines.push(
          "판정과 판정 라벨은 입력의 verdictLabel 그대로이며 앱이 행으로 만든다. 판정 값을 바꾸지 않는다.",
          "rows 에는 해석 한 행(label 은 해석, 120자 이내 한두 문장)만 쓰고, 부족하면 부족한 점 한 행(120자 이내)을 더한다.",
          "판정, 근거 활동, 대학 평가요소 대응 행은 앱이 만드므로 쓰지 않는다. 활동을 나열하지 않는다.",
          "축 항목의 evidence_ids 는 앱이 채우니 빈 배열로 둔다.",
        );
      }
      return lines.join("\n");
    }
    case 7:
      return [
        "7단계: 학년별 방향 설계",
        "지정한 항목 하나만 쓴다. sections 에는 그 항목 하나만 담는다.",
        "구체적인 탐구 주제를 쓰지 말고 방향과 조건까지만 쓴다. 탐구 주제: 처럼 주제를 못 박는 표현을 쓰지 않는다.",
        "항목마다 조건은 2~3개만 쓰고 길게 설명하지 않는다.",
        "트랙의 제외 항목은 요청하지 않았으니 쓰지 않는다. 분석 범위 밖의 학기는 평가하지 않는다.",
      ].join("\n");
  }
}

/**
 * 4, 6, 7단계 모든 호출이 공유하는 앞 단계 결과. 섹션마다 따로 불러도 대주제와 소주제 문구가 어긋나지 않게 한다.
 * 설문 대조(match)는 4단계 이후 호출에만 싣는다.
 */
function sharedInput(
  step: SplitStep,
  prior: StepPromptInput["prior"],
  table: AliasTable,
): string {
  const narrative = need(prior.narrative, step, "narrative");
  const view = {
    theme: narrative.theme,
    subthemes: narrative.subthemes.map((t) => ({
      grade: t.grade,
      stage: t.stage,
      text: t.text,
    })),
  };
  const parts = [
    `[리포트의 대주제와 학년별 소주제]\n리포트의 대주제와 학년별 소주제다. 서술에서 이 표현을 그대로 이어 쓰고 새 대주제를 만들지 않는다.\n${json(view)}`,
  ];
  if (prior.problems && prior.problems.length > 0)
    parts.push(`[반복 문제의식(1-8)]\n${json(prior.problems)}`);
  if (step !== 4) {
    const match = need(prior.match, step, "match");
    parts.push(`[설문 대조]\n${json(matchBrief(match, table))}`);
  }
  return parts.join("\n\n");
}

function stepUser(
  step: ModelStep,
  { context, prior, batch, call }: StepPromptInput,
): string {
  const splitCall = (): StepCall => {
    if (!call)
      throw new Error(`${step}단계 프롬프트에는 호출 종류(call)가 필요합니다.`);
    return call;
  };
  const guide = (c: StepCall): string =>
    c.kind === "section" ? `\n\n${sectionGuide(step, context, c.id)}` : "";
  const head = `학생 트랙: ${context.track}, 현재 학년: ${context.currentGrade}\n분석 범위: ${context.range.semesters.join(", ")}`;
  const career = context.profile.career?.trim() ?? "";
  const table = buildAliasTable(context);
  const brief = (a: ReportContext["activities"][number]) =>
    activityBrief(a, table);
  switch (step) {
    case 1: {
      return `${head}\n\n[활동 전체]\n${json(
        (batch ?? context.activities).map((a) => ({
          ...brief(a),
          text: a.text,
        })),
      )}`;
    }
    case 3: {
      const signals = need(prior.signals, step, "signals");
      const previous = context.previousNarrative
        ? `\n\n[이전 회차 서사]\n이전 주제: ${context.previousNarrative.theme}\n이전 진로: ${context.previousNarrative.career ?? "없음"}\n현재 진로 답이 이전과 달라 진로가 바뀌었다면 narrative.previous 를 채우고, 같다면 previous 를 쓰지 않는다.`
        : "";
      return `${head}\n\n[설문의 진로 답]\n${json({ career: context.profile.career, survey: context.survey })}\n\n[활동 목록]\n${json(context.activities.map(brief))}\n\n[활동 신호]\n${json(signalBrief(signals, table))}${previous}\n\n${sectionGuide(step, context)}`;
    }
    case 4: {
      const c = splitCall();
      const signals = need(prior.signals, step, "signals");
      const note =
        career === "" && c.kind === "section" && c.id === "1-2"
          ? "\n설문의 진로 답이 비어 있으므로 항목 1-2 는 no_data 로 둔다."
          : "";
      return `${head}\n\n${sharedInput(step, prior, table)}\n\n[설문 전체 답]\n${json({ career: context.profile.career, survey: context.survey })}${note}\n\n[활동 신호]\n${json(signalBrief(signals, table))}${guide(c)}`;
    }
    case 5: {
      const signals = need(prior.signals, step, "signals");
      const byActivity = context.activities.map((a) => ({
        ...brief(a),
        semester:
          a.gradeLabel && a.semester ? `${a.gradeLabel}-${a.semester}` : null,
        linkage: signals.find((s) => s.activityId === a.id)?.linkage ?? [],
        summary: signals.find((s) => s.activityId === a.id)?.summary ?? "",
      }));
      return `${head}\n\n[활동별 연계 신호]\n${json(byActivity)}\n\n${sectionGuide(step, context)}`;
    }
    case 6: {
      const c = splitCall();
      const axes = need(prior.axes, step, "axes");
      const view = axes.map((e) => ({
        axis: e.axis,
        name: AXIS_NAMES[e.axis],
        count: e.count,
        required: e.required,
        verdict: e.verdict,
        verdictLabel: e.verdictLabel,
        guideline: e.guideline,
        activityIds: e.activityIds.map((id) => toAlias(table, id)),
      }));
      const signals = prior.signals
        ? `\n\n[활동 신호]\n${json(signalBrief(prior.signals, table))}`
        : "";
      return `${head}\n\n${sharedInput(step, prior, table)}\n\n[앱이 계산한 축 진단]\n${json(view)}\n\n[활동 목록]\n${json(context.activities.map(brief))}${signals}${guide(c)}`;
    }
    case 7: {
      const c = splitCall();
      const c5 = need(prior.consistency, step, "consistency");
      const axes = need(prior.axes, step, "axes");
      const omitted =
        context.omitted.reasons.length > 0
          ? `\n제외 사유: ${context.omitted.reasons.join(" / ")}`
          : "";
      return `${head}\n분석 범위 설명: ${context.range.description}${omitted}\n\n${sharedInput(step, prior, table)}\n\n[방향 일관성 요약]\n${json({ percent: c5.percent, verdictLabel: c5.verdictLabel, smallSample: c5.smallSample })}\n\n[5축 요약]\n${json(axes.map((e) => ({ axis: e.axis, name: AXIS_NAMES[e.axis], count: e.count, required: e.required, verdictLabel: e.verdictLabel, guideline: e.guideline })))}\n\n[활동 목록]\n${json(context.activities.map(brief))}${guide(c)}`;
    }
  }
}

export function buildStepPrompt(
  step: ModelStep,
  input: StepPromptInput,
  retryNotes: string[] = [],
  attempt: 0 | 1 = 0,
): PromptBundle {
  const retry =
    retryNotes.length > 0
      ? `\n\n[이전 응답의 문제]\n${retryNotes.map((n) => `- ${n}`).join("\n")}`
      : "";
  const user = `${stepUser(step, input)}${retry}`;
  const info = (
    kind: CallInfo["kind"],
    over: Partial<CallInfo> = {},
  ): CallInfo => ({
    step,
    kind,
    sectionId: null,
    batchIndex: null,
    attempt,
    ...over,
  });
  if (step === 4 || step === 6 || step === 7) {
    const call = input.call;
    if (!call)
      throw new Error(`${step}단계 프롬프트에는 호출 종류(call)가 필요합니다.`);
    return {
      system: `${COMMON_RULES}\n\n${callRules(step, call)}`,
      user,
      responseSchema: CALL_RESPONSE_SCHEMAS[call.kind],
      maxOutputTokens: callMaxOutputTokens(call),
      callInfo: info(
        call.kind,
        call.kind === "section" ? { sectionId: call.id } : {},
      ),
    };
  }
  return {
    system: `${COMMON_RULES}\n\n${STEP_RULES[step]}`,
    user,
    responseSchema: STEP_RESPONSE_SCHEMAS[step],
    maxOutputTokens: STEP_MAX_OUTPUT_TOKENS[step],
    callInfo:
      step === 1
        ? info("batch", { batchIndex: input.batchIndex ?? 0 })
        : info("step"),
  };
}

// ---------------------------------------------------------------------------
// 응답 파싱
// ---------------------------------------------------------------------------

export type ParseResult =
  | { ok: true; output: StepOutput }
  | { ok: false; issues: ValidationIssue[] };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const fail = (code: string, message: string, path?: string): ParseResult => ({
  ok: false,
  issues: [path ? { code, message, path } : { code, message }],
});

function parseSignals(
  body: Record<string, unknown>,
  context: ReportContext,
  batch: ReportContext["activities"],
): ParseResult {
  if (!Array.isArray(body.signals))
    return fail("invalid_payload", "signals 배열이 없습니다.", "signals");
  const byId = new Map<string, Record<string, unknown>>();
  for (const raw of body.signals) {
    if (!isRecord(raw) || typeof raw.activityId !== "string") continue;
    if (!context.evidenceIds.includes(raw.activityId)) continue;
    if (!byId.has(raw.activityId)) byId.set(raw.activityId, raw);
  }
  // 묶음 호출이면 묶음의 활동만 기대하고, 묶음 밖 activityId 는 쓰지 않는다.
  const signals: ActivitySignal[] = batch.map((a) => {
    const raw = byId.get(a.id);
    const axes = Array.isArray(raw?.axes)
      ? AXIS_LIST.filter((ax) => (raw.axes as unknown[]).includes(ax))
      : [];
    const keywords = Array.isArray(raw?.keywords)
      ? (raw.keywords as unknown[])
          .filter((k): k is string => typeof k === "string" && k.trim() !== "")
          .slice(0, KEYWORD_LIMIT)
      : [];
    return {
      activityId: a.id,
      axes,
      method:
        typeof raw?.method === "string" && raw.method.trim() !== ""
          ? raw.method
          : null,
      keywords,
      linkage: [],
      summary:
        typeof raw?.summary === "string"
          ? raw.summary.slice(0, SUMMARY_LIMIT)
          : "",
    };
  });
  return { ok: true, output: { step: 1, signals } };
}

/** 섹션 본문을 레지스트리 형식에 맞게 정규화한다. 맞지 않으면 undefined. */
function normalizeBody(format: SectionItem["format"], body: unknown): unknown {
  const obj = isRecord(body) ? body : null;
  switch (format) {
    case "prose": {
      const text = typeof body === "string" ? body : obj?.text;
      return typeof text === "string" && text.trim() !== "" ? text : undefined;
    }
    case "list": {
      const items = Array.isArray(body) ? body : obj?.items;
      return Array.isArray(items) ? items : undefined;
    }
    case "table": {
      const rows = Array.isArray(body) ? body : obj?.rows;
      return Array.isArray(rows) ? { ...(obj ?? {}), rows } : undefined;
    }
    default:
      return obj ?? undefined;
  }
}

/** 모델이 한 판단에 달 수 있는 근거 수. 가장 직접적인 활동만 남긴다. */
export const MODEL_EVIDENCE_LIMIT = 3;

/** 문자열만 남기고 중복을 없앤 뒤 앞 MODEL_EVIDENCE_LIMIT 개만 둔다. */
function representativeEvidence(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const ids = raw.filter((e): e is string => typeof e === "string");
  return [...new Set(ids)].slice(0, MODEL_EVIDENCE_LIMIT);
}

/** 본문 항목(items, rows)이 가진 evidence_ids 를 대표 근거로 줄인다. */
function limitEntryEvidence(entry: unknown): unknown {
  if (!isRecord(entry) || !Array.isArray(entry.evidence_ids)) return entry;
  return { ...entry, evidence_ids: representativeEvidence(entry.evidence_ids) };
}

function limitBodyEvidence(body: unknown): unknown {
  if (Array.isArray(body)) return body.map(limitEntryEvidence);
  if (!isRecord(body)) return body;
  const out: Record<string, unknown> = { ...body };
  if (Array.isArray(body.rows)) out.rows = body.rows.map(limitEntryEvidence);
  if (Array.isArray(body.items)) out.items = body.items.map(limitEntryEvidence);
  return out;
}

/** 본문 항목(items, rows)의 근거를 순서대로 모아 중복 없이 돌려준다. */
function bodyEvidenceUnion(body: unknown): string[] {
  const entries = Array.isArray(body)
    ? body
    : isRecord(body)
      ? [
          ...(Array.isArray(body.items) ? body.items : []),
          ...(Array.isArray(body.rows) ? body.rows : []),
        ]
      : [];
  const ids = entries.flatMap((e) =>
    isRecord(e) ? representativeEvidence(e.evidence_ids) : [],
  );
  return [...new Set(ids)];
}

/** 이 호출이 만들 섹션 id. 나누지 않은 호출은 단계 전체, match 와 planDraft 호출은 없다. */
function callSectionIds(
  step: ModelStep,
  context: ReportContext,
  call: StepCall | undefined,
): string[] {
  if (!call) return stepSectionIds(step, context);
  return call.kind === "section" ? [call.id] : [];
}

function parseSections(
  body: Record<string, unknown>,
  expected: string[],
): { sections: SectionItem[]; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const found = new Map<string, SectionItem>();
  const raws = Array.isArray(body.sections) ? body.sections : [];
  for (const raw of raws) {
    if (!isRecord(raw) || typeof raw.id !== "string") continue;
    if (!expected.includes(raw.id) || found.has(raw.id)) continue;
    const def = SECTION_REGISTRY.find((d) => d.id === raw.id);
    if (!def) continue;
    const evidence = representativeEvidence(raw.evidence_ids);
    const base = {
      id: def.id,
      title: def.title,
      format: def.format,
      badge: def.badge,
      evidence_ids: evidence,
    };
    if (raw.status === "no_data") {
      const reason =
        typeof raw.no_data_reason === "string" && raw.no_data_reason !== ""
          ? raw.no_data_reason
          : NO_DATA_TEXT;
      found.set(def.id, {
        ...base,
        status: "no_data",
        body: { text: NO_DATA_TEXT, reason },
        no_data_reason: reason,
      });
      continue;
    }
    const normalized =
      raw.status === "ok" ? normalizeBody(def.format, raw.body) : undefined;
    if (normalized === undefined) {
      issues.push({
        code: "invalid_section",
        message: `항목 "${def.id}" 의 status 또는 본문 형식(${def.format})이 올바르지 않습니다.`,
        path: def.id,
      });
      continue;
    }
    const limited = limitBodyEvidence(normalized);
    // 섹션 근거를 비워 보내면 본문 항목 근거의 합집합을 쓴다.
    found.set(def.id, {
      ...base,
      evidence_ids: evidence.length > 0 ? evidence : bodyEvidenceUnion(limited),
      status: "ok",
      body: limited,
    });
  }
  for (const id of expected) {
    if (!found.has(id) && !issues.some((i) => i.path === id)) {
      issues.push({
        code: "missing_section",
        message: `항목 "${id}" 이(가) 응답에 없습니다.`,
        path: id,
      });
    }
  }
  const sections = expected.flatMap((id) => {
    const item = found.get(id);
    return item ? [item] : [];
  });
  return { sections, issues };
}

/** 활동의 학기 키(예: 고1-1). 학년이나 학기를 모르면 null. */
function semesterKeyOf(a: ReportContext["activities"][number]): string | null {
  return a.gradeLabel !== null && a.semester !== null
    ? `${a.gradeLabel}-${a.semester}`
    : null;
}

/**
 * 1-9 행의 근거는 앱이 그 학기 활동 전부로 채운다. 학기 키가 아닌 label 이나 활동 없는 학기는 비운다.
 * 섹션 근거는 행 근거의 합집합이다.
 */
function fillSemesterEvidence(
  sections: SectionItem[],
  context: ReportContext,
): SectionItem[] {
  return sections.map((s) => {
    if (s.id !== "1-9" || s.status !== "ok" || !isRecord(s.body)) return s;
    const rows = Array.isArray(s.body.rows) ? s.body.rows : [];
    const filled = rows.map((row) => {
      if (!isRecord(row)) return row;
      const label = typeof row.label === "string" ? row.label.trim() : "";
      const ids = context.activities
        .filter((a) => semesterKeyOf(a) === label)
        .map((a) => a.id);
      return { ...row, evidence_ids: ids };
    });
    const union = [
      ...new Set(
        filled.flatMap((r) =>
          isRecord(r) && Array.isArray(r.evidence_ids)
            ? (r.evidence_ids as string[])
            : [],
        ),
      ),
    ];
    return {
      ...s,
      body: { ...s.body, rows: filled },
      evidence_ids: union,
    };
  });
}

function parseNarrative(
  body: Record<string, unknown>,
  context: ReportContext,
): Narrative | null {
  const raw = body.narrative;
  if (!isRecord(raw)) return null;
  const subs = Array.isArray(raw.subthemes) ? raw.subthemes : [];
  const narrative = {
    theme: typeof raw.theme === "string" ? raw.theme : "",
    subthemes: subs.filter(isRecord).map((x) => ({
      grade: x.grade,
      stage: x.stage,
      text: typeof x.text === "string" ? x.text : "",
    })),
  } as unknown as Narrative;
  if (
    raw.previous !== undefined &&
    raw.previous !== null &&
    context.previousNarrative
  ) {
    narrative.previous = {
      theme: context.previousNarrative.theme,
      issuedAt: context.previousNarrative.issuedAt,
      reason: "career_change",
    };
  }
  return narrative;
}

function parseMatchList(raw: unknown): MatchSignals["aligned"] | null {
  if (!Array.isArray(raw)) return null;
  const out: MatchSignals["aligned"] = [];
  for (const x of raw) {
    if (!isRecord(x) || typeof x.text !== "string") return null;
    out.push({
      text: x.text,
      evidenceIds: representativeEvidence(x.evidenceIds),
    });
  }
  return out;
}

const PROGRAMS = ["school", "self", "deep"];
const PRIORITIES = ["required", "recommended"];
const PERIODS = ["course_selection", "semester", "vacation"];

function parsePlanDraft(raw: unknown): {
  items: PlanItemDraft[];
  issues: ValidationIssue[];
} {
  const issues: ValidationIssue[] = [];
  const items: PlanItemDraft[] = [];
  const list = Array.isArray(raw) ? raw : [];
  list.forEach((x, i) => {
    const path = `planDraft[${i}]`;
    const ok =
      isRecord(x) &&
      PROGRAMS.includes(x.program as string) &&
      PRIORITIES.includes(x.priority as string) &&
      PERIODS.includes(x.period as string) &&
      typeof x.title === "string" &&
      x.title.trim() !== "" &&
      (x.axis === null ||
        x.axis === undefined ||
        AXIS_LIST.includes(x.axis as Axis));
    if (!ok) {
      issues.push({
        code: "invalid_plan_item",
        message: `실행계획 항목 ${i + 1} 의 program, priority, period, axis, title 중 허용 범위 밖 값이 있습니다.`,
        path,
      });
      return;
    }
    const r = x as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" && v !== "" ? v : null);
    items.push({
      program: r.program as PlanItemDraft["program"],
      title: r.title as string,
      description: str(r.description),
      priority: r.priority as PlanItemDraft["priority"],
      axis: (r.axis as Axis | null | undefined) ?? null,
      category: str(r.category),
      period: r.period as PlanItemDraft["period"],
      periodLabel: str(r.periodLabel),
      deadline: null,
    });
  });
  return { items, issues };
}

export function parseStepResponse(
  step: ModelStep,
  rawText: string,
  context: ReportContext,
  options: {
    axes?: AxisEvaluation[];
    batch?: ReportContext["activities"];
    /** 나눈 호출이면 그 호출이 만들 것만 파싱한다. 없으면 단계 전체다. */
    call?: StepCall;
  } = {},
): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return fail("invalid_json", "응답이 JSON 형식이 아닙니다.");
  }
  if (!isRecord(parsed))
    return fail("invalid_json", "응답이 JSON 객체가 아닙니다.");
  // 모델은 별칭으로 답하므로 근거 필드를 활동 id 로 되돌린 뒤 단계별로 파싱한다.
  // 먼저 본문에 새어 나온 별칭을 지우고 근거 필드로 옮긴다.
  const aliasTable = buildAliasTable(context);
  parsed = restoreEvidenceIds(aliasTable, scrubAliasText(aliasTable, parsed));
  if (!isRecord(parsed))
    return fail("invalid_json", "응답이 JSON 객체가 아닙니다.");
  if (step === 1)
    return parseSignals(parsed, context, options.batch ?? context.activities);
  const call = options.call;
  const expected = callSectionIds(step, context, call);
  const parsedSections = parseSections(parsed, expected);
  let { sections } = parsedSections;
  let { issues } = parsedSections;
  if (step === 6 && options.axes) {
    // 나눈 호출이면 이 호출의 섹션에 해당하는 축만 정규화한다. 다른 축 섹션을 끼워 넣지 않는다.
    const axes = call
      ? options.axes.filter((e) => expected.includes(AXIS_SECTION[e.axis]))
      : options.axes;
    // 근거 활동이 없는 축은 앱이 no_data 로 확정하므로 모델의 누락과 형식 오류를 문제로 보지 않는다.
    const emptyIds = new Set(
      axes.filter((e) => e.count === 0).map((e) => AXIS_SECTION[e.axis]),
    );
    issues = issues.filter((i) => !(i.path && emptyIds.has(i.path)));
    sections = normalizeAxisSections(
      sections,
      axes,
      context.evidenceIds,
      context.activities,
    );
    sections = expected.flatMap((id) => sections.filter((x) => x.id === id));
  }
  if (step === 5) sections = fillSemesterEvidence(sections, context);
  const output: StepOutput = { step, sections };
  if (step === 3) {
    const narrative = parseNarrative(parsed, context);
    if (narrative) output.narrative = narrative;
    else
      issues.push({
        code: "invalid_narrative",
        message: "narrative 객체가 없습니다.",
        path: "narrative",
      });
  }
  if (step === 4 && (!call || call.kind === "match")) {
    const m = isRecord(parsed.match) ? parsed.match : null;
    const aligned = parseMatchList(m?.aligned);
    const conflicting = parseMatchList(m?.conflicting);
    if (aligned && conflicting) output.match = { aligned, conflicting };
    else
      issues.push({
        code: "invalid_match",
        message: "match.aligned 와 match.conflicting 배열이 필요합니다.",
        path: "match",
      });
  }
  if (step === 7 && (!call || call.kind === "planDraft")) {
    const plan = parsePlanDraft(parsed.planDraft);
    output.planDraft = plan.items;
    issues.push(...plan.issues);
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true, output };
}

// ---------------------------------------------------------------------------
// 앱 검증
// ---------------------------------------------------------------------------

const PLAN_NUMBER_PATTERNS: readonly RegExp[] = [
  /\d+(\.\d+)?\s*등급/,
  /\d+\s*점/,
  /\d+\s*%/,
];

const AXIS_SECTION: Record<Axis, string> = {
  A: "2-1",
  B: "2-2",
  C: "2-3",
  D: "2-4",
  E: "2-5",
};

const AXIS_NO_DATA_REASON = "해당 축의 근거 활동이 없어요";

function axisNoDataSection(id: string): SectionItem {
  const def = SECTION_REGISTRY.find((d) => d.id === id);
  return {
    id,
    title: def?.title ?? id,
    format: def?.format ?? "prose",
    badge: def?.badge ?? "fact",
    status: "no_data",
    evidence_ids: [],
    body: { text: NO_DATA_TEXT, reason: AXIS_NO_DATA_REASON },
    no_data_reason: AXIS_NO_DATA_REASON,
  };
}

/** 앱이 만드는 축 섹션 행의 라벨. 모델이 같은 라벨로 쓴 행은 버린다. */
const APP_AXIS_ROW_LABELS = ["판정", "근거 활동", "대학 평가요소 대응"];

/** 근거 활동 행에 보여줄 topic 수. 근거 id 도 같은 건수만 단다. */
const AXIS_TOPIC_LIMIT = 3;

/** 축 섹션의 앱 행(판정, 근거 활동, 대학 평가요소 대응)을 조립한다. */
function buildAxisAppRows(
  e: AxisEvaluation,
  activities: readonly ContextActivity[],
): Record<string, unknown>[] {
  const inAxis = new Set(e.activityIds);
  const withTopic = activities
    .filter((a) => inAxis.has(a.id))
    .flatMap((a) => {
      const topic = a.topic?.trim() ?? "";
      return topic === "" ? [] : [{ id: a.id, topic }];
    });
  const shown = withTopic.slice(0, AXIS_TOPIC_LIMIT);
  const rest = withTopic.length - shown.length;
  const rows: Record<string, unknown>[] = [
    { label: "판정", value: e.verdictLabel, evidence_ids: [] },
  ];
  if (shown.length > 0) {
    rows.push({
      label: "근거 활동",
      value: `${shown.map((x) => x.topic).join(", ")}${rest > 0 ? ` 외 ${rest}건` : ""}`,
      evidence_ids: shown.map((x) => x.id),
    });
  }
  const factor = AXIS_TO_UNIVERSITY_FACTORS[e.axis];
  rows.push({
    label: "대학 평가요소 대응",
    value: `${factor.factor}: ${factor.detail}`,
    evidence_ids: [],
  });
  return rows;
}

/**
 * 6단계 축 섹션(2-1부터 2-5)을 앱이 계산한 축 평가에 맞춰 정규화한다.
 * 근거 활동이 없는 축은 모델 응답과 무관하게 no_data 로 두고,
 * 근거가 있는 축의 근거는 모델 값과 무관하게 앱이 아는 activityIds 로 덮는다.
 * 근거가 있는 축의 rows 는 앱 행(판정, 근거 활동, 대학 평가요소 대응)을 앞에 두고 모델 행을 뒤에 잇는다.
 */
export function normalizeAxisSections(
  sections: SectionItem[],
  axes: AxisEvaluation[],
  knownEvidenceIds: readonly string[],
  activities: readonly ContextActivity[],
): SectionItem[] {
  const known = new Set(knownEvidenceIds);
  const out = [...sections];
  for (const e of axes) {
    const id = AXIS_SECTION[e.axis];
    const idx = out.findIndex((x) => x.id === id);
    if (e.count === 0) {
      if (idx >= 0) out[idx] = axisNoDataSection(id);
      else out.push(axisNoDataSection(id));
      continue;
    }
    const section = out[idx];
    if (!section || section.status === "no_data") continue;
    const body = isRecord(section.body) ? section.body : {};
    const modelRows = (Array.isArray(body.rows) ? body.rows : []).filter(
      (r) => !(isRecord(r) && APP_AXIS_ROW_LABELS.includes(String(r.label))),
    );
    out[idx] = {
      ...section,
      evidence_ids: e.activityIds.filter((x) => known.has(x)),
      body: {
        ...body,
        rows: [...buildAxisAppRows(e, activities), ...modelRows],
      },
    };
  }
  return out;
}

function checkPlanDraft(plan: PlanItemDraft[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  plan.forEach((item, i) => {
    const text = `${item.title}\n${item.description ?? ""}`;
    if (PLAN_NUMBER_PATTERNS.some((re) => re.test(text))) {
      issues.push({
        code: "grade_number_in_plan",
        message:
          "실행계획의 title 과 description 에 등급, 점수, 퍼센트 숫자를 쓸 수 없습니다.",
        path: `planDraft[${i}]`,
      });
    }
  });
  const items = plan.map((item, i) => ({
    id: String(i),
    period: item.period,
    priority: item.priority,
  }));
  const requiredCount = items.filter((x) => x.priority === "required").length;
  const capped = capPlanItems(items);
  if (requiredCount > capped.required.length || capped.dropped.length > 0) {
    issues.push({
      code: "too_many_plan_items",
      message:
        "실행계획 항목이 상한(필수 3건, 권장 3건)을 넘었습니다. 줄여서 다시 작성하세요.",
      path: "planDraft",
    });
  } else if (
    items.filter((x) => x.priority !== "required").length >
    capped.recommended.length
  ) {
    issues.push({
      code: "too_many_plan_items",
      message: "실행계획 항목이 상한을 넘었습니다.",
      path: "planDraft",
    });
  }
  if (requiredCount === 0) {
    issues.push({
      code: "no_required_plan_item",
      message: "필수(required) 실행계획 항목이 1건 이상 있어야 합니다.",
      path: "planDraft",
    });
  }
  return issues;
}

function checkVerdictLabels(
  sections: SectionItem[],
  axes: AxisEvaluation[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const e of axes) {
    const id = AXIS_SECTION[e.axis];
    const section = sections.find((x) => x.id === id);
    if (section?.status === "no_data") {
      if (e.count > 0) {
        issues.push({
          code: "axis_no_data_with_evidence",
          message: `항목 "${id}" 은 활동 ${e.count}건이 있는 축인데 no_data 로 두었습니다. 활동 근거로 작성하세요.`,
          path: id,
        });
      }
      continue;
    }
    if (!section) continue;
    const rows =
      isRecord(section.body) && Array.isArray(section.body.rows)
        ? section.body.rows
        : [];
    const row = rows.find((r) => isRecord(r) && r.label === "판정");
    if (!isRecord(row) || row.value !== e.verdictLabel) {
      issues.push({
        code: "verdict_label_mismatch",
        message: `항목 "${id}" 의 판정 값은 앱이 계산한 "${e.verdictLabel}" 그대로여야 합니다.`,
        path: id,
      });
    }
  }
  return issues;
}

/** 표 칸 하나의 글자 수 상한. 안내(60자)의 두 배이며, 넘으면 반복 루프로 본다. */
const TABLE_CELL_MAX_LENGTH = 120;

const TABLE_CELL_KEYS = [
  "label",
  "value",
  "subject",
  "direction",
  "record_to_leave",
] as const;

/** 표 섹션의 칸이 상한을 넘은 곳마다 이슈를 낸다. 섹션 하나에 이슈는 한 번만 낸다. */
function checkTableCells(sections: SectionItem[]): ValidationIssue[] {
  return sections.flatMap((s) => {
    if (s.format !== "table" || !isRecord(s.body)) return [];
    const rows = Array.isArray(s.body.rows) ? s.body.rows : [];
    // 6단계 축 섹션은 파싱이 앱 행을 이미 붙였으므로 앱 행은 모델이 쓴 칸이 아니라서 뺀다.
    const tooLong = rows.some(
      (r) =>
        isRecord(r) &&
        !APP_AXIS_ROW_LABELS.includes(String(r.label)) &&
        TABLE_CELL_KEYS.some((k) => {
          const v = r[k];
          return typeof v === "string" && v.length > TABLE_CELL_MAX_LENGTH;
        }),
    );
    return tooLong
      ? [
          {
            code: "table_cell_too_long",
            message: `항목 "${s.id}" 의 표 칸이 ${TABLE_CELL_MAX_LENGTH}자를 넘었습니다.`,
            path: s.id,
          },
        ]
      : [];
  });
}

function matchEvidenceIds(match: MatchSignals): string[] {
  return [...match.aligned, ...match.conflicting].flatMap((m) => m.evidenceIds);
}

export function validateStepOutput(
  step: ModelStep,
  output: StepOutput,
  context: ReportContext,
  extra: { axes?: AxisEvaluation[]; call?: StepCall } = {},
): StepValidationResult {
  const sections = output.sections ?? [];
  // 나눈 호출이면 그 호출이 만든 것만 검증한다. planDraft 상한은 planDraft 호출이 아니면 보지 않는다.
  const checksPlan =
    step === 7 && (!extra.call || extra.call.kind === "planDraft");
  const payload: Record<string, unknown> = {};
  if (output.sections) payload.sections = sections;
  if (step === 1) payload.signals = output.signals ?? [];
  if (step === 3 && output.narrative) payload.narrative = output.narrative;
  if (step === 4 && output.match) payload.match = output.match;
  if (checksPlan) payload.planDraft = output.planDraft ?? [];

  const result = validateStep(step, payload, {
    expectedSectionIds: callSectionIds(step, context, extra.call),
    knownEvidenceIds: context.evidenceIds,
  });
  const issues = [...result.issues];

  // validateStep 은 근거 누락과 근거 id 대조를 6단계 이후에만 하므로 3, 4, 5단계는 여기서 맡는다.
  if (step === 3 || step === 4 || step === 5) {
    const known = new Set(context.evidenceIds);
    for (const s of sections) {
      if (
        s.status !== "no_data" &&
        !EVIDENCE_EXEMPT_SECTION_IDS.includes(s.id) &&
        s.evidence_ids.length < 1
      ) {
        issues.push({
          code: "missing_evidence",
          message: `항목 "${s.id}" 에 근거(evidence_ids)가 연결되어 있지 않습니다.`,
          path: s.id,
        });
      }
      const bad = s.evidence_ids.filter((e) => !known.has(e));
      if (bad.length > 0) {
        issues.push({
          code: "unknown_evidence",
          message: `항목 "${s.id}" 이(가) 모르는 근거 id 를 가리킵니다: ${bad.join(", ")}`,
          path: s.id,
        });
      }
    }
  }
  if (step === 3) {
    const n = validateNarrative(output.narrative);
    for (const message of n.errors)
      issues.push({ code: "invalid_narrative", message, path: "narrative" });
  }
  if (step === 4 && output.match) {
    const known = new Set(context.evidenceIds);
    const bad = matchEvidenceIds(output.match).filter((e) => !known.has(e));
    if (bad.length > 0) {
      issues.push({
        code: "unknown_evidence",
        message: `match 가 모르는 근거 id 를 가리킵니다: ${bad.join(", ")}`,
        path: "match",
      });
    }
  }
  // 칸 길이는 섹션 호출에서 모델이 쓴 칸만 본다(단계 전체 검증에는 앱이 만든 값이 섞인다).
  if (extra.call?.kind === "section") issues.push(...checkTableCells(sections));
  if (step === 6 && extra.axes)
    issues.push(...checkVerdictLabels(sections, extra.axes));
  if (checksPlan) issues.push(...checkPlanDraft(output.planDraft ?? []));
  return { ok: issues.length === 0, issues };
}
