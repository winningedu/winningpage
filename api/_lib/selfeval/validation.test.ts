import { describe, expect, it } from "vitest";
import { SCORE_RUBRIC } from "./dictionaries.js";
import {
  type ActivityRecordLike,
  ANALYSIS_FIELDS,
  type GenerationSections,
} from "./types.js";
import {
  canRetry,
  findForbidden,
  isSoftOnly,
  parseModelJson,
  validateAnalyzeResponse,
  validateVerifyResponse,
  validateWriteResponse,
  type WriteValidationContext,
} from "./validation.js";

describe("parseModelJson", () => {
  it("정상 JSON 을 파싱한다", () => {
    expect(parseModelJson('{"a":1}', "STOP")).toEqual({
      ok: true,
      value: { a: 1 },
    });
  });

  it("코드 펜스를 벗기고 파싱한다", () => {
    const r = parseModelJson('```json\n{"a":1}\n```', "STOP");
    expect(r).toEqual({ ok: true, value: { a: 1 } });
  });

  it("MAX_TOKENS 면 내용과 무관하게 truncated 다", () => {
    const r = parseModelJson('{"a":1}', "MAX_TOKENS");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issue.code).toBe("truncated");
  });

  it("깨진 JSON 은 invalid_json 이다", () => {
    const r = parseModelJson('{"a":', "STOP");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issue.code).toBe("invalid_json");
  });
});

describe("findForbidden / canRetry / isSoftOnly", () => {
  it("공백이 섞여도 금지 표현을 찾는다", () => {
    expect(findForbidden("합격 가능성이 높다")).toContain("합격 가능성");
    expect(findForbidden("합 격 률")).toContain("합격률");
    expect(findForbidden("깨끗한 글")).toEqual([]);
  });

  it("이슈가 있어야 재요청하고 soft 만 있으면 isSoftOnly 다", () => {
    expect(canRetry([])).toBe(false);
    expect(canRetry([{ code: "paragraph_count", message: "x" }])).toBe(true);
    expect(isSoftOnly([{ code: "length_off_target", message: "x" }])).toBe(
      true,
    );
    expect(
      isSoftOnly([
        { code: "length_off_target", message: "x" },
        { code: "markdown", message: "y" },
      ]),
    ).toBe(false);
    expect(isSoftOnly([])).toBe(false);
  });
});

const record: ActivityRecordLike = {
  id: "a1",
  sourceProgram: "performance",
  status: "confirmed",
  gradeLabel: "고1",
  semester: 1,
  subjectGroup: null,
  subject: "수학",
  topic: "이차함수 그래프의 꼭짓점 변화 탐구",
  concept: "이차함수 판별식",
  method: "그래프 프로그램으로 계수를 바꿔 관찰",
  result: "계수가 커질수록 폭이 좁아짐",
  limitation: "정수 계수만 확인",
  numbers: ["계수 5개"],
  sources: ["교과서"],
  createdAt: "2026-01-01",
};

function allValues(over: Record<string, string> = {}) {
  const values: Record<string, string> = {};
  for (const f of ANALYSIS_FIELDS) values[f] = "";
  return { values: { ...values, ...over } };
}

