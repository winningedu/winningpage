// 단계 하나를 실행해 growth_reports 에 반영할 patch 를 만드는 오케스트레이터. 순수 로직이다.
// 모델 호출과 시각은 deps 로 받고, DB 접근은 핸들러가 한다.

import type { AxisEvaluation } from "../axes.js";
import type { ConsistencyResult } from "../consistency.js";
import { DeadlineExceeded, withinBudget } from "../intake/extractRunner.js";
import { detectLinkage } from "../linkagePhrases.js";
import {
  type Narrative,
  NO_DATA_TEXT,
  SECTION_REGISTRY,
  type SectionItem,
} from "../sections.js";
import { buildRetryNote, type ValidationIssue } from "../validation.js";
import {
  assembleFinal,
  type CarriedItem,
  type CompletionPayload,
  completionPayload,
  mergeSections,
} from "./assemble.js";
import {
  appSections,
  classify,
  computeStep5,
  computeStep6,
  consistencyActivities,
} from "./compute.js";
import {
  buildStepPrompt,
  type ModelStep,
  type PromptBundle,
  parseStepResponse,
  type StepPromptInput,
  stepSectionIds,
  validateStepOutput,
} from "./prompts.js";
import type {
  ActivitySignal,
  Classification,
  MatchSignals,
  PlanItemDraft,
  ReportContext,
  StepNumber,
  StepOutput,
} from "./types.js";

export type StoredOutputs = {
  /** growth_reports.signals: { byActivity?, classification?, match? } */
  signals: unknown;
  narrative_theme: string | null;
  grade_subthemes: unknown;
  stage: string | null;
  consistency: unknown;
  axis_scores: unknown;
  sections: unknown;
  planDraft: unknown;
};

export type RunStepDeps = {
  /** finishReason 은 출력 한도 잘림(MAX_TOKENS)을 알아채는 데 쓴다. */
  callModel: (
    bundle: PromptBundle,
    signal: AbortSignal,
  ) => Promise<{ text: string; finishReason: string | null }>;
  now: () => string;
  /** 이 요청에 남은 예산(ms). */
  budgetMs: number;
  /** 8단계: 이전 회차 pending 실행계획. */
  carried?: CarriedItem[];
};

export type RunStepResult =
  | {
      ok: true;
      step: StepNumber;
      output: StepOutput;
      patch: Record<string, unknown>;
      extraAttempts: number;
      completion?: CompletionPayload;
    }
  | {
      ok: false;
      step: StepNumber;
      issues: ValidationIssue[];
      extraAttempts: number;
      failure: "validation" | "upstream" | "timeout" | "fatal";
    };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isSectionLike = (v: unknown): v is SectionItem =>
  isRecord(v) && typeof v.id === "string";

export type ReadStored = {
  signals: ActivitySignal[];
  classification: Classification | null;
  narrative: Narrative | null;
  match: MatchSignals | null;
  consistency: ConsistencyResult | null;
  axes: AxisEvaluation[] | null;
  sections: SectionItem[];
  planDraft: PlanItemDraft[] | null;
};

/** 저장값을 느슨한 타입 가드로 정규화한다. 깨진 값은 null 또는 빈 배열이다. */
export function readStored(stored: StoredOutputs): ReadStored {
  const sig = isRecord(stored.signals) ? stored.signals : {};
  const signals = Array.isArray(sig.byActivity)
    ? (sig.byActivity.filter(
        (s) => isRecord(s) && typeof s.activityId === "string",
      ) as ActivitySignal[])
    : [];
  const classification = isRecord(sig.classification)
    ? (sig.classification as unknown as Classification)
    : null;
  const match =
    isRecord(sig.match) &&
    Array.isArray(sig.match.aligned) &&
    Array.isArray(sig.match.conflicting)
      ? (sig.match as unknown as MatchSignals)
      : null;
  const narrative =
    typeof stored.narrative_theme === "string" &&
    stored.narrative_theme !== "" &&
    Array.isArray(stored.grade_subthemes)
      ? {
          theme: stored.narrative_theme,
          subthemes: stored.grade_subthemes as Narrative["subthemes"],
        }
      : null;
  const consistency =
    isRecord(stored.consistency) && typeof stored.consistency.total === "number"
      ? (stored.consistency as unknown as ConsistencyResult)
      : null;
  const axes = Array.isArray(stored.axis_scores)
    ? (stored.axis_scores as AxisEvaluation[])
    : null;
  const sections = Array.isArray(stored.sections)
    ? stored.sections.filter(isSectionLike)
    : [];
  const planDraft = Array.isArray(stored.planDraft)
    ? (stored.planDraft as PlanItemDraft[])
    : null;
  return {
    signals,
    classification,
    narrative,
    match,
    consistency,
    axes,
    sections,
    planDraft,
  };
}

