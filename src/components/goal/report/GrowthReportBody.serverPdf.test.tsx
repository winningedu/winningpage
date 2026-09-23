// QA 2차 시트 행39·56 — 카카오톡 인앱 등 모바일 UA에서는 "PDF 저장" 버튼이
// react-to-print(iframe 인쇄) 대신 서버 PDF 경로(api/report-pdf.ts)를 타야 한다.
import "@testing-library/jest-dom/vitest";
import { fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as buildPrintDocumentModule from "@/lib/report/buildPrintDocument";
import * as downloadReportPdfModule from "@/lib/report/downloadReportPdf";
import * as shouldUseServerPdfModule from "@/lib/report/shouldUseServerPdf";
import GrowthReportBody, { type GrowthReport } from "./GrowthReportBody";

function makeReport(): GrowthReport {
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
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GrowthReportBody — 서버 PDF 경로 분기", () => {
  it("모바일·인앱 UA면 buildPrintDocument+downloadReportPdf 서버 경로를 탄다", async () => {
    vi.spyOn(shouldUseServerPdfModule, "shouldUseServerPdf").mockReturnValue(
      true,
    );
    vi.spyOn(downloadReportPdfModule, "getReportAccessToken").mockResolvedValue(
      "test-token",
    );
    const buildSpy = vi
      .spyOn(buildPrintDocumentModule, "buildPrintDocument")
      .mockReturnValue("<html>built</html>");
    const downloadSpy = vi
      .spyOn(downloadReportPdfModule, "downloadReportPdf")
      .mockImplementation(() => {});

    const { getByRole } = render(
      <GrowthReportBody
        period="weekly"
        onPeriodChange={() => {}}
        report={makeReport()}
      />,
    );

    fireEvent.click(getByRole("button", { name: "PDF 저장" }));
    await Promise.resolve();
    await Promise.resolve();

    expect(buildSpy).toHaveBeenCalledTimes(1);
    expect(downloadSpy).toHaveBeenCalledTimes(1);
    expect(downloadSpy.mock.calls[0]?.[0]).toMatchObject({
      html: "<html>built</html>",
      accessToken: "test-token",
    });
  });

  it("데스크톱 UA면 downloadReportPdf를 부르지 않는다(기존 react-to-print 경로 유지)", () => {
    vi.spyOn(shouldUseServerPdfModule, "shouldUseServerPdf").mockReturnValue(
      false,
    );
    const downloadSpy = vi.spyOn(downloadReportPdfModule, "downloadReportPdf");

    const { getByRole } = render(
      <GrowthReportBody
        period="weekly"
        onPeriodChange={() => {}}
        report={makeReport()}
      />,
    );

    fireEvent.click(getByRole("button", { name: "PDF 저장" }));

    expect(downloadSpy).not.toHaveBeenCalled();
  });
});
