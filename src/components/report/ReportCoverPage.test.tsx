// 리포트 공용 표지 — QA 2차 시트 행37·51("최종 리포트에 표지를 붙여 달라", 고객사
// "매우중요"). 세 리포트(학습진단·목표관리 성장·수행평가)가 공유하는 프레젠테이션
// 컴포넌트다. 값이 없는 항목은 렌더하지 않는다(폴백 문구를 지어내지 않는다).
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ReportCoverPage from "./ReportCoverPage";

// flow 표지가 인쇄에서 한 페이지를 넘지 않도록 상한을 두는 인쇄 규칙 검사(QA t11
// 커버픽스 — flow 표지가 react-to-print 실측에서 두 페이지를 차지하던 버그).
function getFlowPrintStyle(container: HTMLElement) {
  const styleTag = container.querySelector("style");
  return styleTag?.textContent ?? "";
}

describe("ReportCoverPage", () => {
  it("title을 렌더한다", () => {
    render(
      <ReportCoverPage
        serviceLabel="학습진단"
        title="위닝에듀 학습진단 리포트"
      />,
    );

    expect(screen.getByText("위닝에듀 학습진단 리포트")).toBeInTheDocument();
  });

  it("serviceLabel을 렌더한다", () => {
    render(<ReportCoverPage serviceLabel="학습진단" title="제목" />);

    expect(screen.getByText("학습진단")).toBeInTheDocument();
  });

  it("studentName이 없으면 이름 줄을 렌더하지 않는다", () => {
    render(<ReportCoverPage serviceLabel="학습진단" title="제목" />);

    expect(screen.queryByText(/학생$/)).not.toBeInTheDocument();
  });

  it("studentName이 있으면 'OOO 학생'을 렌더한다", () => {
    render(
      <ReportCoverPage
        serviceLabel="학습진단"
        title="제목"
        studentName="김민준"
      />,
    );

    expect(screen.getByText("김민준 학생")).toBeInTheDocument();
  });

  it("targetMajor·targetUniversity가 모두 없으면 목표 줄을 렌더하지 않는다", () => {
    render(<ReportCoverPage serviceLabel="학습진단" title="제목" />);

    expect(screen.queryByText(/목표/)).not.toBeInTheDocument();
  });

  it("targetUniversity·targetMajor를 모두 주면 한 줄로 합쳐 렌더한다", () => {
    render(
      <ReportCoverPage
        serviceLabel="학습진단"
        title="제목"
        targetUniversity="서울대학교"
        targetMajor="컴퓨터공학과"
      />,
    );

    expect(
      screen.getByText("목표 서울대학교 컴퓨터공학과"),
    ).toBeInTheDocument();
  });

  it("targetMajor만 있으면 그 값만으로 목표 줄을 렌더한다", () => {
    render(
      <ReportCoverPage
        serviceLabel="학습진단"
        title="제목"
        targetMajor="컴퓨터공학과"
      />,
    );

    expect(screen.getByText("목표 컴퓨터공학과")).toBeInTheDocument();
  });

  it("dateLabel이 없으면 렌더하지 않는다", () => {
    render(<ReportCoverPage serviceLabel="학습진단" title="제목" />);

    expect(screen.queryByText("2026.09.10")).not.toBeInTheDocument();
  });

  it("dateLabel이 있으면 렌더한다", () => {
    render(
      <ReportCoverPage
        serviceLabel="학습진단"
        title="제목"
        dateLabel="2026.09.10"
      />,
    );

    expect(screen.getByText("2026.09.10")).toBeInTheDocument();
  });

  it("사이트 로고를 site.brandName을 alt로 렌더한다", () => {
    render(<ReportCoverPage serviceLabel="학습진단" title="제목" />);

    const logo = screen.getByAltText("위닝에듀");
    expect(logo).toHaveAttribute("src", "/images/winning-logo-horizontal.svg");
  });

  it("variant='a4'면 fd-report-sheet 클래스를 붙인다(인쇄 페이지 나눔 계약)", () => {
    render(
      <ReportCoverPage serviceLabel="학습진단" title="제목" variant="a4" />,
    );

    expect(screen.getByLabelText("학습진단 리포트 표지").className).toContain(
      "fd-report-sheet",
    );
  });

  it("기본(variant 생략)이면 fd-report-sheet 클래스를 붙이지 않는다", () => {
    render(<ReportCoverPage serviceLabel="학습진단" title="제목" />);

    expect(
      screen.getByLabelText("학습진단 리포트 표지").className,
    ).not.toContain("fd-report-sheet");
  });

  it("flow 변형은 인쇄에서 높이를 고정하고 넘치는 내용을 자른다", () => {
    // 267mm(= A4 - @page 15mm*2 여백) 그대로 쓰면 Chromium 인쇄 엔진이 해당 박스를
    // 두 페이지로 쪼개는 실제 버그가 있다(QA t11 실측 — react-to-print PDF에서
    // height:250mm 이상 + break-after:page 조합마다 재현, 249mm 이하는 재현 안 됨).
    // 여유를 두고 230mm로 고정한다.
    const { container } = render(
      <ReportCoverPage serviceLabel="학습진단" title="제목" />,
    );

    const printStyle = getFlowPrintStyle(container);
    expect(printStyle).toContain("height: 230mm");
    expect(printStyle).toContain("max-height: 230mm");
    expect(printStyle).toContain("overflow: hidden");
    expect(printStyle).toContain("break-after: page");
  });

  it("일러스트 SVG는 영역 안에 들어오도록 preserveAspectRatio를 meet으로 맞춘다", () => {
    const { container } = render(
      <ReportCoverPage serviceLabel="학습진단" title="제목" />,
    );

    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("preserveAspectRatio", "xMaxYMax meet");
  });

  it("표지 푸터는 report-print.css의 전역 footer 태그 인쇄 숨김 규칙에 걸리지 않는다", () => {
    // report-print.css `@media print { header, footer { display: none !important } }`는
    // SiteLayout 헤더·푸터를 지우려는 규칙인데 태그 셀렉터라 리터럴 <footer> 요소를 전부
    // 잡는다. 실측(QA t11)에서 표지 푸터가 인쇄에서 완전히 안 보였다 — <footer> 대신
    // 다른 태그를 써서 이 전역 셀렉터를 피한다.
    const { container } = render(
      <ReportCoverPage
        serviceLabel="학습진단"
        title="제목"
        studentName="김민준"
      />,
    );

    expect(container.querySelector("footer")).not.toBeInTheDocument();
    expect(
      screen.getByText("김민준 학생").closest(".fd-report-cover-footer"),
    ).not.toBeNull();
  });
});
