// W14c 이름 수정. 이름만 고치고 아이디와 전화번호는 그대로다(교 #117 10/30 답변).

import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: mocks.getSession } },
}));

import { renderRoutes, stubApi } from "../testUtils";
import EditNameDialog from "./EditNameDialog";

function open() {
  const onSaved = vi.fn();
  const onClose = vi.fn();
  renderRoutes(
    [
      {
        path: "/",
        element: (
          <EditNameDialog
            teacher={{ id: "t-park", name: "박지훈" }}
            onSaved={onSaved}
            onClose={onClose}
          />
        ),
      },
    ],
    "/",
  );
  return { onSaved, onClose };
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

describe("W14c 이름 수정", () => {
  it("이름을 바꿔 저장하면 PATCH 로 보내고 저장됨을 알린다", async () => {
    const calls = stubApi({
      "PATCH /api/console/teachers/name": { body: { ok: true } },
    });
    const { onSaved } = open();

    const save = screen.getByRole("button", { name: "저장" });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("이름"), {
      target: { value: " 박지후 " },
    });
    fireEvent.click(save);

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(calls[0]?.body).toEqual({ teacherId: "t-park", name: "박지후" });
  });

  it("서버가 거절하면 문구를 창에 보이고 닫지 않는다", async () => {
    stubApi({
      "PATCH /api/console/teachers/name": {
        status: 404,
        body: {
          error: { code: "NOT_FOUND", message: "대상을 찾을 수 없습니다." },
        },
      },
    });
    const { onSaved } = open();

    fireEvent.change(screen.getByLabelText("이름"), {
      target: { value: "박지후" },
    });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(await screen.findByText("대상을 찾을 수 없습니다.")).toBeTruthy();
    expect(onSaved).not.toHaveBeenCalled();
  });
});
