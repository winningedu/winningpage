import { act, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const { tokenMock, downloadMock, serverMock, printMock, printOptions } =
  vi.hoisted(() => ({
    tokenMock: vi.fn(),
    downloadMock: vi.fn(),
    serverMock: vi.fn(),
    printMock: vi.fn(),
    printOptions: { current: null as Record<string, unknown> | null },
  }));

vi.mock("react-to-print", () => ({
  useReactToPrint: (options: Record<string, unknown>) => {
    printOptions.current = options;
    return printMock;
  },
}));
vi.mock("./downloadReportPdf", () => ({
  getReportAccessToken: tokenMock,
  downloadReportPdf: downloadMock,
}));
vi.mock("./shouldUseServerPdf", () => ({ shouldUseServerPdf: serverMock }));
vi.mock("./buildPrintDocument", () => ({
  buildPrintDocument: () => "<html/>",
}));

import { ToastProvider } from "@/context/ToastContext";
import { REPORT_PRINT_PAGE_BASE_STYLE } from "./printPageStyle";
import { useReportPdfSave } from "./useReportPdfSave";

const wrapper = ({ children }: { children: ReactNode }) => (
  <ToastProvider>{children}</ToastProvider>
);

function setup() {
  const hook = renderHook(() => useReportPdfSave("report"), { wrapper });
  // 인쇄 대상 요소가 있어야 서버 경로가 시작된다.
  hook.result.current.contentRef.current = document.createElement("div");
  return hook;
}

beforeEach(() => {
  serverMock.mockReturnValue(true);
  tokenMock.mockResolvedValue("token");
});

afterEach(() => {
  document.head.innerHTML = "";
  vi.restoreAllMocks();
  vi.useRealTimers();
  for (const m of [tokenMock, downloadMock, serverMock, printMock])
    m.mockReset();
});

describe("useReportPdfSave 서버 PDF 경로", () => {
  test("토큰 조회나 요청이 거부되면 토스트로 알리고 버튼을 바로 복구한다", async () => {
    tokenMock.mockRejectedValue(new Error("network"));
    const { result } = setup();
    await act(async () => {
      result.current.save();
    });
    expect(await screen.findByText(/PDF를 만들지 못했어요/)).toBeVisible();
    expect(result.current.isPreparing).toBe(false);
  });

  test("문서가 너무 커서 요청이 던져도 토스트로 알린다", async () => {
    downloadMock.mockImplementation(() => {
      throw new Error("PDF 문서가 너무 큽니다");
    });
    const { result } = setup();
    await act(async () => {
      result.current.save();
    });
    expect(await screen.findByText(/PDF를 만들지 못했어요/)).toBeVisible();
    expect(result.current.isPreparing).toBe(false);
  });

  test("언마운트하면 복구 타이머를 정리한다", async () => {
    const clear = vi.spyOn(window, "clearTimeout");
    const { result, unmount } = setup();
    await act(async () => {
      result.current.save();
    });
    expect(result.current.isPreparing).toBe(true);
    clear.mockClear();
    unmount();
    expect(clear).toHaveBeenCalled();
  });
});

describe("useReportPdfSave 데스크톱 인쇄 경로", () => {
  const INJECTED = "style[data-report-print-css]";

  test("전역 스타일 복사를 끄고 pageStyle은 베이스 인쇄 스타일만 넘긴다", () => {
    serverMock.mockReturnValue(false);
    setup();
    expect(printOptions.current?.ignoreGlobalStyles).toBe(true);
    expect(printOptions.current?.pageStyle).toBe(REPORT_PRINT_PAGE_BASE_STYLE);
  });

  test("클릭 시점의 문서 CSS를 <style>로 콘텐츠에 심은 뒤 인쇄하고 베이스 스타일을 맨 끝에 둔다", () => {
    serverMock.mockReturnValue(false);
    const { result } = setup();
    // 마운트 뒤에 늘어난 시트도 클릭 시점에는 포함돼야 한다.
    const style = document.createElement("style");
    style.textContent = ".late { color: red; }";
    document.head.appendChild(style);
    const root = result.current.contentRef.current as HTMLElement;
    let injected: string | undefined;
    printMock.mockImplementation(() => {
      injected = root.querySelector(INJECTED)?.textContent ?? undefined;
    });

    act(() => {
      result.current.save();
    });

    expect(printMock).toHaveBeenCalledTimes(1);
    expect(injected).toContain(".late");
    expect(injected?.endsWith(REPORT_PRINT_PAGE_BASE_STYLE)).toBe(true);
  });

  test("onAfterPrint과 onPrintError에서 심은 <style>을 걷어내고, 두 번 눌러도 하나만 남는다", () => {
    serverMock.mockReturnValue(false);
    const { result } = setup();
    const root = result.current.contentRef.current as HTMLElement;

    act(() => {
      result.current.save();
      result.current.save();
    });
    expect(root.querySelectorAll(INJECTED)).toHaveLength(1);

    (printOptions.current?.onAfterPrint as (() => void) | undefined)?.();
    expect(root.querySelector(INJECTED)).toBeNull();

    act(() => {
      result.current.save();
    });
    (printOptions.current?.onPrintError as (() => void) | undefined)?.();
    expect(root.querySelector(INJECTED)).toBeNull();
  });
});
