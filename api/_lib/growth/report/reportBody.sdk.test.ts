// 성장설계 callModelWith 의 AI SDK 경로 고정.
//
// 실제 callStructured(AI SDK 호출 계층)를 callModelWith 로 감싸 성장설계 bundle 을 동시에 보내고,
// 전역 fetch 를 가로채 실제로 나가는 Gemini REST 바디를 bundle 과 대조한다. 계기판 자식 핸들을
// 끼워도 온도, 출력 한도, 스키마, 지시문, 본문이 그대로 나가는지와, 응답의 토큰과 종료 사유가
// 그 호출의 행에 남는지를 본다.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callStructured } from "../../ai/gemini.js";
import { geminiSchemaToJsonSchema } from "../../ai/sdkAdapter.js";
import { createAiTrace } from "../../ai/telemetry/trace.js";
import { computeStep5, computeStep6 } from "./compute.js";
import { buildStepPrompt, type PromptBundle } from "./prompts.js";
import { callModelWith, REPORT_MODEL_TEMPERATURE } from "./reportBody.js";
import type {
  ActivitySignal,
  ContextActivity,
  ReportContext,
} from "./types.js";

type Body = {
  contents?: Array<{ role?: string; parts: Array<{ text?: string }> }>;
  systemInstruction?: { parts: Array<{ text: string }> };
  generationConfig?: Record<string, unknown>;
};

function activity(id: string): ContextActivity {
  return {
    id,
    sourceProgram: "manual",
    gradeLabel: "고1",
    semester: 1,
    subjectGroup: "과학",
    subject: "물리",
    topic: "열 전달",
    text: `${id} 본문`,
    group: "curricular",
  } as ContextActivity;
}

const activities = Array.from({ length: 20 }, (_, i) =>
  activity(`act-${String(i + 1).padStart(3, "0")}`),
);
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
const signals: ActivitySignal[] = activities.map((a, i) => ({
  activityId: a.id,
  axes: [i % 2 === 0 ? "A" : "B"],
  linkage: [],
  keywords: ["열"],
  method: "실험",
  summary: "요약",
})) as ActivitySignal[];
const narrative = {
  theme: "열 흐름",
  subthemes: [{ grade: "고1" as const, stage: "seed" as const, text: "기초" }],
};
const match = { aligned: [], conflicting: [] };
const axes = computeStep6(context, signals);
const { consistency } = computeStep5(context, signals);

/** 1단계 batch, 4단계 section 2개, 6단계 section, 7단계 planDraft. */
const bundles: PromptBundle[] = [
  buildStepPrompt(1, {
    context,
    prior: {},
    batch: activities.slice(15),
    batchIndex: 1,
  }),
  buildStepPrompt(4, {
    context,
    prior: { signals, narrative },
    call: { kind: "section", id: "1-2" },
  }),
  buildStepPrompt(4, {
    context,
    prior: { signals, narrative },
    call: { kind: "section", id: "1-6" },
  }),
  buildStepPrompt(6, {
    context,
    prior: { signals, narrative, match, axes },
    call: { kind: "section", id: "2-1" },
  }),
  buildStepPrompt(7, {
    context,
    prior: { signals, narrative, match, consistency, axes },
    call: { kind: "planDraft" },
  }),
];
const keys = [
  "batch:1",
  "section:1-2",
  "section:1-6",
  "section:2-1",
  "planDraft",
];

/** bundle 마다 다른 응답 값. 종료 사유와 토큰이 그 호출 행에 남는지 보려고 다르게 준다. */
const replies = bundles.map((_, i) => ({
  finishReason: i === 2 ? "MAX_TOKENS" : "STOP",
  usage: {
    promptTokenCount: 1000 + i,
    candidatesTokenCount: 200 + i * 10,
    totalTokenCount: 1200 + i * 11,
  },
}));

const fetchMock = vi.fn();
const bodies: Body[] = [];

beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  bodies.length = 0;
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as Body;
    bodies.push(body);
    const user = body.contents?.[0]?.parts[0]?.text;
    const index = bundles.findIndex((b) => b.user === user);
    const reply = replies[index];
    if (!reply) throw new Error("모르는 요청");
    // 앞 요청을 늦게 끝내 완료 순서를 섞는다.
    await new Promise((resolve) => setTimeout(resolve, (5 - index) * 3));
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: { parts: [{ text: "{}" }], role: "model" },
            finishReason: reply.finishReason,
          },
        ],
        usageMetadata: reply.usage,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("성장설계 bundle 의 AI SDK 경로", () => {
  it("동시에 보낸 bundle 마다 온도, 출력 한도, 스키마, 지시문, 본문이 그대로 나가고 행에 그 응답 값이 남는다", async () => {
    const trace = createAiTrace({
      service: "growth",
      feature: "report_step",
    });
    const callModel = callModelWith(callStructured, trace);
    const results = await Promise.all(
      bundles.map((b) => callModel(b, new AbortController().signal)),
    );
    expect(results.map((r) => r.finishReason)).toEqual(
      replies.map((r) => r.finishReason),
    );
    expect(bodies).toHaveLength(bundles.length);

    const sentSchemas: string[] = [];
    for (const bundle of bundles) {
      const body = bodies.find(
        (b) => b.contents?.[0]?.parts[0]?.text === bundle.user,
      );
      if (!body) throw new Error("bundle 바디 없음");
      const config = body.generationConfig ?? {};
      expect(config.temperature).toBe(REPORT_MODEL_TEMPERATURE);
      expect(config.temperature).toBe(0.2);
      expect(config.maxOutputTokens).toBe(bundle.maxOutputTokens);
      expect(config.responseMimeType).toBe("application/json");
      const schema = config.responseJsonSchema ?? config.responseSchema;
      expect(schema).toEqual(
        geminiSchemaToJsonSchema(
          bundle.responseSchema as Record<string, unknown>,
        ),
      );
      sentSchemas.push(JSON.stringify(schema));
      expect(body.systemInstruction?.parts.map((p) => p.text).join("")).toBe(
        bundle.system,
      );
      expect(body.contents?.[0]?.parts.map((p) => p.text).join("")).toBe(
        bundle.user,
      );
    }
    // 섹션 스키마는 형식(prose, table, list)별로 갈린다. 4단계 1-2(prose)와 1-6(table)은
    // 서로 다른 스키마가 나가고, 형식이 같은 1-6 과 2-1 만 같다.
    expect(sentSchemas[1]).not.toBe(sentSchemas[2]);
    expect(sentSchemas[2]).toBe(sentSchemas[3]);
    expect(new Set(sentSchemas).size).toBe(4);

    const rows = keys.map((key) => {
      const found = trace.calls.filter((r) => r.call_key === key);
      expect(found, key).toHaveLength(1);
      return found[0];
    });
    rows.forEach((row, i) => {
      const reply = replies[i];
      expect(row).toMatchObject({
        step: String(bundles[i]?.callInfo.step),
        attempt: 1,
        status: "ok",
        finish_reason: reply?.finishReason,
        prompt_tokens: reply?.usage.promptTokenCount,
        output_tokens: reply?.usage.candidatesTokenCount,
        total_tokens: reply?.usage.totalTokenCount,
      });
    });
  });
});