describe("validateAnalyzeResponse", () => {
  it("모두 빈 문자열이어도 형식이 맞으면 통과한다", () => {
    const r = validateAnalyzeResponse(allValues(), { record });
    expect(r.ok).toBe(true);
  });

  it("기록에 근거가 있는 값은 통과한다", () => {
    const r = validateAnalyzeResponse(
      allValues({ concept: "이차함수 판별식을 사용" }),
      { record },
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.values.concept).toBe("이차함수 판별식을 사용");
  });

  it("기록에 없는 낱말뿐이면 unsupported_value 이고 path 가 항목이다", () => {
    const r = validateAnalyzeResponse(
      allValues({ motive: "친구와 대화하다 호기심이 생김" }),
      { record },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues[0]).toMatchObject({
        code: "unsupported_value",
        path: "motive",
      });
    }
  });

  it("11키 중 누락이나 비문자열은 invalid_payload 다", () => {
    const v = allValues();
    delete (v.values as Record<string, string>).next;
    const r = validateAnalyzeResponse(v, { record });
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.issues[0]).toMatchObject({
        code: "missing_field",
        path: "next",
      });
    expect(validateAnalyzeResponse("x", { record }).ok).toBe(false);
  });

  it("마크다운과 금지 표현을 막는다", () => {
    const r = validateAnalyzeResponse(
      allValues({
        result: "- 계수가 커질수록 폭이 좁아짐",
        limitation: "정수 계수만 확인 합격 가능성",
      }),
      { record },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const codes = r.issues.map((i) => i.code);
      expect(codes).toContain("markdown");
      expect(codes).toContain("forbidden_phrase");
    }
  });
});

// 문장 하나를 만드는 도우미. evidence 기본값은 핵심 활동의 method.
const sent = (
  text: string,
  evidence: unknown = { activityId: "core1", field: "method" },
  feeling = false,
) => ({ text, evidence, feeling });

function para(
  b: { paragraphs: { role: string; sentences: unknown[] }[] },
  i: number,
) {
  const p = b.paragraphs[i];
  if (!p) throw new Error(`문단 ${i} 없음`);
  return p;
}

function sentenceAt(sections: GenerationSections, p: number, s: number) {
  const found = sections.paragraphs[p]?.sentences[s];
  if (!found) throw new Error(`문장 ${p}-${s} 없음`);
  return found;
}

const wctx: WriteValidationContext = {
  coreActivityId: "core1",
  supportActivityIds: ["sup1"],
  allowedFields: ["motive", "method", "result", "limitation"],
  targetChars: null,
  mode: "without_space",
  universities: ["한국대학교"],
  shortMode: false,
  expectedParagraphs: 3,
};

function body3(over: Record<string, unknown>[] = []) {
  return {
    paragraphs: [
      {
        role: "process",
        sentences: [
          sent("그래프 프로그램으로 계수를 바꿔 관찰했다."),
          sent("관찰 결과를 표로 정리했다."),
        ],
      },
      {
        role: "judgment",
        sentences: [
          sent("계수가 커질수록 폭이 좁아진다고 판단했다.", {
            activityId: "core1",
            field: "result",
          }),
          sent("정수 계수만 확인한 점이 한계였다.", {
            activityId: "core1",
            field: "limitation",
          }),
        ],
      },
      {
        role: "wrap",
        sentences: [
          sent("다음에는 소수 계수를 확인하고 싶다.", null, true),
          sent("이 과정에서 방법을 고쳤다."),
        ],
      },
    ],
    ...over[0],
  };
}

