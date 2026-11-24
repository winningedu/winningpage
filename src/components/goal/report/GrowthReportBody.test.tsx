// QA 2차 시트 행37·51 — 목표관리 성장 리포트 본문 최상단(=인쇄 첫 페이지)에 공용 표지
// (ReportCoverPage)를 붙인다. 표지는 report.admission.upper.university(이미 "대학 학과"
// 형태로 합쳐진 문자열, aggregate.ts computeAdmissionDelta 참고)를 목표로 쓰고, 학생
// 이름은 호출부(ChildReport.tsx 등)가 studentName prop으로 내려준다.
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { site } from "@/config/site";
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
    periodLabel: "2026-09-15 ~ 2026-09-21",
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
    expect(cover).toHaveTextContent(`${site.brandName} 주간 성장 리포트`);
  });

  it("studentName prop을 표지에 반영하고 목표 칸은 두지 않는다", () => {
    render(
      <GrowthReportBody
        period="weekly"
        onPeriodChange={() => {}}
        report={makeReport()}
        studentName="김민준"
      />,
    );

    const cover = screen.getByLabelText(/리포트 표지/);
    const info = within(cover).getByTestId("cover-info");
    expect(info).toHaveTextContent("학생명김민준");
    expect(info).not.toHaveTextContent("목표");
    expect(info).not.toHaveTextContent("서울대학교");
  });

  it("studentGrade prop을 표지용 학년 표기로 바꿔 학생명, 학년, 기간 3칸 순으로 표지에 반영한다", () => {
    render(
      <GrowthReportBody
        period="weekly"
        onPeriodChange={() => {}}
        report={makeReport()}
        studentName="김민준"
        studentGrade="고2"
      />,
    );

    const info = within(screen.getByLabelText(/리포트 표지/)).getByTestId(
      "cover-info",
    );
    expect(info).toHaveTextContent("학년고등학교 2학년");
    const text = info.textContent ?? "";
    expect(text.indexOf("학생명")).toBeLessThan(text.indexOf("학년"));
    expect(text.indexOf("학년")).toBeLessThan(text.indexOf("기간"));
    expect(info.children).toHaveLength(3);
    expect(info).not.toHaveTextContent("목표");
  });

  it("표지 기간은 시안 날짜 형식으로 쓰고 본문 기간 표기는 그대로 둔다", () => {
    render(
      <GrowthReportBody
        period="weekly"
        onPeriodChange={() => {}}
        report={makeReport()}
        studentName="김민준"
        studentGrade="고2"
      />,
    );

    const info = within(screen.getByLabelText(/리포트 표지/)).getByTestId(
      "cover-info",
    );
    expect(info).toHaveTextContent("기간2026. 09. 15 ~ 2026. 09. 21");
    expect(screen.getByText("2026-09-15 ~ 2026-09-21")).toBeInTheDocument();
  });

  it("studentGrade가 없으면 학년 칸을 렌더하지 않는다", () => {
    render(
      <GrowthReportBody
        period="weekly"
        onPeriodChange={() => {}}
        report={makeReport()}
        studentName="김민준"
      />,
    );

    const info = within(screen.getByLabelText(/리포트 표지/)).getByTestId(
      "cover-info",
    );
    expect(info).not.toHaveTextContent("학년");
  });

  it("월간이면 월간 프리셋(다음 달 전략 항목)을 쓴다", () => {
    render(
      <GrowthReportBody
        period="monthly"
        onPeriodChange={() => {}}
        report={makeReport()}
      />,
    );

    const cover = screen.getByLabelText(/리포트 표지/);
    expect(within(cover).getAllByTestId("cover-area")).toHaveLength(4);
    expect(cover).toHaveTextContent("다음 달 전략");
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

  // QA3 행69, 주간/월간 선택이 밑줄/글자색만 달라 약해 박스형 탭으로 그린다.
  it("주간/월간 선택을 박스형 탭으로 그린다", () => {
    render(
      <GrowthReportBody
        period="weekly"
        onPeriodChange={() => {}}
        report={makeReport()}
      />,
    );

    const tablist = screen.getByRole("tablist", { name: "리포트 기간" });
    const weekly = within(tablist).getByRole("tab", { name: "주간" });
    const monthly = within(tablist).getByRole("tab", { name: "월간" });
    expect(weekly).toHaveAttribute("aria-selected", "true");
    expect(weekly).toHaveClass("border", "rounded-lg", "border-accent");
    expect(monthly).toHaveClass("border", "rounded-lg", "border-[#E3E3E3]");
  });
});

describe("GrowthReportBody: 멘토 코멘트 작성일", () => {
  it("writtenAt 시각을 브라우저 시간대의 날짜로 보여준다", () => {
    // 2026-09-20T16:30Z = 서울 9/21 01:30. 브라우저 시간대를 서울로 둔다.
    const spy = vi
      .spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions")
      .mockReturnValue({ timeZone: "Asia/Seoul" } as never);
    try {
      render(
        <GrowthReportBody
          period="weekly"
          onPeriodChange={() => {}}
          report={makeReport({
            mentorComment: {
              writtenAt: "2026-09-20T16:30:00Z",
              body: "잘했어요",
            },
          })}
        />,
      );
      expect(screen.getByText("2026-09-21")).toBeInTheDocument();
    } finally {
      spy.mockRestore();
    }
  });
});

describe("GrowthReportBody, 리포트 기간 선택", () => {
  const options = [
    { value: "2026-09-14", label: "이번 주 9.14 ~ 9.20" },
    { value: "2026-09-07", label: "9.7 ~ 9.13" },
  ];

  it("옵션이 있으면 select를 렌더하고 activePeriod를 선택값으로 보여준다", () => {
    render(
      <GrowthReportBody
        period="weekly"
        onPeriodChange={() => {}}
        report={makeReport()}
        periodOptions={options}
        activePeriod="2026-09-07"
        onPeriodKeyChange={() => {}}
      />,
    );

    const select = screen.getByLabelText("리포트 기간 선택");
    expect(select).toHaveValue("2026-09-07");
    expect(
      within(select)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["이번 주 9.14 ~ 9.20", "9.7 ~ 9.13"]);
  });

  it("옵션을 고르면 onPeriodKeyChange를 그 값으로 부른다", () => {
    const onPeriodKeyChange = vi.fn();
    render(
      <GrowthReportBody
        period="weekly"
        onPeriodChange={() => {}}
        report={makeReport()}
        periodOptions={options}
        activePeriod="2026-09-14"
        onPeriodKeyChange={onPeriodKeyChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("리포트 기간 선택"), {
      target: { value: "2026-09-07" },
    });
    expect(onPeriodKeyChange).toHaveBeenCalledWith("2026-09-07");
  });

  it("옵션이 없으면 select를 렌더하지 않는다", () => {
    render(
      <GrowthReportBody
        period="weekly"
        onPeriodChange={() => {}}
        report={makeReport()}
      />,
    );

    expect(screen.queryByLabelText("리포트 기간 선택")).toBeNull();
  });

  it("activePeriod가 목록 밖이면 periodLabel을 그 값의 옵션으로 보여준다", () => {
    render(
      <GrowthReportBody
        period="weekly"
        onPeriodChange={() => {}}
        report={makeReport()}
        periodOptions={options}
        activePeriod="2026-08-31"
        onPeriodKeyChange={() => {}}
      />,
    );

    const select = screen.getByLabelText("리포트 기간 선택");
    expect(select).toHaveValue("2026-08-31");
    expect(
      within(select).getByRole("option", { name: "2026-09-15 ~ 2026-09-21" }),
    ).toBeInTheDocument();
  });
});
