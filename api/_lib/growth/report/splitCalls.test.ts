// 4, 6, 7단계는 섹션마다 모델을 따로 부른다(4단계는 match, 7단계는 planDraft 호출을 더한다).
// 한 응답이 길어질수록 반복 루프로 잘리는 문제를 호출을 쪼개 줄인다.

import { describe, expect, it, vi } from "vitest";
import { SECTION_REGISTRY, type SectionItem } from "../sections.js";
import { computeStep5, computeStep6 } from "./compute.js";
import { stepSectionIds } from "./prompts.js";
import { type RunStepDeps, runStep, type StoredOutputs } from "./runStep.js";
import type { ContextActivity, ReportContext } from "./types.js";

const activity = (id: string): ContextActivity => ({
  id,
  sourceProgram: "manual",
  gradeLabel: "고2",
  semester: 1,
  subjectGroup: "과학",
  subject: "물리",
  topic: `주제 ${id}`,
  text: `${id} 본문`,
  group: "curricular",
});

const activities = ["act-1", "act-2", "act-3"].map(activity);

const context: ReportContext = {
  reportId: "r1",
  profileId: "p1",
  track: "고2",
  currentGrade: "고2",
  range: { semesters: ["고1-1", "고1-2", "고2-1"], description: "범위" },
  omitted: { ids: [], reasons: [] },
  expectedSectionIds: [],
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

// act-1, act-2 는 A 축, act-3 은 C 축이다. B, D, E 축은 근거 활동이 없다.
const byActivity = [
  { activityId: "act-1", axes: ["A"], summary: "s1" },
  { activityId: "act-2", axes: ["A"], summary: "s2" },
  { activityId: "act-3", axes: ["C"], summary: "s3" },
].map((s) => ({ ...s, linkage: [], keywords: [], method: null }));

const THEME = "열과 에너지 흐름 탐구";
const SUBTHEME = "고1 열 전달 기초 실험";
const PROBLEM = "열이 어떻게 이동하는가라는 되풀이된 물음";
const MATCH_TEXT = "설문의 물리 진로와 활동이 맞는다";

const section18: SectionItem = {
  id: "1-8",
  title: "반복 문제의식",
  format: "list",
  badge: "fact",
  status: "ok",
  evidence_ids: ["act-1"],
  body: { items: [{ text: PROBLEM, evidence_ids: ["act-1"] }] },
};

const narrativeStored = {
  narrative_theme: THEME,
  grade_subthemes: [
    { grade: "고1", stage: "seed", text: SUBTHEME },
    { grade: "고2", stage: "flower", text: "고2 열기관 비교" },
    { grade: "고3", stage: "bloom", text: "고3 에너지 효율 종합" },
  ],
};

const matchStored = {
  aligned: [{ text: MATCH_TEXT, evidenceIds: ["act-2"] }],
  conflicting: [],
};

const baseStored = (): StoredOutputs => ({
  signals: { byActivity },
  ...narrativeStored,
  stage: "flower",
  consistency: null,
  axis_scores: null,
  sections: [section18],
  planDraft: null,
});

const storedFor = (step: 4 | 6 | 7): StoredOutputs => {
  const s = baseStored();
  if (step === 4) return s;
  s.signals = { byActivity, match: matchStored };
  if (step === 6) return s;
  s.consistency = computeStep5(context, byActivity as never).consistency;
  s.axis_scores = computeStep6(context, byActivity as never);
  return s;
};

// ---------------------------------------------------------------------------
// 목 모델
// ---------------------------------------------------------------------------

const sectionIdOf = (user: string): string | undefined =>
  /작성할 항목[^\n]*\n\[\s*\{\s*"id": "([\d-]+)"/.exec(user)?.[1];

function bodyFor(id: string): unknown {
  const def = SECTION_REGISTRY.find((d) => d.id === id);
  const e = ["a1"];
  switch (def?.format) {
    case "list":
      return { items: [{ text: "항목", evidence_ids: e }] };
    case "table":
      return { rows: [{ label: "해석", value: "서술", evidence_ids: e }] };
    default:
      return { text: "서술" };
  }
}

const planItem = (priority: string) => ({
  program: "deep",
  title: "탐구 방향 정하기",
  description: "방향과 조건만 정한다",
  priority,
  period: "semester",
});

// 호출 종류별 단계 규칙에만 있는 문구. 공통 규칙에도 단어는 나오므로 문구로 구분한다.
const MATCH_MARK = "match.aligned(맞는 신호)";
const PLAN_MARK = "required 는 최대 3건";
const SECTION7_MARK = "항목마다 조건은 2~3개만";

type Bundle = Parameters<RunStepDeps["callModel"]>[0];

/** 호출 종류를 프롬프트에서 읽어 그 종류의 정상 응답을 낸다. */
function answer(bundle: Bundle, plan: unknown[] = [planItem("required")]) {
  const id = sectionIdOf(bundle.user);
  if (id)
    return {
      sections: [{ id, status: "ok", evidence_ids: ["a1"], body: bodyFor(id) }],
    };
  if (bundle.system.includes(PLAN_MARK)) return { planDraft: plan };
  return {
    match: {
      aligned: [{ text: "일치", evidenceIds: ["a2"] }],
      conflicting: [],
    },
  };
}

const ok = (value: unknown) => ({
  text: JSON.stringify(value),
  finishReason: "STOP" as string | null,
});

const baseDeps = (callModel: RunStepDeps["callModel"]): RunStepDeps => ({
  callModel,
  now: () => "2026-10-06T00:00:00.000Z",
  budgetMs: 10_000,
});

async function run(
  step: 4 | 6 | 7,
  respond: (
    b: Bundle,
  ) => ReturnType<typeof ok> | Promise<ReturnType<typeof ok>>,
  ctx: ReportContext = context,
) {
  const bundles: Bundle[] = [];
  const callModel = vi.fn(async (b: Bundle) => {
    bundles.push(b);
    return respond(b);
  });
  const r = await runStep(step, ctx, storedFor(step), baseDeps(callModel));
  return { r, bundles, callModel };
}

/** 표 형식 섹션 호출은 1024, 다른 섹션 호출은 1536 이다. */
const sectionLimit = (id: string | undefined): number =>
  SECTION_REGISTRY.find((d) => d.id === id)?.format === "table" ? 1024 : 1536;

const sectionBundles = (bundles: Bundle[]) =>
  bundles.filter((b) => sectionIdOf(b.user) !== undefined);
const otherBundles = (bundles: Bundle[]) =>
  bundles.filter((b) => sectionIdOf(b.user) === undefined);

// 6단계에서 근거 활동이 있는 축 섹션과 축이 아닌 섹션만 부른다.
const STEP6_CALLED = ["2-1", "2-3", "2-6", "2-7", "2-8", "2-9", "2-10"];

describe("4단계 섹션별 호출", () => {
  it("섹션마다 1호출과 match 1호출을 부르고 각 섹션 호출은 그 id 하나만 요청한다", async () => {
    const { r, bundles } = await run(4, (b) => ok(answer(b)));
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    const ids = stepSectionIds(4, context);
    expect(bundles).toHaveLength(ids.length + 1);
    expect(sectionBundles(bundles).map((b) => sectionIdOf(b.user))).toEqual(
      ids,
    );
    for (const b of sectionBundles(bundles)) {
      const mine = sectionIdOf(b.user);
      for (const other of ids.filter((x) => x !== mine))
        expect(b.user).not.toContain(`"id": "${other}"`);
      expect(b.user).toContain("이 id 하나만 쓴다");
      expect(b.system).not.toContain(MATCH_MARK);
      expect(b.maxOutputTokens).toBe(sectionLimit(sectionIdOf(b.user)));
    }
    const match = otherBundles(bundles);
    expect(match).toHaveLength(1);
    expect(match[0]?.system).toContain(MATCH_MARK);
    expect(match[0]?.system).not.toContain("지정한 항목 하나만 쓴다");
    expect(match[0]?.user).not.toContain("작성할 항목");
    expect(match[0]?.maxOutputTokens).toBe(1536);
    expect(r.output.sections?.map((s) => s.id)).toEqual(ids);
    expect(r.output.match?.aligned[0]?.evidenceIds).toEqual(["act-2"]);
  });

  it("모든 호출 user 에 대주제, 학년별 소주제, 1-8 본문이 실린다", async () => {
    const { bundles } = await run(4, (b) => ok(answer(b)));
    for (const b of bundles) {
      expect(b.user).toContain(THEME);
      expect(b.user).toContain(SUBTHEME);
      expect(b.user).toContain(PROBLEM);
      expect(b.user).toContain("새 대주제를 만들지 않는다");
    }
  });
});

describe("6단계 섹션별 호출", () => {
  it("근거 활동이 없는 축은 부르지 않고 앱이 no_data 로 확정하며 stepSectionIds 순서로 합친다", async () => {
    const { r, bundles } = await run(6, (b) => ok(answer(b)));
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    expect(bundles.map((b) => sectionIdOf(b.user))).toEqual(STEP6_CALLED);
    for (const b of bundles) {
      expect(b.system).not.toContain(PLAN_MARK);
      expect(b.system).not.toContain(MATCH_MARK);
      expect(b.maxOutputTokens).toBe(sectionLimit(sectionIdOf(b.user)));
    }
    const out = r.output.sections ?? [];
    expect(out.map((s) => s.id)).toEqual(stepSectionIds(6, context));
    for (const id of ["2-2", "2-4", "2-5"])
      expect(out.find((s) => s.id === id)?.status).toBe("no_data");
    expect(out.find((s) => s.id === "2-1")?.status).toBe("ok");
    expect(r.output.axes).toHaveLength(5);
  });

  it("모든 호출 user 에 대주제, 소주제, 1-8 본문, 설문 대조 text 가 실린다", async () => {
    const { bundles } = await run(6, (b) => ok(answer(b)));
    for (const b of bundles) {
      expect(b.user).toContain(THEME);
      expect(b.user).toContain(SUBTHEME);
      expect(b.user).toContain(PROBLEM);
      expect(b.user).toContain(MATCH_TEXT);
    }
  });

  it("한 섹션의 첫 응답이 잘리면 그 섹션만 두 번 부르고 extraAttempts 는 1이다", async () => {
    let cut = false;
    const { r, bundles } = await run(6, (b) => {
      if (!cut && sectionIdOf(b.user) === "2-6") {
        cut = true;
        return { text: '{"sections":[', finishReason: "MAX_TOKENS" };
      }
      return ok(answer(b));
    });
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    expect(r.extraAttempts).toBe(1);
    const ids = bundles.map((b) => sectionIdOf(b.user));
    expect(ids.filter((x) => x === "2-6")).toHaveLength(2);
    expect(bundles).toHaveLength(STEP6_CALLED.length + 1);
    const retry = bundles.filter((b) => sectionIdOf(b.user) === "2-6")[1];
    expect(retry?.user).toContain("이전 응답의 문제");
  });

  it("한 섹션이 두 번 다 실패하면 단계가 실패하고 patch 가 없다", async () => {
    const { r } = await run(6, (b) =>
      sectionIdOf(b.user) === "2-6"
        ? { text: '{"sections":[', finishReason: "MAX_TOKENS" }
        : ok(answer(b)),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.failure).toBe("validation");
    expect(r.extraAttempts).toBe(1);
    expect(r.issues.map((i) => i.code)).toEqual(["truncated"]);
    expect("patch" in r).toBe(false);
  });

  it("upstream 오류가 섞이면 failure 는 upstream 이다", async () => {
    const { r } = await run(6, (b) => {
      if (sectionIdOf(b.user) === "2-7") throw new Error("boom");
      if (sectionIdOf(b.user) === "2-6")
        return { text: '{"sections":[', finishReason: "MAX_TOKENS" };
      return ok(answer(b));
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure).toBe("upstream");
  });
});

const longCellAnswer = (b: Bundle, len: number) => {
  const id = sectionIdOf(b.user);
  return ok({
    sections: [
      {
        id,
        status: "ok",
        evidence_ids: ["a1"],
        body: {
          rows: [
            { label: "과학", value: "가".repeat(len), evidence_ids: ["a1"] },
          ],
        },
      },
    ],
  });
};

describe("표 칸 길이 재요청", () => {
  it("칸이 121자인 표 섹션은 60자 메모와 함께 재요청되고, 짧아지면 단계가 성공한다", async () => {
    let tries = 0;
    const { r, bundles } = await run(6, (b) => {
      if (sectionIdOf(b.user) !== "2-6") return ok(answer(b));
      tries++;
      return longCellAnswer(b, tries === 1 ? 121 : 40);
    });
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    expect(r.extraAttempts).toBe(1);
    const mine = bundles.filter((b) => sectionIdOf(b.user) === "2-6");
    expect(mine).toHaveLength(2);
    expect(mine[0]?.user).not.toContain("이전 응답의 문제");
    expect(mine[1]?.user).toContain("이전 응답의 문제");
    expect(mine[1]?.user).toContain(
      "각 칸을 한 문장 60자 이내로, 줄바꿈과 괄호 부연 없이",
    );
  });

  it("재요청도 121자면 table_cell_too_long 으로 단계가 실패한다", async () => {
    const { r } = await run(6, (b) =>
      sectionIdOf(b.user) === "2-6" ? longCellAnswer(b, 121) : ok(answer(b)),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues.map((i) => i.code)).toEqual(["table_cell_too_long"]);
  });

  it("앱이 만든 근거 활동 행이 120자를 넘어도 6단계는 통과한다", async () => {
    const longTopic = "아주 긴 탐구 주제 이름 ".repeat(8).trim();
    const longContext: ReportContext = {
      ...context,
      activities: activities.map((a) => ({ ...a, topic: longTopic })),
    };
    const { r } = await run(6, (b) => ok(answer(b)), longContext);
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    const body = r.output.sections?.find((s) => s.id === "2-1")?.body as
      | { rows: { label: string; value: string }[] }
      | undefined;
    const rows = body?.rows ?? [];
    expect(
      rows.find((x) => x.label === "근거 활동")?.value.length,
    ).toBeGreaterThan(120);
  });
});

describe("7단계 섹션별 호출", () => {
  it("섹션마다 1호출과 planDraft 1호출을 부르고 종류별 지시가 섞이지 않는다", async () => {
    const { r, bundles } = await run(7, (b) => ok(answer(b)));
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    const ids = stepSectionIds(7, context);
    expect(bundles).toHaveLength(ids.length + 1);
    for (const b of sectionBundles(bundles)) {
      expect(b.system).not.toContain(PLAN_MARK);
      expect(b.system).toContain(SECTION7_MARK);
      expect(b.maxOutputTokens).toBe(sectionLimit(sectionIdOf(b.user)));
    }
    const plan = otherBundles(bundles);
    expect(plan).toHaveLength(1);
    expect(plan[0]?.system).toContain(PLAN_MARK);
    expect(plan[0]?.system).not.toContain(SECTION7_MARK);
    expect(plan[0]?.user).not.toContain("작성할 항목");
    expect(plan[0]?.maxOutputTokens).toBe(2048);
    expect(r.output.sections?.map((s) => s.id)).toEqual(ids);
    expect(r.output.planDraft).toHaveLength(1);
  });

  it("모든 호출 user 에 대주제, 소주제, 1-8 본문, 설문 대조 text 가 실린다", async () => {
    const { bundles } = await run(7, (b) => ok(answer(b)));
    for (const b of bundles) {
      expect(b.user).toContain(THEME);
      expect(b.user).toContain(SUBTHEME);
      expect(b.user).toContain(PROBLEM);
      expect(b.user).toContain(MATCH_TEXT);
    }
  });

  it("planDraft 상한 위반은 planDraft 호출만 재요청한다", async () => {
    const tooMany = Array.from({ length: 4 }, () => planItem("required"));
    let plans = 0;
    const { r, bundles } = await run(7, (b) => {
      if (sectionIdOf(b.user) === undefined) {
        plans++;
        return ok(answer(b, plans === 1 ? tooMany : [planItem("required")]));
      }
      return ok(answer(b));
    });
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    expect(r.extraAttempts).toBe(1);
    expect(otherBundles(bundles)).toHaveLength(2);
    expect(sectionBundles(bundles)).toHaveLength(
      stepSectionIds(7, context).length,
    );
    expect(otherBundles(bundles)[1]?.user).toContain("이전 응답의 문제");
  });
});

describe("번들 호출 정보(callInfo)", () => {
  const infoOf = (b: Bundle) => b.callInfo;

  it("4단계는 섹션 id, match 종류를 싣고 시도 번호는 0이다", async () => {
    const { bundles } = await run(4, (b) => ok(answer(b)));
    const sections = stepSectionIds(4, context).map((id) => ({
      step: 4,
      kind: "section",
      sectionId: id,
      batchIndex: null,
      attempt: 0,
    }));
    expect(bundles.map(infoOf)).toEqual([
      ...sections,
      { step: 4, kind: "match", sectionId: null, batchIndex: null, attempt: 0 },
    ]);
  });

  it("6단계는 부르는 섹션 id 를, 7단계는 섹션 id 와 planDraft 종류를 싣는다", async () => {
    const six = await run(6, (b) => ok(answer(b)));
    expect(six.bundles.map((b) => infoOf(b)?.sectionId)).toEqual(STEP6_CALLED);
    expect(six.bundles.every((b) => infoOf(b)?.step === 6)).toBe(true);
    const seven = await run(7, (b) => ok(answer(b)));
    expect(infoOf(seven.bundles.at(-1) as Bundle)).toEqual({
      step: 7,
      kind: "planDraft",
      sectionId: null,
      batchIndex: null,
      attempt: 0,
    });
    expect(infoOf(seven.bundles[0] as Bundle)).toMatchObject({
      step: 7,
      kind: "section",
      sectionId: "3-2",
    });
  });

  it("같은 요청 안 재요청은 시도 번호가 1이다", async () => {
    let cut = false;
    const { bundles } = await run(6, (b) => {
      if (!cut && sectionIdOf(b.user) === "2-6") {
        cut = true;
        return { text: '{"sections":[', finishReason: "MAX_TOKENS" };
      }
      return ok(answer(b));
    });
    const mine = bundles.filter((b) => infoOf(b)?.sectionId === "2-6");
    expect(mine.map((b) => infoOf(b)?.attempt)).toEqual([0, 1]);
  });
});

describe("동시 호출", () => {
  it("4, 6, 7단계 모두 동시에 진행 중인 호출은 6을 넘지 않는다", async () => {
    for (const step of [4, 6, 7] as const) {
      let running = 0;
      let peak = 0;
      let calls = 0;
      const { r } = await run(step, async (b) => {
        calls += 1;
        running += 1;
        peak = Math.max(peak, running);
        await new Promise((resolve) => setTimeout(resolve, 5));
        running -= 1;
        return ok(answer(b));
      });
      expect(r.ok).toBe(true);
      expect(peak, `${step}단계`).toBe(Math.min(6, calls));
    }
  });
});
