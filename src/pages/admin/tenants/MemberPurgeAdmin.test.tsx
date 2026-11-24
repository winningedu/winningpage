// 계약 종료 회원 삭제 화면(사 #162, #176, 결정 102.1, 102.3, 102.4). 기관을 고르면 미리보기를 읽고, 고른 학생만 삭제 API 로 보낸다.
// 고른 기관은 주소(/admin/memberPurge/:tenantId)에 둔다.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router";
import { beforeEach, describe, expect, test, vi } from "vitest";

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/lib/http/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/http/client")>()),
  api: http,
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: "hq-1" } } } }),
    },
  },
}));

vi.mock("@/lib/adminPermissions", () => ({
  fetchAdminPermissions: vi.fn(),
}));

import { fetchAdminPermissions } from "@/lib/adminPermissions";
import { ApiError } from "@/lib/http/client";
import MemberPurgeAdmin from "./MemberPurgeAdmin";

const TENANT = {
  id: "tenant-7",
  code: "ABCD1234",
  name: "한빛고",
  contract_end_date: "2026-09-01",
  time_zone: "Asia/Seoul",
};
const STUDENTS = [
  {
    id: "s-1",
    name: "김*늘",
    grade: "고1",
    classLabel: "3반",
    number: 5,
    protected: false,
  },
  {
    id: "s-2",
    name: "이*윤",
    grade: "고2",
    classLabel: null,
    number: null,
    protected: true,
  },
  {
    id: "s-3",
    name: "박*준",
    grade: "고1",
    classLabel: "3반",
    number: 6,
    protected: false,
  },
];

type Preview = {
  contractEnd: string | null;
  graceEnd: string | null;
  deletableFrom: string | null;
  dDay: number | null;
  students: typeof STUDENTS;
};

function preview(dDay: number | null, list = STUDENTS): Preview {
  return {
    contractEnd: "2026-09-01",
    graceEnd: "2026-10-01",
    deletableFrom: "2026-10-02",
    dDay,
    students: list,
  };
}

// ky 응답처럼 .json(schema)로 바디를 검증해 돌려준다. 바디는 Promise 여도 된다.
const reply = (body: unknown) => ({
  json: async (schema: { parse: (value: unknown) => unknown }) =>
    schema.parse(await body),
});

const db = {
  tenants: [] as Record<string, unknown>[],
  previewFor: (_tenantId: string): unknown => preview(-36),
};

beforeEach(() => {
  vi.resetAllMocks();
  db.tenants = [TENANT];
  db.previewFor = () => preview(-36);
  http.get.mockImplementation(
    (url: string, options?: { searchParams?: { tenantId: string } }) =>
      url === "admin/tenants"
        ? reply({ items: db.tenants, graceDays: null })
        : reply(db.previewFor(options?.searchParams?.tenantId ?? "")),
  );
  vi.mocked(fetchAdminPermissions).mockResolvedValue(
    new Map([["tenants", "edit"]]),
  );
});

function Probe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <div>
      <output data-testid="path">{location.pathname}</output>
      <button type="button" onClick={() => navigate(-1)}>
        뒤로
      </button>
    </div>
  );
}

