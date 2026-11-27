// 성장 리포트 이용권 부여 다이얼로그. 학생 검색은 서버 검색 API 를 쓰고, 부여 중에는 닫히지 않으며,
// 바깥을 눌러서는 닫히지 않고, 다시 열면 이전 입력이 비어 있다.

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/http/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/http/client")>()),
  api: (await import("./fakeApi")).fakeApi,
}));

import { ApiError } from "@/lib/http/client";
import { callsTo, on, resetApi } from "./fakeApi";
import { LIST, listBody, renderGrowth } from "./testKit";

const GRANT = "admin/growth-grant";
const SEARCH = "admin/students/search";

beforeEach(() => {
  resetApi();
  on("GET", LIST, listBody());
  on("GET", SEARCH, {
    items: [
      { id: "p-1", name: "김학생", email: "kim@example.com", isAdmin: false },
    ],
  });
});

afterEach(cleanup);

async function openGrant() {
  renderGrowth();
  await screen.findByText("kim@example.com");
  fireEvent.click(screen.getByRole("button", { name: "이용권 부여" }));
  return screen.findByRole("dialog", { name: "이용권 부여" });
}

async function pickStudent() {
  fireEvent.change(screen.getByLabelText("학생 검색"), {
    target: { value: "김" },
  });
  fireEvent.click(screen.getByRole("button", { name: "검색" }));
  fireEvent.click(await screen.findByText("김학생 / kim@example.com"));
}

async function fillAndSubmit() {
  await pickStudent();
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

describe("GrowthReportsAdmin 학생 검색", () => {
  test("검색 버튼을 누르면 서버 검색 API 에 메뉴 키와 함께 묻고 결과를 보여준다", async () => {
    await openGrant();
    expect(callsTo("GET", SEARCH)).toHaveLength(0);

    await pickStudent();

    expect(callsTo("GET", SEARCH)[0]?.options.searchParams).toEqual({
      q: "김",
      section: "growthReports",
    });
    expect(
      screen.getByText("선택된 학생: 김학생 (kim@example.com)"),
    ).toBeVisible();
  });

  test("결과가 없으면 안내한다", async () => {
    on("GET", SEARCH, { items: [] });
    await openGrant();
    fireEvent.change(screen.getByLabelText("학생 검색"), {
      target: { value: "없음" },
    });
    fireEvent.click(screen.getByRole("button", { name: "검색" }));
    expect(await screen.findByText("검색 결과가 없습니다.")).toBeVisible();
  });

  test("검색이 실패하면 학생 조회 실패를 알린다", async () => {
    on("GET", SEARCH, () => {
      throw new ApiError({ status: 500, code: "INTERNAL_ERROR", detail: "x" });
    });
    await openGrant();
    fireEvent.change(screen.getByLabelText("학생 검색"), {
      target: { value: "김" },
    });
    fireEvent.click(screen.getByRole("button", { name: "검색" }));
    expect(await screen.findByText("학생 조회에 실패했습니다.")).toBeVisible();
  });
});

// 서버가 돌려주는 회차 현황(shared/program-quota/contract.ts)과 같은 모양이다.
const QUOTA = {
  quotaTotal: 3,
  quotaUsed: 1,
  quotaRemaining: 2,
  planEndsAt: null,
  planLabel: "수동 부여",
};

describe("GrowthReportsAdmin 이용권 부여 다이얼로그", () => {
  test("부여하면 본문을 보내고 quota 를 보여주며 목록을 다시 읽는다", async () => {
    on("POST", GRANT, { grantId: "g-1", quota: QUOTA });
    await openGrant();
    await fillAndSubmit();

    expect(await screen.findByText(/부여했습니다\. quota:/)).toHaveTextContent(
      JSON.stringify(QUOTA),
    );
    expect(callsTo("POST", GRANT)[0]?.options.json).toEqual({
      profileId: "p-1",
      sessionQuota: 3,
      months: 6,
    });
    await waitFor(() => expect(callsTo("GET", LIST)).toHaveLength(2));
  });

  test("서버가 거절하면 detail 을 보여준다", async () => {
    on("POST", GRANT, () => {
      throw new ApiError({
        status: 409,
        code: "CONFLICT",
        detail: "이미 부여된 이용권입니다.",
      });
    });
    await openGrant();
    await fillAndSubmit();
    expect(await screen.findByText("이미 부여된 이용권입니다.")).toBeVisible();
  });

  test("학생을 고르지 않으면 요청하지 않는다", async () => {
    await openGrant();
    fireEvent.click(screen.getByRole("button", { name: "부여" }));
    expect(await screen.findByText("학생을 선택해 주세요.")).toBeVisible();
    expect(callsTo("POST", GRANT)).toHaveLength(0);
  });

  test("부여 요청이 진행 중일 때 Esc 로 닫아도 다이얼로그가 유지된다", async () => {
    on("POST", GRANT, () => new Promise(() => {}));
    await openGrant();
    await fillAndSubmit();
    await screen.findByRole("button", { name: "처리 중..." });

    pressEscape();

    expect(
      screen.getByRole("dialog", { name: "이용권 부여" }),
    ).toBeInTheDocument();
  });

  test("부여 요청이 진행 중일 때 바깥을 눌러도 닫히지 않는다", async () => {
    on("POST", GRANT, () => new Promise(() => {}));
    await openGrant();
    await fillAndSubmit();
    await screen.findByRole("button", { name: "처리 중..." });

    pressOutside();

    expect(
      screen.getByRole("dialog", { name: "이용권 부여" }),
    ).toBeInTheDocument();
  });

  test("진행 중에는 닫기 버튼이 비활성이다", async () => {
    on("POST", GRANT, () => new Promise(() => {}));
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

  test("다시 열면 이전 입력과 검색 결과가 비어 있다", async () => {
    await openGrant();
    await pickStudent();
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "이용권 부여" }),
      ).not.toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "이용권 부여" }));
    expect(await screen.findByLabelText("학생 검색")).toHaveValue("");
    expect(screen.getByText("선택된 학생: 없음")).toBeVisible();
    expect(screen.queryByText("김학생 / kim@example.com")).toBeNull();
  });
});
