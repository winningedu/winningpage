// 멘토 신청 상세. 새로고침 진입, 없는 신청, 목록 복귀, 상태 저장, 증빙 열람.

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
import { app1, BASE, ID1, PATH, renderMentor } from "./testKit";

const toastTitle = () => document.querySelector('[data-slot="toast-title"]');
const toastDescription = () =>
  document.querySelector('[data-slot="toast-description"]');

beforeEach(() => {
  resetApi();
  on("GET", BASE, { items: [app1] });
  on("GET", `${BASE}/${ID1}`, app1);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  toast.close();
  vi.restoreAllMocks();
});

const openProof = async () =>
  fireEvent.click(
    await screen.findByRole("button", { name: /증빙 파일 열람/ }),
  );

test("상세 주소로 바로 들어가도 GET :id 로 불러와 그린다", async () => {
  renderMentor(`${PATH}/${ID1}`);
  expect(await screen.findByText("신청 관리 상세")).toBeInTheDocument();
  expect(await screen.findByText("proof.pdf")).toBeInTheDocument();
  expect(callsTo("GET", `${BASE}/${ID1}`)).toHaveLength(1);
});

test("없는 신청이면 찾을 수 없다는 안내와 목록으로 버튼이 보인다", async () => {
  on("GET", `${BASE}/${ID1}`, () => {
    throw new FakeApiError(404, "NOT_FOUND");
  });
  const { router } = renderMentor(`${PATH}/${ID1}`);
  expect(
    await screen.findByText("멘토 신청을 찾을 수 없습니다."),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "목록으로" }));
  expect(router.state.location.pathname).toBe(PATH);
});

test("목록으로 버튼은 q 와 page 를 살려 목록으로 돌아간다", async () => {
  const { router } = renderMentor(
    `${PATH}?q=${encodeURIComponent("김")}&page=2`,
  );
  fireEvent.click(await screen.findByRole("button", { name: "열기 김지원" }));
  fireEvent.click(await screen.findByRole("button", { name: "목록으로" }));
  await waitFor(() => expect(router.state.location.pathname).toBe(PATH));
  expect(router.state.location.search).toBe(
    `?q=${encodeURIComponent("김")}&page=2`,
  );
});

test("상태를 바꿔 저장하면 status 만 PATCH 하고 성공 토스트가 보인다", async () => {
  on("PATCH", `${BASE}/${ID1}`, { ...app1, status: "interview" });
  renderMentor(`${PATH}/${ID1}`);
  const select = await screen.findByRole("combobox");
  fireEvent.change(select, { target: { value: "interview" } });
  fireEvent.click(screen.getByRole("button", { name: "상태 저장" }));
  await waitFor(() =>
    expect(toastTitle()).toHaveTextContent("상태를 변경했습니다."),
  );
  expect(callsTo("PATCH", `${BASE}/${ID1}`)[0]?.options.json).toEqual({
    status: "interview",
  });
  // 저장 뒤 상세와 목록을 다시 받는다.
  await waitFor(() =>
    expect(callsTo("GET", `${BASE}/${ID1}`).length).toBeGreaterThan(1),
  );
});

test("상태가 그대로면 경고만 보이고 요청하지 않는다", async () => {
  renderMentor(`${PATH}/${ID1}`);
  await screen.findByRole("combobox");
  fireEvent.click(screen.getByRole("button", { name: "상태 저장" }));
  await waitFor(() =>
    expect(toastTitle()).toHaveTextContent("변경된 상태가 없습니다."),
  );
  expect(callsTo("PATCH", `${BASE}/${ID1}`)).toHaveLength(0);
});

test("상태 저장이 실패하면 서버 원문 없이 오류 토스트가 보인다", async () => {
  on("PATCH", `${BASE}/${ID1}`, () => {
    throw new FakeApiError(500, "INTERNAL_ERROR", "서버 원문 홍길동");
  });
  renderMentor(`${PATH}/${ID1}`);
  fireEvent.change(await screen.findByRole("combobox"), {
    target: { value: "active" },
  });
  fireEvent.click(screen.getByRole("button", { name: "상태 저장" }));
  await waitFor(() => expect(toastTitle()).toHaveTextContent("상태 변경 실패"));
  expect(document.body.textContent).not.toContain("홍길동");
});

test("증빙 파일 열람은 서명 URL 을 새 탭으로 연다", async () => {
  on("POST", `${BASE}/${ID1}/proof-url`, { url: "https://signed.example/x" });
  const open = vi.spyOn(window, "open").mockImplementation(() => null);
  renderMentor(`${PATH}/${ID1}`);
  await openProof();
  await waitFor(() =>
    expect(open).toHaveBeenCalledWith(
      "https://signed.example/x",
      "_blank",
      "noopener,noreferrer",
    ),
  );
});

test("증빙 파일이 없으면 닫히지 않는 경고 토스트로 알린다", async () => {
  on("POST", `${BASE}/${ID1}/proof-url`, () => {
    throw new FakeApiError(404, "PROOF_NOT_FOUND", "서버 원문");
  });
  const open = vi.spyOn(window, "open").mockImplementation(() => null);
  const addSpy = vi.spyOn(toast, "add");
  renderMentor(`${PATH}/${ID1}`);
  await openProof();
  await waitFor(() =>
    expect(toastTitle()).toHaveTextContent("등록된 증빙 파일이 없습니다."),
  );
  expect(addSpy).toHaveBeenCalledWith(
    expect.objectContaining({ type: "warning", priority: "high", timeout: 0 }),
  );
  expect(open).not.toHaveBeenCalled();
});

test("그 밖의 열람 실패는 원문 없이 오류 토스트가 보인다", async () => {
  on("POST", `${BASE}/${ID1}/proof-url`, () => {
    throw new FakeApiError(500, "INTERNAL_ERROR", "permission denied 홍길동");
  });
  renderMentor(`${PATH}/${ID1}`);
  await openProof();
  await waitFor(() =>
    expect(toastTitle()).toHaveTextContent("증빙 파일 열람 실패"),
  );
  expect(toastDescription()).toHaveTextContent("잠시 후 다시 시도해 주세요.");
  expect(document.body.textContent).not.toContain("홍길동");
});