function renderAt(path: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin/memberPurge/*" element={<MemberPurgeAdmin />} />
        </Routes>
        <Probe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function openTenant() {
  renderAt("/admin/memberPurge");
  const select = await screen.findByLabelText("기관");
  await screen.findByRole("option", { name: /한빛고/ });
  fireEvent.change(select, { target: { value: "tenant-7" } });
  await screen.findByText("김*늘");
}

describe("MemberPurgeAdmin", () => {
  test("계약 종료일이 있는 기관만 이름순으로 고르는 칸에 보인다", async () => {
    db.tenants = [
      { ...TENANT, id: "t-b", name: "하나고", code: "BBBB0000" },
      { ...TENANT, id: "t-none", name: "가온고", contract_end_date: null },
      { ...TENANT, id: "t-a", name: "나래고", code: "AAAA0000" },
    ];
    renderAt("/admin/memberPurge");
    await screen.findByRole("option", { name: /하나고/ });

    const names = screen
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(names).toEqual([
      "기관을 고르세요",
      "나래고 (AAAA0000)",
      "하나고 (BBBB0000)",
    ]);
    expect(http.get).toHaveBeenCalledWith(
      "admin/tenants",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  test("주소에 기관이 있으면 새로 열어도 그 기관의 미리보기를 읽는다", async () => {
    renderAt("/admin/memberPurge/tenant-7");

    expect(await screen.findByText("김*늘")).toBeTruthy();
    expect((screen.getByLabelText("기관") as HTMLSelectElement).value).toBe(
      "tenant-7",
    );
  });

  test("기관을 고르면 주소가 바뀌고 뒤로 가면 고르는 화면으로 돌아온다", async () => {
    await openTenant();
    expect(screen.getByTestId("path").textContent).toBe(
      "/admin/memberPurge/tenant-7",
    );

    fireEvent.click(screen.getByRole("button", { name: "뒤로" }));

    await waitFor(() =>
      expect(screen.getByTestId("path").textContent).toBe("/admin/memberPurge"),
    );
    expect((screen.getByLabelText("기관") as HTMLSelectElement).value).toBe("");
    expect(screen.queryByText("김*늘")).toBeNull();
  });

  test("미리보기를 못 읽으면 서버가 준 안내를 보여 준다", async () => {
    db.previewFor = () =>
      Promise.reject(
        new ApiError({
          status: 403,
          code: "FORBIDDEN",
          detail: "권한이 없어요.",
        }),
      );
    renderAt("/admin/memberPurge/tenant-7");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "권한이 없어요.",
    );
  });

  test("기관 목록을 못 읽으면 안내를 보여 준다", async () => {
    http.get.mockReturnValue({
      json: async () => {
        throw new ApiError({ status: 500, code: "X", detail: "서버 오류" });
      },
    });
    renderAt("/admin/memberPurge");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "기관 목록을 불러오지 못했어요.",
    );
  });

  test("열 머리글은 scope col 을 가진다", async () => {
    await openTenant();
    expect(screen.getByRole("columnheader", { name: "이름" })).toHaveAttribute(
      "scope",
      "col",
    );
  });

  test("기관을 고르면 계약 종료일, 유예 종료일, 삭제 가능일 안내와 학생 목록이 보이고 유료 전환 학생은 고를 수 없다", async () => {
    await openTenant();

    expect(http.get).toHaveBeenCalledWith(
      "admin/tenants/member-purge-preview",
      expect.objectContaining({ searchParams: { tenantId: "tenant-7" } }),
    );
    expect(screen.getByText("2026-09-01")).toBeTruthy();
    expect(screen.getByText("2026-10-01")).toBeTruthy();
    const paidRow = screen.getByText("이*윤").closest("tr") as HTMLElement;
    const paidBox = within(paidRow).getByRole("checkbox") as HTMLInputElement;
    expect(paidBox.checked).toBe(false);
    expect(paidBox.disabled).toBe(true);
    expect(within(paidRow).getByText("제외(유료 전환)")).toBeTruthy();
    const row = screen.getByText("김*늘").closest("tr") as HTMLElement;
    expect(
      (within(row).getByRole("checkbox") as HTMLInputElement).checked,
    ).toBe(true);
    expect(within(row).getByText("고1")).toBeTruthy();
  });

  test("체크를 푼 학생은 보내지 않고, 기관 이름을 입력해야 삭제를 확정하며, 결과 건수를 보여 준다", async () => {
    http.post.mockReturnValue(
      reply({ deleted: 1, excluded: 1, skipped: 1, notProcessed: 0 }),
    );
    await openTenant();
    fireEvent.click(screen.getByLabelText("박*준 선택"));

    fireEvent.click(screen.getByRole("button", { name: "삭제 실행" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(
      within(dialog).getByText(
        "삭제한 회원정보는 되돌릴 수 없어요. 1명을 삭제할까요?",
      ),
    ).toBeTruthy();
    const confirm = within(dialog).getByRole("button", {
      name: "삭제",
    }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText("기관 이름 입력"), {
      target: { value: "한빛" },
    });
    expect(confirm.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText("기관 이름 입력"), {
      target: { value: "한빛고" },
    });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);

    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith(
        "admin/tenants/member-purge",
        expect.objectContaining({
          json: { tenantId: "tenant-7", targetIds: ["s-1"] },
        }),
      ),
    );
    expect(
      await screen.findByText("삭제 1명, 제외(유료 전환) 1명, 제외(직접) 1명"),
    ).toBeTruthy();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  test("먼저 고른 기관의 미리보기가 늦게 도착해도 지금 고른 기관의 목록을 덮어쓰지 않는다", async () => {
    db.tenants = [TENANT, { ...TENANT, id: "tenant-8", name: "새빛고" }];
    let resolveSlow: (value: Preview) => void = () => {};
    db.previewFor = (id) =>
      id === "tenant-7"
        ? new Promise<Preview>((resolve) => {
            resolveSlow = resolve;
          })
        : preview(-36, [
            {
              id: "s-9",
              name: "최*새",
              grade: "고1",
              classLabel: null,
              number: null,
              protected: false,
            },
          ]);
    renderAt("/admin/memberPurge");
    const select = await screen.findByLabelText("기관");
    await screen.findByRole("option", { name: /새빛고/ });
    fireEvent.change(select, { target: { value: "tenant-7" } });
    fireEvent.change(select, { target: { value: "tenant-8" } });
    await screen.findByText("최*새");

    resolveSlow(preview(-36));
    await waitFor(() =>
      expect(
        http.get.mock.calls.filter(([url]) => url.endsWith("preview")),
      ).toHaveLength(2),
    );
    await Promise.resolve();

    expect(screen.getByText("최*새")).toBeTruthy();
    expect(screen.queryByText("김*늘")).toBeNull();
  });

  test("tenants 편집 권한이 없으면 삭제 실행 버튼이 막힌다", async () => {
    vi.mocked(fetchAdminPermissions).mockResolvedValue(
      new Map([["tenants", "view"]]),
    );
    await openTenant();

    expect(
      (screen.getByRole("button", { name: "삭제 실행" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  test("처리하지 못한 학생이 있으면 다시 실행해 달라는 안내를 보여 주고, 없으면 보여 주지 않는다", async () => {
    http.post.mockReturnValueOnce(
      reply({ deleted: 1, excluded: 0, skipped: 0, notProcessed: 2 }),
    );
    await openTenant();
    fireEvent.click(screen.getByRole("button", { name: "삭제 실행" }));
    let dialog = await screen.findByRole("alertdialog");
    fireEvent.change(within(dialog).getByLabelText("기관 이름 입력"), {
      target: { value: "한빛고" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "삭제" }));

    expect(
      await screen.findByText(
        "처리하지 못한 학생 2명, 잠시 뒤 다시 실행해 주세요",
      ),
    ).toBeTruthy();

    http.post.mockReturnValueOnce(
      reply({ deleted: 1, excluded: 0, skipped: 0, notProcessed: 0 }),
    );
    fireEvent.click(screen.getByRole("button", { name: "삭제 실행" }));
    dialog = await screen.findByRole("alertdialog");
    fireEvent.change(within(dialog).getByLabelText("기관 이름 입력"), {
      target: { value: "한빛고" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "삭제" }));

    await screen.findByText("삭제 1명, 제외(유료 전환) 0명, 제외(직접) 0명");
    expect(screen.queryByText(/처리하지 못한 학생/)).toBeNull();
  });

  test("삭제 가능일 전에는 삭제 실행 버튼이 막히고 D-day 안내가 보인다", async () => {
    db.previewFor = () => ({
      contractEnd: "2999-09-01",
      graceEnd: "2999-10-01",
      deletableFrom: "2999-10-02",
      dDay: 12,
      students: STUDENTS,
    });
    await openTenant();

    expect(
      (screen.getByRole("button", { name: "삭제 실행" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(screen.getByText(/삭제 가능일 D-/)).toBeTruthy();
  });

  test("서버가 아직 삭제할 수 없다고 하면 그 안내를 보여 주고 목록은 그대로 둔다", async () => {
    http.post.mockReturnValue({
      json: async () => {
        throw new ApiError({
          status: 409,
          code: "NOT_DELETABLE",
          detail: "아직 삭제할 수 없는 기관입니다.",
        });
      },
    });
    await openTenant();
    fireEvent.click(screen.getByRole("button", { name: "삭제 실행" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.change(within(dialog).getByLabelText("기관 이름 입력"), {
      target: { value: "한빛고" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "삭제" }));

    expect(
      await screen.findByText("아직 삭제할 수 없는 기관입니다."),
    ).toBeTruthy();
    expect(screen.getByText("김*늘")).toBeTruthy();
  });

  describe("삭제 확인 모달", () => {
    async function openConfirm() {
      await openTenant();
      fireEvent.click(screen.getByRole("button", { name: "삭제 실행" }));
      return await screen.findByRole("alertdialog", {
        name: "계약 종료 회원 삭제 확인",
      });
    }

    test("취소가 왼쪽 삭제가 오른쪽에 있고 처음 포커스는 취소에 있다", async () => {
      const dialog = await openConfirm();

      const cancel = within(dialog).getByRole("button", { name: "취소" });
      const purge = within(dialog).getByRole("button", { name: "삭제" });
      expect(
        cancel.compareDocumentPosition(purge) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      await waitFor(() => expect(document.activeElement).toBe(cancel));
    });

    test("기관 이름이 비어 있으면 아무것도 입력하지 않아도 삭제 버튼은 막혀 있다", async () => {
      db.tenants = [{ ...TENANT, name: "" }];
      renderAt("/admin/memberPurge");
      const select = await screen.findByLabelText("기관");
      await screen.findByRole("option", { name: /ABCD1234/ });
      fireEvent.change(select, { target: { value: "tenant-7" } });
      await screen.findByText("김*늘");
      fireEvent.click(screen.getByRole("button", { name: "삭제 실행" }));
      const dialog = await screen.findByRole("alertdialog");

      expect(
        (
          within(dialog).getByRole("button", {
            name: "삭제",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
    });

    test("삭제 중에는 Esc 로 닫히지 않고 취소도 막혀 있다", async () => {
      http.post.mockReturnValue({ json: () => new Promise(() => {}) });
      const dialog = await openConfirm();
      fireEvent.change(within(dialog).getByLabelText("기관 이름 입력"), {
        target: { value: "한빛고" },
      });
      fireEvent.click(within(dialog).getByRole("button", { name: "삭제" }));
      await waitFor(() => expect(http.post).toHaveBeenCalledTimes(1));

      fireEvent.keyDown(document.activeElement ?? document.body, {
        key: "Escape",
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(screen.getByRole("alertdialog")).toBeTruthy();
      expect(
        (
          within(dialog).getByRole("button", {
            name: "취소",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
    });

    test("실행 전에 Esc 로 닫으면 입력한 기관 이름이 지워진다", async () => {
      const dialog = await openConfirm();
      fireEvent.change(within(dialog).getByLabelText("기관 이름 입력"), {
        target: { value: "한빛고" },
      });

      fireEvent.keyDown(document.activeElement ?? document.body, {
        key: "Escape",
      });
      await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
      fireEvent.click(screen.getByRole("button", { name: "삭제 실행" }));

      const reopened = await screen.findByRole("alertdialog");
      expect(
        (within(reopened).getByLabelText("기관 이름 입력") as HTMLInputElement)
          .value,
      ).toBe("");
      expect(http.post).not.toHaveBeenCalled();
    });

    test("바깥을 눌러도 닫히지 않는다", async () => {
      await openConfirm();

      fireEvent.pointerDown(document.body);
      fireEvent.mouseDown(document.body);
      fireEvent.pointerUp(document.body);
      fireEvent.mouseUp(document.body);
      fireEvent.click(document.body);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(screen.getByRole("alertdialog")).toBeTruthy();
    });
  });
});
