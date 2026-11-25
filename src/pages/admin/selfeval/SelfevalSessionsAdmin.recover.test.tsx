// 자기평가 복구. 복구 요청이 진행 중일 때는 Esc 와 바깥 누름으로 닫히지 않고,
// 성공하면 목록을 다시 읽고 같은 조건의 목록 주소로 돌아간다.

import "@testing-library/jest-dom/vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock(
  "@/lib/http/client",
  async () => (await import("./fakeApi")).clientMock,
);

import { callsTo, FakeApiError, on, resetApi } from "./fakeApi";
import {
  ARCHIVED_ITEM,
  archivedDetail,
  LIST_PATH,
  listBody,
  renderSelfeval,
} from "./testKit";

const RECOVER_PATH = "admin/selfeval-recover";

beforeEach(() => {
  resetApi();
  on("GET", LIST_PATH, listBody({ items: [ARCHIVED_ITEM] }));
  on("GET", `${LIST_PATH}/s-1`, archivedDetail());
});

async function startRecover(path = "/admin/selfevalSessions/s-1?page=2") {
  const view = renderSelfeval(path);
  await screen.findByRole("dialog", { name: /김학생/ });
  fireEvent.click(screen.getByRole("button", { name: "실패 세션 복구" }));
  fireEvent.click(screen.getByRole("button", { name: "확인" }));
  return view;
}

describe("SelfevalSessionsAdmin 복구", () => {
  test("확인하면 세션 id 로 복구하고 목록을 다시 읽어 목록 주소로 돌아간다", async () => {
    on("POST", RECOVER_PATH, { newSessionId: "s-2" });
    const { router } = await startRecover();

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/admin/selfevalSessions"),
    );
    expect(router.state.location.search).toBe("?page=2");
    expect(callsTo("POST", RECOVER_PATH)[0]?.options.json).toEqual({
      sessionId: "s-1",
    });
    await waitFor(() => expect(callsTo("GET", LIST_PATH)).toHaveLength(2));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  test("종결되지 않은 세션에는 복구 버튼이 없다", async () => {
    on("GET", `${LIST_PATH}/s-1`, {
      ...archivedDetail(),
      terminal: null,
    });
    renderSelfeval("/admin/selfevalSessions/s-1");
    await screen.findByRole("dialog", { name: /김학생/ });
    expect(screen.queryByRole("button", { name: "실패 세션 복구" })).toBeNull();
  });

  test("서버가 거부하면 안내를 상세에 보이고 상세는 열려 있다", async () => {
    on("POST", RECOVER_PATH, () => {
      throw new FakeApiError(
        409,
        "ALREADY_RECOVERED",
        "이미 복구된 세션입니다.",
      );
    });
    const { router } = await startRecover();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "이미 복구된 세션입니다.",
    );
    expect(router.state.location.pathname).toBe("/admin/selfevalSessions/s-1");
    expect(screen.getByRole("dialog", { name: /김학생/ })).toBeInTheDocument();
  });

  test("복구 요청이 진행 중이면 확인과 취소가 비활성이다", async () => {
    on("POST", RECOVER_PATH, () => new Promise(() => {}));
    await startRecover();
    await screen.findByRole("button", { name: "처리 중..." });

    expect(screen.getByRole("button", { name: "처리 중..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "취소" })).toBeDisabled();
    expect(callsTo("POST", RECOVER_PATH)).toHaveLength(1);
  });

  test("복구 요청이 진행 중일 때 Esc 로 닫아도 상세가 유지된다", async () => {
    on("POST", RECOVER_PATH, () => new Promise(() => {}));
    const { router } = await startRecover();
    await screen.findByRole("button", { name: "처리 중..." });

    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });

    expect(screen.getByRole("dialog", { name: /김학생/ })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/admin/selfevalSessions/s-1");
  });

  test("복구 요청이 진행 중일 때 바깥을 눌러도 닫히지 않는다", async () => {
    on("POST", RECOVER_PATH, () => new Promise(() => {}));
    await startRecover();
    await screen.findByRole("button", { name: "처리 중..." });

    const backdrop = document.querySelector('[data-slot="dialog-overlay"]');
    expect(backdrop).not.toBeNull();
    fireEvent.pointerDown(backdrop as Element);
    fireEvent.mouseDown(backdrop as Element);
    fireEvent.click(backdrop as Element);

    expect(screen.getByRole("dialog", { name: /김학생/ })).toBeInTheDocument();
  });
});