describe("validateWriteResponse", () => {
  it("정상 응답은 문장 id 를 매기고 charCount 를 돌려준다", () => {
    const r = validateWriteResponse(body3(), wctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sections.paragraphs.map((p) => p.role)).toEqual([
      "process",
      "judgment",
      "wrap",
    ]);
    expect(sentenceAt(r.sections, 0, 0).id).toBe("p1-s1");
    expect(sentenceAt(r.sections, 2, 1).id).toBe("p3-s2");
    expect(sentenceAt(r.sections, 0, 0).confirmed).toBe(false);
    expect(r.charCount.withoutSpace).toBeGreaterThan(30);
    expect(r.softIssues).toEqual([]);
  });

  it("문단 수가 다르면 paragraph_count 다", () => {
    const b = body3();
    b.paragraphs.pop();
    const r = validateWriteResponse(b, wctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.map((i) => i.code)).toContain("paragraph_count");
  });

  it("4문단 기대에서 link 로 시작하지 않으면 paragraph_role 이다", () => {
    const r = validateWriteResponse(body3(), {
      ...wctx,
      expectedParagraphs: 4,
    });
    expect(r.ok).toBe(false);
  });

  it("role 순서가 틀리면 paragraph_role 이다", () => {
    const b = body3();
    para(b, 0).role = "wrap";
    para(b, 2).role = "process";
    const r = validateWriteResponse(b, wctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.map((i) => i.code)).toContain("paragraph_role");
  });

  it("빈 문장, 모르는 활동, 비운 항목, 잘못된 모양 evidence 를 막는다", () => {
    const b = body3();
    para(b, 0).sentences[0] = sent("  ");
    para(b, 0).sentences[1] = sent("가나다 라마바.", {
      activityId: "zzz",
      field: "method",
    });
    para(b, 1).sentences[0] = sent("가나다 라마바.", {
      activityId: "core1",
      field: "role",
    });
    para(b, 1).sentences[1] = sent("가나다 라마바.", { student: true });
    const r = validateWriteResponse(b, wctx);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const codes = r.issues.map((i) => i.code);
    expect(codes).toContain("empty_sentence");
    expect(codes).toContain("unknown_evidence");
    expect(codes).toContain("empty_field_used");
  });

  it("보조 활동 id 는 허용된다", () => {
    const b = body3();
    para(b, 0).sentences[0] = sent("보조 활동에서 나온 방법을 이었다.", {
      activityId: "sup1",
      field: "method",
    });
    expect(validateWriteResponse(b, wctx).ok).toBe(true);
  });

  it("보조 활동 evidence 는 핵심 활동의 allowedFields 로 막지 않는다", () => {
    const b = body3();
    para(b, 0).sentences[0] = sent("보조 활동의 진로 연결을 이었다.", {
      activityId: "sup1",
      field: "career",
    });
    expect(validateWriteResponse(b, wctx).ok).toBe(true);
  });

  it("보조 활동 evidence 도 field 가 11항목 밖이면 막는다", () => {
    const b = body3();
    para(b, 0).sentences[0] = sent("보조 활동 근거를 썼다.", {
      activityId: "sup1",
      field: "nonsense",
    });
    const r = validateWriteResponse(b, wctx);
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.issues.map((i) => i.code)).toContain("empty_field_used");
  });

  it("대학명, 학교명, 마크다운, 금지 표현을 막는다", () => {
    const b = body3();
    para(b, 0).sentences[0] = sent("한국대 진학을 목표로 했다.");
    para(b, 0).sentences[1] = sent("한빛고등학교 수업에서 시작했다.");
    para(b, 1).sentences[0] = sent("**굵게** 썼다.");
    para(b, 1).sentences[1] = sent("합격 가능성이 보인다.");
    const r = validateWriteResponse(b, wctx);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const codes = r.issues.map((i) => i.code);
    for (const c of [
      "university_name",
      "school_name",
      "markdown",
      "forbidden_phrase",
    ])
      expect(codes).toContain(c);
  });

  it("shortMode 에서 문단당 문장 3개 이상이면 short_mode_overflow 다", () => {
    const b = body3();
    para(b, 0).sentences.push(sent("하나 더 썼다."));
    const r = validateWriteResponse(b, { ...wctx, shortMode: true });
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.issues.map((i) => i.code)).toContain("short_mode_overflow");
  });

  it("evidence 가 없고 feeling 도 false 면 feeling true 로 올린다", () => {
    const b = body3();
    para(b, 0).sentences[0] = sent("그냥 쓴 문장이다.", null, false);
    const r = validateWriteResponse(b, wctx);
    expect(r.ok).toBe(true);
    if (r.ok) expect(sentenceAt(r.sections, 0, 0).feeling).toBe(true);
  });

  it("느낌 표현 패턴이 걸리면 evidence 가 있어도 feeling true 다", () => {
    const b = body3();
    para(b, 0).sentences[0] = sent("계수를 바꾸며 뿌듯했다.");
    const r = validateWriteResponse(b, wctx);
    expect(r.ok).toBe(true);
    if (r.ok) expect(sentenceAt(r.sections, 0, 0).feeling).toBe(true);
  });

  it("명사형 종결은 고쳐 저장한다", () => {
    const b = body3();
    para(b, 0).sentences[0] = sent("계수 변화를 확인함.");
    const r = validateWriteResponse(b, wctx);
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(sentenceAt(r.sections, 0, 0).text).toBe("계수 변화를 확인한 점.");
  });

  it("글자 수가 목표 ±5% 밖이면 hard 가 아닌 softIssues 로 length_off_target 을 낸다", () => {
    const r = validateWriteResponse(body3(), { ...wctx, targetChars: 500 });
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(r.softIssues.map((i) => i.code)).toEqual(["length_off_target"]);
  });

  it("목표가 현재 길이 ±5% 안이면 softIssues 가 비어 있다", () => {
    const first = validateWriteResponse(body3(), wctx);
    if (!first.ok) throw new Error("setup");
    const n = first.charCount.withoutSpace;
    const r = validateWriteResponse(body3(), { ...wctx, targetChars: n });
    expect(r.ok && r.softIssues).toEqual([]);
  });

  it("paragraphs 가 배열이 아니면 invalid_payload 다", () => {
    const r = validateWriteResponse({ paragraphs: "x" }, wctx);
    expect(r.ok).toBe(false);
  });
});

