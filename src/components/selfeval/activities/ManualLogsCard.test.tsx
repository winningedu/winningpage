import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { ManualMemo } from "@/lib/selfeval/api";

const api = vi.hoisted(() => ({
  manualLogsList: vi.fn(),
  manualLogsUpload: vi.fn(),
  manualLogsUpdate: vi.fn(),
  manualLogsSetIncluded: vi.fn(),
  manualLogsDelete: vi.fn(),
}));
vi.mock("@/lib/selfeval/api", () => api);

import ManualLogsCard from "./ManualLogsCard";

const memo = (over: Partial<ManualMemo> = {}): ManualMemo => ({
  id: "m1",
  writtenAt: "2026-04-03",
  text: "광합성 실험을 했다",
  ocr: true,
  confirmed: false,
  included: true,
  nameNotice: false,
  ...over,
});

const ok = <T,>(data: T) => ({ kind: "ok" as const, data });

function renderCard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ManualLogsCard sessionId="s1" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  api.manualLogsList.mockResolvedValue(ok({ ok: true, memos: [] }));
});
afterEach(() => vi.clearAllMocks());

describe("ManualLogsCard", () => {
  test("업로드 칸에 생활기록부 원문 고지를 보인다", async () => {
    renderCard();
    expect(
      await screen.findByText("생활기록부 원문은 받지 않아요"),
    ).toBeTruthy();
  });

  test("붙여넣은 글을 올리고 메모를 목록에 보인다", async () => {
    api.manualLogsUpload.mockResolvedValue(
      ok({ ok: true, memos: [memo()], personNameDetected: false }),
    );
    renderCard();
    fireEvent.change(await screen.findByLabelText("글 붙여넣기"), {
      target: { value: "광합성 실험을 했다" },
    });
    fireEvent.click(screen.getByRole("button", { name: "붙여넣은 글 올리기" }));
    await waitFor(() =>
      expect(api.manualLogsUpload).toHaveBeenCalledWith("s1", {
        text: "광합성 실험을 했다",
      }),
    );
    expect(await screen.findByDisplayValue("광합성 실험을 했다")).toBeTruthy();
  });

  test("서버가 거절하면 이유를 그대로 보인다", async () => {
    api.manualLogsUpload.mockResolvedValue({
      kind: "error",
      status: 422,
      code: "RECORD_BOOK_DETECTED",
      message: "생활기록부 양식으로 보여서 올릴 수 없어요",
    });
    renderCard();
    fireEvent.change(await screen.findByLabelText("글 붙여넣기"), {
      target: { value: "x" },
    });
    fireEvent.click(screen.getByRole("button", { name: "붙여넣은 글 올리기" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "생활기록부 양식",
    );
  });

  test("이름 안내가 있는 메모에 안내를 보인다", async () => {
    api.manualLogsList.mockResolvedValue(
      ok({ ok: true, memos: [memo({ nameNotice: true })] }),
    );
    renderCard();
    expect(await screen.findByText(/지우거나 다른 말로 바꾼/)).toBeTruthy();
  });

  test("날짜가 없으면 확인 버튼이 막힌다", async () => {
    api.manualLogsList.mockResolvedValue(
      ok({ ok: true, memos: [memo({ writtenAt: null })] }),
    );
    renderCard();
    const button = await screen.findByRole("button", { name: "확인" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  test("확인을 누르면 날짜와 글과 함께 확인으로 보낸다", async () => {
    api.manualLogsList.mockResolvedValue(ok({ ok: true, memos: [memo()] }));
    api.manualLogsUpdate.mockResolvedValue(
      ok({ ok: true, memo: memo({ confirmed: true }) }),
    );
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "확인" }));
    await waitFor(() =>
      expect(api.manualLogsUpdate).toHaveBeenCalledWith("s1", "m1", {
        writtenAt: "2026-04-03",
        text: "광합성 실험을 했다",
        confirmed: true,
      }),
    );
  });

  test("확인 실패 안내를 메모 곁에 보인다", async () => {
    api.manualLogsList.mockResolvedValue(ok({ ok: true, memos: [memo()] }));
    api.manualLogsUpdate.mockResolvedValue({
      kind: "error",
      status: 400,
      code: "DATE_OUT_OF_YEAR",
      message: "2026학년도 안의 날짜만 쓸 수 있어요.",
    });
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "확인" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "2026학년도",
    );
  });

  test("포함 해제와 삭제", async () => {
    api.manualLogsList.mockResolvedValue(ok({ ok: true, memos: [memo()] }));
    api.manualLogsSetIncluded.mockResolvedValue(
      ok({ ok: true, memo: memo({ included: false }) }),
    );
    api.manualLogsDelete.mockResolvedValue(ok({ ok: true }));
    renderCard();
    fireEvent.click(await screen.findByLabelText("근거에 포함"));
    await waitFor(() =>
      expect(api.manualLogsSetIncluded).toHaveBeenCalledWith("s1", "m1", false),
    );
    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    await waitFor(() =>
      expect(api.manualLogsDelete).toHaveBeenCalledWith("s1", "m1"),
    );
  });
});