const fatal = (step: StepNumber, issues: ValidationIssue[]): RunStepResult => ({
  ok: false,
  step,
  issues,
  extraAttempts: 0,
  failure: "fatal",
});

const missingPrior = (step: StepNumber, what: string): RunStepResult =>
  fatal(step, [
    {
      code: "missing_prior",
      message: `${step}단계에 필요한 앞 단계 산출물(${what})이 없습니다.`,
    },
  ]);

type ModelCallOutcome =
  | { ok: true; output: StepOutput; extraAttempts: number }
  | Extract<RunStepResult, { ok: false }>;

/** 모델 호출 1회, 검증 실패 시 문제 목록을 붙여 1회 재요청(No.88). */
async function callWithRetry(
  step: ModelStep,
  input: StepPromptInput,
  deps: RunStepDeps,
  extra: { axes?: AxisEvaluation[] },
  seed: Partial<StepOutput> = {},
): Promise<ModelCallOutcome> {
  const startedAt = Date.parse(deps.now());
  const left = (): number => {
    const elapsed = Date.parse(deps.now()) - startedAt;
    return deps.budgetMs - (Number.isNaN(elapsed) ? 0 : elapsed);
  };
  let retryNotes: string[] = [];
  let lastIssues: ValidationIssue[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const extraAttempts = attempt;
    const remaining = left();
    if (remaining <= 0) {
      return {
        ok: false,
        step,
        issues: lastIssues,
        extraAttempts: 0,
        failure: "timeout",
      };
    }
    const bundle = buildStepPrompt(step, input, retryNotes);
    let reply: { text: string; finishReason: string | null };
    try {
      reply = await withinBudget(
        (signal) => deps.callModel(bundle, signal),
        remaining,
      );
    } catch (e) {
      const timedOut = e instanceof DeadlineExceeded;
      return {
        ok: false,
        step,
        issues: timedOut
          ? lastIssues
          : [{ code: "upstream_error", message: "모델 호출에 실패했습니다." }],
        extraAttempts,
        failure: timedOut ? "timeout" : "upstream",
      };
    }
    // 잘린 응답은 우연히 파싱돼도 뒷부분이 비어 있을 수 있어 쓰지 않는다.
    const truncated = reply.finishReason === "MAX_TOKENS";
    const parsed = truncated
      ? null
      : parseStepResponse(
          step,
          reply.text,
          input.context,
          extra.axes ? { axes: extra.axes } : {},
        );
    let issues: ValidationIssue[];
    if (parsed === null) {
      issues = [
        { code: "truncated", message: "응답이 출력 한도를 넘어 잘렸습니다." },
      ];
    } else if (parsed.ok) {
      const output: StepOutput = { ...parsed.output, ...seed };
      const verdict = validateStepOutput(step, output, input.context, extra);
      if (verdict.ok) return { ok: true, output, extraAttempts };
      issues = verdict.issues;
    } else {
      issues = parsed.issues;
    }
    lastIssues = issues;
    retryNotes = buildRetryNote(issues);
  }
  return {
    ok: false,
    step,
    issues: lastIssues,
    extraAttempts: 1,
    failure: "validation",
  };
}

function ok(
  step: StepNumber,
  output: StepOutput,
  patch: Record<string, unknown>,
  extraAttempts = 0,
): RunStepResult {
  return { ok: true, step, output, patch, extraAttempts };
}

function noDataSection(id: string, reason: string): SectionItem {
  const def = SECTION_REGISTRY.find((d) => d.id === id);
  return {
    id,
    title: def?.title ?? id,
    format: def?.format ?? "prose",
    badge: def?.badge ?? "fact",
    status: "no_data",
    evidence_ids: [],
    body: { text: NO_DATA_TEXT, reason },
    no_data_reason: reason,
  };
}

