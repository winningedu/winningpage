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
import type {
  ActivitySignal,
  Classification,
  MatchSignals,
  PlanItemDraft,
  ReportContext,
  StepOutput,
} from "./types.js";

export type ModelStep = 1 | 3 | 4 | 5 | 6 | 7;

export type ResponseSchema = NonNullable<
  NonNullable<Parameters<typeof callText>[2]>["responseSchema"]
>;

/** 단계별 응답 최대 출력 토큰. */
export const STEP_MAX_OUTPUT_TOKENS: Record<ModelStep, number> = {
  1: 4096,
  3: 2048,
  4: 3072,
  5: 2048,
  6: 6144,
  7: 6144,
};

const AXIS_LIST: readonly Axis[] = ["A", "B", "C", "D", "E"];
const KEYWORD_LIMIT = 5;
const SUMMARY_LIMIT = 80;

const STEP_SECTION_IDS: Record<ModelStep, string[]> = {
  1: [],
  3: ["1-8"],
  4: ["1-2", "1-6", "1-7", "1-11"],
  5: ["1-9", "1-10"],
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
    percent: { type: "number" },
    formula: { type: "string" },
    verdictLabel: { type: "string" },
    criteria: { type: "string" },
    smallSample: { type: "boolean" },
    linked: strings,
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

export const STEP_RESPONSE_SCHEMAS = {
  1: SIGNALS_SCHEMA,
  3: {
    type: "object",
    properties: { narrative: narrativeSchema, sections: sectionsSchema },
    required: ["narrative", "sections"],
  },
  4: {
    type: "object",
    properties: {
      match: {
        type: "object",
        properties: { aligned: matchListSchema, conflicting: matchListSchema },
        required: ["aligned", "conflicting"],
      },
      sections: sectionsSchema,
    },
    required: ["match", "sections"],
  },
  5: {
    type: "object",
    properties: { formula: { type: "string" }, sections: sectionsSchema },
    required: ["formula", "sections"],
  },
  6: {
    type: "object",
    properties: { sections: sectionsSchema },
    required: ["sections"],
  },
  7: {
    type: "object",
    properties: { sections: sectionsSchema, planDraft: planDraftSchema },
    required: ["sections", "planDraft"],
  },
} as Record<ModelStep, ResponseSchema>;

export type PromptBundle = {
  system: string;
  user: string;
  responseSchema: ResponseSchema;
  maxOutputTokens: number;
};

export type StepPromptInput = {
  context: ReportContext;
  prior: {
    signals?: ActivitySignal[];
    classification?: Classification;
    narrative?: Narrative;
    match?: MatchSignals;
    consistency?: ConsistencyResult;
    expectedFormula?: string;
    axes?: AxisEvaluation[];
  };
};

const json = (v: unknown): string => JSON.stringify(v, null, 1);

const COMMON_RULES = [
  "너는 고등학생의 학교생활 기록과 탐구 활동을 읽고 성장설계 리포트의 일부를 쓰는 분석가다.",
  "응답은 지정한 JSON 객체 하나만 낸다. JSON 밖에 설명이나 코드 블록 표시를 붙이지 않는다.",
  "문체는 존댓말이 아닌 리포트 평서문(예: 탐구가 이어진다, 확인된다)으로 쓴다.",
  "",
  "근거 표시 원칙",
  "- 모든 판단에는 evidence_ids 로 입력에 주어진 활동 id 를 단다. 입력에 없는 id 를 만들지 않는다.",
  "- 확인된 사실과 제안을 섞지 않는다. 각 항목의 badge 는 안내된 값 그대로 따른다.",
  "- 자료가 없으면 status 를 no_data 로 두고 no_data_reason 에 자료 없음 이라고 쓴다. 지어내지 않는다.",
  "- 점수가 아니라 서술로 쓴다. 학생을 등급이나 점수로 평가하는 문장을 쓰지 않는다.",
  "- 항목의 format 은 안내된 값 그대로 쓴다. prose 는 body.text, list 는 body.items, table 은 body.rows, diagram 은 안내된 필드를 쓴다.",
  `금지 표현: ${FORBIDDEN_PHRASES.map((p) => `"${p}"`).join(", ")}. 이 표현과 같은 뜻의 말을 어떤 필드에도 쓰지 않는다.`,
].join("\n");

const SECTION_SPECS: Record<string, string> = {
  "1-8":
    "활동들에서 되풀이된 문제의식을 items 로 쓴다. 항목마다 text 와 evidence_ids 를 단다.",
  "1-2":
    "설문의 진로 답에서 학생이 말한 장기 목표를 서술한다. 진로 답이 비어 있으면 no_data 로 둔다.",
  "1-6":
    "활동에서 드러난 지적 성향을 rows 로 쓴다. 행마다 label, value, evidence_ids 를 단다.",
  "1-7":
    "활동에서 드러난 선호 탐구 방식을 rows 로 쓴다. 행마다 label, value, evidence_ids 를 단다.",
  "1-11": "활동과 설문 답을 함께 읽어 현재 핵심 정체성을 서술한다.",
  "1-9":
    "rows 에 학기별 연계 여부를 쓴다. label 은 학기(예: 고1-1), value 는 연계, 단절, 자료 없음 중 하나, evidence_ids 는 그 학기 활동 id.",
  "1-10":
    "body 에 percent, formula, verdictLabel, criteria, smallSample, linked(연계된 활동 id 배열)를 입력값 그대로 담는다.",
  "2-1":
    "rows 에 판정, 근거 활동, 대학 평가요소 대응을 쓴다. 부족하면 부족한 점 행을 더한다. 판정 행의 value 는 입력의 verdictLabel 그대로다.",
  "2-2": "2-1 과 같은 구성으로 쓴다.",
  "2-3": "2-1 과 같은 구성으로 쓴다.",
  "2-4": "2-1 과 같은 구성으로 쓴다.",
  "2-5": "2-1 과 같은 구성으로 쓴다.",
  "2-6":
    "교과별 역할을 rows 로 쓴다. label 은 과목, value 는 그 과목 활동이 맡은 역할, evidence_ids 를 단다.",
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
    "rows 에 과목별 빌드업 지도를 쓴다. 행마다 subject, direction, record_to_leave, evidence_ids 를 단다. 과목별 방향은 새로 제안하는 것이므로 제안으로 표시된다.",
  "3-6": "자율 및 동아리 활동의 발전 방향을 서술한다.",
  "3-7":
    "진로활동을 구체화하는 방향을 rows 로 쓴다. 행마다 label, value, evidence_ids 를 단다.",
  "3-11": "반드시 필요한 다음 활동을 items 로 쓴다.",
  "3-12": "있으면 좋은 활동을 items 로 쓴다.",
  "3-13": "피해야 할 반복을 items 로 쓴다.",
};

function sectionGuide(step: ModelStep, context: ReportContext): string {
  const ids = stepSectionIds(step, context);
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
  return `작성할 항목(이 id 를 모두, 이 id 만 쓴다):\n${json(rows)}`;
}

function activityBrief(a: ReportContext["activities"][number]) {
  return {
    id: a.id,
    period: a.gradeLabel
      ? `${a.gradeLabel}${a.semester ? ` ${a.semester}학기` : ""}`
      : null,
    group: a.group,
    subject: a.subject,
    topic: a.topic,
  };
}

function signalBrief(signals: ActivitySignal[]) {
  return signals.map((s) => ({
    activityId: s.activityId,
    axes: s.axes,
    method: s.method,
    keywords: s.keywords,
    linkage: s.linkage,
    summary: s.summary,
  }));
}

function need<T>(value: T | undefined, step: ModelStep, name: string): T {
  if (value === undefined)
    throw new Error(
      `${step}단계 프롬프트에는 prior.${name} 이(가) 필요합니다.`,
    );
  return value;
}

const STEP_RULES: Record<ModelStep, string> = {
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
  4: [
    "4단계: 학생 조사 응답 대조",
    "설문 답과 활동 신호를 대조해 match.aligned(맞는 신호)와 match.conflicting(어긋나는 신호)을 쓴다. 각 항목은 text 와 evidenceIds 를 가진다.",
    "어긋남은 학생을 탓하지 않고 확인된 차이로만 쓴다.",
  ].join("\n"),
  5: [
    "5단계: 방향 일관성 진단",
    "앱이 계산한 일관성 값을 서술로 풀어 쓴다. 숫자를 다시 계산하거나 바꾸지 않는다.",
    "응답의 formula 에는 입력의 계산식을 글자 그대로 복사한다. 한 글자라도 다르면 검증에 실패한다.",
    "연계 여부는 입력의 활동별 연계 신호를 따른다.",
  ].join("\n"),
  6: [
    "6단계: A부터 E 5축 진단",
    "앱이 계산한 축별 판정을 서술로 풀어 쓴다. 판정과 판정 라벨은 입력의 verdictLabel 그대로 쓰고 바꾸지 않는다. 바꾸면 검증에 실패한다.",
    "각 축 항목의 rows 에는 label 이 판정인 행(value 는 verdictLabel), 근거 활동 행, 대학 평가요소 대응 행을 두고, 부족하면 무엇이 부족한지 행을 더한다.",
    "축별 대학 평가요소 대응은 입력의 universityFactor 를 따른다.",
  ].join("\n"),
  7: [
    "7단계: 학년별 방향 설계",
    "구체적인 탐구 주제를 쓰지 말고 방향과 조건까지만 쓴다. 탐구 주제: 처럼 주제를 못 박는 표현을 쓰지 않는다.",
    "planDraft 에 실행계획 항목을 쓴다. program 은 school, self, deep 중 하나, priority 는 required 또는 recommended, period 는 course_selection, semester, vacation 중 하나다.",
    "required 는 최대 3건, recommended 도 최대 3건이며 required 는 1건 이상 둔다. deadline 은 쓰지 않는다.",
    "planDraft 의 title 과 description 에는 등급이나 점수 숫자를 쓰지 않는다. 학부모가 읽는 글이다. 퍼센트 숫자도 쓰지 않는다.",
    "트랙의 제외 항목은 요청하지 않았으니 쓰지 않는다. 분석 범위 밖의 학기는 평가하지 않는다.",
  ].join("\n"),
};

function stepUser(
  step: ModelStep,
  { context, prior }: StepPromptInput,
): string {
  const head = `학생 트랙: ${context.track}, 현재 학년: ${context.currentGrade}\n분석 범위: ${context.range.semesters.join(", ")}`;
  const career = context.profile.career?.trim() ?? "";
  switch (step) {
    case 1: {
      return `${head}\n\n[활동 전체]\n${json(
        context.activities.map((a) => ({ ...activityBrief(a), text: a.text })),
      )}`;
    }
    case 3: {
      const signals = need(prior.signals, step, "signals");
      const previous = context.previousNarrative
        ? `\n\n[이전 회차 서사]\n이전 주제: ${context.previousNarrative.theme}\n이전 진로: ${context.previousNarrative.career ?? "없음"}\n현재 진로 답이 이전과 달라 진로가 바뀌었다면 narrative.previous 를 채우고, 같다면 previous 를 쓰지 않는다.`
        : "";
      return `${head}\n\n[설문의 진로 답]\n${json({ career: context.profile.career, survey: context.survey })}\n\n[활동 목록]\n${json(context.activities.map(activityBrief))}\n\n[활동 신호]\n${json(signalBrief(signals))}${previous}\n\n${sectionGuide(step, context)}`;
    }
    case 4: {
      const signals = need(prior.signals, step, "signals");
      const note =
        career === ""
          ? "\n설문의 진로 답이 비어 있으므로 항목 1-2 는 no_data 로 둔다."
          : "";
      return `${head}\n\n[설문 전체 답]\n${json({ career: context.profile.career, survey: context.survey })}${note}\n\n[활동 신호]\n${json(signalBrief(signals))}\n\n${sectionGuide(step, context)}`;
    }
    case 5: {
      const signals = need(prior.signals, step, "signals");
      const c = need(prior.consistency, step, "consistency");
      const formula = prior.expectedFormula ?? c.formula;
      const byActivity = context.activities.map((a) => ({
        ...activityBrief(a),
        linkage: signals.find((s) => s.activityId === a.id)?.linkage ?? [],
        summary: signals.find((s) => s.activityId === a.id)?.summary ?? "",
      }));
      return `${head}\n\n[앱이 계산한 일관성]\n${json({ percent: c.percent, linked: c.linked, total: c.total, verdictLabel: c.verdictLabel, criteria: c.criteria, smallSample: c.smallSample })}\n계산식(글자 그대로 복사): ${formula}\n\n[활동별 연계 신호]\n${json(byActivity)}\n\n${sectionGuide(step, context)}`;
    }
    case 6: {
      const axes = need(prior.axes, step, "axes");
      const view = axes.map((e) => ({
        axis: e.axis,
        name: AXIS_NAMES[e.axis],
        count: e.count,
        required: e.required,
        verdict: e.verdict,
        verdictLabel: e.verdictLabel,
        guideline: e.guideline,
        activityIds: e.activityIds,
        universityFactor: AXIS_TO_UNIVERSITY_FACTORS[e.axis],
      }));
      const signals = prior.signals
        ? `\n\n[활동 신호]\n${json(signalBrief(prior.signals))}`
        : "";
      return `${head}\n\n[앱이 계산한 축 진단]\n${json(view)}\n\n[활동 목록]\n${json(context.activities.map(activityBrief))}${signals}\n\n${sectionGuide(step, context)}`;
    }
    case 7: {
      const narrative = need(prior.narrative, step, "narrative");
      const match = need(prior.match, step, "match");
      const c = need(prior.consistency, step, "consistency");
      const axes = need(prior.axes, step, "axes");
      const omitted =
        context.omitted.reasons.length > 0
          ? `\n제외 사유: ${context.omitted.reasons.join(" / ")}`
          : "";
      return `${head}\n분석 범위 설명: ${context.range.description}${omitted}\n\n[서사]\n${json(narrative)}\n\n[설문 대조]\n${json(match)}\n\n[방향 일관성 요약]\n${json({ percent: c.percent, verdictLabel: c.verdictLabel, smallSample: c.smallSample })}\n\n[5축 요약]\n${json(axes.map((e) => ({ axis: e.axis, name: AXIS_NAMES[e.axis], count: e.count, required: e.required, verdictLabel: e.verdictLabel, guideline: e.guideline })))}\n\n[활동 목록]\n${json(context.activities.map(activityBrief))}\n\n${sectionGuide(step, context)}`;
    }
  }
}

export function buildStepPrompt(
  step: ModelStep,
  input: StepPromptInput,
  retryNotes: string[] = [],
): PromptBundle {
  const system = `${COMMON_RULES}\n\n${STEP_RULES[step]}`;
  const retry =
    retryNotes.length > 0
      ? `\n\n[이전 응답의 문제]\n${retryNotes.map((n) => `- ${n}`).join("\n")}`
      : "";
  return {
    system,
    user: `${stepUser(step, input)}${retry}`,
    responseSchema: STEP_RESPONSE_SCHEMAS[step],
    maxOutputTokens: STEP_MAX_OUTPUT_TOKENS[step],
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
): ParseResult {
  if (!Array.isArray(body.signals))
    return fail("invalid_payload", "signals 배열이 없습니다.", "signals");
  const byId = new Map<string, Record<string, unknown>>();
  for (const raw of body.signals) {
    if (!isRecord(raw) || typeof raw.activityId !== "string") continue;
    if (!context.evidenceIds.includes(raw.activityId)) continue;
    if (!byId.has(raw.activityId)) byId.set(raw.activityId, raw);
  }
  const signals: ActivitySignal[] = context.activities.map((a) => {
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

function parseSections(
  body: Record<string, unknown>,
  step: ModelStep,
  context: ReportContext,
): { sections: SectionItem[]; issues: ValidationIssue[] } {
  const expected = stepSectionIds(step, context);
  const issues: ValidationIssue[] = [];
  const found = new Map<string, SectionItem>();
  const raws = Array.isArray(body.sections) ? body.sections : [];
  for (const raw of raws) {
    if (!isRecord(raw) || typeof raw.id !== "string") continue;
    if (!expected.includes(raw.id) || found.has(raw.id)) continue;
    const def = SECTION_REGISTRY.find((d) => d.id === raw.id);
    if (!def) continue;
    const evidence = Array.isArray(raw.evidence_ids)
      ? raw.evidence_ids.filter((e): e is string => typeof e === "string")
      : [];
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
    found.set(def.id, { ...base, status: "ok", body: normalized });
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
  // 5단계 계산식은 1-10 항목에 싣는다. 검증이 이 값을 앱 계산식과 대조한다.
  if (step === 5 && typeof body.formula === "string") {
    const target = sections.find((x) => x.id === "1-10");
    if (target) target.formula = body.formula;
  }
  return { sections, issues };
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
    const ids = Array.isArray(x.evidenceIds)
      ? x.evidenceIds.filter((e): e is string => typeof e === "string")
      : [];
    out.push({ text: x.text, evidenceIds: ids });
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
): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return fail("invalid_json", "응답이 JSON 형식이 아닙니다.");
  }
  if (!isRecord(parsed))
    return fail("invalid_json", "응답이 JSON 객체가 아닙니다.");
  if (step === 1) return parseSignals(parsed, context);
  const { sections, issues } = parseSections(parsed, step, context);
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
  if (step === 4) {
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
  if (step === 7) {
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

function matchEvidenceIds(match: MatchSignals): string[] {
  return [...match.aligned, ...match.conflicting].flatMap((m) => m.evidenceIds);
}

export function validateStepOutput(
  step: ModelStep,
  output: StepOutput,
  context: ReportContext,
  extra: { expectedFormula?: string; axes?: AxisEvaluation[] } = {},
): StepValidationResult {
  const sections = output.sections ?? [];
  const payload: Record<string, unknown> = {};
  if (output.sections) payload.sections = sections;
  if (step === 1) payload.signals = output.signals ?? [];
  if (step === 3 && output.narrative) payload.narrative = output.narrative;
  if (step === 4 && output.match) payload.match = output.match;
  if (step === 5) {
    const formula = sections.find((x) => x.id === "1-10")?.formula;
    if (formula !== undefined) payload.formula = formula;
  }
  if (step === 7) payload.planDraft = output.planDraft ?? [];

  const result = validateStep(step, payload, {
    expectedSectionIds: stepSectionIds(step, context),
    knownEvidenceIds: context.evidenceIds,
    ...(extra.expectedFormula !== undefined
      ? { expectedFormula: extra.expectedFormula }
      : {}),
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
  if (step === 6 && extra.axes)
    issues.push(...checkVerdictLabels(sections, extra.axes));
  if (step === 7) issues.push(...checkPlanDraft(output.planDraft ?? []));
  return { ok: issues.length === 0, issues };
}
