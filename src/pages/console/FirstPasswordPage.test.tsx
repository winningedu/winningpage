// W2 첫 로그인 새 비밀번호. 임시 비밀번호 칸은 가린 읽기 전용 표시이고 서버로 보내지 않는다(결정 46).

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: mocks.getSession } },
}));

import ConsoleGate from "./ConsoleGate";
import FirstPasswordPage from "./FirstPasswordPage";
import { homeroomMe, renderRoutes, stubApi } from "./testUtils";

const routes = [
  {
    path: "/teacher",
    Component: ConsoleGate,
    children: [
      { path: "first-password", Component: FirstPasswordPage },
      { index: true, element: <p>대시보드 화면</p> },
    ],
  },
];

const RULE_ERROR = "8자 이상, 영문과 숫자를 함께 써 주세요";

/** POST 뒤에는 me 가 임시 비밀번호 상태를 벗어난 것으로 응답한다. */
function stubFirstPassword(post: { status?: number; body?: unknown }) {
  let changed = false;
  return stubApi({
    "GET /api/console/me": () => ({
      body: { ...homeroomMe, mustChangePassword: !changed },
    }),
    "POST /api/console/first-password": () => {
      if ((post.status ?? 200) === 200) changed = true;
      return post;
    },
  });
}

async function fill(newPw: string, confirm = newPw) {
  fireEvent.change(await screen.findByLabelText("새 비밀번호"), {
    target: { value: newPw },
  });
  fireEvent.change(screen.getByLabelText("새 비밀번호 확인"), {
    target: { value: confirm },
  });
}

beforeEach(() => {
  mocks.getSession.mockResolvedValue({
    data: { session: { user: { id: "u" }, access_token: "tok" } },
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("FirstPasswordPage", () => {
  it("제목, 안내, 가린 읽기 전용 임시 비밀번호 칸과 입력 칸을 보여 준다", async () => {
    stubFirstPassword({ body: { ok: true } });

    renderRoutes(routes, "/teacher/first-password");

    expect(
      await screen.findByRole("heading", { name: "새 비밀번호 설정" }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "임시 비밀번호로 처음 들어오셨어요. 새 비밀번호를 정해야 다음으로 갈 수 있어요.",
      ),
    ).toBeTruthy();
    const temp = screen.getByLabelText("임시 비밀번호") as HTMLInputElement;
    expect(temp.readOnly).toBe(true);
    expect(temp.value).toBe("••••••••");
    expect(temp.tabIndex).toBe(-1);
    expect(
      (screen.getByLabelText("새 비밀번호") as HTMLInputElement).placeholder,
    ).toBe("8자 이상, 영문과 숫자 포함, 임시 비밀번호와 다르게");
    expect(
      (screen.getByLabelText("새 비밀번호 확인") as HTMLInputElement)
        .placeholder,
    ).toBe("한 번 더 입력");
  });

  it.each([
    ["짧음", "Ab1"],
    ["영문 없음", "12345678"],
    ["숫자 없음", "abcdefgh"],
  ])(
    "규칙에 맞지 않으면(%s) 오류를 보이고 서버로 보내지 않는다",
    async (_n, pw) => {
      const calls = stubFirstPassword({ body: { ok: true } });
      renderRoutes(routes, "/teacher/first-password");
      await fill(pw);

      fireEvent.click(screen.getByRole("button", { name: "저장" }));

      expect(await screen.findByText(RULE_ERROR)).toBeTruthy();
      expect(
        screen.getByLabelText("새 비밀번호").getAttribute("aria-invalid"),
      ).toBe("true");
      expect(calls.some((c) => c.key.startsWith("POST"))).toBe(false);
    },
  );

  it("확인 칸이 다르면 새 비밀번호가 서로 다르다고 알린다", async () => {
    const calls = stubFirstPassword({ body: { ok: true } });
    renderRoutes(routes, "/teacher/first-password");
    await fill("NewPass123", "NewPass124");

    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(
      await screen.findByText("새 비밀번호가 서로 다릅니다."),
    ).toBeTruthy();
    expect(calls.some((c) => c.key.startsWith("POST"))).toBe(false);
  });

  it("저장하면 새 비밀번호만 보내고 대시보드로 이동한다", async () => {
    const calls = stubFirstPassword({ body: { ok: true } });
    const { router } = renderRoutes(routes, "/teacher/first-password");
    await fill("NewPass123");

    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(await screen.findByText("대시보드 화면")).toBeTruthy();
    expect(router.state.location.pathname).toBe("/teacher");
    expect(calls.find((c) => c.key.startsWith("POST"))?.body).toEqual({
      password: "NewPass123",
    });
  });

  it("임시 비밀번호와 같다는 응답이면 새 비밀번호 칸에 오류를 보인다", async () => {
    stubFirstPassword({
      status: 400,
      body: { error: { code: "PASSWORD_SAME_AS_TEMP", message: "x" } },
    });
    renderRoutes(routes, "/teacher/first-password");
    await fill("NewPass123");

    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(
      await screen.findByText("임시 비밀번호와 다르게 써 주세요"),
    ).toBeTruthy();
  });

  it("서버가 규칙 위반(PASSWORD_NO_DIGIT)을 돌려주면 디자인 문구를 보인다", async () => {
    stubFirstPassword({
      status: 400,
      body: { error: { code: "PASSWORD_NO_DIGIT", message: "x" } },
    });
    renderRoutes(routes, "/teacher/first-password");
    await fill("NewPass123");

    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(await screen.findByText(RULE_ERROR)).toBeTruthy();
  });

  it("이미 설정했다는 응답(409 NOT_REQUIRED)이면 대시보드로 보낸다", async () => {
    stubFirstPassword({
      status: 409,
      body: { error: { code: "NOT_REQUIRED", message: "x" } },
    });
    const { router } = renderRoutes(routes, "/teacher/first-password");
    await fill("NewPass123");

    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/teacher"),
    );
  });

  it("서버 오류면 오류 토스트를 보이고 화면에 머문다", async () => {
    stubFirstPassword({ status: 500, body: {} });
    const { router } = renderRoutes(routes, "/teacher/first-password");
    await fill("NewPass123");

    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect((await screen.findByRole("status")).textContent).toBe(
      "저장하지 못했어요. 잠시 뒤 다시 시도해 주세요",
    );
    expect(router.state.location.pathname).toBe("/teacher/first-password");
  });
});
