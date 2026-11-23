// 리포트 공용 표지 - QA3 시트 행55, 56. 문구는 coverPresets 가 정하고, 이 컴포넌트는
// 프리셋과 정보 줄 값을 파일83 배치로 그린다. 값이 없는 칸은 렌더하지 않는다.
import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ReportCoverPage from "./ReportCoverPage";

function getStyleText(container: HTMLElement) {
  return container.querySelector("style")?.textContent ?? "";
}

describe("ReportCoverPage", () => {
  it("프리셋 서비스 라벨로 aria-label 을 만든다", () => {
    render(<ReportCoverPage kind="diagnosis" title="제목" infoItems={[]} />);

    expect(screen.getByLabelText("학습진단 리포트 표지")).toBeInTheDocument();
  });

  it("title 을 렌더한다", () => {
    render(
      <ReportCoverPage
        kind="diagnosis"
        title={"위닝에듀\n학습진단 리포트"}
        infoItems={[]}
      />,
    );

    expect(screen.getByRole("heading").textContent).toBe(
      "위닝에듀\n학습진단 리포트",
    );
  });

  it("짧은 제목은 7cqw, 긴 제목은 7cqw 미만 글자 크기로 그린다", () => {
    const { rerender } = render(
      <ReportCoverPage kind="performance" title="확률과 통계" infoItems={[]} />,
    );
    expect(screen.getByRole("heading")).toHaveStyle({ fontSize: "7cqw" });

    rerender(
      <ReportCoverPage
        kind="performance"
        title="정수론 기반의 오류 정정 코드(ECC) 원리 분석 및 데이터 통신에서의 활용"
        infoItems={[]}
      />,
    );
    const fontSize = Number.parseFloat(
      screen.getByRole("heading").style.fontSize,
    );
    expect(fontSize).toBeLessThan(7);
  });

  it("프리셋의 영문 라벨, 부제 2줄, 머리글을 렌더한다", () => {
    render(<ReportCoverPage kind="diagnosis" title="제목" infoItems={[]} />);

    expect(screen.getByText("LEARNING DIAGNOSIS REPORT")).toBeInTheDocument();
    expect(
      screen.getByText("학습 성향부터 영역별 성취도, 맞춤 학습 처방까지"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("데이터로 읽는 우리 자녀의 현재와 다음 단계."),
    ).toBeInTheDocument();
    expect(screen.getByText("DIAGNOSIS AREAS")).toBeInTheDocument();
  });

  it("프리셋 항목 수만큼 번호 목록을 렌더한다", () => {
    const { rerender } = render(
      <ReportCoverPage kind="goalWeekly" title="제목" infoItems={[]} />,
    );
    expect(screen.getAllByTestId("cover-area")).toHaveLength(3);

    rerender(
      <ReportCoverPage kind="goalMonthly" title="제목" infoItems={[]} />,
    );
    const areas = screen.getAllByTestId("cover-area");
    expect(areas).toHaveLength(4);
    expect(areas[3]).toHaveTextContent("04");
    expect(areas[3]).toHaveTextContent("다음 달 전략");
  });

  it("계단 6단을 01부터 06까지 순서대로 렌더한다", () => {
    render(<ReportCoverPage kind="selfeval" title="제목" infoItems={[]} />);

    const steps = screen.getAllByTestId("cover-step");
    expect(steps.map((step) => step.textContent)).toEqual([
      "01학습진단",
      "02목표관리",
      "03성장설계",
      "04수행평가",
      "05심화탐구",
      "06자기평가",
    ]);
  });

  it("정보 줄은 값이 있는 칸만 라벨과 값으로 렌더한다", () => {
    render(
      <ReportCoverPage
        kind="diagnosis"
        title="제목"
        infoItems={[
          { label: "학생명", value: "김민준" },
          { label: "학년", value: null },
          { label: "진단일", value: "2026. 10. 16" },
        ]}
      />,
    );

    expect(screen.getByText("학생명")).toBeInTheDocument();
    expect(screen.getByText("김민준")).toBeInTheDocument();
    expect(screen.queryByText("학년")).not.toBeInTheDocument();
    expect(screen.getByText("진단일")).toBeInTheDocument();
    expect(screen.getByText("2026. 10. 16")).toBeInTheDocument();
  });

  it("compact 칸의 값은 작은 글자로 한 줄에 그린다", () => {
    render(
      <ReportCoverPage
        kind="goalWeekly"
        title="제목"
        infoItems={[
          { label: "학생명", value: "김민준" },
          {
            label: "기간",
            value: "2026. 10. 19 ~ 2026. 10. 25",
            compact: true,
          },
        ]}
      />,
    );

    const period = screen.getByText("2026. 10. 19 ~ 2026. 10. 25");
    expect(period).toHaveClass("text-[1.8cqw]", "whitespace-nowrap");
    expect(screen.getByText("김민준")).not.toHaveClass("whitespace-nowrap");
  });

  it("값이 공백뿐이거나 undefined 인 칸은 렌더하지 않는다", () => {
    render(
      <ReportCoverPage
        kind="diagnosis"
        title="제목"
        infoItems={[
          { label: "학생명", value: "  " },
          { label: "학년", value: undefined },
        ]}
      />,
    );

    expect(screen.queryByText("학생명")).not.toBeInTheDocument();
    expect(screen.queryByText("학년")).not.toBeInTheDocument();
  });

  it("정보 값이 전부 비면 정보 줄 자체를 렌더하지 않는다", () => {
    render(
      <ReportCoverPage
        kind="inquiryDesign"
        title="제목"
        infoItems={[{ label: "학생명", value: null }]}
      />,
    );

    expect(screen.queryByTestId("cover-info")).not.toBeInTheDocument();
  });

  it("고지 문구와 학생 전용 표기를 렌더한다", () => {
    render(<ReportCoverPage kind="diagnosis" title="제목" infoItems={[]} />);

    expect(
      screen.getByText(/위닝에듀 학습진단 결과에 대하여 작성한 내용입니다/),
    ).toBeInTheDocument();
    expect(screen.getByText("위닝에듀 학생 전용")).toBeInTheDocument();
  });

  it("사이트 로고를 site.brandName 을 alt 로 렌더한다", () => {
    render(<ReportCoverPage kind="diagnosis" title="제목" infoItems={[]} />);

    expect(screen.getByAltText("위닝에듀")).toHaveAttribute(
      "src",
      "/images/winning-logo-horizontal.svg",
    );
  });

  it("표지 루트는 컨테이너 쿼리 단위를 쓰도록 inline-size 컨테이너다", () => {
    render(<ReportCoverPage kind="diagnosis" title="제목" infoItems={[]} />);

    expect(screen.getByLabelText("학습진단 리포트 표지").className).toContain(
      "[container-type:inline-size]",
    );
  });

  it("variant='a4' 는 fd-report-sheet 클래스를 붙이고 인쇄 규칙으로 시트 패딩을 덮는다", () => {
    const { container } = render(
      <ReportCoverPage
        kind="diagnosis"
        title="제목"
        infoItems={[]}
        variant="a4"
      />,
    );

    expect(screen.getByLabelText("학습진단 리포트 표지").className).toContain(
      "fd-report-sheet",
    );
    expect(getStyleText(container)).toContain("padding: 0 !important");
  });

  it("기본(flow)은 fd-report-sheet 를 붙이지 않고 화면에서 숨긴다", () => {
    render(<ReportCoverPage kind="diagnosis" title="제목" infoItems={[]} />);

    const root = screen.getByLabelText("학습진단 리포트 표지");
    expect(root.className).not.toContain("fd-report-sheet");
    expect(root.className).toContain("hidden");
    expect(root.className).toContain("print:block");
  });

  it("flow 는 첫 페이지 여백을 없애고 A4 전체 한 장으로 끊는다", () => {
    const { container } = render(
      <ReportCoverPage kind="diagnosis" title="제목" infoItems={[]} />,
    );

    const style = getStyleText(container);
    expect(style).toMatch(/@page :first\s*\{\s*margin:\s*0/);
    expect(style).toContain("width: 210mm");
    expect(style).toContain("height: 297mm");
    expect(style).toContain("break-after: page");
    expect(style).not.toContain("230mm");
  });

  it("className 을 루트에 합친다", () => {
    render(
      <ReportCoverPage
        kind="diagnosis"
        title="제목"
        infoItems={[]}
        className="custom-cover"
      />,
    );

    expect(screen.getByLabelText("학습진단 리포트 표지").className).toContain(
      "custom-cover",
    );
  });

  it("렌더 텍스트에 em dash, en dash, 가운뎃점이 없다", () => {
    render(
      <ReportCoverPage
        kind="inquiryFinal"
        title="제목"
        infoItems={[{ label: "학생명", value: "김민준" }]}
      />,
    );

    const root = screen.getByLabelText("심화탐구 리포트 표지");
    expect(within(root).getByRole("heading")).toBeInTheDocument();
    expect(root.textContent).not.toMatch(/[\u2014\u2013\u00B7]/);
  });
});

describe("ReportCoverPage 자기평가서 v4.2 확장", () => {
  const steps = [true, true, true, true, false, true] as const;

  it("목차 항목에 비고를 붙일 수 있다(해당 없음)", () => {
    render(
      <ReportCoverPage
        kind="selfevalReport"
        title="수학 자기평가서"
        infoItems={[]}
        areaNotes={{ 3: "해당 없음" }}
      />,
    );

    const areas = screen.getAllByTestId("cover-area");
    expect(areas).toHaveLength(5);
    expect(areas[3]).toHaveTextContent("04");
    expect(areas[3]).toHaveTextContent("해당 없음");
    expect(areas[2]).not.toHaveTextContent("해당 없음");
  });

  it("filledSteps 가 false 인 단계는 채우지 않은 표시를 단다", () => {
    render(
      <ReportCoverPage
        kind="selfevalReport"
        title="제목"
        infoItems={[]}
        filledSteps={steps}
      />,
    );

    const cards = screen.getAllByTestId("cover-step");
    expect(cards.map((c) => c.getAttribute("data-filled"))).toEqual([
      "true",
      "true",
      "true",
      "true",
      "false",
      "true",
    ]);
  });

  it("filledSteps 를 주지 않으면 6단 모두 채워 그린다(다른 리포트 그대로)", () => {
    render(<ReportCoverPage kind="diagnosis" title="제목" infoItems={[]} />);

    for (const card of screen.getAllByTestId("cover-step")) {
      expect(card.getAttribute("data-filled")).toBe("true");
    }
  });

  it("tagline 을 주면 제목 아래에 그린다, 주지 않으면 없다", () => {
    const { rerender } = render(
      <ReportCoverPage
        kind="selfevalReport"
        title="제목"
        infoItems={[]}
        tagline="근거 연계 리포트 포함"
      />,
    );
    expect(screen.getByText("근거 연계 리포트 포함")).toBeInTheDocument();

    rerender(
      <ReportCoverPage kind="selfevalReport" title="제목" infoItems={[]} />,
    );
    expect(screen.queryByText("근거 연계 리포트 포함")).not.toBeInTheDocument();
  });

  it("variant='screen' 은 화면에도 보이고 인쇄에서 A4 한 장으로 나온다", () => {
    const { container } = render(
      <ReportCoverPage
        kind="selfevalReport"
        title="제목"
        infoItems={[]}
        variant="screen"
      />,
    );

    const root = screen.getByLabelText("자기평가 리포트 표지");
    expect(root).not.toHaveClass("hidden");
    expect(root.className).not.toContain("fd-report-sheet");
    expect(container.querySelector("style")?.textContent).toContain("210mm");
  });

  it("샘플의 NEW 배지와 SAMPLE 칩은 그리지 않는다", () => {
    render(
      <ReportCoverPage kind="selfevalReport" title="제목" infoItems={[]} />,
    );

    expect(screen.queryByText("NEW")).not.toBeInTheDocument();
    expect(screen.queryByText(/SAMPLE/)).not.toBeInTheDocument();
  });
});
