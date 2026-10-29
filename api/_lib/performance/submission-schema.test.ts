// 수행평가 제출 스키마 — 세션 어댑터 회귀 검증.
//
// `resolveSessionSubmissionSchema`는 우리 저장소에만 있는 세션 배선이다.
// upload/manual 모드에 따라 어느 컬럼을 판정에 넘기는지, 영속화된
// `submission_schema`가 있으면 재판정하지 않는지를 고정한다.
import { describe, expect, test } from "vitest";
import * as ported from "./submission-schema.js";

describe("세션 어댑터", () => {
  test("upload 모드 → guide_json.text로 판정 + inferred:true", () => {
    const r = ported.resolveSessionSubmissionSchema({
      guide_input_mode: "upload",
      guide_json: {
        mode: "upload",
        text: "질문 1: 주제를 고른 이유는 무엇인가요?",
      },
    });
    expect(r.inferred).toBe(true);
    expect(r.schema.type).toBe("question_based");
  });

  test("manual 모드 → guide_freetext로 판정", () => {
    expect(
      ported.resolveSessionSubmissionSchema({
        guide_input_mode: "manual",
        guide_freetext: "카드뉴스 4장을 제작한다.",
      }).schema.type,
    ).toBe("cardnews");
  });

  test("영속화된 submission_schema가 있으면 재판정하지 않는다 (inferred:false)", () => {
    const r = ported.resolveSessionSubmissionSchema({
      guide_input_mode: "manual",
      guide_freetext: "카드뉴스 4장을 제작한다.",
      submission_schema: {
        type: "basic_report",
        label: "기본 보고서형",
        notice: "n",
        fields: [{ key: "intro", label: "서론", helper: "" }],
      },
    });
    expect(r.inferred).toBe(false);
    expect(r.schema.type).toBe("basic_report");
    expect(r.schema.fields.length).toBe(1);
  });

  test("입력 없음 → 기본 보고서형 (throw 없음)", () => {
    expect(ported.resolveSessionSubmissionSchema({}).schema.type).toBe(
      "basic_report",
    );
    expect(ported.resolveSessionSubmissionSchema().schema.type).toBe(
      "basic_report",
    );
  });
});

describe("작성 예시(example)", () => {
  const GUIDES = [
    "",
    "탐구 내용과 배우고 느낀 점을 쓰고 주제 선정 이유와 참고 문헌을 적는다. 1000자 이상",
    "카드뉴스를 제작한다.",
    "발표 PPT를 만든다.",
    "칼럼을 쓴다.",
    "독서 서평을 쓴다.",
    "탐구 보고서를 쓴다.",
    "질문 1: 주제를 고른 이유는 무엇인가요?",
  ];

  test("모든 필드 예시는 [예시]로 시작하지 않는다", () => {
    for (const g of GUIDES) {
      for (const f of ported.inferSubmissionSchema(g).fields) {
        expect(f.example.startsWith("[예시]"), f.key).toBe(false);
      }
    }
  });

  test("모든 유형의 모든 필드에 60~150자 예시가 있다", () => {
    const schemas = GUIDES.map((g) => ported.inferSubmissionSchema(g));
    expect(new Set(schemas.map((s) => s.type)).size).toBe(GUIDES.length);
    for (const schema of schemas) {
      for (const f of schema.fields) {
        const where = `${schema.type}/${f.key}`;
        expect(f.example.length, where).toBeGreaterThanOrEqual(60);
        expect(f.example.length, where).toBeLessThanOrEqual(150);
      }
    }
  });

  test("정규화는 저장된 example을 보존한다", () => {
    const r = ported.normalizeSubmissionSchema({
      fields: [{ key: "a", label: "A", helper: "h", example: "예시 문장" }],
    });
    expect(r.fields[0]?.example).toBe("예시 문장");
  });

  test("example 없는 저장 스키마를 normalize하면 기본 example이 채워진다", () => {
    const base = ported.inferSubmissionSchema("카드뉴스를 제작한다.");
    const stored = {
      type: base.type,
      fields: base.fields.map(({ example: _e, ...rest }) => rest),
    };
    const r = ported.normalizeSubmissionSchema(stored);
    expect(r.fields.map((f) => f.example)).toEqual(
      base.fields.map((f) => f.example),
    );
    expect(r.fields[0]?.example).not.toBe("");

    const q = ported.normalizeSubmissionSchema({
      type: "question_based",
      fields: [{ key: "question_7", label: "문항 7", helper: "h" }],
    });
    expect(q.fields[0]?.example).not.toBe("");
  });

  test("저장된 example이 있으면 덮어쓰지 않는다", () => {
    const r = ported.normalizeSubmissionSchema({
      type: "basic_report",
      fields: [
        { key: "intro", label: "서론", helper: "h", example: "내 예시" },
      ],
    });
    expect(r.fields[0]?.example).toBe("내 예시");
  });

  test("알 수 없는 key면 비운다", () => {
    const r = ported.normalizeSubmissionSchema({
      type: "basic_report",
      fields: [{ key: "nope", label: "X", helper: "h" }],
    });
    expect(r.fields[0]?.example).toBe("");
  });
});
