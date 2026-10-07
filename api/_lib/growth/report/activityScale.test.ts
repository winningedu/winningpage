// 활동 수가 16, 37, 60, 120건이어도 1~8단계가 출력 한도 안에서 끝나는지 목 모델로 확인한다.
// 4, 6, 7단계는 섹션마다(4단계는 match, 7단계는 planDraft 도) 따로 부르므로 한도도 호출 종류별로 본다.
// 목 모델은 최악의 모델이다. 근거 필드마다 프롬프트에 나온 별칭을 전부 나열하고(대표 3개 규칙 무시),
// 요청된 항목을 모두 분량 원칙의 최대 길이로 쓴다. 출력 토큰은 글자 수로 어림한다.

import { describe, expect, it } from "vitest";
import {
  expectedSectionIds,
  SECTION_REGISTRY,
  type SectionItem,
} from "../sections.js";
import { computeStep6 } from "./compute.js";
import {
  buildStepPrompt,
  type ModelStep,
  STEP_MAX_OUTPUT_TOKENS,
  stepSectionIds,
} from "./prompts.js";
import {
  type RunStepDeps,
  readStored,
  runStep,
  type StoredOutputs,
} from "./runStep.js";
import type { ContextActivity, ReportContext } from "./types.js";

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

// ---------------------------------------------------------------------------
// 토큰 어림
// ---------------------------------------------------------------------------

/** UUID 36자의 실측 토큰 수(약 30). */
const UUID_TOKENS = 30;

/**
 * 응답 텍스트의 출력 토큰을 보수적으로 어림한다.
 * 비 ASCII 글자 1자는 1토큰, ASCII 4자는 1토큰이다. UUID 는 실측 약 30토큰으로 센다.
 */
function estimateTokens(text: string): number {
  const uuids = text.match(UUID_RE)?.length ?? 0;
  const rest = text.replace(UUID_RE, "");
  let nonAscii = 0;
  let ascii = 0;
  for (const ch of rest) {
    if (ch.charCodeAt(0) > 127) nonAscii++;
    else ascii++;
  }
  return nonAscii + Math.ceil(ascii / 4) + uuids * UUID_TOKENS;
}

// ---------------------------------------------------------------------------
// 픽스처
// ---------------------------------------------------------------------------

const uuidOf = (i: number): string => {
  const h = (i + 1).toString(16);
  return `${h.padStart(8, "0")}-1111-4111-8111-${h.padStart(12, "0")}`;
};

const SEMESTERS = [
  { gradeLabel: "고1", semester: 1 },
  { gradeLabel: "고1", semester: 2 },
  { gradeLabel: "고2", semester: 1 },
] as const;
const SUBJECTS = [
  ["과학", "물리"],
  ["과학", "화학"],
  ["과학", "생명과학"],
  ["수학", "수학"],
  ["국어", "문학"],
  ["영어", "영어"],
] as const;
const CREATIVE = ["자율활동", "동아리활동", "진로활동"] as const;

function makeActivity(i: number): ContextActivity {
  const sem = SEMESTERS[i % SEMESTERS.length];
  const creative = i % 5 === 4;
  const subject = SUBJECTS[i % SUBJECTS.length];
  return {
    id: uuidOf(i),
    sourceProgram: "manual",
    gradeLabel: sem?.gradeLabel ?? "고1",
    semester: sem?.semester ?? 1,
    subjectGroup: creative
      ? (CREATIVE[i % CREATIVE.length] ?? null)
      : (subject?.[0] ?? null),
    subject: creative ? null : (subject?.[1] ?? null),
    topic: `주제 ${i + 1}`,
    text: `활동 ${i + 1} 본문 열 전달과 에너지 흐름을 실험으로 확인했다`,
    group: creative ? "extracurricular" : "curricular",
  };
}

