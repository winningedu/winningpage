import "@testing-library/jest-dom/vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock(
  "@/lib/http/client",
  async () => (await import("./fakeApi")).clientMock,
);

import { callsTo, FakeApiError, on, resetApi } from "./fakeApi";
import { detailBody, LIST_PATH, listBody, renderSelfeval } from "./testKit";

const DETAIL_PATH = `${LIST_PATH}/s-1`;

const lastListParams = () =>
  callsTo("GET", LIST_PATH).at(-1)?.options.searchParams;

beforeEach(() => {
  resetApi();
  on("GET", LIST_PATH, listBody());
  on("GET", DETAIL_PATH, detailBody());
});

describe("SelfevalSessionsAdmin 목록", () => {
  test("기본 조건으로 목록을 읽어 행을 그린다", async () => {
    renderSelfeval();

    expect(
      await screen.findByRole("button", { name: "최학생" }),
    ).toBeInTheDocument();
    expect(screen.getByText("choi@example.com")).toBeInTheDocument();
    expect(lastListParams()).toEqual({ page: "1", pageSize: "20" });
    expect(callsTo("GET", LIST_PATH)[0]?.options.signal).toBeInstanceOf(
      AbortSignal,
    );
  });

  test("열 머리글은 scope col 을 가진다", async () => {
    renderSelfeval();
    const header = await screen.findByRole("columnheader", { name: "학생" });
    expect(header).toHaveAttribute("scope", "col");
  });

  test("주소의 상태 검색어 페이지로 읽고 입력칸에 채운다", async () => {
    on("GET", LIST_PATH, listBody({ total: 45, page: 2 }));
    renderSelfeval(
      "/admin/selfevalSessions?status=archived&q=%EB%AC%BC&page=2",
    );

    await screen.findByRole("button", { name: "최학생" });
    expect(lastListParams()).toEqual({
      status: "archived",
      q: "물",
      page: "2",
      pageSize: "20",
    });
    expect(screen.getByLabelText("상태")).toHaveValue("archived");
    expect(screen.getByLabelText("검색어")).toHaveValue("물");
  });

  test("상태를 바꾸면 주소가 바뀌고 1페이지로 다시 읽는다", async () => {
    const { router } = renderSelfeval("/admin/selfevalSessions?page=3");
    await screen.findByRole("button", { name: "최학생" });

    fireEvent.change(screen.getByLabelText("상태"), {
      target: { value: "completed" },
    });

    await waitFor(() =>
      expect(lastListParams()).toEqual({
        status: "completed",
        page: "1",
        pageSize: "20",
      }),
    );
    expect(router.state.location.search).toBe("?status=completed");
  });

  test("검색어는 조회를 눌러야 주소에 들어가 읽는다", async () => {
    const { router } = renderSelfeval();
    await screen.findByRole("button", { name: "최학생" });

    fireEvent.change(screen.getByLabelText("검색어"), {
      target: { value: " 국어 " },
    });
    expect(callsTo("GET", LIST_PATH)).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "조회" }));

    await waitFor(() =>
      expect(lastListParams()).toEqual({
        q: "국어",
        page: "1",
        pageSize: "20",
      }),
    );
    expect(new URLSearchParams(router.state.location.search).get("q")).toBe(
      "국어",
    );
  });

  test("페이지를 넘기면 주소의 page 가 바뀐다", async () => {
    on("GET", LIST_PATH, listBody({ total: 45 }));
    const { router } = renderSelfeval();
    await screen.findByRole("button", { name: "최학생" });

    fireEvent.click(screen.getByRole("button", { name: "2페이지" }));

    await waitFor(() => expect(lastListParams()?.page).toBe("2"));
    expect(router.state.location.search).toBe("?page=2");
  });

  test("목록 조회가 실패하면 서버 안내를 alert 로 보인다", async () => {
    on("GET", LIST_PATH, () => {
      throw new FakeApiError(
        400,
        "VALIDATION_FAILED",
        "조회 조건이 잘못됐습니다.",
      );
    });
    renderSelfeval();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "조회 조건이 잘못됐습니다.",
    );
    expect(screen.getByText("조회된 세션이 없습니다.")).toBeInTheDocument();
  });

  test("알 수 없는 하위 주소는 목록으로 돌아간다", async () => {
    const { router } = renderSelfeval("/admin/selfevalSessions/s-1/x");
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/admin/selfevalSessions"),
    );
  });
});

