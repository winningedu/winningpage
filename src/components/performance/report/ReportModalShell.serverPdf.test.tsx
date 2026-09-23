// QA 2차 시트 행39·56 — 카카오톡 인앱 등 모바일 UA에서는 ctx.print가
// react-to-print(iframe 인쇄) 대신 서버 PDF 경로(api/report-pdf.ts)를 타야 한다.
import "@testing-library/jest-dom/vitest";
import { fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as buildPrintDocumentModule from "@/lib/report/buildPrintDocument";
import * as downloadReportPdfModule from "@/lib/report/downloadReportPdf";
import * as shouldUseServerPdfModule from "@/lib/report/shouldUseServerPdf";
import ReportModalShell from "./ReportModalShell";

const noop = () => {};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ReportModalShell — 서버 PDF 경로 분기", () => {
  it("모바일·인앱 UA면 ctx.print가 buildPrintDocument+downloadReportPdf 서버 경로를 탄다", async () => {
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
      <ReportModalShell
        open
        title="평가 리포트"
        documentTitle="평가리포트"
        scrollLabel="본문"
        onClose={noop}
        footer={({ print }) => (
          <button type="button" onClick={print}>
            PDF 저장
          </button>
        )}
      >
        본문
      </ReportModalShell>,
    );

    fireEvent.click(getByRole("button", { name: "PDF 저장" }));
    await Promise.resolve();
    await Promise.resolve();

    expect(buildSpy).toHaveBeenCalledTimes(1);
    expect(downloadSpy).toHaveBeenCalledTimes(1);
    expect(downloadSpy.mock.calls[0]?.[0]).toMatchObject({
      html: "<html>built</html>",
      filename: "평가리포트",
      accessToken: "test-token",
    });
  });

  it("documentTitle이 없으면 모바일·인앱 UA여도 서버 경로 대신 기존 인쇄 경로로 떨어진다", async () => {
    // QA — 서버 PDF 경로는 파일명이 필수다. 폴백 문자열("리포트")로 채워 보내는 대신,
    // documentTitle이 없으면 애초에 서버 경로를 타지 않고 기존 react-to-print로 둔다.
    // accessToken·buildPrintDocument는 위 테스트와 동일하게 성공 경로로 mock해
    // "documentTitle 부재" 자체가 분기 원인임을 분리해서 본다.
    vi.spyOn(shouldUseServerPdfModule, "shouldUseServerPdf").mockReturnValue(
      true,
    );
    vi.spyOn(downloadReportPdfModule, "getReportAccessToken").mockResolvedValue(
      "test-token",
    );
    vi.spyOn(buildPrintDocumentModule, "buildPrintDocument").mockReturnValue(
      "<html>built</html>",
    );
    const downloadSpy = vi
      .spyOn(downloadReportPdfModule, "downloadReportPdf")
      .mockImplementation(() => {});

    const { getByRole } = render(
      <ReportModalShell
        open
        title="평가 리포트"
        scrollLabel="본문"
        onClose={noop}
        footer={({ print }) => (
          <button type="button" onClick={print}>
            PDF 저장
          </button>
        )}
      >
        본문
      </ReportModalShell>,
    );

    fireEvent.click(getByRole("button", { name: "PDF 저장" }));
    await Promise.resolve();
    await Promise.resolve();

    expect(downloadSpy).not.toHaveBeenCalled();
  });

  it("데스크톱 UA면 downloadReportPdf를 부르지 않는다(기존 react-to-print 경로 유지)", () => {
    vi.spyOn(shouldUseServerPdfModule, "shouldUseServerPdf").mockReturnValue(
      false,
    );
    const downloadSpy = vi.spyOn(downloadReportPdfModule, "downloadReportPdf");

    const { getByRole } = render(
      <ReportModalShell
        open
        title="평가 리포트"
        documentTitle="평가리포트"
        scrollLabel="본문"
        onClose={noop}
        footer={({ print }) => (
          <button type="button" onClick={print}>
            PDF 저장
          </button>
        )}
      >
        본문
      </ReportModalShell>,
    );

    fireEvent.click(getByRole("button", { name: "PDF 저장" }));

    expect(downloadSpy).not.toHaveBeenCalled();
  });
});