/**
 * 1-10 방향 진단은 앱이 일관성 값으로 만든다. 모델은 쓰지 않는다.
 * 근거는 연계된 활동이고, 연계가 0건이면 분모 활동 전부다.
 */
function appConsistencySection(
  c: ConsistencyResult,
  linkedIds: string[],
  allIds: string[],
): SectionItem {
  const def = SECTION_REGISTRY.find((d) => d.id === "1-10");
  return {
    id: "1-10",
    title: def?.title ?? "1-10",
    format: def?.format ?? "diagram",
    badge: def?.badge ?? "fact",
    status: "ok",
    evidence_ids: linkedIds.length > 0 ? linkedIds : allIds,
    formula: c.formula,
    body: {
      percent: c.percent,
      formula: c.formula,
      verdictLabel: c.verdictLabel,
      linked: linkedIds,
      total: c.total,
      smallSample: c.smallSample,
      criteria: c.criteria,
    },
  };
}

function signalsBase(stored: StoredOutputs): Record<string, unknown> {
  return isRecord(stored.signals) ? stored.signals : {};
}

const hasByActivity = (stored: StoredOutputs): boolean =>
  Array.isArray(signalsBase(stored).byActivity);

/** 모델 단계 결과를 patch 로 바꾼다. 섹션은 저장분과 합친 전체를 넣는다. */
function modelResult(
  step: ModelStep,
  context: ReportContext,
  stored: StoredOutputs,
  s: ReadStored,
  output: StepOutput,
  extraAttempts: number,
): RunStepResult {
  const sections = mergeSections(s.sections, output.sections ?? []);
  switch (step) {
    case 1: {
      const textById = new Map(context.activities.map((a) => [a.id, a.text]));
      const byActivity = (output.signals ?? []).map((sig) => {
        const kind = detectLinkage(textById.get(sig.activityId) ?? "").kind;
        return { ...sig, linkage: kind === null ? [] : [kind] };
      });
      return ok(
        step,
        { ...output, signals: byActivity },
        { signals: { ...signalsBase(stored), byActivity } },
        extraAttempts,
      );
    }
    case 3: {
      const narrative = output.narrative;
      const stage =
        narrative?.subthemes.find((t) => t.grade === context.currentGrade)
          ?.stage ?? null;
      return ok(
        step,
        output,
        {
          narrative_theme: narrative?.theme ?? null,
          grade_subthemes: narrative?.subthemes ?? null,
          stage,
          sections,
        },
        extraAttempts,
      );
    }
    case 4:
      return ok(
        step,
        output,
        {
          signals: { ...signalsBase(stored), match: output.match },
          sections,
        },
        extraAttempts,
      );
    case 5:
      return ok(
        step,
        output,
        { consistency: output.consistency, sections },
        extraAttempts,
      );
    case 6:
      return ok(
        step,
        output,
        { axis_scores: output.axes, sections },
        extraAttempts,
      );
    case 7:
      return ok(
        step,
        output,
        { sections, planDraft: output.planDraft ?? [] },
        extraAttempts,
      );
  }
}

const NO_ACTIVITY_REASON = "분석할 활동이 없어요";

/** 활동 0건 회차의 3, 4, 6, 7단계. 앱이 no_data 섹션과 빈 산출물만 만든다. */
function noActivityResult(
  step: 3 | 4 | 6 | 7,
  context: ReportContext,
  stored: StoredOutputs,
  s: ReadStored,
): RunStepResult {
  const sections = stepSectionIds(step, context).map((id) =>
    noDataSection(id, NO_ACTIVITY_REASON),
  );
  const merged = mergeSections(s.sections, sections);
  switch (step) {
    case 3:
      return ok(
        step,
        { step, sections },
        {
          narrative_theme: null,
          grade_subthemes: null,
          stage: null,
          sections: merged,
        },
      );
    case 4: {
      const match: MatchSignals = { aligned: [], conflicting: [] };
      return ok(
        step,
        { step, match, sections },
        { signals: { ...signalsBase(stored), match }, sections: merged },
      );
    }
    case 6: {
      const axes = computeStep6(context, s.signals);
      return ok(
        step,
        { step, axes, sections },
        { axis_scores: axes, sections: merged },
      );
    }
    case 7:
      return ok(
        step,
        { step, sections, planDraft: [] },
        { sections: merged, planDraft: [] },
      );
  }
}

