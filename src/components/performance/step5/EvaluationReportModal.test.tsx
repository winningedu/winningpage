// STEP5 평가 리포트 모달 회귀 검증 — scripts/verify-performance-evaluation-report.mjs 이식
// (분기 3버튼은 EvaluationBranchActions.test.tsx로 분리).
//   docs/수행평가-상세-명세.md §5.15(로딩) / §5.16(모달) / §8.5(렌더 계약)
//
// 무엇을 막는가
// -------------
// ① **카드 1 + sections 7**(명세 L1787 단정)이 조용히 8섹션으로 돌아가는 것.
//    프롬프트 평가 형식은 8항목이지만 1번 `종합 평가 점수`는 `score`/`summary` 스칼라로
//    승격돼 `sections`에서 빠진다. 서버 상수(`EVALUATION_REPORT_SECTIONS`)를 직접 읽어
//    7종임을 고정하고, 모달이 그 7개 **앞에** 점수 카드 1개를 더해 8개 제목을 내는지 본다.
// ② 섹션 라벨·순서를 프론트가 다시 정하는 것. 라벨은 서버가 내려준 값을 그대로 써야 한다
//    (P8·P10과 같은 원칙) — 라벨을 바꿔 렌더해 그대로 나오는지로 증명한다.
// ③ §11-Q15 판정(푸터 버튼 조합)이 근거 없이 되돌아가는 것. `중간 저장`은 §5.14 제출폼의
//    버튼이라 열람 전용 모달에서 아무 일도 하지 않는다 — 없어야 한다.
// ④ 접근성 계약(dialog/aria-labelledby/스크롤 region/점수 낭독)이 빠지는 것.
//
// 이식 메모(node:test → Vitest, task 10.8)
// -----------------------------------------
// 원본은 `react-dom/server`의 `renderToStaticMarkup`으로 SSR 문자열을 검사했다 — 이 모달이
// `createPortal(…, document.body)`을 쓰는데 SSR은 포털을 지원하지 않아서
// (`Portals are not currently supported by the server renderer`) esbuild 플러그인으로
// `react-dom`을 스텁으로 바꿔치기하는 우회가 필요했다.
//
// Vitest는 jsdom 환경이 기본값이라(vitest.config.ts) 그 우회가 더 이상 필요 없다 —
// `@testing-library/react`의 `render()`로 **실제** `createPortal`이 `document.body`에 마운트한
// 결과를 그대로 검사한다. 다만 이 컴포넌트는 shadcn `Dialog`(Base UI 기반, ESC/포커스
// 트랩/스크롤 잠금을 기본 제공)를 실제로 마운트하므로, 렌더 직후 `document.body.style.overflow`
// 가 바뀌는 등 원본에는 없던 부작용이 생긴다 — 이 파일은 마크업 계약만 검사하고 그 부작용
// 자체는 검사하지 않는다(테스트 간 격리는 `vitest.setup.ts`의 전역 `afterEach(cleanup)`이
// 포털 노드까지 언마운트해 보장한다 — 실측 확인 완료).
//
// 구조 드리프트 — 원본 검증 시점 이후 실제로 리팩터됨(단언 갱신, 계약 자체는 안 깨짐)
// -----------------------------------------------------------------------------------
// 원본 스크립트가 검증할 당시엔 `EvaluationReportModal`이 dialog 마크업을 직접 손으로 그렸다.
// 지금은 §5.13/§5.16 공용 껍데기 `ReportModalShell` + 섹션 렌더러 `SectionedReportView`
// (+ 블록 뷰 `renderBlock`/`KeyValueView`)로 추출돼 있다(P9/P10). 렌더 **결과**는 원본
// 계약과 동일해서 대부분의 단언은 그대로 옮겼고, 딱 하나만 갱신했다:
//   · 스크롤 영역 `role="region"` — `ReportModalShell`의 `<section>`은 이제 리터럴
//     `role="region"` 속성을 쓰지 않고 `aria-label`만 준다. HTML-ARIA 매핑상 접근 이름이
//     있는 `<section>`은 **암묵적으로** region 역할을 가지므로 접근성 계약(P9 지적 재발
//     방지)은 그대로 성립한다 — 리터럴 문자열 대조 대신 `@testing-library`의 접근성 트리
//     계산(`getByRole('region', {name})`)으로 검증해 오히려 더 정확한 계약 검사가 됐다.
// `EVALUATION_REPORT_SECTIONS`의 record_summary 섹션 kind는 명세상 `"keyValue"`이지만
// 원본 스크립트도 kind 문자열을 직접 비교하지 않고(triad/note가 아니면 keyValue 취급)
// `buildReport` 픽스처를 그대로 구성하므로 이 파일도 그 구조를 그대로 옮겼다.

import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import {
  EVALUATION_RECORD_SUMMARY_ROW_LABELS,
  EVALUATION_REPORT_SECTIONS,
  EVALUATION_SCORE_CARD_LABELS,
  EVALUATION_TRIAD_ROW_LABELS,
} from "../../../../api/_lib/performance/prompts.js";
import type { EvaluationReport } from "./EvaluationReportModal";
import EvaluationReportModal from "./EvaluationReportModal";