function makeContext(n: number): ReportContext {
  const activities = Array.from({ length: n }, (_, i) => makeActivity(i));
  return {
    reportId: "r1",
    profileId: "p1",
    track: "고2",
    currentGrade: "고2",
    range: { semesters: ["고1-1", "고1-2", "고2-1"], description: "범위" },
    omitted: { ids: [], reasons: [] },
    expectedSectionIds: expectedSectionIds({ omit: [] }),
    noFirstYearData: false,
    activities,
    evidenceIds: activities.map((a) => a.id),
    survey: { career: "물리학자" },
    profile: {
      schoolType: null,
      grade: "고2",
      semester: 1,
      career: "물리학자",
      admissionYear: null,
    },
    grades: { system: null, semesters: [], note: null },
    universities: [],
    previousNarrative: null,
    nowIso: "2026-10-06T00:00:00.000Z",
  };
}

const emptyStored = (): StoredOutputs => ({
  signals: null,
  narrative_theme: null,
  grade_subthemes: null,
  stage: null,
  consistency: null,
  axis_scores: null,
  sections: [],
  planDraft: null,
});

// ---------------------------------------------------------------------------
// 최악의 모델 응답
// ---------------------------------------------------------------------------

/** 길이 n 인 한글 문장. 금지 표현과 주제 패턴을 피한다. */
const ko = (n: number): string => "탐구가 이어진다 ".repeat(n).slice(0, n);

/**
 * 본문 길이. 분량 원칙의 상한(prose 350자, list 5개 120자, table 8행 80자)을 모두 채우면
 * 활동 수와 무관하게 4, 7단계만으로 한도를 넘는다. 실측 정상 출력에 맞춰
 * 원칙 안의 중간 길이로 쓰고, 활동 수에 따라 늘어나는 것은 근거 나열뿐이게 한다.
 */
const LEN = {
  prose: 160,
  listItems: 4,
  listText: 70,
  rows: 4,
  rowText: 45,
  rowLabel: 25,
  axisText: 120,
  match: 3,
  matchText: 80,
  plan: 2,
} as const;

type WorstInput = {
  step: ModelStep;
  context: ReportContext;
  /** 근거 필드마다 넣을 id(별칭 또는 활동 id). 규칙을 따르는 모델은 대표 3개, 무시하는 모델은 전부다. */
  ids: string[];
  /** 참이면 축 항목 2-1~2-5 와 1-9 행의 근거를 프롬프트대로 비워 둔다(앱이 채운다). */
  emptyForApp: boolean;
  /** 1단계 한 호출이 읽는 활동 id 목록(ids 와 같은 표기). */
  batchIds: string[];
  /** 6단계 축별 verdictLabel. */
  verdictLabels: Record<string, string>;
  /** 나눈 호출이면 그 호출이 만들 것. 없으면 단계 전체(옛 구조 대조군). */
  only?: CallKindInfo;
  /** 참이면 표 본문을 분량 원칙 최대(8행, 80자)로 쓰고 근거를 전부 나열한다. 한 섹션 호출을 한도 밖으로 보내는 모델이다. */
  maximal?: boolean;
};

type CallKindInfo =
  | { kind: "section"; id: string }
  | { kind: "match" }
  | { kind: "planDraft" };

const AXIS_OF_SECTION: Record<string, string> = {
  "2-1": "A",
  "2-2": "B",
  "2-3": "C",
  "2-4": "D",
  "2-5": "E",
};

function bodyFor(def: { id: string; format: string }, w: WorstInput): unknown {
  const appOwned = w.emptyForApp ? [] : w.ids;
  const entry = (
    extra: Record<string, unknown> = {},
    evidence: string[] = w.ids,
  ) => ({
    label: ko(LEN.rowLabel),
    value: ko(LEN.rowText),
    evidence_ids: evidence,
    ...extra,
  });
  switch (def.format) {
    case "prose":
      return { text: ko(LEN.prose) };
    case "list":
      return {
        items: Array.from({ length: LEN.listItems }, () => ({
          text: ko(LEN.listText),
          evidence_ids: w.ids,
        })),
      };
    case "table": {
      if (def.id === "1-9") {
        return {
          rows: w.context.range.semesters.map((label) => ({
            label,
            value: "연계",
            evidence_ids: appOwned,
          })),
        };
      }
      const axis = AXIS_OF_SECTION[def.id];
      if (axis) {
        return {
          // 판정, 근거 활동, 대학 평가요소 대응 행은 앱이 만든다. 모델은 해석과 부족한 점만 120자 이내로 쓴다.
          rows: [
            entry({ label: "해석", value: ko(LEN.axisText) }, appOwned),
            entry({ label: "부족한 점", value: ko(LEN.axisText) }, appOwned),
          ],
        };
      }
      if (def.id === "3-5") {
        return {
          rows: Array.from({ length: LEN.rows }, () => ({
            subject: ko(LEN.rowLabel),
            direction: ko(LEN.rowText),
            record_to_leave: ko(LEN.rowText),
            evidence_ids: w.ids,
          })),
        };
      }
      if (w.maximal) {
        return {
          rows: Array.from({ length: 8 }, () =>
            entry({ label: ko(80), value: ko(80) }),
          ),
        };
      }
      return { rows: Array.from({ length: LEN.rows }, () => entry()) };
    }
    default:
      return {};
  }
}

