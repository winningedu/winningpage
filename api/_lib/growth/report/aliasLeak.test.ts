// 모델이 학생에게 보이는 본문에 활동 별칭을 적은 응답을 정리하는 흐름을 확인한다.
// 실모델 실측(활동 43건)에서 나온 문장을 그대로 픽스처로 쓴다.

import { describe, expect, it } from "vitest";
import {
  buildStepPrompt,
  parseStepResponse,
  stepSectionIds,
  validateStepOutput,
} from "./prompts.js";
import type { ContextActivity, ReportContext } from "./types.js";

const uuidOf = (i: number): string => {
  const h = (i + 1).toString(16).padStart(8, "0");
  return `${h}-1111-4111-8111-${h.padStart(12, "0")}`;
};

function makeContext(n = 43): ReportContext {
  const activities: ContextActivity[] = Array.from({ length: n }, (_, i) => ({
    id: uuidOf(i),
    sourceProgram: "manual",
    gradeLabel: "고1",
    semester: 1,
    subjectGroup: "과학",
    subject: "물리",
    topic: `주제 ${i + 1}`,
    text: `활동 ${i + 1} 본문`,
    group: "curricular",
  }));
  return {
    reportId: "r1",
    profileId: "p1",
    track: "고2",
    currentGrade: "고2",
    range: { semesters: ["고1-1"], description: "범위" },
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
    nowIso: "2026-10-07T00:00:00.000Z",
  };
}

/** 섹션 본문 rows 의 첫 행. */
function firstRow(section: { body: unknown } | undefined) {
  const body = section?.body as
    | { rows?: Record<string, unknown>[] }
    | undefined;
  return body?.rows?.[0];
}

const alias = (...n: number[]) => n.map((x) => `a${x}`);

function noData(ids: string[]) {
  return ids.map((id) => ({ id, status: "no_data", evidence_ids: [] }));
}

