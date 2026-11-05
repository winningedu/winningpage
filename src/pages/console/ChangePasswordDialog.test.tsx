// W18a 비밀번호 변경 창. 규칙 검사, 서버 응답별 오류, 성공 뒤 세션 교체를 검증한다.

import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  setSession: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { getSession: mocks.getSession, setSession: mocks.setSession },
  },
}));

import ConsoleGate from "./ConsoleGate";
import MyPage from "./MyPage";
import {
  type ApiHandler,
  homeroomMe,
  renderRoutes,
  stubApi,
} from "./testUtils";

const routes = [
  {
    path: "/teacher",
    Component: ConsoleGate,
    children: [{ path: "my", Component: MyPage }],
  },
  { path: "/login", element: <p>로그인 화면</p> },
];

const RULE_ERROR =
  "새 비밀번호가 규칙에 맞지 않아요. 8자 이상, 영문과 숫자를 함께 쓰고 현재 비밀번호와 다르게 써 주세요";
const CURRENT_ERROR = "현재 비밀번호가 맞지 않아요. 다시 입력해 주세요";
const SESSION = { access_token: "a", refresh_token: "r", expires_at: 1 };

function stubChange(post: ApiHandler) {
  return stubApi({
    "GET /api/console/me": { body: homeroomMe },
    "POST /api/console/change-password": post,
  });
}

async function openDialog() {
  fireEvent.click(await screen.findByRole("button", { name: "비밀번호 변경" }));
  return within(await screen.findByRole("dialog"));
}

function fill(
  dialog: ReturnType<typeof within>,
  current: string,
  next: string,
  confirm = next,
) {
  fireEvent.change(dialog.getByLabelText("현재 비밀번호"), {
    target: { value: current },
  });
  fireEvent.change(dialog.getByLabelText("새 비밀번호"), {
    target: { value: next },
  });
  fireEvent.change(dialog.getByLabelText("새 비밀번호 확인"), {
    target: { value: confirm },
  });
}