function sectionsFor(w: WorstInput) {
  const only = w.only;
  if (only && only.kind !== "section") return [];
  const ids = stepSectionIds(w.step, w.context).filter(
    (id) => !only || id === only.id,
  );
  return ids.map((id) => {
    const def = SECTION_REGISTRY.find((d) => d.id === id);
    if (!def) throw new Error(`레지스트리에 없는 항목 ${id}`);
    return {
      id,
      status: "ok",
      evidence_ids:
        w.emptyForApp && (id in AXIS_OF_SECTION || id === "1-9") ? [] : w.ids,
      body: bodyFor(def, w),
    };
  });
}

const matchList = (ids: string[]) =>
  Array.from({ length: LEN.match }, () => ({
    text: ko(LEN.matchText),
    evidenceIds: ids,
  }));

/** 그 단계의 정상 형식 응답을 최대 길이로 쓴다. */
function worstResponse(w: WorstInput): unknown {
  switch (w.step) {
    case 1:
      return {
        signals: w.batchIds.map((activityId) => ({
          activityId,
          axes: ["A", "B", "C", "D", "E"],
          method: ko(10),
          keywords: Array.from({ length: 5 }, () => ko(6)),
          summary: ko(80),
        })),
      };
    case 3:
      return {
        narrative: {
          theme: ko(60),
          subthemes: [
            { grade: "고1", stage: "seed", text: ko(120) },
            { grade: "고2", stage: "flower", text: ko(120) },
            { grade: "고3", stage: "bloom", text: ko(120) },
          ],
        },
        sections: sectionsFor(w),
      };
    case 4: {
      const match = {
        aligned: matchList(w.ids),
        conflicting: matchList(w.ids),
      };
      if (w.only?.kind === "match") return { match };
      if (w.only) return { sections: sectionsFor(w) };
      return { match, sections: sectionsFor(w) };
    }
    case 5:
      return { sections: sectionsFor(w) };
    case 6:
      return { sections: sectionsFor(w) };
    case 7: {
      const plan = (priority: string) =>
        Array.from({ length: LEN.plan }, () => ({
          program: "deep",
          title: ko(40),
          description: ko(160),
          priority,
          period: "semester",
          periodLabel: ko(10),
          axis: "C",
          category: ko(10),
        }));
      const planDraft = [...plan("required"), ...plan("recommended")];
      if (w.only?.kind === "planDraft") return { planDraft };
      if (w.only) return { sections: sectionsFor(w) };
      return { sections: sectionsFor(w), planDraft };
    }
  }
}

const ALIAS_RE = /"(?:id|activityId)": "(a\d+)"/g;

/** 프롬프트에 나온 활동 별칭(중복 없이, 나온 순서). */
function aliasesIn(user: string): string[] {
  return [...new Set([...user.matchAll(ALIAS_RE)].map((m) => m[1] ?? ""))];
}

// ---------------------------------------------------------------------------
// 1~8단계 실행
// ---------------------------------------------------------------------------

type CallLog = {
  step: number;
  /** single 은 1, 3, 5단계의 단일 호출이다. */
  kind: "single" | "section" | "match" | "planDraft";
  sectionId: string | null;
  tokens: number;
  limit: number;
  cut: boolean;
  user: string;
};

/** 대표 근거 규칙대로 입력 전체에서 고르게 퍼진 별칭 3개(앞, 가운데, 끝)를 고른다. */
function representative(aliases: string[]): string[] {
  if (aliases.length <= 3) return aliases;
  const mid = Math.floor(aliases.length / 2);
  return [aliases[0], aliases[mid], aliases[aliases.length - 1]].filter(
    (x): x is string => x !== undefined,
  );
}

