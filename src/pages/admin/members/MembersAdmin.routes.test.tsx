// 회원 관리의 하위 주소. 목록, 상세, 탭이 각각 주소를 가지고, 새로고침해도 같은 화면이 열린다.

import "@testing-library/jest-dom/vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("@/config/site", () => ({
  site: { key: "winning", features: { studentEnrollment: true } },
}));

const http = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  put: vi.fn(),
}));

vi.mock("@/lib/http/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/http/client")>()),
  api: http,
}));

vi.mock("@/pages/admin/shared/AdminEngine", () => ({
  AdminTable: ({
    rows,
    onEdit,
  }: {
    rows: { id: string; name: string }[];
    onEdit: (row: unknown) => void;
  }) => (
    <div>
      {rows.map((row) => (
        <button key={row.id} type="button" onClick={() => onEdit(row)}>
          {`열기 ${row.name}`}
        </button>
      ))}
    </div>
  ),
}));

import { toast } from "@/components/ui/toast";
import { ApiError } from "@/lib/http/client";
import { renderMembers, routeApi } from "./testHelpers";

const KIM = {
  id: "p-kim",
  name: "김학생",
  member_type: "student",
  created_at: "2026-01-01T00:00:00Z",
  service_labels: "growth",
  tenant_name: "",
};
const LEE = {
  id: "p-lee",
  name: "이학부모",
  member_type: "parent",
  created_at: "2026-01-02T00:00:00Z",
};

function mockServer(overrides: Record<string, unknown> = {}) {
  routeApi(http.get, {
    "admin/members": { items: [KIM, LEE] },
    "admin/members/p-kim": KIM,
    "admin/members/p-kim/links": {
      items: [
        {
          linkId: "l-1",
          status: "approved",
          profile: { id: "p-lee", name: "이학부모", email: null, phone: null },
        },
      ],
    },
    "admin/members/p-kim/services": {
      items: [
        {
          id: "p-kim",
          program_key: "growth",
          access_status: "active",
          payment_status: "paid",
          paid_amount: 18000,
        },
      ],
    },
    "admin/members/p-kim/orders": {
      items: [
        {
          id: "o-1",
          status: "paid",
          order_name: "성장 설계",
          amount: 18000,
          parent_profile_id: "p-lee",
          student_profile_id: "p-kim",
        },
      ],
    },
    "admin/members/p-kim/messages": {
      items: [
        {
          id: 1,
          template_key: "manualMessage",
          channel: "SMS",
          message: "안내드립니다",
          status: "sent",
          sent_at: "2026-02-01T00:00:00Z",
        },
      ],
    },
    "admin/tenant-options": { items: [] },
    ...overrides,
  });
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  mockServer();
});

afterEach(() => {
  toast.close();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

test("목록은 GET admin/members 로 그린다", async () => {
  renderMembers();

  expect(
    await screen.findByRole("button", { name: "열기 김학생" }),
  ).toBeInTheDocument();
  expect(http.get).toHaveBeenCalledWith("admin/members", expect.anything());
});

test("목록의 검색어와 회원 유형은 주소에 남고 주소에서 복원된다", async () => {
  const { router } = renderMembers("/admin/members?q=이학&type=parent");

  expect(await screen.findByLabelText("회원 검색")).toHaveValue("이학");
  expect(screen.getByRole("combobox", { name: "회원구분" })).toHaveValue(
    "parent",
  );
  expect(
    await screen.findByRole("button", { name: "열기 이학부모" }),
  ).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "열기 김학생" })).toBeNull();

  fireEvent.change(screen.getByLabelText("회원 검색"), {
    target: { value: "김" },
  });
  await waitFor(() =>
    expect(router.state.location.search).toBe("?q=%EA%B9%80&type=parent"),
  );
});

test("행을 누르면 상세 주소로 이동해 프로필을 보인다", async () => {
  const { router } = renderMembers();

  fireEvent.click(await screen.findByRole("button", { name: "열기 김학생" }));

  expect(await screen.findByText("기본 정보")).toBeInTheDocument();
  expect(router.state.location.pathname).toBe("/admin/members/p-kim");
});

test("상세 주소로 바로 들어와도 프로필과 연결 학부모를 보인다", async () => {
  renderMembers("/admin/members/p-kim");

  expect(await screen.findByText("기본 정보")).toBeInTheDocument();
  expect(await screen.findByText("이학부모")).toBeInTheDocument();
  expect(http.get).toHaveBeenCalledWith(
    "admin/members/p-kim",
    expect.anything(),
  );
});