beforeEach(() => {
  mocks.getSession.mockResolvedValue({
    data: { session: { user: { id: "u" }, access_token: "tok" } },
  });
  mocks.setSession.mockResolvedValue({ error: null });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("ChangePasswordDialog 화면", () => {
  it("제목, 입력 칸, 규칙 안내, 취소와 저장 버튼을 보여 주고 닫기 X 는 없다", async () => {
    stubChange({ body: {} });
    renderRoutes(routes, "/teacher/my");

    const dialog = await openDialog();

    expect(dialog.getByText("비밀번호 변경")).toBeTruthy();
    expect(
      (dialog.getByLabelText("새 비밀번호") as HTMLInputElement).placeholder,
    ).toBe("8자 이상, 영문과 숫자 포함, 현재 비밀번호와 다르게");
    expect(
      (dialog.getByLabelText("새 비밀번호 확인") as HTMLInputElement)
        .placeholder,
    ).toBe("한 번 더 입력");
    expect(
      dialog.getByText(
        "8자 이상, 영문과 숫자 포함, 현재 비밀번호와 달라야 해요",
      ),
    ).toBeTruthy();
    expect(dialog.getByRole("button", { name: "취소" })).toBeTruthy();
    expect(dialog.getByRole("button", { name: "저장" })).toBeTruthy();
    expect(dialog.queryByRole("button", { name: /Close|닫기/ })).toBeNull();
  });

  it("취소하면 닫히고 다시 열면 입력이 비어 있다", async () => {
    stubChange({ body: {} });
    renderRoutes(routes, "/teacher/my");
    const dialog = await openDialog();
    fill(dialog, "OldPass123", "NewPass456");

    fireEvent.click(dialog.getByRole("button", { name: "취소" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const reopened = await openDialog();

    expect(
      (reopened.getByLabelText("현재 비밀번호") as HTMLInputElement).value,
    ).toBe("");
    expect(
      (reopened.getByLabelText("새 비밀번호") as HTMLInputElement).value,
    ).toBe("");
  });
});

describe("ChangePasswordDialog 입력 검사", () => {
  it.each([
    ["규칙 위반", "OldPass123", "short1"],
    ["현재와 같음", "OldPass123", "OldPass123"],
  ])(
    "%s 이면 새 비밀번호 오류를 보이고 서버로 보내지 않는다",
    async (_n, current, next) => {
      const calls = stubChange({ body: {} });
      renderRoutes(routes, "/teacher/my");
      const dialog = await openDialog();
      fill(dialog, current, next);

      fireEvent.click(dialog.getByRole("button", { name: "저장" }));

      expect(await dialog.findByText(RULE_ERROR)).toBeTruthy();
      expect(
        dialog.getByLabelText("새 비밀번호").getAttribute("aria-invalid"),
      ).toBe("true");
      expect(calls.some((c) => c.key.startsWith("POST"))).toBe(false);
    },
  );

  it("확인 칸이 다르면 서로 다르다고 알린다", async () => {
    const calls = stubChange({ body: {} });
    renderRoutes(routes, "/teacher/my");
    const dialog = await openDialog();
    fill(dialog, "OldPass123", "NewPass456", "NewPass457");

    fireEvent.click(dialog.getByRole("button", { name: "저장" }));

    expect(
      await dialog.findByText("새 비밀번호가 서로 다릅니다."),
    ).toBeTruthy();
    expect(calls.some((c) => c.key.startsWith("POST"))).toBe(false);
  });
});

describe("ChangePasswordDialog 서버 응답", () => {
  it("성공하면 두 비밀번호를 보내고 새 세션으로 바꾼 뒤 완료 화면을 보인다", async () => {
    const calls = stubChange({ body: { ok: true, session: SESSION } });
    renderRoutes(routes, "/teacher/my");
    const dialog = await openDialog();
    fill(dialog, "OldPass123", "NewPass456");

    fireEvent.click(dialog.getByRole("button", { name: "저장" }));

    expect(await dialog.findByText("비밀번호를 바꿨어요")).toBeTruthy();
    expect(
      dialog.getByText(
        "변경 일시가 기록됐어요. 다음 로그인부터 새 비밀번호를 써 주세요",
      ),
    ).toBeTruthy();
    expect(calls.find((c) => c.key.startsWith("POST"))?.body).toEqual({
      currentPassword: "OldPass123",
      newPassword: "NewPass456",
    });
    expect(mocks.setSession).toHaveBeenCalledWith({
      access_token: "a",
      refresh_token: "r",
    });

    fireEvent.click(dialog.getByRole("button", { name: "확인" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("현재 비밀번호가 틀리면(401) 현재 비밀번호 칸에 오류를 보이고 로그아웃하지 않는다", async () => {
    stubChange({
      status: 401,
      body: { error: { code: "INVALID", message: "x" } },
    });
    const { router } = renderRoutes(routes, "/teacher/my");
    const dialog = await openDialog();
    fill(dialog, "WrongPass1", "NewPass456");

    fireEvent.click(dialog.getByRole("button", { name: "저장" }));

    expect(await dialog.findByText(CURRENT_ERROR)).toBeTruthy();
    expect(
      dialog.getByLabelText("현재 비밀번호").getAttribute("aria-invalid"),
    ).toBe("true");
    expect(router.state.location.pathname).toBe("/teacher/my");
  });

  it.each(["PASSWORD_TOO_SHORT", "PASSWORD_SAME_AS_CURRENT"])(
    "서버가 %s 를 돌려주면 새 비밀번호 오류 문구를 보인다",
    async (code) => {
      stubChange({ status: 400, body: { error: { code, message: "x" } } });
      renderRoutes(routes, "/teacher/my");
      const dialog = await openDialog();
      fill(dialog, "OldPass123", "NewPass456");

      fireEvent.click(dialog.getByRole("button", { name: "저장" }));

      expect(await dialog.findByText(RULE_ERROR)).toBeTruthy();
    },
  );

  it("잠겼으면(429) 서버 문구를 현재 비밀번호 칸에 보이고 Retry-After 동안 저장을 막는다", async () => {
    stubChange({
      status: 429,
      headers: { "Retry-After": "1" },
      body: {
        error: {
          code: "LOCKED",
          message: "로그인 실패가 많아 약 1초 후에 다시 시도해 주세요.",
        },
      },
    });
    renderRoutes(routes, "/teacher/my");
    const dialog = await openDialog();
    fill(dialog, "WrongPass1", "NewPass456");

    fireEvent.click(dialog.getByRole("button", { name: "저장" }));

    expect(
      await dialog.findByText(
        "로그인 실패가 많아 약 1초 후에 다시 시도해 주세요.",
      ),
    ).toBeTruthy();
    const save = dialog.getByRole("button", {
      name: "저장",
    }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);

    await waitFor(() => expect(save.disabled).toBe(false), { timeout: 2500 });
  });

  it("서버 오류면 오류 토스트를 보이고 창은 그대로 둔다", async () => {
    stubChange({
      status: 503,
      body: { error: { code: "RETRY", message: "x" } },
    });
    renderRoutes(routes, "/teacher/my");
    const dialog = await openDialog();
    fill(dialog, "OldPass123", "NewPass456");

    fireEvent.click(dialog.getByRole("button", { name: "저장" }));

    expect(
      (await screen.findByRole("status", { hidden: true })).textContent,
    ).toBe("저장하지 못했어요. 잠시 뒤 다시 시도해 주세요");
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});