/** 프롬프트의 "작성할 항목" 블록에서 섹션 호출의 섹션 id 를 읽는다. */
const sectionIdOf = (user: string): string | undefined =>
  /작성할 항목[^\n]*\n\[\s*\{\s*"id": "([\d-]+)"/.exec(user)?.[1];

/** 단계와 프롬프트로 호출 종류를 알아낸다. 4, 6, 7단계 섹션 호출이 아닌 호출은 4단계 match, 7단계 planDraft 다. */
function callOf(step: number, user: string): CallKindInfo | null {
  if (step !== 4 && step !== 6 && step !== 7) return null;
  const id = sectionIdOf(user);
  if (id) return { kind: "section", id };
  return step === 4 ? { kind: "match" } : { kind: "planDraft" };
}

type RunOptions = {
  /** 6단계 2-6 섹션의 첫 호출만 대표 근거 규칙을 무시하고 모든 별칭을 모든 근거 필드에 나열하며 표를 최대 분량으로 쓴다. */
  ignoreRuleOnStep6?: boolean;
  /** 참이면 3~7단계 응답의 본문 문자열 끝에 입력의 별칭 목록을 덧붙인다. 한도 판정은 이 원문 기준이다. */
  leakAliasesInText?: boolean;
};

const TEXT_KEYS = new Set([
  "text",
  "value",
  "label",
  "direction",
  "record_to_leave",
  "theme",
  "title",
  "description",
]);

/** 응답 객체의 본문 문자열 끝에 별칭 목록을 덧붙인 사본. */
function leakAliases(value: unknown, aliases: string[], key = ""): unknown {
  if (typeof value === "string")
    return TEXT_KEYS.has(key) ? `${value} (${aliases.join(", ")})` : value;
  if (Array.isArray(value))
    return value.map((v) => leakAliases(v, aliases, key));
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [k, leakAliases(v, aliases, k)]),
  );
}

const EVIDENCE_KEYS = new Set([
  "id",
  "evidence_ids",
  "evidenceIds",
  "linked",
  "activityId",
]);

/** 근거 필드와 앱이 만든 도식 노드 id 를 뺀 모든 문자열. */
function textsOf(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(textsOf);
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([k, v]) =>
    EVIDENCE_KEYS.has(k) ? [] : textsOf(v),
  );
}

async function runAllSteps(n: number, options: RunOptions = {}) {
  const context = makeContext(n);
  const calls: CallLog[] = [];
  const extraAttempts: Record<number, number> = {};
  let stored = emptyStored();
  let last: Awaited<ReturnType<typeof runStep>> | null = null;
  for (const step of [1, 2, 3, 4, 5, 6, 7, 8] as const) {
    const signals = readStored(stored).signals;
    const verdictLabels = Object.fromEntries(
      computeStep6(context, signals).map((e) => [e.axis, e.verdictLabel]),
    );
    let ignored = false;
    const callModel: RunStepDeps["callModel"] = async (bundle) => {
      const aliases = aliasesIn(bundle.user);
      const only = callOf(step, bundle.user);
      const ignoring =
        options.ignoreRuleOnStep6 === true &&
        step === 6 &&
        only?.kind === "section" &&
        only.id === "2-6" &&
        !ignored;
      if (ignoring) ignored = true;
      const response = worstResponse({
        step: step as ModelStep,
        context,
        ids: ignoring ? aliases : representative(aliases),
        emptyForApp: !ignoring,
        batchIds: step === 1 ? aliases : [],
        verdictLabels,
        ...(only ? { only } : {}),
        maximal: ignoring,
      });
      const text = JSON.stringify(
        options.leakAliasesInText === true && step >= 3 && step <= 7
          ? leakAliases(response, aliases)
          : response,
      );
      const tokens = estimateTokens(text);
      const cut = tokens > bundle.maxOutputTokens;
      calls.push({
        step,
        kind: only ? only.kind : "single",
        sectionId: only?.kind === "section" ? only.id : null,
        tokens,
        limit: bundle.maxOutputTokens,
        cut,
        user: bundle.user,
      });
      return { text, finishReason: cut ? "MAX_TOKENS" : "STOP" };
    };
    const r = await runStep(step, context, stored, {
      callModel,
      now: () => "2026-10-06T00:00:00.000Z",
      budgetMs: 50_000,
      carried: [],
    });
    if (!r.ok)
      throw new Error(
        `${n}건 ${step}단계 실패: ${r.failure} ${JSON.stringify(r.issues).slice(0, 400)}`,
      );
    extraAttempts[step] = r.extraAttempts;
    stored = { ...stored, ...r.patch } as StoredOutputs;
    last = r;
  }
  return { context, calls, extraAttempts, last, stored };
}