describe("본문에 적힌 별칭 정리", () => {
  it("1-6 행 value 끝 괄호 목록은 지워지고 행 근거 앞 3개와 섹션 근거가 된다", () => {
    const ctx = makeContext();
    const ids = stepSectionIds(4, ctx);
    const list = alias(7, 16, 18, 20, 31, 32, 33, 35, 37);
    const raw = JSON.stringify({
      match: { aligned: [], conflicting: [] },
      sections: [
        ...noData(ids.filter((i) => i !== "1-6")),
        {
          id: "1-6",
          status: "ok",
          evidence_ids: [],
          body: {
            rows: [
              {
                label: "분석 성향",
                value: `자료를 모아 심층적인 분석을 시도한다. (${list.join(", ")})`,
                evidence_ids: [],
              },
            ],
          },
        },
      ],
    });
    const r = parseStepResponse(4, raw, ctx);
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    const s = r.output.sections?.find((x) => x.id === "1-6");
    const row = firstRow(s);
    expect(row?.value).toBe("자료를 모아 심층적인 분석을 시도한다.");
    expect(row?.evidence_ids).toEqual([uuidOf(6), uuidOf(15), uuidOf(17)]);
    expect(s?.evidence_ids).toEqual([uuidOf(6), uuidOf(15), uuidOf(17)]);
    expect(validateStepOutput(4, r.output, ctx).ok).toBe(true);
  });

  it("2-1 근거 활동 행의 인라인 별칭은 지워지고 행 근거가 된다", () => {
    const ctx = makeContext();
    const ids = stepSectionIds(6, ctx);
    const raw = JSON.stringify({
      sections: [
        ...noData(ids.filter((i) => i !== "2-1")),
        {
          id: "2-1",
          status: "ok",
          evidence_ids: [],
          body: {
            rows: [
              {
                label: "근거 활동",
                value:
                  "버스 배차 간격과 정류장 대기인원의 관계 분석(a4), 온습도지수의 산책 적합성 판단 기준 재검토(a7)",
                evidence_ids: [],
              },
            ],
          },
        },
      ],
    });
    const r = parseStepResponse(6, raw, ctx);
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    const s = r.output.sections?.find((x) => x.id === "2-1");
    const row = firstRow(s);
    expect(row?.value).toBe(
      "버스 배차 간격과 정류장 대기인원의 관계 분석, 온습도지수의 산책 적합성 판단 기준 재검토",
    );
    expect(row?.evidence_ids).toEqual([uuidOf(3), uuidOf(6)]);
    expect(validateStepOutput(6, r.output, ctx).ok).toBe(true);
  });

  it("2-6 행 value 끝에 별칭 25개만 적고 행 근거가 비어도 missing_evidence 가 나지 않는다", () => {
    const ctx = makeContext();
    const ids = stepSectionIds(6, ctx);
    const list = alias(
      4,
      8,
      10,
      11,
      12,
      13,
      14,
      15,
      16,
      17,
      18,
      19,
      20,
      21,
      22,
      23,
      24,
      25,
      26,
      27,
      28,
      29,
      30,
      31,
      32,
    );
    expect(list).toHaveLength(25);
    const raw = JSON.stringify({
      sections: [
        ...noData(ids.filter((i) => i !== "2-6")),
        {
          id: "2-6",
          status: "ok",
          evidence_ids: [],
          body: {
            rows: [
              {
                label: "범위",
                value: `여러 과목에 걸쳐 같은 문제의식이 이어진다. (${list.join(", ")})`,
                evidence_ids: [],
              },
            ],
          },
        },
      ],
    });
    const r = parseStepResponse(6, raw, ctx);
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    const s = r.output.sections?.find((x) => x.id === "2-6");
    const row = firstRow(s);
    expect(row?.value).toBe("여러 과목에 걸쳐 같은 문제의식이 이어진다.");
    expect(row?.evidence_ids).toEqual([uuidOf(3), uuidOf(7), uuidOf(9)]);
    expect(s?.evidence_ids).toEqual([uuidOf(3), uuidOf(7), uuidOf(9)]);
    expect(validateStepOutput(6, r.output, ctx).ok).toBe(true);
  });

  it("4단계 match 항목 text 의 별칭은 그 항목 evidenceIds 가 된다", () => {
    const ctx = makeContext();
    const raw = JSON.stringify({
      match: {
        aligned: [{ text: "진로와 맞는 탐구(a2)", evidenceIds: [] }],
        conflicting: [],
      },
      sections: noData(stepSectionIds(4, ctx)),
    });
    const r = parseStepResponse(4, raw, ctx);
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    expect(r.output.match?.aligned).toEqual([
      { text: "진로와 맞는 탐구", evidenceIds: [uuidOf(1)] },
    ]);
  });

  it("별칭 표에 없는 a99 와 일반 영단어는 본문에 그대로 남는다", () => {
    const ctx = makeContext(5);
    const ids = stepSectionIds(5, ctx);
    const raw = JSON.stringify({
      sections: [
        {
          id: ids[0],
          status: "ok",
          evidence_ids: ["a1"],
          body: {
            rows: [
              {
                label: "고1-1",
                value: "a99 모델과 data 분석",
                evidence_ids: [],
              },
            ],
          },
        },
      ],
    });
    const r = parseStepResponse(5, raw, ctx);
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    const row = firstRow(r.output.sections?.[0]);
    expect(row?.value).toBe("a99 모델과 data 분석");
  });
});

describe("프롬프트 규칙", () => {
  const ctx = makeContext(3);
  it("공통 규칙은 본문에 별칭을 쓰지 않고 근거는 evidence_ids 에만 달라고 한다", () => {
    const b = buildStepPrompt(1, { context: ctx, prior: {} });
    expect(b.system).toContain(
      "학생에게 보이는 글에는 활동 별칭이나 id 를 쓰지 않는다",
    );
    expect(b.system).toContain("활동은 주제로 가리키고");
    expect(b.system).toContain("근거는 evidence_ids 와 evidenceIds 에만 단다");
  });
});
