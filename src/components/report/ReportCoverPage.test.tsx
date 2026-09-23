// 리포트 공용 표지 — QA 2차 시트 행37·51("최종 리포트에 표지를 붙여 달라", 고객사
// "매우중요"). 세 리포트(학습진단·목표관리 성장·수행평가)가 공유하는 프레젠테이션
// 컴포넌트다. 값이 없는 항목은 렌더하지 않는다(폴백 문구를 지어내지 않는다).
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ReportCoverPage from "./ReportCoverPage";

describe("ReportCoverPage", () => {
  it("title을 렌더한다", () => {
    render(
      <ReportCoverPage serviceLabel="학습진단" title="위닝에듀 학습진단 리포트" />,
    );

    expect(
      screen.getByText("위닝에듀 학습진단 리포트"),
    ).toBeInTheDocument();
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

    expect(screen.getByText("목표 서울대학교 컴퓨터공학과")).toBeInTheDocument();
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
});