export async function runStep(
  step: StepNumber,
  context: ReportContext,
  stored: StoredOutputs,
  deps: RunStepDeps,
): Promise<RunStepResult> {
  const s = readStored(stored);

  if (step === 2) {
    const classification = classify(context);
    return ok(
      step,
      { step, classification },
      { signals: { ...signalsBase(stored), classification } },
    );
  }

  if (step === 8) {
    if (!s.classification) return missingPrior(step, "classification");
    if (!s.consistency) return missingPrior(step, "consistency");
    if (!s.axes) return missingPrior(step, "axes");
    const app = appSections(context, {
      classification: s.classification,
      narrative: s.narrative,
      consistency: s.consistency,
      axes: s.axes,
      signals: s.signals,
      sections: s.sections,
    });
    const assembled = assembleFinal(context, s.sections, app);
    if (!assembled.ok) {
      return {
        ok: false,
        step,
        issues: assembled.issues,
        extraAttempts: 0,
        // 같은 입력이면 조립 결과도 같아 재시도해도 소용없다.
        failure: "fatal",
      };
    }
    const planDraft = s.planDraft ?? [];
    return {
      ok: true,
      step,
      output: { step, sections: assembled.sections, planDraft },
      patch: { sections: assembled.sections },
      extraAttempts: 0,
      completion: completionPayload(
        context,
        assembled.sections,
        planDraft,
        deps.carried ?? [],
      ),
    };
  }

  if (step === 1) {
    if (context.activities.length === 0) {
      return ok(
        step,
        { step, signals: [] },
        { signals: { ...signalsBase(stored), byActivity: [] } },
      );
    }
    const r = await callWithRetry(1, { context, prior: {} }, deps, {});
    return r.ok
      ? modelResult(1, context, stored, s, r.output, r.extraAttempts)
      : r;
  }

  if (step === 3 || step === 4 || step === 5) {
    if (!hasByActivity(stored)) return missingPrior(step, "signals");
  }
  // 활동이 0건이면 모델을 부르지 않는다. 근거 없이 서술하지 않고, 추천도 만들지 않는다.
  if (context.activities.length === 0 && step !== 5) {
    return noActivityResult(step, context, stored, s);
  }
  if (step === 7) {
    if (!s.narrative) return missingPrior(step, "narrative");
    if (!s.match) return missingPrior(step, "match");
    if (!s.consistency) return missingPrior(step, "consistency");
    if (!s.axes) return missingPrior(step, "axes");
  }

  if (step === 5) {
    const { consistency } = computeStep5(context, s.signals);
    if (consistency.total === 0) {
      const sections = ["1-9", "1-10"].map((id) =>
        noDataSection(id, "분석할 활동이 없어요"),
      );
      return ok(
        step,
        { step, consistency, sections },
        {
          consistency,
          sections: mergeSections(s.sections, sections),
        },
      );
    }
    const r = await callWithRetry(
      5,
      { context, prior: { signals: s.signals, consistency } },
      deps,
      {},
      { consistency },
    );
    if (!r.ok) return r;
    const counted = consistencyActivities(context, s.signals);
    const linkedIds = counted
      .filter((a) => a.signals.length > 0)
      .map((a) => a.id);
    const output: StepOutput = {
      ...r.output,
      sections: [
        ...(r.output.sections ?? []),
        appConsistencySection(
          consistency,
          linkedIds,
          counted.map((a) => a.id),
        ),
      ],
    };
    return modelResult(5, context, stored, s, output, r.extraAttempts);
  }

  if (step === 6) {
    const axes = computeStep6(context, s.signals);
    const r = await callWithRetry(
      6,
      { context, prior: { signals: s.signals, axes } },
      deps,
      { axes },
      { axes },
    );
    return r.ok
      ? modelResult(6, context, stored, s, r.output, r.extraAttempts)
      : r;
  }

  const prior: StepPromptInput["prior"] = { signals: s.signals };
  if (step === 7) {
    if (s.narrative) prior.narrative = s.narrative;
    if (s.match) prior.match = s.match;
    if (s.consistency) prior.consistency = s.consistency;
    if (s.axes) prior.axes = s.axes;
  }
  const r = await callWithRetry(step, { context, prior }, deps, {});
  return r.ok
    ? modelResult(step, context, stored, s, r.output, r.extraAttempts)
    : r;
}
