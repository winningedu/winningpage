// 성장 리포트 복구. 요청이 진행 중일 때는 닫히지 않고, 성공하면 목록을 다시 읽고 목록으로 돌아간다.

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/http/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/http/client")>()),
  api: (await import("./fakeApi")).fakeApi,
}));

import { ApiError } from "@/lib/http/client";
import { callsTo, on, resetApi } from "./fakeApi";
import {
  archivedItem,
  detailPath,
  LIST,
  listBody,
  renderGrowth,
} from "./testKit";

const RECOVER = "admin/growth-recover";

beforeEach(() => {
  resetApi();
  on("GET", LIST, listBody([archivedItem]));
  on("GET", detailPath("r-1"), archivedItem);
});

afterEach(cleanup);

async function startRecover(path = "/admin/growthReports/r-1?status=archived") {
  const view = renderGrowth(path);
  await screen.findByRole("dialog", { name: /김학생/ });
  fireEvent.click(screen.getByRole("button", { name: "실패 회차 복구" }));
  fireEvent.click(screen.getByRole("button", { name: "확인" }));
  return view;
}

describe("GrowthReportsAdmin 복구", () => {
  test("복구 요청이 진행 중일 때 Esc 로 닫아도 다이얼로그가 유지된다", async () => {
    on("POST", RECOVER, () => new Promise(() => {}));
    await startRecover();
    await screen.findByRole("button", { name: "처리 중..." });

    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });

    expect(screen.getByRole("dialog", { name: /김학생/ })).toBeInTheDocument();
  });

  test("복구 요청이 진행 중일 때 바깥을 눌러도 닫히지 않고 버튼은 비활성이다", async () => {
    on("POST", RECOVER, () => new Promise(() => {}));
    await startRecover();
    const busy = await screen.findByRole("button", { name: "처리 중..." });
    expect(busy).toBeDisabled();

    const backdrop = document.querySelector('[data-slot="dialog-overlay"]');
    expect(backdrop).not.toBeNull();
    fireEvent.pointerDown(backdrop as Element);
    fireEvent.mouseDown(backdrop as Element);
    fireEvent.click(backdrop as Element);

    expect(screen.getByRole("dialog", { name: /김학생/ })).toBeInTheDocument();
  });

  test("성공하면 reportId 를 보내고, 목록을 다시 읽고, 검색 조건을 단 목록으로 돌아간다", async () => {
    on("POST", RECOVER, { newReportId: "r-2" });
    const { router } = await startRecover();

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/admin/growthReports"),
    );
    expect(router.state.location.search).toBe("?status=archived");
    expect(callsTo("POST", RECOVER)[0]?.options.json).toEqual({
      reportId: "r-1",
    });
    await waitFor(() => expect(callsTo("GET", LIST)).toHaveLength(2));
  });

  test("실패하면 서버 detail 을 다이얼로그에 보여주고 열어 둔다", async () => {
    on("POST", RECOVER, () => {
      throw new ApiError({
        status: 409,
        code: "ALREADY_RECOVERED",
        detail: "이미 복구된 회차입니다.",
      });
    });
    const { router } = await startRecover();

    expect(await screen.findByText("이미 복구된 회차입니다.")).toBeVisible();
    expect(router.state.location.pathname).toBe("/admin/growthReports/r-1");
    expect(callsTo("GET", LIST)).toHaveLength(1);
  });
});
