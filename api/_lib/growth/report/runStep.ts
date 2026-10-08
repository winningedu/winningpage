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
  normalizeAxisSections,
  type PromptBundle,
  parseStepResponse,
  type SplitStep,
  type StepCall,
  type StepPromptInput,
  stepCalls,
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
  /** 묶음 호출들이 단계 시작 하나를 공유할 때 넘긴다. 없으면 이 호출의 시작이다. */
  stepStartedAt?: number,
): Promise<ModelCallOutcome> {
  const startedAt = stepStartedAt ?? Date.parse(deps.now());
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
    const bundle = buildStepPrompt(
      step,
      input,
      retryNotes,
      attempt === 0 ? 0 : 1,
    );
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
      : parseStepResponse(step, reply.text, input.context, {
          ...(extra.axes ? { axes: extra.axes } : {}),
          ...(input.batch ? { batch: input.batch } : {}),
          ...(input.call ? { call: input.call } : {}),
        });
    let issues: ValidationIssue[];
    if (parsed === null) {
      issues = [
        { code: "truncated", message: "응답이 출력 한도를 넘어 잘렸습니다." },
      ];
    } else if (parsed.ok) {
      const output: StepOutput = { ...parsed.output, ...seed };
      const verdict = validateStepOutput(step, output, input.context, {
        ...extra,
        ...(input.call ? { call: input.call } : {}),
      });
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

/** 1단계 한 묶음의 활동 수. 출력이 활동 수에 비례해 한도를 넘지 않게 나눈다. */
export const SIGNAL_BATCH_SIZE = 15;
/** 한 단계 안에서 모델을 동시에 부르는 최대 수. 1단계 묶음과 4, 6, 7단계 섹션 호출이 같이 쓴다. */
export const MODEL_CALL_CONCURRENCY = 6;

const FAILURE_SEVERITY = ["validation", "timeout", "upstream"] as const;

type CallSuccess = Extract<ModelCallOutcome, { ok: true }>;

/**
 * 한 단계의 호출들을 동시에(최대 MODEL_CALL_CONCURRENCY) 부르고 입력 순서대로 결과를 모은다.
 * 모든 호출이 같은 단계 예산을 쓰고, 하나라도 끝내 실패하면 단계 전체가 실패한다.
 * 실패 종류는 upstream, timeout, validation 순으로 심한 것을 고르고 issues 는 실패한 호출 것을 이어 붙인다.
 * extraAttempts 는 재요청이 하나라도 있으면 1이다.
 */
async function runCalls(
  step: ModelStep,
  jobs: ((stepStartedAt: number) => Promise<ModelCallOutcome>)[],
  deps: RunStepDeps,
): Promise<
  | { ok: true; outputs: StepOutput[]; extraAttempts: number }
  | Extract<ModelCallOutcome, { ok: false }>
> {
  const stepStartedAt = Date.parse(deps.now());
  const outcomes: ModelCallOutcome[] = new Array(jobs.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < jobs.length) {
      const index = next++;
      const job = jobs[index];
      if (!job) return;
      outcomes[index] = await job(stepStartedAt);
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(MODEL_CALL_CONCURRENCY, jobs.length) },
      worker,
    ),
  );

  const extraAttempts = outcomes.some((o) => o.extraAttempts > 0) ? 1 : 0;
  const failed = outcomes.filter(
    (o): o is Extract<ModelCallOutcome, { ok: false }> => !o.ok,
  );
  if (failed.length > 0) {
    const failure = FAILURE_SEVERITY.reduce<
      "validation" | "timeout" | "upstream"
    >(
      (worst, kind) => (failed.some((f) => f.failure === kind) ? kind : worst),
      "validation",
    );
    return {
      ok: false,
      step,
      issues: failed.flatMap((f) => f.issues),
      extraAttempts,
      failure,
    };
  }
  return {
    ok: true,
    outputs: outcomes.map((o) => (o as CallSuccess).output),
    extraAttempts,
  };
}

/** 1단계. 활동을 묶음으로 나눠 동시에 부르고 활동 순서대로 합친다. */
async function readActivitiesInBatches(
  context: ReportContext,
  deps: RunStepDeps,
): Promise<ModelCallOutcome> {
  const batches: ReportContext["activities"][] = [];
  for (let i = 0; i < context.activities.length; i += SIGNAL_BATCH_SIZE)
    batches.push(context.activities.slice(i, i + SIGNAL_BATCH_SIZE));

  const r = await runCalls(
    1,
    batches.map(
      (batch, batchIndex) => (startedAt: number) =>
        callWithRetry(
          1,
          { context, prior: {}, batch, batchIndex },
          deps,
          {},
          {},
          startedAt,
        ),
    ),
    deps,
  );
  if (!r.ok) return r;
  const signals = r.outputs.flatMap((o) => o.signals ?? []);
  return {
    ok: true,
    output: { step: 1, signals },
    extraAttempts: r.extraAttempts,
  };
}