function item(
  b: { items: { checks: { text: string; pass: boolean }[] }[] },
  i: number,
) {
  const found = b.items[i];
  if (!found) throw new Error(`항목 ${i} 없음`);
  return found;
}

function verifyBody(growth = false) {
  return {
    items: SCORE_RUBRIC.map((r) => ({
      key: r.key,
      checks: r.checks.map((t) => ({ text: t, pass: true })),
    })),
    stageChecks: growth
      ? [
          { text: "a", pass: true },
          { text: "b", pass: false },
        ]
      : [],
  };
}

describe("validateVerifyResponse", () => {
  it("정상 응답은 키별 checks 를 돌려준다", () => {
    const r = validateVerifyResponse(verifyBody(), { expectGrowth: false });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(Object.keys(r.checks).sort()).toEqual(
        SCORE_RUBRIC.map((x) => x.key).sort(),
      );
      expect(r.stageChecks).toEqual([]);
    }
  });

  it("모델이 바꿔 쓴 text 는 루브릭 문장으로 덮어쓴다", () => {
    const b = verifyBody();
    item(b, 0).checks.splice(0, 1, { text: "마음대로 바꾼 문장", pass: true });
    const r = validateVerifyResponse(b, { expectGrowth: false });
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(r.checks.judgment[0]?.text).toBe(SCORE_RUBRIC[0]?.checks[0]);
  });

  it("확인 문장 수가 다르면 check_count 다", () => {
    const b = verifyBody();
    item(b, 1).checks.pop();
    const r = validateVerifyResponse(b, { expectGrowth: false });
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.issues[0]).toMatchObject({
        code: "check_count",
        path: "limitation",
      });
  });

  it("항목 누락과 pass 가 boolean 아님을 막는다", () => {
    const b = verifyBody();
    b.items.pop();
    expect(validateVerifyResponse(b, { expectGrowth: false }).ok).toBe(false);
    const c = verifyBody();
    item(c, 0).checks.splice(0, 1, {
      text: "x",
      pass: "yes" as unknown as boolean,
    });
    expect(validateVerifyResponse(c, { expectGrowth: false }).ok).toBe(false);
  });

  it("expectGrowth 면 stageChecks 2개가 필요하다", () => {
    expect(
      validateVerifyResponse(verifyBody(false), { expectGrowth: true }).ok,
    ).toBe(false);
    const r = validateVerifyResponse(verifyBody(true), { expectGrowth: true });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.stageChecks).toHaveLength(2);
  });

  it("expectGrowth 가 아니면 stageChecks 는 무시한다", () => {
    const r = validateVerifyResponse(verifyBody(true), { expectGrowth: false });
    expect(r.ok && r.stageChecks).toEqual([]);
  });
});
