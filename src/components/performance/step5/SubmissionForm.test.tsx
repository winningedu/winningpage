// STEP5 제출폼(§5.14) 동적 렌더·게이트·접근성 회귀 검증 —
// scripts/verify-performance-submission-form.mjs 이식.
//
// 무엇을 막는가
// -------------
// ① **4필드 고정 폼으로 되돌아가는 것.** §6.1은 `schema`가 「4필드 고정이 아니라 8종
//    동적 스키마(문항형 최대 20필드)」라고 못박는데, 시안(§5.14)은 기본 보고서형 3필드
//    변형만 그린다. 시안만 보고 만들면 문항형 20문항 학생에게 서론·본론·결론 3칸이
//    뜬다 — 눈으로는 정상으로 보이고, 서버는 `400 UNKNOWN_FIELD`로만 반응한다.
// ② **글자 수 규칙이 두 벌로 갈라지는 것.** §8.3은 「시안 카운터와 동일 계산식 공유」를
//    요구한다. 클라이언트가 사본을 만들면 "카운터는 통과인데 서버가 400"이 되고, 그
//    증상은 100자 언저리에서만 나타나 테스트를 잘 빠져나간다. 여기서는 **서버 모듈이
//    계산한 기대값과 렌더된 카운터 문자열을 직접 대조**한다.
// ③ **접근성 회귀 4종** — 라벨 미연결(placeholder 대용), 헬퍼 소실(placeholder는 값이
//    차면 사라진다), 카운터 live region화(타이핑마다 낭독), 비활성 버튼의 사유 미전달
//    (`disabled` 속성은 포커스를 못 받아 `aria-describedby`가 영원히 안 읽힌다).
//
// 이식 메모(node:test → Vitest, task 10.8)
// -----------------------------------------
// 원본은 esbuild로 `SubmissionForm.jsx`를 번들했다. Vitest는 TSX를 그대로 변환하므로
// 컴포넌트를 직접 import한다. 스키마는 원본과 동일하게 **서버 판별 모듈이 만든 것을
// 그대로** 넘긴다 — 화면이 받는 값의 출처와 같다.
// `.jsx` → `.tsx` 경로 드리프트: `SubmissionForm.jsx`/`CharCounter.jsx` →
// `SubmissionForm.tsx`/`CharCounter.tsx`. 서버 모듈도 `.js` → `.ts`로 전환됐지만
// (task 3b), api/ import는 저장소 관례대로 `.js` 확장자로 import한다(tsx가 해석한다).

import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import * as charsModule from "../../../../api/_lib/performance/submission-chars.js";
import * as schemaModule from "../../../../api/_lib/performance/submission-schema.js";
import type { SubmissionFieldValues, SubmissionSchema } from "./SubmissionForm";
import SubmissionForm from "./SubmissionForm";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../..");
const CHARS_FILE = path.join(
  REPO_ROOT,
  "api/_lib/performance/submission-chars.ts",
);
const SCHEMA_FILE = path.join(
  REPO_ROOT,
  "api/_lib/performance/submission-schema.ts",
);
const CLIENT_LIB = path.join(REPO_ROOT, "src/lib/performance/submission.ts");
const FORM_FILE = path.join(
  REPO_ROOT,
  "src/components/performance/step5/SubmissionForm.tsx",
);
const COUNTER_FILE = path.join(
  REPO_ROOT,
  "src/components/performance/step5/CharCounter.tsx",
);

function render(props: {
  schema?: SubmissionSchema | null;
  value?: SubmissionFieldValues;
  topicTitle?: string | null;
}) {
  return renderToStaticMarkup(
    <SubmissionForm {...props} onChange={() => {}} />,
  );
}

// ── DOM 헬퍼(정규식) — 이 폼의 마크업은 평평해서 파서를 끌어올 필요가 없다 ────────
const attrsOf = (tag: string) => {
  const map: Record<string, string> = {};
  for (const m of tag.matchAll(/([a-zA-Z-]+)="([^"]*)"/g)) {
    map[m[1] as string] = m[2] as string;
  }
  return map;
};
const collect = (html: string, tagName: string) =>
  [...html.matchAll(new RegExp(`<${tagName}\\b([^>]*)>`, "g"))].map((m) =>
    attrsOf(m[0]),
  );