/**
 * 4, 6, 7단계. 섹션마다(4단계는 match, 7단계는 planDraft 도) 따로 부르고 stepSectionIds 순서로 합친다.
 * 한 응답이 길수록 잦은 반복 루프를 호출을 쪼개 줄인다. 합친 뒤 단계 전체 검증을 한 번 더 돈다.
 */
async function runSplitStep(
  step: SplitStep,
  context: ReportContext,
  prior: StepPromptInput["prior"],
  deps: RunStepDeps,
  axes?: AxisEvaluation[],
): Promise<ModelCallOutcome> {
  const extra = axes ? { axes } : {};
  const calls: StepCall[] = stepCalls(step, context, axes);
  const r = await runCalls(
    step,
    calls.map(
      (call) => (startedAt: number) =>
        callWithRetry(
          step,
          { context, prior, call },
          deps,
          extra,
          {},
          startedAt,
        ),
    ),
    deps,
  );
  if (!r.ok) return r;

  let sections = r.outputs.flatMap((o) => o.sections ?? []);
  const merged: StepOutput = { step, sections };
  for (const o of r.outputs) {
    if (o.match) merged.match = o.match;
    if (o.planDraft) merged.planDraft = o.planDraft;
  }
  if (step === 6 && axes) {
    // 근거 활동이 없는 축 섹션은 부르지 않았으니 앱이 no_data 로 채우고 단계 순서로 되돌린다.
    sections = normalizeAxisSections(
      sections,
      axes,
      context.evidenceIds,
      context.activities,
    );
    sections = stepSectionIds(step, context).flatMap((id) =>
      sections.filter((x) => x.id === id),
    );
    merged.sections = sections;
    merged.axes = axes;
  }
  const verdict = validateStepOutput(step, merged, context, extra);
  if (!verdict.ok) {
    return {
      ok: false,
      step,
      issues: verdict.issues,
      extraAttempts: r.extraAttempts,
      failure: "validation",
    };
  }
  return { ok: true, output: merged, extraAttempts: r.extraAttempts };
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

/** 저장된 1-8 반복 문제의식 항목의 text. 섹션 호출 모두에 같은 문제의식을 이어 쓰게 한다. */
function repeatedProblemTexts(sections: SectionItem[]): string[] {
  const body = sections.find((x) => x.id === "1-8")?.body;
  const items = Array.isArray(body)
    ? body
    : isRecord(body) && Array.isArray(body.items)
      ? body.items
      : [];
  return items.flatMap((item) =>
    isRecord(item) && typeof item.text === "string" && item.text.trim() !== ""
      ? [item.text]
      : [],
  );
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
    const r = await readActivitiesInBatches(context, deps);
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
  // 4, 6, 7단계는 섹션 호출마다 3단계 서사를 공통 입력으로 싣고, 6, 7단계는 4단계 설문 대조도 싣는다.
  if (step === 4 || step === 6 || step === 7) {
    if (!s.narrative) return missingPrior(step, "narrative");
  }
  if (step === 6) {
    if (!s.match) return missingPrior(step, "match");
  }
  if (step === 7) {
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

  if (step === 4 || step === 6 || step === 7) {
    const prior: StepPromptInput["prior"] = { signals: s.signals };
    if (s.narrative) prior.narrative = s.narrative;
    const problems = repeatedProblemTexts(s.sections);
    if (problems.length > 0) prior.problems = problems;
    if (step !== 4 && s.match) prior.match = s.match;
    if (step === 7) {
      if (s.consistency) prior.consistency = s.consistency;
      if (s.axes) prior.axes = s.axes;
    }
    const axes = step === 6 ? computeStep6(context, s.signals) : undefined;
    if (axes) prior.axes = axes;
    const r = await runSplitStep(step, context, prior, deps, axes);
    return r.ok
      ? modelResult(step, context, stored, s, r.output, r.extraAttempts)
      : r;
  }

  const r = await callWithRetry(
    step,
    { context, prior: { signals: s.signals } },
    deps,
    {},
  );
  return r.ok
    ? modelResult(step, context, stored, s, r.output, r.extraAttempts)
    : r;
}