/** 서버가 실제로 내려주는 모양 그대로의 픽스처(`evaluate.js buildEvaluationSections`). */
function buildReport({
  score = 86,
  summary = "총평 본문입니다.",
  labelOverride = null,
}: {
  score?: number | null;
  summary?: string;
  labelOverride?: string | null;
} = {}): EvaluationReport {
  const sections = EVALUATION_REPORT_SECTIONS.map((section, index) => {
    const label = labelOverride && index === 0 ? labelOverride : section.label;

    if (section.kind === "triad") {
      return {
        id: section.id,
        label,
        blocks: [
          {
            kind: "keyValue",
            rows: EVALUATION_TRIAD_ROW_LABELS.map((row) => ({
              label: row.label,
              content: `${section.id}-${row.key} 값`,
            })),
          },
        ],
      };
    }

    if (section.kind === "note") {
      return { id: section.id, label, text: "특이사항 없음" };
    }

    return {
      id: section.id,
      label,
      blocks: [
        {
          kind: "keyValue",
          rows: EVALUATION_RECORD_SUMMARY_ROW_LABELS.map((row) => ({
            label: row.label,
            content: `${row.key} 값`,
          })),
        },
      ],
    };
  });

  return { score, summary, sections };
}

const noop = () => {};

// ─────────────────────────────────────────────────────────────────────
// [1] §8.5 렌더 계약 — 서버 섹션 상수는 7종이다(8이 아니다).
// ─────────────────────────────────────────────────────────────────────
describe("§8.5 렌더 계약 — 서버 섹션 상수", () => {
  test("EVALUATION_REPORT_SECTIONS가 7개다(「카드 1 + sections 7」)", () => {
    expect(EVALUATION_REPORT_SECTIONS).toHaveLength(7);
  });

  test("3분할(triad) 섹션은 2~6번 5개다(7·8번에 3분할을 강제하지 않는다)", () => {
    expect(
      EVALUATION_REPORT_SECTIONS.filter((s) => s.kind === "triad"),
    ).toHaveLength(5);
  });
});