describe("SelfevalSessionsAdmin 상세 라우트", () => {
  test("학생 이름을 누르면 목록 조건을 단 채 상세 주소로 가서 상세 API 를 읽는다", async () => {
    const { router } = renderSelfeval(
      "/admin/selfevalSessions?status=completed",
    );
    fireEvent.click(await screen.findByRole("button", { name: "최학생" }));

    expect(
      await screen.findByRole("dialog", { name: /최학생 \(완료\)/ }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/admin/selfevalSessions/s-1");
    expect(router.state.location.search).toBe("?status=completed");
    expect(callsTo("GET", DETAIL_PATH)[0]?.options.signal).toBeInstanceOf(
      AbortSignal,
    );
  });

  test("상세 주소로 바로 열어도(새로고침) 목록과 상세가 같이 나온다", async () => {
    renderSelfeval("/admin/selfevalSessions/s-1?page=2");

    const dialog = await screen.findByRole("dialog", {
      name: /최학생 \(완료\)/,
    });
    expect(within(dialog).getByText("choi@example.com")).toBeInTheDocument();
    expect(
      within(dialog).getByText(/s-1 \/ 6\/6 \/ 차감 없음/),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("입력")).toBeInTheDocument();
    expect(within(dialog).getByText(/핵심 abcdef12/)).toBeInTheDocument();
    expect(within(dialog).getByText(/final r2 \(80점\)/)).toBeInTheDocument();
    expect(lastListParams()).toEqual({ page: "2", pageSize: "20" });
    // 모달이 열려 있어 뒤의 목록은 접근성 트리에서 가려진다.
    expect(
      screen.getByRole("button", { name: "최학생", hidden: true }),
    ).toBeInTheDocument();
  });

  test("불러오는 동안 상세에 상태를 알린다", async () => {
    on("GET", DETAIL_PATH, () => new Promise(() => {}));
    renderSelfeval("/admin/selfevalSessions/s-1");
    const dialog = await screen.findByRole("dialog", { name: "세션 상세" });
    expect(within(dialog).getByRole("status")).toHaveTextContent(
      "불러오는 중...",
    );
  });

  test("세션이 없으면 서버 안내를 상세에 보인다", async () => {
    on("GET", DETAIL_PATH, () => {
      throw new FakeApiError(
        404,
        "SESSION_NOT_FOUND",
        "세션을 찾을 수 없습니다.",
      );
    });
    renderSelfeval("/admin/selfevalSessions/s-1");

    const dialog = await screen.findByRole("dialog", { name: "세션 상세" });
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "세션을 찾을 수 없습니다.",
    );
  });

  test("Esc 로 닫으면 같은 조건의 목록 주소로 돌아간다", async () => {
    const { router } = renderSelfeval("/admin/selfevalSessions/s-1?page=2");
    await screen.findByRole("dialog", { name: /최학생/ });

    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/admin/selfevalSessions"),
    );
    expect(router.state.location.search).toBe("?page=2");
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  test("브라우저 뒤로가기로 상세에서 목록으로 돌아온다", async () => {
    const { router } = renderSelfeval("/admin/selfevalSessions");
    fireEvent.click(await screen.findByRole("button", { name: "최학생" }));
    await screen.findByRole("dialog", { name: /최학생/ });

    await router.navigate(-1);

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(router.state.location.pathname).toBe("/admin/selfevalSessions");
  });
});
