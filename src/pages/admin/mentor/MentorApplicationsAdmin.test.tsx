// 멘토 신청 목록. 조회, 검색, 쪽 번호 주소 보존, 조회 오류 안내.

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock(
  "@/lib/http/client",
  async () => (await import("@/pages/admin/shared/fakeApi")).clientMock,
);

vi.mock("@/pages/admin/shared/AdminEngine", () => ({
  AdminTable: ({
    rows,
    onEdit,
    page,
    setPage,
  }: {
    rows: { id: string; name: string }[];
    onEdit: (row: unknown) => void;
    page: number;
    setPage: (page: number) => void;
  }) => (
    <div>
      <span data-testid="page">{page}</span>
      <button type="button" onClick={() => setPage(2)}>
        다음 쪽
      </button>
      {rows.map((row) => (
        <button key={row.id} type="button" onClick={() => onEdit(row)}>
          {`열기 ${row.name}`}
        </button>
      ))}
    </div>
  ),
}));

import { toast } from "@/components/ui/toast";
import {
  callsTo,
  FakeApiError,
  on,
  resetApi,
} from "@/pages/admin/shared/fakeApi";
import { app1, app2, BASE, ID1, PATH, renderMentor } from "./testKit";

beforeEach(() => {
  resetApi();
  on("GET", BASE, { items: [app1, app2] });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  toast.close();
  vi.restoreAllMocks();
});

test("목록을 서버에서 받아 그린다", async () => {
  renderMentor();
  expect(
    await screen.findByRole("button", { name: "열기 김지원" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "열기 박서준" }),
  ).toBeInTheDocument();
});

test("검색 입력은 이름이 있고 입력하면 목록이 걸러지며 주소에 남는다", async () => {
  const { router } = renderMentor();
  await screen.findByRole("button", { name: "열기 박서준" });

  fireEvent.change(screen.getByRole("textbox", { name: "신청 내역 검색" }), {
    target: { value: "김지원" },
  });

  expect(
    screen.getByRole("button", { name: "열기 김지원" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "열기 박서준" }),
  ).not.toBeInTheDocument();
  expect(router.state.location.search).toBe("?q=%EA%B9%80%EC%A7%80%EC%9B%90");
});

test("주소의 q 와 page 로 목록 상태를 되살린다", async () => {
  renderMentor(`${PATH}?q=${encodeURIComponent("박서준")}&page=2`);
  expect(
    await screen.findByRole("button", { name: "열기 박서준" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "열기 김지원" }),
  ).not.toBeInTheDocument();
  expect(screen.getByTestId("page")).toHaveTextContent("2");
  expect(screen.getByRole("textbox", { name: "신청 내역 검색" })).toHaveValue(
    "박서준",
  );
});

test("쪽을 넘기면 page 가 주소에 남는다", async () => {
  const { router } = renderMentor();
  fireEvent.click(await screen.findByRole("button", { name: "다음 쪽" }));
  expect(router.state.location.search).toBe("?page=2");
});

test("아무 일도 하지 않는 검색 버튼은 없다", async () => {
  renderMentor();
  await screen.findByRole("button", { name: "열기 김지원" });
  expect(
    screen.queryByRole("button", { name: "검색" }),
  ).not.toBeInTheDocument();
});

test("초기화 버튼은 목록을 다시 받는다", async () => {
  renderMentor();
  await screen.findByRole("button", { name: "열기 김지원" });
  fireEvent.click(screen.getByRole("button", { name: "초기화" }));
  await waitFor(() => expect(callsTo("GET", BASE)).toHaveLength(2));
});

const LIST_LABEL = "멘토 신청 목록을 불러오는 중입니다.";

test("처음 받는 동안에는 표 스켈레톤을 보이고 응답이 오면 행으로 바뀐다", async () => {
  let release: (value: unknown) => void = () => {};
  on(
    "GET",
    BASE,
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  renderMentor();
  expect(
    await screen.findByRole("status", { name: LIST_LABEL }),
  ).toBeInTheDocument();
  release({ items: [app1] });
  expect(
    await screen.findByRole("button", { name: "열기 김지원" }),
  ).toBeInTheDocument();
  expect(screen.queryByRole("status", { name: LIST_LABEL })).toBeNull();
});

test("창 포커스 같은 배경 재조회는 행을 그대로 두고 스켈레톤을 띄우지 않는다", async () => {
  const { client } = renderMentor();
  await screen.findByRole("button", { name: "열기 김지원" });
  on("GET", BASE, () => new Promise(() => {}));
  void client.refetchQueries({ queryKey: ["admin", "mentor-applications"] });
  await waitFor(() => expect(callsTo("GET", BASE)).toHaveLength(2));
  expect(screen.getByRole("button", { name: "열기 김지원" })).toBeVisible();
  expect(screen.queryByRole("status", { name: LIST_LABEL })).toBeNull();
});

test("캐시에 있는 목록으로 다시 들어오면 옛 행 대신 스켈레톤을 보인 뒤 새 행을 보인다", async () => {
  const first = renderMentor();
  await screen.findByRole("button", { name: "열기 김지원" });
  first.unmount();

  let release: (value: unknown) => void = () => {};
  on(
    "GET",
    BASE,
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  renderMentor(PATH, first.client);
  expect(
    await screen.findByRole("status", { name: LIST_LABEL }),
  ).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "열기 김지원" })).toBeNull();
  release({ items: [app2] });
  expect(
    await screen.findByRole("button", { name: "열기 박서준" }),
  ).toBeInTheDocument();
});

test("초기화를 누르면 스켈레톤을 보인 뒤 새 행을 보인다", async () => {
  renderMentor();
  await screen.findByRole("button", { name: "열기 김지원" });
  let release: (value: unknown) => void = () => {};
  on(
    "GET",
    BASE,
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  fireEvent.click(screen.getByRole("button", { name: "초기화" }));
  expect(
    await screen.findByRole("status", { name: LIST_LABEL }),
  ).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "열기 김지원" })).toBeNull();
  release({ items: [app2] });
  expect(
    await screen.findByRole("button", { name: "열기 박서준" }),
  ).toBeInTheDocument();
});

test("열기를 누르면 상세 주소로 간다", async () => {
  const { router } = renderMentor();
  fireEvent.click(await screen.findByRole("button", { name: "열기 김지원" }));
  expect(router.state.location.pathname).toBe(`${PATH}/${ID1}`);
});

test("조회에 실패하면 서버 원문 없이 닫을 때까지 남는 오류 토스트가 보인다", async () => {
  on("GET", BASE, () => {
    throw new FakeApiError(500, "INTERNAL_ERROR", "서버 원문 홍길동");
  });
  const addSpy = vi.spyOn(toast, "add");
  renderMentor();
  await waitFor(() =>
    expect(
      document.querySelector('[data-slot="toast-title"]'),
    ).toHaveTextContent("신청 관리 조회 실패"),
  );
  expect(addSpy).toHaveBeenCalledWith(
    expect.objectContaining({ type: "error", priority: "high", timeout: 0 }),
  );
  expect(document.body.textContent).not.toContain("홍길동");
});
