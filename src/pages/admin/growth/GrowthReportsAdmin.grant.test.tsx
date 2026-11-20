// 성장 리포트 이용권 부여 다이얼로그. 부여 중에는 닫히지 않고, 바깥을 눌러서는 닫히지 않으며,
// 다시 열면 이전 입력이 비어 있다.

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("./growthReportsApi", () => ({
  fetchGrowthReports: vi.fn(),
  postGrowthGrant: vi.fn(),
  postGrowthRecover: vi.fn(),
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

import GrowthReportsAdmin from "./GrowthReportsAdmin";
import * as api from "./growthReportsApi";

const ITEM = {
  id: "s-1",
  profileId: "p-1",
  studentName: "김학생",
  email: "kim@example.com",
  status: "completed",
  currentStep: 6,
  ledgerId: null,
  ledgerReversedAt: null,
  terminal: null,
  progress: [],
  lastActivityAt: null,
  track: "인문",
  issuedAt: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.fetchGrowthReports).mockResolvedValue({
    ok: true,
    data: { items: [ITEM], total: 1, page: 1, pageSize: 20 },
  } as never);
});

async function openGrant() {
  render(<GrowthReportsAdmin config={{ title: "성장 리포트" }} />);
  await screen.findByText("kim@example.com");
  fireEvent.click(screen.getByRole("button", { name: "이용권 부여" }));
  return screen.findByRole("dialog", { name: "이용권 부여" });
}

async function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText("학생 검색"), {
    target: { value: "김" },
  });
  fireEvent.click(screen.getByRole("button", { name: "검색" }));
  fireEvent.click(await screen.findByText("김학생 / kim@example.com"));
  fireEvent.change(screen.getByLabelText("회차 수"), {
    target: { value: "3" },
  });
  fireEvent.change(screen.getByLabelText("기간(개월)"), {
    target: { value: "6" },
  });
  fireEvent.click(screen.getByRole("button", { name: "부여" }));
}

function pressEscape() {
  fireEvent.keyDown(document.activeElement ?? document.body, {
    key: "Escape",
  });
}

function pressOutside() {
  const backdrop = document.querySelector('[data-slot="dialog-overlay"]');
  expect(backdrop).not.toBeNull();
  fireEvent.pointerDown(backdrop as Element);
  fireEvent.mouseDown(backdrop as Element);
  fireEvent.click(backdrop as Element);
}

describe("GrowthReportsAdmin 이용권 부여 다이얼로그", () => {
  test("부여 요청이 진행 중일 때 Esc 로 닫아도 다이얼로그가 유지된다", async () => {
    vi.mocked(api.postGrowthGrant).mockReturnValue(new Promise(() => {}));
    await openGrant();
    await fillAndSubmit();
    await screen.findByRole("button", { name: "처리 중..." });

    pressEscape();

    expect(
      screen.getByRole("dialog", { name: "이용권 부여" }),
    ).toBeInTheDocument();
  });

  test("부여 요청이 진행 중일 때 바깥을 눌러도 닫히지 않는다", async () => {
    vi.mocked(api.postGrowthGrant).mockReturnValue(new Promise(() => {}));
    await openGrant();
    await fillAndSubmit();
    await screen.findByRole("button", { name: "처리 중..." });

    pressOutside();

    expect(
      screen.getByRole("dialog", { name: "이용권 부여" }),
    ).toBeInTheDocument();
  });

  test("진행 중에는 닫기 버튼이 비활성이다", async () => {
    vi.mocked(api.postGrowthGrant).mockReturnValue(new Promise(() => {}));
    await openGrant();
    await fillAndSubmit();
    await screen.findByRole("button", { name: "처리 중..." });

    expect(screen.getByRole("button", { name: "닫기" })).toBeDisabled();
  });

  test("진행 중이 아니어도 바깥을 눌러서는 닫히지 않는다", async () => {
    await openGrant();

    pressOutside();

    expect(
      screen.getByRole("dialog", { name: "이용권 부여" }),
    ).toBeInTheDocument();
  });

  test("진행 중이 아니면 Esc 로 닫힌다", async () => {
    await openGrant();

    pressEscape();

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "이용권 부여" }),
      ).not.toBeInTheDocument(),
    );
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
});
