// QA 2차 시트 행37·51 — 목표관리 성장 리포트 본문 최상단(=인쇄 첫 페이지)에 공용 표지
// (ReportCoverPage)를 붙인다. 표지는 report.admission.upper.university(이미 "대학 학과"
// 형태로 합쳐진 문자열, aggregate.ts computeAdmissionDelta 참고)를 목표로 쓰고, 학생
// 이름은 호출부(ChildReport.tsx 등)가 studentName prop으로 내려준다.
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import GrowthReportBody, { type GrowthReport } from "./GrowthReportBody";

/** heading을 아예 생략한(=undefined 아님, 키 자체가 없는) 리포트. exactOptionalPropertyTypes
 * 때문에 `makeReport({ heading: undefined })`는 쓸 수 없다 — 키를 지워서 만든다. */
function makeReportWithoutHeading(
  overrides: Partial<Omit<GrowthReport, "heading">> = {},
): GrowthReport {
  const { heading: _heading, ...rest } = makeReport(overrides);
  return rest;
}

function makeReport(overrides: Partial<GrowthReport> = {}): GrowthReport {
  return {
    heading: "주간 성장 리포트",
    periodLabel: "2026.09.15 ~ 09.21",
    hero: { narrative: "이번 주도 수고했어요.", kpis: [] },
    overview: {
      achievement: { rows: [] },
      studyTime: { bars: [] },
      condition: { rows: [] },
    },
    execution: {
      subjectShare: { rows: [] },
      timeSlot: { rows: [] },
      distraction: { rows: [] },
    },
    outcome: {
      coreItems: { rows: [] },
      conditionTiles: { tiles: [] },
      admission: {},
    },
    strategy: null,
    mentorComment: null,
    admission: {
      upper: {
        university: "서울대학교 컴퓨터공학과",
        susi: { delta: { direction: "up", value: "0%p" }, rate: 0 },
        jeongsi: { delta: { direction: "up", value: "0%p" }, rate: 0 },
      },
      lower: {
        university: "",
        susi: { delta: { direction: "up", value: "0%p" }, rate: 0 },
        jeongsi: { delta: { direction: "up", value: "0%p" }, rate: 0 },
      },
    },
    ...overrides,
  };
}

describe("GrowthReportBody — 표지", () => {
  it("표지에 리포트 제목을 렌더한다", () => {
    render(
      <GrowthReportBody
        period="weekly"
        onPeriodChange={() => {}}
        report={makeReport()}
      />,
    );

    const cover = screen.getByLabelText(/리포트 표지/);
    expect(cover).toHaveTextContent("주간 성장 리포트");
  });

  it("studentName prop과 admission.upper.university를 표지에 반영한다", () => {
    render(
      <GrowthReportBody
        period="weekly"
        onPeriodChange={() => {}}
        report={makeReport()}
        studentName="김민준"
      />,
    );

    const cover = screen.getByLabelText(/리포트 표지/);
    expect(cover).toHaveTextContent("김민준 학생");
    expect(cover).toHaveTextContent("서울대학교 컴퓨터공학과");
  });

  // QA — heading이 없을 때 빈 문자열 폴백("")을 표지 title로 넘기면 빈 <h1>이
  // 그대로 DOM에 남는다(스크린리더에 내용 없는 제목으로 읽힌다). 데이터가 없으면
  // 렌더하지 않는다.
  it("heading이 없으면 표지 자체를 렌더하지 않는다", () => {
    render(
      <GrowthReportBody
        period="weekly"
        onPeriodChange={() => {}}
        report={makeReportWithoutHeading()}
      />,
    );

    expect(screen.queryByLabelText(/리포트 표지/)).not.toBeInTheDocument();
  });

  it("heading이 없으면 본문 h1도 렌더하지 않는다", () => {
    render(
      <GrowthReportBody
        period="weekly"
        onPeriodChange={() => {}}
        report={makeReportWithoutHeading()}
      />,
    );

    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  });
});