// ─────────────────────────────────────────────────────────────────────
// [2] 모달 본문 = 점수 카드 1 + 서버 섹션 7, **순서 그대로**.
// ─────────────────────────────────────────────────────────────────────
describe("모달 본문 — 점수 카드 1 + 서버 섹션 7", () => {
  test("제목이 8개(점수 카드 1 + 섹션 7)이고 순서가 서버 상수와 같다", () => {
    render(
      <EvaluationReportModal
        open
        report={buildReport()}
        topicTitle="주제 제목"
        onClose={noop}
      />,
    );
    const dialog = screen.getByRole("dialog");
    const headings = within(dialog)
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent);

    expect(headings).toHaveLength(8);
    expect(headings[0]).toBe(EVALUATION_SCORE_CARD_LABELS.score);
    expect(headings.slice(1)).toEqual(
      EVALUATION_REPORT_SECTIONS.map((s) => s.label),
    );
  });

  test("3분할 행 라벨(잘한 점/아쉬운 점/보완할 점)이 5개 섹션에 나온다", () => {
    render(
      <EvaluationReportModal
        open
        report={buildReport()}
        topicTitle="주제 제목"
        onClose={noop}
      />,
    );
    const html = document.body.innerHTML;
    for (const row of EVALUATION_TRIAD_ROW_LABELS) {
      const count = html.split(`<b>${row.label}</b>`).length - 1;
      expect(count, `행 '${row.label}'`).toBe(5);
    }
  });

  test("누적 기록용 요약 행 라벨이 전부 나온다", () => {
    render(
      <EvaluationReportModal
        open
        report={buildReport()}
        topicTitle="주제 제목"
        onClose={noop}
      />,
    );
    const html = document.body.innerHTML;
    for (const row of EVALUATION_RECORD_SUMMARY_ROW_LABELS) {
      expect(html.includes(`<b>${row.label}</b>`), row.label).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// [3] 승격된 점수 카드 — `86/100` 표기 + 낭독 보강 + `총평:`.
// ─────────────────────────────────────────────────────────────────────
describe("승격된 점수 카드", () => {
  test("만점 표기·점수 값·낭독 보강·총평 라벨이 모두 렌더된다", () => {
    render(
      <EvaluationReportModal
        open
        report={buildReport()}
        topicTitle="주제 제목"
        onClose={noop}
      />,
    );
    const html = document.body.innerHTML;
    expect(html.includes("/100"), "만점 표기(§5.16 `86/100`)").toBe(true);
    expect(html.includes("86"), "점수 값").toBe(true);
    expect(
      html.includes("100점 만점에 86점"),
      "스크린리더 낭독 보강 — `86/100`은 그대로 읽히지 않는다",
    ).toBe(true);
    expect(html.includes(`${EVALUATION_SCORE_CARD_LABELS.summary}:`)).toBe(
      true,
    );
  });

  // 점수를 못 읽은 경우: 점수 줄만 빠지고 총평은 남는다(0점으로 보정하지 않는다).
  test("score가 없으면 만점 표기는 빠지고 총평은 남는다", () => {
    render(
      <EvaluationReportModal
        open
        report={buildReport({ score: null })}
        onClose={noop}
      />,
    );
    const html = document.body.innerHTML;
    expect(html.includes("/100"), "없는 점수를 지어내면 안 된다").toBe(false);
    expect(html.includes(`${EVALUATION_SCORE_CARD_LABELS.summary}:`)).toBe(
      true,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────
// [4] 접근성 계약 — dialog / aria-labelledby / 스크롤 region.
// ─────────────────────────────────────────────────────────────────────
describe("접근성 계약", () => {
  test("role=dialog + aria-modal + aria-labelledby가 실재하는 <h2>를 가리킨다", () => {
    render(
      <EvaluationReportModal
        open
        report={buildReport()}
        topicTitle="주제 제목"
        onClose={noop}
      />,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    const title = within(dialog).getByRole("heading", { level: 2 });
    expect(title.id).toBe(labelledBy);
  });

  // 리터럴 role="region" 속성 대신 접근성 트리 계산으로 검증한다(파일 상단 "구조 드리프트" 절).
  test('스크롤 영역이 role="region"으로 노출되고 tabIndex=0이다(P9 지적 재발 금지)', () => {
    render(
      <EvaluationReportModal
        open
        report={buildReport()}
        topicTitle="주제 제목"
        onClose={noop}
      />,
    );
    const region = screen.getByRole("region", { name: "평가 리포트 본문" });
    expect(region.tabIndex).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────
// [5] §11-Q15 판정 — 푸터 버튼 조합.
// ─────────────────────────────────────────────────────────────────────
describe("§11-Q15 판정 — 푸터 버튼 조합", () => {
  test("primary '다음 단계 선택하기' + secondary 'PDF로 저장 / 인쇄'만 있다", () => {
    render(
      <EvaluationReportModal
        open
        report={buildReport()}
        topicTitle="주제 제목"
        onClose={noop}
      />,
    );
    const dialog = screen.getByRole("dialog");
    const footerLabels = within(dialog)
      .getAllByRole("button")
      .map((b) => b.textContent);

    expect(footerLabels).toContain("다음 단계 선택하기");
    expect(footerLabels).toContain("PDF로 저장 / 인쇄");
    expect(
      footerLabels,
      "`중간 저장`은 §5.14 제출폼 버튼이다 — 열람 전용 모달에서 아무 일도 하지 않는다",
    ).not.toContain("중간 저장");
    expect(
      footerLabels,
      "`저장 리포트 목록 가기`는 §5.18 목록 라우트가 생긴 뒤에 배선한다",
    ).not.toContain("저장 리포트 목록 가기");

    const nextButton = screen.getByRole("button", {
      name: "다음 단계 선택하기",
    });
    expect(
      nextButton.className,
      "primary(#013262, §11.1 Q5)로 렌더돼야 한다",
    ).toMatch(/\bbg-primary\b/);
  });
});

// ─────────────────────────────────────────────────────────────────────
// [6] 라벨·본문은 서버가 정한다 / 빈 상태 처리.
// ─────────────────────────────────────────────────────────────────────
describe("라벨·본문 소유권 + 빈 상태", () => {
  test("서버가 내려준 섹션 라벨이 그대로 렌더된다(프론트가 자체 상수로 덮어쓰지 않는다)", () => {
    const OVERRIDE = "ZZZ 라벨 검증용";
    render(
      <EvaluationReportModal
        open
        report={buildReport({ labelOverride: OVERRIDE })}
        onClose={noop}
      />,
    );
    expect(screen.getByText(OVERRIDE)).toBeTruthy();
  });

  test("본문이 빈 섹션은 라벨만 남은 채 렌더되지 않는다(getVisibleSections 판정)", () => {
    render(
      <EvaluationReportModal
        open
        report={{
          score: 70,
          summary: "요약",
          sections: [{ id: "x", label: "빈 섹션", text: "" }],
        }}
        onClose={noop}
      />,
    );
    expect(screen.queryByText("빈 섹션")).toBeNull();
  });

  test("open=false면 아무것도 렌더하지 않는다", () => {
    render(
      <EvaluationReportModal
        open={false}
        report={buildReport()}
        onClose={noop}
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("report=null이면 모달을 렌더하지 않는다(무음 실패 방지 계약)", () => {
    render(<EvaluationReportModal open report={null} onClose={noop} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────
// [4] QA 2차 시트 행37·51 — studentName이 ReportModalShell 표지까지 전달된다.
// ─────────────────────────────────────────────────────────────────────
describe("표지(ReportModalShell 공용 컴포넌트)로의 studentName 전달", () => {
  test("studentName을 표지에 반영한다", () => {
    render(
      <EvaluationReportModal
        open
        report={buildReport()}
        studentName="김민준"
        onClose={noop}
      />,
    );

    const cover = screen.getByLabelText(/리포트 표지/);
    expect(cover).toHaveTextContent("김민준 학생");
  });
});
