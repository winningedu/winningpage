// 평가 흐름 순수 함수 테스트(부록 B 3번, 개발계획 §2 18~20).
import { describe, expect, it } from "vitest";
import { CHECKLIST, RUBRIC, SECTION_IDS } from "./constants.js";
import {
  buildAppFacts,
  buildEvaluationRow,
  buildPromptInput,
  EVALUATION_PROMPT_VERSION,
  parseEvaluateBody,
  precheckEvaluation,
  retryNotesFor,
  validateEvaluation,
} from "./evaluateFlow.js";
import type { SectionId, SubmissionSections } from "./types.js";
import { TRUNCATED_RETRY_NOTE } from "./validation.js";

function sectionsOf(text: string): SubmissionSections {
  const out = {} as SubmissionSections;
  for (const id of SECTION_IDS) out[id] = text;
  return out;
}

const longText = "가".repeat(60);
const openSession = {
  selectedTopicId: "t1",
  designReportId: "d1",
  latestEvaluationId: null,
  status: "in_progress" as const,
  evaluationCount: 0,
};

describe("precheckEvaluation", () => {
  it("설계 리포트가 없으면 409 STEP_ORDER", () => {
    const r = precheckEvaluation({
      session: { ...openSession, designReportId: null },
      draftSections: sectionsOf(longText),
    });
    expect(r).toMatchObject({ ok: false, status: 409, code: "STEP_ORDER" });
  });

  it("닫힌 세션이면 409 SESSION_NOT_OPEN", () => {
    const r = precheckEvaluation({
      session: { ...openSession, status: "completed" },
      draftSections: sectionsOf(longText),
    });
    expect(r).toMatchObject({
      ok: false,
      status: 409,
      code: "SESSION_NOT_OPEN",
    });
  });

  it("작성본 초안이 없으면 409 NO_SUBMISSION", () => {
    const r = precheckEvaluation({ session: openSession, draftSections: null });
    expect(r).toMatchObject({ ok: false, status: 409, code: "NO_SUBMISSION" });
  });

  it("빈 절이 있으면 422 SECTION_EMPTY 와 절 목록", () => {
    const sections = { ...sectionsOf(longText), IV: "  " };
    const r = precheckEvaluation({
      session: openSession,
      draftSections: sections,
    });
    expect(r).toMatchObject({
      ok: false,
      status: 422,
      code: "SECTION_EMPTY",
      extra: { sections: ["IV"] },
    });
  });

  it("합계 300자 미만이면 422 SUBMISSION_TOO_SHORT 와 합계", () => {
    const r = precheckEvaluation({
      session: openSession,
      draftSections: sectionsOf("가나다"),
    });
    expect(r).toMatchObject({
      ok: false,
      status: 422,
      code: "SUBMISSION_TOO_SHORT",
      extra: { total: 21, minimum: 300 },
    });
  });

  it("평가 성공이 상한에 닿았으면 409 REEVALUATION_LIMIT", () => {
    const r = precheckEvaluation({
      session: { ...openSession, evaluationCount: 4 },
      draftSections: sectionsOf(longText),
    });
    expect(r).toMatchObject({
      ok: false,
      status: 409,
      code: "REEVALUATION_LIMIT",
    });
  });

  it("통과하면 글자 수와 자리표시자를 돌려준다", () => {
    const sections = { ...sectionsOf(longText), I: `${longText}[여기 채우기]` };
    const r = precheckEvaluation({
      session: openSession,
      draftSections: sections,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.check.placeholders).toEqual({ I: 1 });
    expect(r.check.strippedCounts.I).toBe(60);
    expect(r.check.counts.I).toBe(68);
    const id: SectionId = "II";
    expect(r.check.counts[id]).toBe(60);
  });
});

const topic = {
  title: "주제",
  question: "질문?",
  hypothesis1: "가설 1",
  hypothesis2: "가설 2",
};
const design = {
  sections: SECTION_IDS.map((id) => ({
    id,
    role: "r",
    must: [`${id} 필수`],
    avoid: [],
    tip: "t",
  })),
};

describe("buildPromptInput", () => {
  const sections = { ...sectionsOf(longText), I: `${longText}[채울 것]` };
  const pre = precheckEvaluation({
    session: openSession,
    draftSections: sections,
  });
  if (!pre.ok) throw new Error("precheck");
  const base = buildPromptInput({
    grade: "고2",
    subject: "물리",
    topic,
    design,
    sections,
    check: pre.check,
    linkageType: "direct",
  });

  it("모델에는 자리표시자를 지운 본문과 센 사실을 넘긴다", () => {
    expect(base.submission.I).toBe(longText);
    expect(base.counts.I).toBe(66);
    expect(base.placeholders).toEqual({ I: 1 });
  });

  it("설계의 must 와 체크리스트 id 13개를 넘긴다", () => {
    expect(base.design.sections[0]).toEqual({ id: "I", must: ["I 필수"] });
    expect(base.design.checklistIds).toEqual(CHECKLIST.map((c) => c.id));
  });

  it("연계 유형이 예비 주제일 때만 isProvisional", () => {
    expect(base.isProvisional).toBe(false);
    const prov = buildPromptInput({
      grade: "고2",
      subject: "물리",
      topic,
      design,
      sections,
      check: pre.check,
      linkageType: "interest_based_provisional",
    });
    expect(prov.isProvisional).toBe(true);
  });
});

describe("retryNotesFor", () => {
  it("잘렸으면 분량 축소 문구 하나", () => {
    expect(retryNotesFor([{ code: "x", message: "m" }], true)).toEqual([
      TRUNCATED_RETRY_NOTE,
    ]);
  });
  it("아니면 문제 목록", () => {
    const notes = retryNotesFor([{ code: "x", message: "문제다." }], false);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain("문제다.");
  });
});

describe("buildAppFacts", () => {
  const pre = (sections: SubmissionSections) => {
    const r = precheckEvaluation({
      session: openSession,
      draftSections: sections,
    });
    if (!r.ok) throw new Error("precheck");
    return r.check;
  };

  it("Ⅱ절 원문과 설계 출처표 행 수, 예비 여부를 담는다", () => {
    const sections = { ...sectionsOf(longText), II: `${longText} 질문입니다?` };
    const facts = buildAppFacts({
      sections,
      check: pre(sections),
      designSourceTableRows: 3,
      isProvisional: true,
    });
    expect(facts.questionText).toBe(sections.II);
    expect(facts.designSourceTableRows).toBe(3);
    expect(facts.isProvisional).toBe(true);
    expect(facts.introMinChars).toBe(300);
  });

  it("Ⅳ 또는 Ⅴ절에 아라비아 숫자가 있으면 hasNumbersInResults", () => {
    const none = sectionsOf(longText);
    expect(
      buildAppFacts({
        sections: none,
        check: pre(none),
        designSourceTableRows: 1,
        isProvisional: false,
      }).hasNumbersInResults,
    ).toBe(false);
    const withNum = { ...none, V: `${longText} 12.5%` };
    expect(
      buildAppFacts({
        sections: withNum,
        check: pre(withNum),
        designSourceTableRows: 1,
        isProvisional: false,
      }).hasNumbersInResults,
    ).toBe(true);
  });

  it("자리표시자 안의 숫자는 결과 숫자로 세지 않는다", () => {
    const sections = {
      ...sectionsOf(longText),
      IV: `${longText}[수치 1 입력]`,
    };
    expect(
      buildAppFacts({
        sections,
        check: pre(sections),
        designSourceTableRows: 1,
        isProvisional: false,
      }).hasNumbersInResults,
    ).toBe(false);
  });

  it("Ⅷ절의 비어 있지 않은 줄 수를 센다", () => {
    const sections = { ...sectionsOf(longText), VIII: "자료 1\n\n  \n자료 2" };
    expect(
      buildAppFacts({
        sections,
        check: pre(sections),
        designSourceTableRows: 1,
        isProvisional: false,
      }).sourceLineCount,
    ).toBe(2);
  });

  it("글자 수는 자리표시자를 뺀 값을 쓴다", () => {
    const sections = { ...sectionsOf(longText), I: `${longText}[채울 것]` };
    const facts = buildAppFacts({
      sections,
      check: pre(sections),
      designSourceTableRows: 1,
      isProvisional: false,
    });
    expect(facts.counts.I).toBe(60);
    expect(facts.placeholders).toEqual({ I: 1 });
  });
});

function modelResponse(over: Record<string, unknown> = {}) {
  return {
    items: RUBRIC.map((item) => ({
      id: item.id,
      requirements: item.requirements.map((r) => ({
        id: r.id,
        met: true,
        note: "근거",
      })),
      evidence: "학생 글에서 확인한 근거",
    })),
    coreErrors: [],
    fixes: [],
    sources: [{ text: "기상청 자료", hasUrlOrCitation: false }],
    checklist: CHECKLIST.map((c) => ({ id: c.id, met: true })),
    ...over,
  };
}

describe("validateEvaluation", () => {
  it("정상 응답은 모델 평가로 돌려준다", () => {
    const r = validateEvaluation(modelResponse());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.items).toHaveLength(6);
  });

  it("형태 검증에 걸리면 이슈로 돌려준다", () => {
    const r = validateEvaluation(modelResponse({ items: [] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.length).toBeGreaterThan(0);
  });

  it("객체가 아니면 이슈로 돌려준다", () => {
    const r = validateEvaluation("텍스트");
    expect(r.ok).toBe(false);
  });
});

describe("validateEvaluation 핵심 오류 가드", () => {
  const denial =
    "탁도가 높은 지점이 용존산소량도 낮았지만 이것은 상관이지 인과를 보인 것은 아니다.";
  const core = (id: string, quote?: string) => ({
    id,
    location: "VI",
    detail: "판정 이유",
    quote,
  });

  it("인과 부정 인용의 correlation_as_cause 는 빠지고 overclaim 은 남는다", () => {
    const r = validateEvaluation(
      modelResponse({
        coreErrors: [
          core("correlation_as_cause", denial),
          core("overclaim", "반드시 그렇다."),
        ],
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(r.value.coreErrors.map((e) => e.id)).toEqual(["overclaim"]);
  });

  it("인과를 단정한 인용의 correlation_as_cause 는 남는다", () => {
    const r = validateEvaluation(
      modelResponse({
        coreErrors: [
          core("correlation_as_cause", "탁도가 높아서 용존산소량이 낮아졌다"),
        ],
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.coreErrors.map((e) => e.id)).toEqual([
        "correlation_as_cause",
      ]);
    }
  });

  it("quote 없는 핵심 오류 응답은 이슈로 거절한다", () => {
    const r = validateEvaluation(
      modelResponse({ coreErrors: [core("overclaim")] }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues.map((i) => i.code)).toContain("core_error_quote_missing");
    }
  });

  it("프롬프트 버전은 v2 다", () => {
    expect(EVALUATION_PROMPT_VERSION).toBe("inquiry-evaluation-v2");
  });
});

describe("buildEvaluationRow", () => {
  const sections = sectionsOf(longText);
  const pre = precheckEvaluation({
    session: openSession,
    draftSections: sections,
  });
  if (!pre.ok) throw new Error("precheck");
  const facts = buildAppFacts({
    sections,
    check: pre.check,
    designSourceTableRows: 2,
    isProvisional: false,
  });
  const parsed = validateEvaluation(modelResponse());
  if (!parsed.ok) throw new Error("validate");

  it("평가 리포트 행에 총점과 라벨을 컬럼에도 싣는다", () => {
    const row = buildEvaluationRow({
      sessionId: "s1",
      userId: "u1",
      submissionId: "sub1",
      topicId: "t1",
      model: "m",
      promptVersion: "v1",
      evaluation: parsed.value,
      facts,
    });
    expect(row).toMatchObject({
      session_id: "s1",
      profile_id: "u1",
      report_type: "evaluation",
      submission_id: "sub1",
      topic_id: "t1",
      model: "m",
      prompt_version: "v1",
    });
    expect(row.score).toBe(row.sections.total);
    expect(row.label).toBe(row.sections.label);
    expect(row.sections.items).toHaveLength(6);
  });
});

describe("parseEvaluateBody", () => {
  it("sessionId 가 uuid 면 통과", () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    expect(parseEvaluateBody({ sessionId: id })).toEqual({
      ok: true,
      sessionId: id,
    });
  });
  it("아니면 이유를 돌려준다", () => {
    expect(parseEvaluateBody({ sessionId: "x" }).ok).toBe(false);
    expect(parseEvaluateBody(null).ok).toBe(false);
    expect(parseEvaluateBody({}).ok).toBe(false);
  });
});