/** 호출 종류별 최대 어림 토큰과 한도. 키는 "4단계 섹션" 같은 이름이다. */
const KIND_LABEL = {
  single: "",
  section: " 섹션",
  match: " match",
  planDraft: " planDraft",
} as const;

const maxByKind = (
  calls: CallLog[],
): Record<string, { tokens: number; limit: number }> => {
  const out: Record<string, { tokens: number; limit: number }> = {};
  for (const c of calls) {
    const key = `${c.step}단계${KIND_LABEL[c.kind]}`;
    const prev = out[key];
    out[key] = {
      tokens: Math.max(prev?.tokens ?? 0, c.tokens),
      limit: c.limit,
    };
  }
  return out;
};

describe("활동 수별 출력 한도", () => {
  it.each([16, 37, 60, 120])(
    "활동 %i건에서 1~8단계가 모두 한도 안에서 끝난다",
    async (n) => {
      const { calls, extraAttempts } = await runAllSteps(n);
      expect(Object.values(extraAttempts).every((x) => x === 0)).toBe(true);
      const max = maxByKind(calls);
      const table = Object.entries(max)
        .map(([k, v]) => `${k} ${v.tokens}/${v.limit}`)
        .join(", ");
      const cut = calls.filter((c) => c.cut);
      expect(
        cut,
        `${n}건 잘린 호출 ${JSON.stringify(cut)}; 단계별 최대 어림 토큰: ${table}`,
      ).toEqual([]);
      // 1단계는 15건 묶음이라 호출 수가 활동 수에 비례한다.
      expect(calls.filter((c) => c.step === 1)).toHaveLength(Math.ceil(n / 15));
      // 4, 6, 7단계는 섹션 수(4단계 4, 6단계 10, 7단계 9)에 match 또는 planDraft 호출이 더해지고 활동 수와 무관하다.
      const count = (step: number, kind: CallLog["kind"]) =>
        calls.filter((c) => c.step === step && c.kind === kind).length;
      expect(count(4, "section")).toBe(4);
      expect(count(4, "match")).toBe(1);
      expect(count(6, "section")).toBe(10);
      expect(count(7, "section")).toBe(9);
      expect(count(7, "planDraft")).toBe(1);
      // 호출별 한도는 종류별 상수다.
      for (const c of calls.filter((x) => x.kind === "section"))
        expect(c.limit).toBe(1536);
      for (const c of calls.filter((x) => x.kind === "match"))
        expect(c.limit).toBe(1536);
      for (const c of calls.filter((x) => x.kind === "planDraft"))
        expect(c.limit).toBe(2048);
    },
    30_000,
  );

  it("8단계 조립 결과의 근거 id 는 모두 활동 UUID 이고 별칭이 남지 않는다", async () => {
    const { last, context } = await runAllSteps(60);
    if (!last?.ok || last.step !== 8) throw new Error("8단계 결과 없음");
    const sections = last.output.sections as SectionItem[];
    const known = new Set(context.evidenceIds);
    for (const s of sections) {
      for (const id of s.evidence_ids) {
        expect(known.has(id), `${s.id} 근거 ${id}`).toBe(true);
      }
    }
    expect(JSON.stringify(sections)).not.toMatch(/"a\d+"/);
  });
});

// ---------------------------------------------------------------------------
// 대조군: 옛 구조(UUID 근거, 옛 한도, 1단계 비묶음)
// ---------------------------------------------------------------------------

