import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("./inquirySessionsApi", () => ({
  fetchInquirySessions: vi.fn(),
  postInquiryGrant: vi.fn(),
  postInquiryRecover: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        or: () => ({
          limit: () =>
            Promise.resolve({
              data: [{ id: "p-1", name: "김학생", email: "kim@example.com" }],
              error: null,
            }),
        }),
      }),
    }),
  },
}));

import InquirySessionsAdmin from "./InquirySessionsAdmin";
import * as api from "./inquirySessionsApi";
import type { InquirySessionItem } from "./inquirySessionsRow";

const ITEM: InquirySessionItem = {
  id: "s-1",
  profileId: "p-1",
  studentName: "김학생",
  email: "kim@example.com",
  status: "completed",
  currentStep: 6,
  subject: "수학",
  topicTitle: "확률",
  completedAt: null,
  lastActivityAt: null,
  ledgerId: null,
  ledgerReversedAt: null,
  terminal: null,
  generation: { modes: {}, terminal: null },
  evaluationCount: 0,
  topicRoundCount: 0,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.fetchInquirySessions).mockResolvedValue({
    ok: true,
    data: { items: [ITEM], total: 1, page: 1, pageSize: 20 },
  });
});

describe("InquirySessionsAdmin 목록", () => {
  test("첫 칸의 버튼을 눌러 세션 상세를 연다", async () => {
    render(<InquirySessionsAdmin config={{ title: "탐구 세션" }} />);

    fireEvent.click(await screen.findByRole("button", { name: "김학생" }));

    expect(
      await screen.findByRole("dialog", { name: /김학생 \(완료\)/ }),
    ).toBeInTheDocument();
  });

  test("열 머리글은 scope col 을 가진다", async () => {
    render(<InquirySessionsAdmin config={{ title: "탐구 세션" }} />);
    const header = await screen.findByRole("columnheader", { name: "학생" });
    expect(header).toHaveAttribute("scope", "col");
  });
});

describe("InquirySessionsAdmin 이용권 부여 다이얼로그", () => {
  async function openGrant() {
    render(<InquirySessionsAdmin config={{ title: "탐구 세션" }} />);
    await screen.findByText("kim@example.com");
    fireEvent.click(screen.getByRole("button", { name: "이용권 부여" }));
    return screen.findByRole("dialog", { name: "이용권 부여" });
  }

  async function fillAndSubmit() {
    fireEvent.click(screen.getByRole("button", { name: "검색" }));
    fireEvent.change(screen.getByLabelText("학생 검색"), {
      target: { value: "김" },
    });
    fireEvent.click(screen.getByRole("button", { name: "검색" }));
    fireEvent.click(await screen.findByText("김학생 / kim@example.com"));
    fireEvent.change(screen.getByLabelText("세션 수"), {
      target: { value: "3" },
    });
    fireEvent.click(screen.getByRole("button", { name: "부여" }));
  }

  test("부여 요청이 진행 중일 때 Esc 로 닫아도 다이얼로그가 유지된다", async () => {
    vi.mocked(api.postInquiryGrant).mockReturnValue(new Promise(() => {}));
    await openGrant();
    await fillAndSubmit();
    await screen.findByRole("button", { name: "처리 중..." });

    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });

    expect(
      screen.getByRole("dialog", { name: "이용권 부여" }),
    ).toBeInTheDocument();
  });

  test("진행 중에는 닫기 버튼이 비활성이다", async () => {
    vi.mocked(api.postInquiryGrant).mockReturnValue(new Promise(() => {}));
    await openGrant();
    await fillAndSubmit();
    await screen.findByRole("button", { name: "처리 중..." });

    expect(screen.getByRole("button", { name: "닫기" })).toBeDisabled();
  });

  test("진행 중이 아니면 Esc 로 닫힌다", async () => {
    await openGrant();
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "이용권 부여" }),
      ).not.toBeInTheDocument(),
    );
  });

  test("바깥 클릭으로는 닫히지 않는다", async () => {
    await openGrant();
    const backdrop = document.querySelector('[data-slot="dialog-overlay"]');
    expect(backdrop).not.toBeNull();
    fireEvent.pointerDown(backdrop as Element);
    fireEvent.mouseDown(backdrop as Element);
    fireEvent.click(backdrop as Element);
    expect(
      screen.getByRole("dialog", { name: "이용권 부여" }),
    ).toBeInTheDocument();
  });

  test("다시 열면 이전 입력이 비어 있다", async () => {
    await openGrant();
    fireEvent.change(screen.getByLabelText("학생 검색"), {
      target: { value: "김" },
    });
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "이용권 부여" }),
      ).not.toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "이용권 부여" }));
    expect(await screen.findByLabelText("학생 검색")).toHaveValue("");
  });

  test("무제한을 체크하면 세션 수 입력이 사라지고 quota 는 null 로 보낸다", async () => {
    vi.mocked(api.postInquiryGrant).mockResolvedValue({
      ok: true,
      data: { grantId: "g", quota: {} },
    });
    await openGrant();
    fireEvent.click(screen.getByRole("button", { name: "검색" }));
    fireEvent.change(screen.getByLabelText("학생 검색"), {
      target: { value: "김" },
    });
    fireEvent.click(screen.getByRole("button", { name: "검색" }));
    fireEvent.click(await screen.findByText("김학생 / kim@example.com"));
    fireEvent.click(screen.getByLabelText("무제한"));
    expect(screen.queryByLabelText("세션 수")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("만료일(비우면 무기한)"), {
      target: { value: "2027-01-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: "부여" }));
    await waitFor(() => expect(api.postInquiryGrant).toHaveBeenCalled());
    expect(api.postInquiryGrant).toHaveBeenCalledWith(
      expect.objectContaining({ sessionQuota: null }),
    );
  });
});