const labelsOf = (html: string) =>
  [...html.matchAll(/<label\b([^>]*)>([\s\S]*?)<\/label>/g)].map(
    (m): Record<string, string> & { text: string } => ({
      ...attrsOf((m[0] as string).slice(0, (m[0] as string).indexOf(">") + 1)),
      text: (m[2] as string).replace(/<[^>]*>/g, "").trim(),
    }),
  );
const idsInHtml = (html: string) =>
  new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1] as string));

// ── 8종 스키마를 **서버 판별로** 만든다(화면이 받는 값의 출처와 동일) ──────────────
// 각 유형을 실제로 발동시키는 최소 안내문. `inferSubmissionSchema`가 8종 전부를 돌려주는지
// 자체가 1차 검사다 — 한 유형이라도 빠지면 아래 렌더 검사도 그 유형을 놓친다.
const GUIDES = [
  // `extractAnswerQuestions`가 인식하는 형태는 `질문 N: …` 줄이다(guide-structure.js:140).
  [
    "question_based",
    "질문 1: 주제를 고른 이유는 무엇인가요?\n질문 2: 탐구 과정을 소개해 주세요\n질문 3: 배운 점은 무엇인가요?",
  ],
  [
    "length_based_report",
    "분량은 1000자 내외로 작성하고 탐구 내용을 포함하세요.",
  ],
  ["cardnews", "카드뉴스 형태로 제작해 제출하세요."],
  ["presentation", "발표 자료와 대본을 준비해 제출하세요."],
  ["column", "칼럼 형식의 논술문으로 작성하세요."],
  ["book_review", "도서를 읽고 서평을 작성하세요."],
  ["research_report", "탐구보고서 형식으로 서론 본론 결론을 갖춰 작성하세요."],
  ["basic_report", ""],
] as const;

function buildSchema(guide: string) {
  return schemaModule.normalizeSubmissionSchema(
    schemaModule.inferSubmissionSchema(guide),
  );
}

describe("8종 동적 렌더 — §6.1 「4필드 고정이 아니다」", () => {
  test.each(GUIDES)("%s 판별", (expectedType, guide) => {
    const schema = buildSchema(guide);
    expect(schema.type, `안내문 "${guide}" → ${schema.type}`).toBe(
      expectedType,
    );
  });

  describe.each(GUIDES)("%s 렌더", (expectedType) => {
    const guide = GUIDES.find(([type]) => type === expectedType)?.[1] ?? "";
    const schema = buildSchema(guide);
    const html = render({ schema, value: {}, topicTitle: "테스트 주제" });
    const textareas = collect(html, "textarea");
    const labels = labelsOf(html);

    test(`스키마 필드 ${schema.fields.length}개가 그대로 textarea로 렌더된다`, () => {
      expect(textareas).toHaveLength(schema.fields.length);
    });

    test("필드 키·순서가 스키마와 동일하다(화면이 재정렬·재명명하지 않는다)", () => {
      const renderedNames = textareas.map((t) => t.name);
      expect(renderedNames).toEqual(schema.fields.map((f) => f.key));
    });

    test("라벨이 전부 실재 컨트롤에 연결된다(htmlFor, placeholder 대용 금지)", () => {
      const ids = idsInHtml(html);
      const orphanLabels = labels.filter((l) => !l.for || !ids.has(l.for));
      expect(labels).toHaveLength(schema.fields.length + 1);
      expect(orphanLabels).toHaveLength(0);
    });

    test("헬퍼 문구가 aria-describedby로도 연결된다(placeholder 소실 대비)", () => {
      const helperMissing = schema.fields.filter((field) => {
        if (!field.helper) return false;
        const textarea = textareas.find((t) => t.name === field.key);
        const described = (textarea?.["aria-describedby"] || "").split(" ");
        return (
          !described.some((id) => id.endsWith("-helper")) ||
          !html.includes(field.helper)
        );
      });
      expect(helperMissing.map((f) => f.key)).toEqual([]);
    });

    test("카운터가 aria-describedby로 연결된다(포커스 시 1회 낭독)", () => {
      const counterMissing = textareas.filter(
        (t) =>
          !(t["aria-describedby"] || "")
            .split(" ")
            .some((id) => id.endsWith("-counter")),
      );
      expect(counterMissing.map((t) => t.name)).toEqual([]);
    });

    test("작성 예시가 입력칸 위에 박스로 보이고 placeholder로는 쓰이지 않는다", () => {
      const filled = render({
        schema,
        value: Object.fromEntries(schema.fields.map((f) => [f.key, "작성함"])),
      });
      for (const field of schema.fields) {
        const placeholders = textareas.map((t) => t.placeholder);
        expect(placeholders).not.toContain(field.example);
        for (const h of [html, filled]) {
          const at = h.indexOf(field.example);
          expect(at, `${field.key} 예시 노출`).toBeGreaterThan(-1);
          const nameAt = h.indexOf(`name="${field.key}"`);
          expect(at, `${field.key} 예시는 입력칸 위`).toBeLessThan(nameAt);
        }
      }
      expect(html).toContain("예시</");
    });
  });
});

