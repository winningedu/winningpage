// 자기평가 이용권 부여 다이얼로그. 학생 검색은 공용 검색 API 를 쓰고, 부여 중에는 닫히지 않으며,
// 바깥을 눌러서는 닫히지 않고, 다시 열면 이전 입력이 비어 있다.

import "@testing-library/jest-dom/vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock(
  "@/lib/http/client",
  async () => (await import("./fakeApi")).clientMock,
);

import { callsTo, FakeApiError, on, resetApi } from "./fakeApi";
import { LIST_PATH, listBody, renderSelfeval } from "./testKit";

const SEARCH_PATH = "admin/students/search";
const GRANT_PATH = "admin/selfeval-grant";

beforeEach(() => {
  resetApi();
  on("GET", LIST_PATH, listBody());
  on("GET", SEARCH_PATH, {
    items: [
      { id: "p-1", name: "김학생", email: "kim@example.com", isAdmin: false },
    ],
  });
  on("POST", GRANT_PATH, { grantId: "g-1", quota: { quotaTotal: 3 } });
});

async function openGrant() {
  renderSelfeval();
  await screen.findByText("choi@example.com");
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

describe("SelfevalSessionsAdmin 이용권 부여 다이얼로그", () => {
  test("학생 검색은 자기평가 세션 구분으로 공용 학생 검색 API 를 부른다", async () => {
    await openGrant();
    await pickStudent();

    expect(callsTo("GET", SEARCH_PATH)[0]?.options).toMatchObject({
      searchParams: { q: "김", section: "selfevalSessions" },
      signal: expect.any(AbortSignal),
    });
    expect(
      screen.getByText("선택된 학생: 김학생 (kim@example.com)"),
    ).toBeInTheDocument();
  });

  test("검색어가 비어 있으면 요청하지 않는다", async () => {
    await openGrant();
    fireEvent.click(screen.getByRole("button", { name: "검색" }));
    expect(callsTo("GET", SEARCH_PATH)).toHaveLength(0);
  });

  test("검색 결과가 없으면 안내한다", async () => {
    on("GET", SEARCH_PATH, { items: [] });
    await openGrant();
    fireEvent.change(screen.getByLabelText("학생 검색"), {
      target: { value: "없음" },
    });
    fireEvent.click(screen.getByRole("button", { name: "검색" }));
    expect(
      await screen.findByText("검색 결과가 없습니다."),
    ).toBeInTheDocument();
  });

  test("검색이 실패하면 서버 안내를 보인다", async () => {
    on("GET", SEARCH_PATH, () => {
      throw new FakeApiError(403, "FORBIDDEN", "권한이 없습니다.");
    });
    await openGrant();
    fireEvent.change(screen.getByLabelText("학생 검색"), {
      target: { value: "김" },
    });
    fireEvent.click(screen.getByRole("button", { name: "검색" }));
    expect(await screen.findByText("권한이 없습니다.")).toBeInTheDocument();
  });

  test("학생을 고르지 않으면 요청하지 않고 안내한다", async () => {
    await openGrant();
    fireEvent.click(screen.getByRole("button", { name: "부여" }));
    expect(screen.getByText("학생을 선택해 주세요.")).toBeInTheDocument();
    expect(callsTo("POST", GRANT_PATH)).toHaveLength(0);
  });

  test("부여하면 본문을 보내고 결과 quota 를 보인다", async () => {
    await openGrant();
    await fillAndSubmit();

    expect(
      await screen.findByText(/부여했습니다. quota: \{"quotaTotal":3\}/),
    ).toBeInTheDocument();
    expect(callsTo("POST", GRANT_PATH)[0]?.options.json).toEqual({
      profileId: "p-1",
      sessionQuota: 3,
      months: 6,
    });
  });

  test("서버가 거부하면 서버 안내를 보인다", async () => {
    on("POST", GRANT_PATH, () => {
      throw new FakeApiError(
        404,
        "PROFILE_NOT_FOUND",
        "회원을 찾을 수 없습니다.",
      );
    });
    await openGrant();
    await fillAndSubmit();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "회원을 찾을 수 없습니다.",
    );
  });

  test("부여 요청이 진행 중일 때 Esc 로 닫아도 다이얼로그가 유지된다", async () => {
    on("POST", GRANT_PATH, () => new Promise(() => {}));
    await openGrant();
    await fillAndSubmit();
    await screen.findByRole("button", { name: "처리 중..." });

    pressEscape();

    expect(
      screen.getByRole("dialog", { name: "이용권 부여" }),
    ).toBeInTheDocument();
  });

  test("부여 요청이 진행 중일 때 바깥을 눌러도 닫히지 않는다", async () => {
    on("POST", GRANT_PATH, () => new Promise(() => {}));
    await openGrant();
    await fillAndSubmit();
    await screen.findByRole("button", { name: "처리 중..." });

    pressOutside();

    expect(
      screen.getByRole("dialog", { name: "이용권 부여" }),
    ).toBeInTheDocument();
  });

  test("진행 중에는 부여와 닫기 버튼이 비활성이다", async () => {
    on("POST", GRANT_PATH, () => new Promise(() => {}));
    await openGrant();
    await fillAndSubmit();
    await screen.findByRole("button", { name: "처리 중..." });

    expect(screen.getByRole("button", { name: "처리 중..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "닫기" })).toBeDisabled();
    expect(callsTo("POST", GRANT_PATH)).toHaveLength(1);
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
    expect(screen.queryByText("김학생 / kim@example.com")).toBeNull();
    expect(screen.getByText("선택된 학생: 없음")).toBeInTheDocument();
  });
});