const OLD_LIMITS: Record<ModelStep, number> = {
  1: 4096,
  3: 2048,
  4: 3072,
  5: 2048,
  6: 6144,
  7: 6144,
};

/** 옛 구조의 단계별 어림 토큰. 구현은 건드리지 않고 같은 최악 응답을 UUID 근거로 어림만 한다. */
function oldStructureTokens(n: number): Record<ModelStep, number> {
  const context = makeContext(n);
  const uuids = context.evidenceIds;
  const axes = computeStep6(context, []);
  const verdictLabels = Object.fromEntries(
    axes.map((e) => [e.axis, e.verdictLabel]),
  );
  const out = {} as Record<ModelStep, number>;
  for (const step of [1, 3, 4, 5, 6, 7] as const) {
    out[step] = estimateTokens(
      JSON.stringify(
        worstResponse({
          step,
          context,
          ids: uuids,
          emptyForApp: false,
          batchIds: uuids,
          verdictLabels,
        }),
      ),
    );
  }
  return out;
}

describe("규칙을 무시한 모델", () => {
  it("6단계 활동 60건에서 한 섹션이 모든 별칭을 나열하면 그 섹션 첫 응답만 잘리고 재요청이 잘림 메모와 함께 성공한다", async () => {
    const { calls, extraAttempts } = await runAllSteps(60, {
      ignoreRuleOnStep6: true,
    });
    const all6 = calls.filter((c) => c.step === 6);
    expect(all6).toHaveLength(11);
    expect(all6.filter((c) => c.sectionId !== "2-6")).toHaveLength(9);
    expect(all6.filter((c) => c.cut)).toHaveLength(1);
    const step6 = all6.filter((c) => c.sectionId === "2-6");
    expect(step6).toHaveLength(2);
    expect(step6[0]?.cut).toBe(true);
    expect(step6[0]?.tokens).toBeGreaterThan(step6[0]?.limit ?? 0);
    expect(step6[1]?.cut).toBe(false);
    expect(step6[0]?.user).not.toContain("이전 응답의 문제");
    expect(step6[1]?.user).toContain("이전 응답의 문제");
    expect(step6[1]?.user).toContain("출력 한도를 넘어 잘렸");
    expect(step6[1]?.user).toContain("절반 이하로 줄이고");
    expect(extraAttempts[6]).toBe(1);
    for (const step of [1, 2, 3, 4, 5, 7, 8])
      expect(extraAttempts[step], `${step}단계`).toBe(0);
  });
});

describe("본문에 별칭 목록을 덧붙이는 모델", () => {
  it("활동 16건에서 정리 뒤 8단계 본문 어디에도 별칭과 UUID 가 남지 않고 재요청도 없다", async () => {
    const { calls, extraAttempts, stored } = await runAllSteps(16, {
      leakAliasesInText: true,
    });
    expect(calls.filter((c) => c.cut)).toEqual([]);
    expect(Object.values(extraAttempts).every((x) => x === 0)).toBe(true);
    const texts = textsOf([
      stored.sections,
      stored.narrative_theme,
      stored.grade_subthemes,
      stored.planDraft,
    ]);
    expect(texts.length).toBeGreaterThan(0);
    for (const t of texts) {
      expect(t, t).not.toMatch(/(?<![A-Za-z0-9])a\d+(?![A-Za-z0-9])/);
      expect(t, t).not.toMatch(UUID_RE);
    }
  });
});

describe("옛 구조 대조군", () => {
  it("UUID 근거, 옛 한도, 1단계 비묶음이면 활동 60건에서 한도를 넘는다", () => {
    const tokens = oldStructureTokens(60);
    const over = (Object.keys(OLD_LIMITS) as unknown as ModelStep[]).filter(
      (s) => tokens[s] > OLD_LIMITS[s],
    );
    expect(
      over.length,
      `옛 구조 60건 단계별 어림: ${JSON.stringify(tokens)}`,
    ).toBeGreaterThan(0);
  });

  it("새 한도 상수는 옛 한도와 다르고 번들에 그대로 실린다", () => {
    const context = makeContext(3);
    const b = buildStepPrompt(1, { context, prior: {} });
    expect(b.maxOutputTokens).toBe(STEP_MAX_OUTPUT_TOKENS[1]);
  });
});
