import { act, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const { tokenMock, downloadMock, serverMock } = vi.hoisted(() => ({
  tokenMock: vi.fn(),
  downloadMock: vi.fn(),
  serverMock: vi.fn(),
}));

vi.mock("react-to-print", () => ({ useReactToPrint: () => vi.fn() }));
vi.mock("./downloadReportPdf", () => ({
  getReportAccessToken: tokenMock,
  downloadReportPdf: downloadMock,
}));
vi.mock("./shouldUseServerPdf", () => ({ shouldUseServerPdf: serverMock }));
vi.mock("./buildPrintDocument", () => ({
  buildPrintDocument: () => "<html/>",
}));

import { ToastProvider } from "@/context/ToastContext";
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
  vi.restoreAllMocks();
  vi.useRealTimers();
  for (const m of [tokenMock, downloadMock, serverMock]) m.mockReset();
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
