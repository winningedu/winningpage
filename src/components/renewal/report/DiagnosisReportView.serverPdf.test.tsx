// QA 2차 시트 행39·56 — 카카오톡 인앱 등 모바일 UA에서는 "PDF 파일로 다운 받기"가
// window.print() 대신 서버 PDF 경로(api/report-pdf.ts)를 타야 한다. 데스크톱은 기존
// window.print() 경로를 그대로 유지한다(벡터 품질·기존 QA 통과분 보존).
import "@testing-library/jest-dom/vitest";
import { fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildReportFromInput } from "@/lib/diagnosisReportBuild";
import { makeInput } from "@/lib/diagnosisScoringTestFixtures";
import * as buildPrintDocumentModule from "@/lib/report/buildPrintDocument";
import * as downloadReportPdfModule from "@/lib/report/downloadReportPdf";
import * as shouldUseServerPdfModule from "@/lib/report/shouldUseServerPdf";
import DiagnosisReportView, {
  type DiagnosisReportData,
} from "./DiagnosisReportView";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DiagnosisReportView — 서버 PDF 경로 분기", () => {
  it("모바일·인앱 UA(shouldUseServerPdf=true)면 buildPrintDocument+downloadReportPdf 서버 경로를 탄다", async () => {
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
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});

    const data = buildReportFromInput(makeInput()) as DiagnosisReportData;
    const { findAllByRole } = render(<DiagnosisReportView data={data} />);

    const buttons = await findAllByRole("button", {
      name: "PDF 파일로 다운 받기",
    });
    fireEvent.click(buttons[0] as HTMLButtonElement);

    // getReportAccessToken()이 비동기라 마이크로태스크를 흘려보낸다.
    await Promise.resolve();
    await Promise.resolve();

    expect(printSpy).not.toHaveBeenCalled();
    expect(buildSpy).toHaveBeenCalledTimes(1);
    expect(downloadSpy).toHaveBeenCalledTimes(1);
    expect(downloadSpy.mock.calls[0]?.[0]).toMatchObject({
      html: "<html>built</html>",
      accessToken: "test-token",
    });
  });

  it("데스크톱 UA(shouldUseServerPdf=false)면 기존 window.print() 경로를 그대로 쓴다", () => {
    vi.spyOn(shouldUseServerPdfModule, "shouldUseServerPdf").mockReturnValue(
      false,
    );
    const downloadSpy = vi.spyOn(downloadReportPdfModule, "downloadReportPdf");
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});

    const data = buildReportFromInput(makeInput()) as DiagnosisReportData;
    const { getAllByRole } = render(<DiagnosisReportView data={data} />);

    fireEvent.click(
      getAllByRole("button", {
        name: "PDF 파일로 다운 받기",
      })[0] as HTMLButtonElement,
    );

    expect(printSpy).toHaveBeenCalledTimes(1);
    expect(downloadSpy).not.toHaveBeenCalled();
  });
});
