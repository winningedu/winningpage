import "@testing-library/jest-dom/vitest";
import { fireEvent, render, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as buildPrintDocumentModule from "@/lib/report/buildPrintDocument";
import * as downloadReportPdfModule from "@/lib/report/downloadReportPdf";
import * as shouldUseServerPdfModule from "@/lib/report/shouldUseServerPdf";
import ReportV3View from "./ReportV3View";
import { FRONT_PAGES } from "./testPages";

const later = (
  <section className="fd-report-sheet" aria-label="later">
    7 이후
  </section>
);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ReportV3View", () => {
  it("starts with the shared image cover filled from the cover data, then the v3 cover page", () => {
    render(<ReportV3View pages={FRONT_PAGES} laterPages={later} />);
    const sheets = Array.from(document.querySelectorAll(".fd-report-sheet"));
    const sharedCover = sheets[0] as HTMLElement;
    expect(sharedCover).toHaveAttribute("aria-label", "학습진단 리포트 표지");
    const info = within(sharedCover).getByTestId("cover-info");
    expect(info).toHaveTextContent("학생명김위닝");
    expect(info).toHaveTextContent("학년고등학교 2학년");
    expect(info).toHaveTextContent("진단일2026. 11. 10");
    expect(sharedCover).not.toHaveTextContent("/ 16");
    expect(sheets[1]).toHaveTextContent(FRONT_PAGES.cover.basis);
  });

  it("the profile name overrides the cover student name on the shared cover", () => {
    render(<ReportV3View pages={FRONT_PAGES} studentName="박프로필" />);
    const info = within(
      document.querySelector(".fd-report-sheet") as HTMLElement,
    ).getByTestId("cover-info");
    expect(info).toHaveTextContent("학생명박프로필");
  });

  it("renders the shared cover, the v3 cover, pages 1 to 6 in order, then the later pages slot", () => {
    render(<ReportV3View pages={FRONT_PAGES} laterPages={later} />);
    const sheets = Array.from(document.querySelectorAll(".fd-report-sheet"));
    expect(sheets).toHaveLength(9);
    expect(sheets[1]).toHaveTextContent(FRONT_PAGES.cover.basis);
    for (let page = 1; page <= 6; page += 1) {
      expect(sheets[page + 1]).toHaveTextContent(`${page} / 16`);
    }
    expect(sheets[8]).toHaveTextContent("7 이후");
    expect(
      within(sheets[2] as HTMLElement).getByRole("heading", { level: 2 }),
    ).toHaveTextContent(FRONT_PAGES.p1.title);
  });

  it("page headers show the PDF titles, not the engine toc names", () => {
    const cover = {
      ...FRONT_PAGES.cover,
      toc: FRONT_PAGES.cover.toc.map((entry) => ({
        ...entry,
        title: "섹션명",
      })),
    };
    render(<ReportV3View pages={{ ...FRONT_PAGES, cover }} />);
    const sheets = Array.from(document.querySelectorAll(".fd-report-sheet"));
    expect(sheets[2]).toHaveTextContent("01진단 요약");
    expect(sheets[5]).toHaveTextContent("04\u0037단계 학습관리 사이클");
    expect(sheets[7]).toHaveTextContent("06학교생활\u00b7입시 준비도");
    expect(sheets[7]).not.toHaveTextContent("섹션명");
  });

  it("surfaces an error when the toc lacks one of pages 1 to 6", () => {
    const cover = {
      ...FRONT_PAGES.cover,
      toc: FRONT_PAGES.cover.toc.filter((entry) => entry.page !== 3),
    };
    expect(() =>
      renderToStaticMarkup(<ReportV3View pages={{ ...FRONT_PAGES, cover }} />),
    ).toThrow("v3 report toc has no page 3");
  });

  it("server PDF html snapshot keeps every A4 sheet inside the print area", () => {
    const html = renderToStaticMarkup(
      <ReportV3View pages={FRONT_PAGES} laterPages={later} />,
    );
    const host = document.createElement("div");
    host.innerHTML = html;
    const root = host.querySelector(".fd-print-area") as HTMLElement;
    expect(root).toHaveClass("fd-print-area");
    expect(root.querySelectorAll(".fd-report-sheet")).toHaveLength(9);
    for (let page = 1; page <= 6; page += 1) {
      expect(html).toContain(`${page} / 16`);
    }
  });

  it("posts the printed v3 html to the server PDF route on mobile or in-app agents", async () => {
    vi.spyOn(shouldUseServerPdfModule, "shouldUseServerPdf").mockReturnValue(
      true,
    );
    vi.spyOn(downloadReportPdfModule, "getReportAccessToken").mockResolvedValue(
      "test-token",
    );
    const buildSpy = vi
      .spyOn(buildPrintDocumentModule, "buildPrintDocument")
      .mockReturnValue("<html>v3</html>");
    const downloadSpy = vi
      .spyOn(downloadReportPdfModule, "downloadReportPdf")
      .mockImplementation(() => {});
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});

    const { getByRole } = render(
      <ReportV3View
        pages={FRONT_PAGES}
        laterPages={later}
        diagnosedAt="2026-11-10T03:00:00.000Z"
      />,
    );
    fireEvent.click(getByRole("button", { name: "PDF 파일로 다운 받기" }));
    await Promise.resolve();
    await Promise.resolve();

    expect(printSpy).not.toHaveBeenCalled();
    expect(buildSpy).toHaveBeenCalledTimes(1);
    expect(downloadSpy.mock.calls[0]?.[0]).toMatchObject({
      html: "<html>v3</html>",
      accessToken: "test-token",
      filename: expect.stringContaining("김위닝학생_20261110"),
    });
  });

  it("clears the PDF button re-enable timer on unmount", () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(shouldUseServerPdfModule, "shouldUseServerPdf").mockReturnValue(
        true,
      );
      vi.spyOn(
        downloadReportPdfModule,
        "getReportAccessToken",
      ).mockResolvedValue(null);
      const { getByRole, unmount } = render(
        <ReportV3View pages={FRONT_PAGES} />,
      );
      fireEvent.click(getByRole("button", { name: "PDF 파일로 다운 받기" }));
      unmount();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("opens the browser print dialog on desktop agents", () => {
    vi.spyOn(shouldUseServerPdfModule, "shouldUseServerPdf").mockReturnValue(
      false,
    );
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});

    const { getByRole } = render(
      <ReportV3View pages={FRONT_PAGES} laterPages={later} />,
    );
    fireEvent.click(getByRole("button", { name: "PDF 파일로 다운 받기" }));

    expect(printSpy).toHaveBeenCalledTimes(1);
  });
});