describe("문항형 20필드 — §6.1 「문항형 최대 20필드」", () => {
  const manyQuestions = Array.from(
    { length: 25 },
    (_, i) => `질문 ${i + 1}: ${i + 1}번 문항은 무엇인가요?`,
  ).join("\n");
  const bigSchema = buildSchema(manyQuestions);
  const bigHtml = render({ schema: bigSchema, value: {}, topicTitle: "주제" });

  test("25문항 안내문 → 20필드로 절단된다(서버)", () => {
    expect(bigSchema.fields).toHaveLength(20);
  });

  test("20필드가 전부 렌더된다", () => {
    expect(collect(bigHtml, "textarea")).toHaveLength(20);
  });

  test("20필드의 id가 전부 유일하다", () => {
    expect(idsInHtml(bigHtml).size).toBe(
      [...bigHtml.matchAll(/\sid="/g)].length,
    );
  });

  test("텍스트영역은 고정 높이 h-40(10rem) + resize 잠금이다(§5.14 제안)", () => {
    const textareas = collect(bigHtml, "textarea");
    expect(textareas.length).toBeGreaterThan(0);
    for (const t of textareas) {
      expect(t.class).toMatch(/\bh-40\b/);
      expect(t.class).toMatch(/\bresize-none\b/);
    }
  });
});

describe("카운터 = 서버 계산식 — §8.3 / §12.2 Q35", () => {
  const basic = buildSchema("");

  const COUNT_CASES = [
    { intro: "가나다", body: "", conclusion: "" },
    { intro: "가  나   다", body: "\n\n\n", conclusion: "   " }, // 공백 접기
    { intro: "🙂🙂", body: "a b", conclusion: "" }, // 코드 포인트
    { intro: "한".repeat(120), body: "", conclusion: "" },
  ];

  test.each(COUNT_CASES.map((values, index) => [index + 1, values] as const))(
    "케이스 %s: 카운터가 서버 계산값과 같다",
    (_index, values) => {
      const html = render({ schema: basic, value: values, topicTitle: "주제" });
      const counters = [
        ...html.matchAll(/<p id="[^"]*-counter"[^>]*>(\d+)자<\/p>/g),
      ].map((m) => Number(m[1]));
      const expected = basic.fields.map((f) =>
        charsModule.countFieldChars(values[f.key as keyof typeof values]),
      );
      expect(counters).toEqual(expected);
    },
  );
});

describe("제출 게이트 100자 — 서버 왕복 전 차단", () => {
  const basic = buildSchema("");

  function submitButton(html: string) {
    const m = html.match(/<button[^>]*type="submit"[^>]*>/);
    return m ? attrsOf(m[0]) : null;
  }

  // "중간 저장" 버튼은 QA 행280으로 없어졌다(자동 저장 전환) — 제출 게이트만 본다.
  const GATE_CASES = [
    { label: "빈 폼", values: {}, submitLocked: true },
    {
      label: "99자(임계값 미달)",
      values: { intro: "한".repeat(99), body: "", conclusion: "" },
      submitLocked: true,
    },
    {
      label: "100자지만 필수 필드 2개 공백",
      values: { intro: "한".repeat(100), body: "", conclusion: "" },
      submitLocked: true,
    },
    {
      label: "100자 + 필수 전부 작성",
      values: { intro: "한".repeat(98), body: "가", conclusion: "나" },
      submitLocked: false,
    },
  ];

  test.each(GATE_CASES)("$label", ({ values, submitLocked }) => {
    const html = render({ schema: basic, value: values, topicTitle: "주제" });
    const submit = submitButton(html);
    const gate = charsModule.checkFieldsMinLength(basic.fields, values);

    expect(submit?.["aria-disabled"], `서버 판정 ok=${gate.ok}`).toBe(
      String(submitLocked),
    );
    // 화면 판정과 서버 판정이 같은 결론이어야 한다(둘이 갈리면 "카운터는 통과인데 400").
    expect(submit?.["aria-disabled"] === "true").toBe(!gate.ok);
  });
});

describe("비활성 사유 전달 — disabled 속성 금지", () => {
  const basic = buildSchema("");
  const lockedHtml = render({ schema: basic, value: {}, topicTitle: "주제" });
  const lockedIds = idsInHtml(lockedHtml);

  test("버튼에 disabled 속성을 쓰지 않는다(포커스 유지 → describedby 낭독 가능)", () => {
    expect(/<button[^>]*\sdisabled/.test(lockedHtml)).toBe(false);
  });

  test("잠긴 제출 버튼의 aria-describedby가 실재 요소를 가리킨다", () => {
    const m = lockedHtml.match(/<button[^>]*type="submit"[^>]*>/);
    const button = m ? attrsOf(m[0]) : null;
    const described = (button?.["aria-describedby"] || "")
      .split(" ")
      .filter(Boolean);
    expect(described.length).toBeGreaterThan(0);
    expect(described.every((id) => lockedIds.has(id))).toBe(true);
  });
});

describe("자동 저장 상태 텍스트(QA 행280) — 버튼 대신 카드 제목 옆 텍스트", () => {
  const basic = buildSchema("");

  test("중간 저장 버튼이 더는 렌더되지 않는다", () => {
    const html = render({
      schema: basic,
      value: { intro: "한".repeat(100), body: "가", conclusion: "나" },
      topicTitle: "주제",
    });
    expect(html).not.toMatch(/type="button"/);
    expect(html).not.toContain("중간 저장");
  });

  test("saving=true면 '저장 중…' 텍스트가 role=status 영역에 뜬다", () => {
    const html = renderToStaticMarkup(
      <SubmissionForm schema={basic} value={{}} onChange={() => {}} saving />,
    );
    expect(html).toMatch(/role="status"[^>]*>[\s\S]*?저장 중…/);
  });

  test("error가 있으면 재시도 버튼이 뜨고 에러 문구를 가리킨다", () => {
    const html = renderToStaticMarkup(
      <SubmissionForm
        schema={basic}
        value={{}}
        onChange={() => {}}
        error="중간 저장에 실패했어요."
      />,
    );
    const m = html.match(/<button[^>]*type="button"[^>]*>저장 실패/);
    expect(m).not.toBeNull();
    const button = m ? attrsOf(m[0]) : null;
    const errorParagraph = html.match(/<p id="([^"]+)" role="alert"/);
    expect(button?.["aria-describedby"]).toBe(errorParagraph?.[1]);
  });

  test("savedAt만 있으면 '자동 저장됨 HH:MM'이 뜬다", () => {
    const html = renderToStaticMarkup(
      <SubmissionForm
        schema={basic}
        value={{}}
        onChange={() => {}}
        savedAt="2026-09-06T01:02:00.000Z"
      />,
    );
    // `formatSavedAt`은 `toLocaleTimeString("ko-KR", {hour:"2-digit", minute:"2-digit"})`을
    // 그대로 쓴다 — 로케일이 "오전/오후" 접두를 붙이므로 시:분 패턴만 느슨하게 본다.
    expect(html).toMatch(/자동 저장됨 .*\d{1,2}:\d{2}/);
  });

  test("submitError만 있으면 제출 메시지만 뜨고 '저장 실패'는 안 뜬다", () => {
    // 회귀: 게이트 실패(`SUBMISSION_TOO_SHORT` 등)는 초안이 이미 저장된 채로 돌아오는데
    // (`error?.saved?.savedAt`), 그 상황을 예전엔 저장 실패와 같은 상태로 알려 학생이
    // 방금 저장된 글을 잃은 줄 오인했다.
    const html = renderToStaticMarkup(
      <SubmissionForm
        schema={basic}
        value={{}}
        onChange={() => {}}
        savedAt="2026-09-06T01:02:00.000Z"
        submitError="제출하지 못했어요. 잠시 후 다시 시도해 주세요."
      />,
    );
    expect(html).toMatch(/자동 저장됨 .*\d{1,2}:\d{2}/);
    expect(html).toContain("제출하지 못했어요. 잠시 후 다시 시도해 주세요.");
    expect(html).not.toContain("저장 실패");
  });
});

describe("aria-live 남용 금지", () => {
  const basic = buildSchema("");
  const typingHtml = render({
    schema: basic,
    value: { intro: "한".repeat(30), body: "", conclusion: "" },
    topicTitle: "주제",
  });

  test("카운터는 live region이 아니다(타이핑마다 낭독 금지)", () => {
    expect(/<p id="[^"]*-counter"[^>]*aria-live/.test(typingHtml)).toBe(false);
  });

  test("polite live region은 임계값 통과 안내 1개뿐이고 미달 상태에서는 비어 있다", () => {
    const liveRegions = [
      ...typingHtml.matchAll(/<[^>]*aria-live="polite"[^>]*>([\s\S]*?)</g),
    ];
    expect(liveRegions).toHaveLength(1);
    expect(liveRegions[0]?.[1]?.trim()).toBe("");
  });

  // 위 두 검사는 **이 폼만 따로 렌더했을 때**의 성질이다. 실제 배치는 `ChatTimeline`
  // 루트(`aria-live="polite"`) 안이고, ARIA 규정상 조상 live region이 서브트리의 텍스트
  // 변경을 전부 announce하므로 루트에 `off`가 없으면 위 보장이 화면에서 무너진다(검토 P11).
  test('폼 루트가 aria-live="off"다 (조상 polite 무효화 — ChatTimeline 안에서도 성립)', () => {
    expect(/^<div[^>]*aria-live="off"/.test(typingHtml.trim())).toBe(true);
  });
});

describe("글자 수 규칙 단일화 — 사본 금지 (§8.3 「동일 계산식 공유」의 구조적 보장)", () => {
  const charsText = fs.readFileSync(CHARS_FILE, "utf8");
  const clientText = fs.readFileSync(CLIENT_LIB, "utf8");
  const formText = fs.readFileSync(FORM_FILE, "utf8");
  const counterText = fs.readFileSync(COUNTER_FILE, "utf8");
  const schemaText = fs.readFileSync(SCHEMA_FILE, "utf8");

  test("잎 모듈에 import가 하나도 없다(브라우저 번들이 서버 코드를 끌고 오지 않는다)", () => {
    expect(/^\s*import\s/m.test(charsText)).toBe(false);
  });

  test("클라이언트는 잎 모듈을 재수출한다(사본이 아니라 같은 함수)", () => {
    expect(
      /from ["']\.\.\/\.\.\/\.\.\/api\/_lib\/performance\/submission-chars\.js["']/.test(
        clientText,
      ),
    ).toBe(true);
  });

  test("서버 스키마 모듈도 같은 잎 모듈을 쓴다", () => {
    expect(/from ["']\.\/submission-chars\.js["']/.test(schemaText)).toBe(true);
  });

  // 정규화 정규식이 잎 모듈 밖에 다시 나타나면 그게 곧 사본이다.
  test.each([
    ["SubmissionForm.tsx", () => formText],
    ["CharCounter.tsx", () => counterText],
    ["src/lib/performance/submission.ts", () => clientText],
  ])("%s에 글자 수 계산 사본이 없다", (_name, getText) => {
    const text = getText();
    expect(/replace\(\/\\s\+\/g/.test(text)).toBe(false);
    expect(/\[\.\.\.[A-Za-z]+\]\.length/.test(text)).toBe(false);
  });

  // 임계값도 잎 모듈이 정본이다 — 화면이 자기 상수로 다시 선언하면 서버가 100을 바꿀 때
  // 조용히 갈라진다. (주석 안의 `100`은 근거 서술이라 검사 대상이 아니다 — 선언만 본다.)
  test("화면이 임계값을 따로 선언하지 않는다(SUBMISSION_MIN_CHARS를 쓴다)", () => {
    expect(/SUBMISSION_MIN_CHARS/.test(formText)).toBe(true);
    expect(/(?:const|let|var)\s+\w+\s*=\s*100\b/.test(formText)).toBe(false);
  });
});
