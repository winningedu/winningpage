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

  it("예측 단독은 통과하고 합격 결합형은 걸린다", () => {
    expect(findForbidden("수요 예측 모델 만들기")).toEqual([]);
    for (const t of [
      "합격 예측",
      "합격예측",
      "합격을 예측한다",
      "합격 가능성 예측",
      "합격 가능성을 예측",
    ])
      expect(findForbidden(t).length).toBeGreaterThan(0);
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

// 모델 응답의 근거 후보 하나. 출처 유형은 서버가 붙이므로 모델은 refId, item, weight 만 낸다.
const ev = (refId: string, item: string, weight = "main") => ({
  refId,
  item,
  weight,
});

// 문장 하나를 만드는 도우미. evidence 기본값은 핵심 활동의 method.
const sent = (
  text: string,
  evidence: unknown = [ev("core1", "method")],
): { text: string; evidence: unknown; feeling?: boolean } => ({
  text,
  evidence,
});

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
  sources: {
    records: [
      {
        id: "core1",
        sourceType: "P",
        completed: true,
        itemTexts: {
          motive: "그래프가 궁금했음",
          method: "계수를 바꿔 관찰함",
          result: "계수가 커질수록 폭이 좁아짐",
          limitation: "정수 계수만 확인함",
        },
      },
      {
        id: "sup1",
        sourceType: "D",
        completed: true,
        itemTexts: { method: "표로 정리함", career: "공학 진로와 이어짐" },
      },
      {
        id: "wip1",
        sourceType: "A",
        completed: false,
        itemTexts: { method: "진행 중 방법" },
      },
    ],
    memos: [{ id: "m1", text: "수업 뒤 한계를 적어 둠" }],
  },
  targetChars: null,
  mode: "without_space",
  universities: ["한국대학교"],
};

function body3(over: Record<string, unknown>[] = []) {
  return {
    paragraphs: [
      {
        role: "process",
        sentences: [
          sent("그래프 프로그램으로 계수를 바꿔 관찰함."),
          sent("관찰 결과를 표로 정리함."),
        ],
      },
      {
        role: "judgment",
        sentences: [
          sent("계수가 커질수록 폭이 좁아진다고 판단함.", [
            ev("core1", "result"),
          ]),
          sent("정수 계수만 확인한 점이 한계임.", [ev("core1", "limitation")]),
        ],
      },
      {
        role: "wrap",
        sentences: [
          sent("다음에는 소수 계수를 확인하고 싶음.", []),
          sent("이 과정에서 방법을 고침."),
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
    expect(r.sections.paragraphs).toHaveLength(3);
    expect(sentenceAt(r.sections, 0, 0).id).toBe("p1-s1");
    expect(sentenceAt(r.sections, 2, 1).id).toBe("p3-s2");
    expect(sentenceAt(r.sections, 0, 0).confirmed).toBe(false);
    expect(r.charCount.withoutSpace).toBeGreaterThan(30);
    expect(r.softIssues).toEqual([]);
  });

  it("문단 수는 고정하지 않는다. 1개와 5개도 통과한다(명세 No.44, No.80)", () => {
    const one = body3();
    one.paragraphs.splice(1);
    expect(validateWriteResponse(one, wctx).ok).toBe(true);
    const five = body3();
    five.paragraphs.push(
      { role: "link", sentences: [sent("앞 활동에서 이어 확인함.")] },
      { role: "wrap", sentences: [sent("개념으로 정리함.")] },
    );
    const r = validateWriteResponse(five, wctx);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.sections.paragraphs).toHaveLength(5);
  });

  it("문단이 하나도 없으면 paragraph_count 다", () => {
    const r = validateWriteResponse({ paragraphs: [] }, wctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.map((i) => i.code)).toEqual(["paragraph_count"]);
  });

  it("role 이 없어도 role 순서를 검사하지 않고 저장 문단에 role 을 싣지 않는다", () => {
    const b = {
      paragraphs: body3().paragraphs.map(({ sentences }) => ({ sentences })),
    };
    const r = validateWriteResponse(b, wctx);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.sections.paragraphs.every((p) => !("role" in p))).toBe(true);
    }
    const swapped = body3();
    para(swapped, 0).role = "wrap";
    para(swapped, 2).role = "process";
    expect(validateWriteResponse(swapped, wctx).ok).toBe(true);
  });

  it("다음 단계(next) 항목은 근거로 쓸 수 없고 버려진다(명세 No.37)", () => {
    const b = body3();
    para(b, 0).sentences[0] = sent("다음 단계로 이어 확인함.", [
      ev("core1", "next"),
    ]);
    const r = validateWriteResponse(b, wctx);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(sentenceAt(r.sections, 0, 0).evidence).toEqual([]);
      expect(sentenceAt(r.sections, 0, 0).feeling).toBe(true);
    }
  });

  it("빈 문장은 막고, 선택 밖 기록과 비운 항목 근거는 버리되 실패시키지 않는다", () => {
    const b = body3();
    para(b, 0).sentences[0] = sent("  ");
    para(b, 0).sentences[1] = sent("가나다 라마함.", [ev("zzz", "method")]);
    para(b, 1).sentences[0] = sent("가나다 라마함.", [ev("core1", "role")]);
    const r = validateWriteResponse(b, wctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.map((i) => i.code)).toEqual(["empty_sentence"]);
    para(b, 0).sentences.shift();
    const r2 = validateWriteResponse(b, wctx);
    expect(r2.ok).toBe(true);
    if (r2.ok) {
      expect(sentenceAt(r2.sections, 0, 0).evidence).toEqual([]);
      expect(sentenceAt(r2.sections, 0, 0).feeling).toBe(true);
      expect(sentenceAt(r2.sections, 1, 0).evidence).toEqual([]);
    }
  });

  it("evidence 가 배열이 아닌 값이면 invalid_evidence 로 막는다", () => {
    const b = body3();
    para(b, 0).sentences[0] = sent("가나다 라마함.", { activityId: "core1" });
    const r = validateWriteResponse(b, wctx);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const issue = r.issues.find((i) => i.code === "invalid_evidence");
      expect(issue?.path).toBe("p1-s1");
    }
  });

  it("보조 기록 근거도 값이 있는 항목이면 붙고 출처 유형은 서버가 정한다", () => {
    const b = body3();
    para(b, 0).sentences[0] = sent("보조 활동에서 나온 방법을 이음.", [
      ev("sup1", "method"),
    ]);
    const r = validateWriteResponse(b, wctx);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(sentenceAt(r.sections, 0, 0).evidence).toEqual([
        { sourceType: "D", refId: "sup1", item: "method", weight: "main" },
      ]);
    }
  });

  it("진행 중 기록과 수기 메모 근거를 다룬다(명세 No.200, 161)", () => {
    const b = body3();
    para(b, 0).sentences[0] = sent("진행 중 기록을 근거로 씀.", [
      ev("wip1", "method"),
    ]);
    para(b, 0).sentences[1] = sent("메모의 한계를 씀.", [
      ev("m1", "limitation"),
      ev("m1", "result"),
    ]);
    const r = validateWriteResponse(b, wctx);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(sentenceAt(r.sections, 0, 0).evidence).toEqual([]);
      expect(sentenceAt(r.sections, 0, 0).feeling).toBe(true);
      expect(sentenceAt(r.sections, 0, 1).evidence.map((e) => e.item)).toEqual([
        "limitation",
      ]);
      expect(sentenceAt(r.sections, 0, 1).feeling).toBe(false);
    }
  });

  it("했습니다, 해요, 했다 같은 종결은 sentence_style 로 막는다", () => {
    for (const bad of [
      "탐구 활동을 시작했습니다.",
      "결과를 정리합니다",
      "그래프를 그렸어요.",
      "표를 만들었죠?",
      "값이 컸네요 예요.",
      "상관계수를 계산했다.",
      "결과를 정리한다.",
    ]) {
      const b = body3();
      para(b, 0).sentences[1] = sent(bad);
      const r = validateWriteResponse(b, wctx);
      expect(r.ok, bad).toBe(false);
      if (!r.ok) {
        const issue = r.issues.find((i) => i.code === "sentence_style");
        expect(issue?.path, bad).toBe("p1-s2");
        expect(issue?.message).toContain("~함");
      }
    }
  });

  it("함, 세움, 깨달음 같은 명사형 종결은 sentence_style 에 걸리지 않는다", () => {
    for (const good of [
      '상관계수를 계산함."',
      "기준을 세움.",
      "한계를 깨달음",
      "오차가 없음.",
      "한계가 있음.",
      "표본 수가 12명임.",
    ]) {
      const b = body3();
      para(b, 0).sentences[1] = sent(good);
      expect(validateWriteResponse(b, wctx).ok, good).toBe(true);
    }
  });

  it("대학명, 학교명, 마크다운, 금지 표현을 막는다", () => {
    const b = body3();
    para(b, 0).sentences[0] = sent("한국대 진학을 목표로 함.");
    para(b, 0).sentences[1] = sent("한빛고등학교 수업에서 시작함.");
    para(b, 1).sentences[0] = sent("**굵게** 씀.");
    para(b, 1).sentences[1] = sent("합격 가능성이 보임.");
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

  it("근거가 없으면 모델이 feeling 을 false 로 신고해도 서버가 true 로 올린다", () => {
    const b = body3();
    para(b, 0).sentences[0] = sent("그냥 쓴 문장임.", []);
    const r = validateWriteResponse(b, wctx);
    expect(r.ok).toBe(true);
    if (r.ok) expect(sentenceAt(r.sections, 0, 0).feeling).toBe(true);
  });

  it("모델이 feeling 을 true 로 신고해도 근거가 있으면 올리지 않는다", () => {
    const b = body3();
    para(b, 0).sentences[0] = { ...sent("계수를 바꿔 관찰함."), feeling: true };
    const r = validateWriteResponse(b, wctx);
    expect(r.ok).toBe(true);
    if (r.ok) expect(sentenceAt(r.sections, 0, 0).feeling).toBe(false);
  });

  it("느낌 표현 패턴이 걸려도 근거가 있으면 표시하지 않는다(명세 No.49 결정)", () => {
    for (const f of [
      "계수를 바꾸며 뿌듯함.",
      "수업에서 새로운 느낌을 받음.",
      "한계를 깨달음.",
      "그래프가 인상 깊었음.",
    ]) {
      const b = body3();
      para(b, 0).sentences[0] = sent(f);
      const r = validateWriteResponse(b, wctx);
      expect(r.ok, f).toBe(true);
      if (r.ok) expect(sentenceAt(r.sections, 0, 0).feeling, f).toBe(false);
    }
  });

  it("느낌 표현 패턴이 걸리고 근거가 없으면 표시한다", () => {
    const b = body3();
    para(b, 0).sentences[0] = sent("직접 만들어 보니 뿌듯함.", []);
    const r = validateWriteResponse(b, wctx);
    expect(r.ok).toBe(true);
    if (r.ok) expect(sentenceAt(r.sections, 0, 0).feeling).toBe(true);
  });

  it("근거 글에 없는 수치가 문장에 있으면 표시한다(명세 No.5)", () => {
    const b = body3();
    para(b, 0).sentences[0] = sent("계수를 99번 바꿔 관찰함.");
    const r = validateWriteResponse(b, wctx);
    expect(r.ok).toBe(true);
    if (r.ok) expect(sentenceAt(r.sections, 0, 0).feeling).toBe(true);
  });

  it("느낌 표현이 없는 ~함 문장은 근거가 있으면 feeling false 다", () => {
    const r = validateWriteResponse(body3(), wctx);
    expect(r.ok).toBe(true);
    if (r.ok) expect(sentenceAt(r.sections, 0, 0).feeling).toBe(false);
  });

  it("하였음, 했음 종결은 함으로 고쳐 저장한다", () => {
    const b = body3();
    para(b, 0).sentences[0] = sent("계수 변화를 확인하였음.");
    para(b, 0).sentences[1] = sent("변수를 통제하지 못하였음.");
    const r = validateWriteResponse(b, wctx);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(sentenceAt(r.sections, 0, 0).text).toBe("계수 변화를 확인함.");
      expect(sentenceAt(r.sections, 0, 1).text).toBe("변수를 통제하지 못함.");
    }
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

  it("문항이 없으면 문항 대응 항목이 응답에 없어도 통과하고 빈 확인을 돌려준다", () => {
    const b = verifyBody();
    b.items = b.items.filter((i) => i.key !== "prompt");
    const r = validateVerifyResponse(b, {
      expectGrowth: false,
      promptMissing: true,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.checks.prompt).toEqual([]);
  });

  it("문항이 없으면 모델이 문항 대응 확인을 보내도 버린다", () => {
    const r = validateVerifyResponse(verifyBody(), {
      expectGrowth: false,
      promptMissing: true,
    });
    expect(r.ok && r.checks.prompt).toEqual([]);
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