test.each([
  ["services", "growth"],
  ["pay", "성장 설계"],
  ["msg", "안내드립니다"],
])("%s 탭 주소로 바로 들어오면 그 탭의 데이터를 보인다", async (tab, text) => {
  renderMembers(`/admin/members/p-kim/${tab}`);

  expect(await screen.findByText(text)).toBeInTheDocument();
});

test.each([
  ["consult", /상담 원장 테이블 도입 후 열립니다/],
  ["usage", /확정 후 열립니다\(기획 확인 대기\)/],
])("%s 탭은 준비 중 안내를 보인다", async (tab, text) => {
  renderMembers(`/admin/members/p-kim/${tab}`);

  expect(await screen.findByText(text)).toBeInTheDocument();
});

test("탭을 누르면 주소가 바뀌고 알 수 없는 탭은 프로필로 돌아간다", async () => {
  const { router } = renderMembers("/admin/members/p-kim");
  fireEvent.click(await screen.findByRole("tab", { name: "결제내역" }));

  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/admin/members/p-kim/pay"),
  );
  expect(await screen.findByText("성장 설계")).toBeInTheDocument();

  await act(async () => {
    await router.navigate("/admin/members/p-kim/nope");
  });
  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/admin/members/p-kim"),
  );
});

test("목록으로를 누르면 필터를 유지한 목록으로 돌아간다", async () => {
  const { router } = renderMembers("/admin/members?q=학&type=student&page=2");
  fireEvent.click(await screen.findByRole("button", { name: "열기 김학생" }));
  await screen.findByText("기본 정보");

  fireEvent.click(screen.getByRole("button", { name: "목록으로" }));

  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/admin/members"),
  );
  expect(router.state.location.search).toBe("?q=학&type=student&page=2");
});

test("브라우저 뒤로가기는 같은 필터의 목록으로 돌아간다", async () => {
  const { router } = renderMembers("/admin/members?type=student");
  fireEvent.click(await screen.findByRole("button", { name: "열기 김학생" }));
  await screen.findByText("기본 정보");

  await act(async () => {
    await router.navigate(-1);
  });

  expect(
    await screen.findByRole("button", { name: "열기 김학생" }),
  ).toBeInTheDocument();
  expect(router.state.location.search).toBe("?type=student");
});

test("없는 회원이면 찾을 수 없다는 안내와 목록 링크를 보인다", async () => {
  mockServer({
    "admin/members/p-none": new ApiError({
      status: 404,
      code: "NOT_FOUND",
      detail: "회원을 찾을 수 없습니다.",
    }),
  });
  const { router } = renderMembers("/admin/members/p-none");

  expect(
    await screen.findByText("회원을 찾을 수 없습니다."),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("link", { name: "목록으로" }));
  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/admin/members"),
  );
});

test("한 탭의 조회가 실패하면 안내 배너와 토스트를 보인다", async () => {
  mockServer({
    "admin/members/p-kim/orders": new ApiError({
      status: 500,
      code: "INTERNAL_ERROR",
      detail: "서버 오류가 났어요.",
    }),
  });
  renderMembers("/admin/members/p-kim/pay");

  const notice = await screen.findByText(/아래 항목이 비어 있을 수 있습니다/);
  expect(notice).toHaveAttribute("role", "alert");
  await waitFor(() =>
    expect(
      document.querySelector('[data-slot="toast-title"]'),
    ).toHaveTextContent("일부 데이터를 불러오지 못했습니다"),
  );
});

test("목록 조회가 실패하면 제목과 서버 안내를 토스트로 보인다", async () => {
  mockServer({
    "admin/members": new ApiError({
      status: 500,
      code: "INTERNAL_ERROR",
      detail: "서버 오류가 났어요.",
    }),
  });
  renderMembers();

  await waitFor(() => {
    expect(
      document.querySelector('[data-slot="toast-title"]'),
    ).toHaveTextContent("회원 조회 실패");
    expect(
      document.querySelector('[data-slot="toast-description"]'),
    ).toHaveTextContent("서버 오류가 났어요.");
  });
});

test("소속 목록 조회가 실패해도 소속 없음만 담은 드롭다운으로 상세를 연다", async () => {
  mockServer({
    "admin/tenant-options": new ApiError({
      status: 403,
      code: "FORBIDDEN",
      detail: "이 메뉴를 쓸 권한이 없습니다.",
    }),
  });
  renderMembers("/admin/members/p-kim");

  const select = (await screen.findByRole("combobox", {
    name: "소속",
  })) as HTMLSelectElement;
  expect(Array.from(select.options).map((o) => o.textContent)).toEqual([
    "소속 없음",
  ]);
});
