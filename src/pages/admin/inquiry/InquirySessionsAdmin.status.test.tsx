// 목록의 불러오는 중 상자는 role=status, 오류 상자는 role=alert 로 낭독된다.

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

vi.mock("./api", () => ({
  fetchInquirySessions: vi.fn(),
  postInquiryGrant: vi.fn(),
  postInquiryRecover: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({ supabase: { from: vi.fn() } }));

import * as api from "./api";
import InquirySessionsAdmin from "./InquirySessionsAdmin";

beforeEach(() => {
  vi.resetAllMocks();
});

test("불러오는 중에는 role=status 로 알린다", () => {
  vi.mocked(api.fetchInquirySessions).mockReturnValue(new Promise(() => {}));

  render(<InquirySessionsAdmin config={{ title: "탐구 세션" }} />);

  expect(screen.getByRole("status")).toHaveTextContent(
    "데이터를 불러오는 중입니다.",
  );
});

test("조회에 실패하면 role=alert 로 알린다", async () => {
  vi.mocked(api.fetchInquirySessions).mockResolvedValue({
    ok: false,
    message: "조회에 실패했습니다.",
  });

  render(<InquirySessionsAdmin config={{ title: "탐구 세션" }} />);

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "조회에 실패했습니다.",
  );
});
