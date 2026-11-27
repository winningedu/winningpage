// 본사 기관 목록과 등록(5번 본사 관리 화면). 사이트 플래그 hqTenantAdmin 이 꺼져 있으면(위닝) 예전 그대로다.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { createMemoryRouter, RouterProvider, useParams } from "react-router";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  hqTenantAdmin: true,
  rows: [] as Record<string, unknown>[],
  graceDays: 30 as number | null,
  created: null as Record<string, unknown> | null,
  listError: null as Error | null,
  createError: null as Error | null,
  creates: [] as Record<string, unknown>[],
  fetches: [] as (AbortSignal | undefined)[],
}));

vi.mock("@/config/site", () => ({
  site: {
    features: {
      get hqTenantAdmin() {
        return state.hqTenantAdmin;
      },
    },
  },
}));

vi.mock("./api", () => ({
  fetchTenants: vi.fn(async (signal?: AbortSignal) => {
    state.fetches.push(signal);
    if (state.listError) throw state.listError;
    return { items: state.rows, graceDays: state.graceDays };
  }),
  createTenant: vi.fn(async (body: Record<string, unknown>) => {
    if (state.createError) throw state.createError;
    state.creates.push(body);
    return state.created;
  }),
}));

vi.mock("@/pages/admin/tenants/TenantDetail", () => ({
  default: function TenantDetailStub() {
    const { id } = useParams();
    return <div>기관 상세 {id}</div>;
  },
}));

import { Toaster } from "@/components/ui/toast";
import { ApiError } from "@/lib/http/client";
import { ConfirmAdminHost } from "@/pages/admin/shared/confirmAdmin";
import { SectionEditAccessProvider } from "@/pages/admin/shared/sectionEditAccess";
import TenantsAdmin from "./TenantsAdmin";
import { tenantKeys } from "./tenantQueries";

const BASE = {
  region: "서울",
  org_type: "학교",
  tier: "B",
  created_at: "2026-09-01T00:00:00Z",
  contract_start_date: null,
  contract_end_date: null,
  grace_ends_on: null,
  mou_status: null,
  is_catch_all: false,
  time_zone: "Asia/Seoul",
};
const ROWS = [
  {
    ...BASE,
    id: "tenant-7",
    code: "ABCD2345",
    name: "한빛고",
    contract_start_date: "2026-03-01",
    contract_end_date: "2026-09-01",
    grace_ends_on: "2026-10-01",
    mou_status: "signed",
  },
  {
    ...BASE,
    id: "tenant-9",
    code: "KKKK2222",
    name: "기타 소속",
    is_catch_all: true,
  },
];

const CONFIG = { title: "기관 관리", searchPlaceholder: "검색" };

beforeEach(() => {
  state.hqTenantAdmin = true;
  state.rows = ROWS;
  state.graceDays = 30;
  state.created = null;
  canEdit = true;
  state.listError = null;
  state.createError = null;
  state.creates = [];
  state.fetches = [];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-21T03:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

// 지금 메뉴의 편집 권한. 기본은 edit 이고, view 시험에서만 끈다.
let canEdit = true;

function renderAdmin(path = "/admin/tenants") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const reset = vi.spyOn(client, "resetQueries");
  const router = createMemoryRouter(
    [{ path: "/admin/tenants/*", element: <TenantsAdmin config={CONFIG} /> }],
    { initialEntries: [path] },
  );
  render(
    <SectionEditAccessProvider value={canEdit}>
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
        <ConfirmAdminHost />
        <Toaster />
      </QueryClientProvider>
    </SectionEditAccessProvider>,
  );
  return { router, reset, client };
}

// 다음 목록 요청을 resolve 를 부를 때까지 붙잡아 둔다.
async function holdNextFetch() {
  const api = await import("./api");
  let resolve: () => void = () => {};
  const gate = new Promise<void>((r) => {
    resolve = r;
  });
  vi.mocked(api.fetchTenants).mockImplementationOnce(
    async (signal?: AbortSignal) => {
      state.fetches.push(signal);
      await gate;
      return { items: state.rows, graceDays: state.graceDays } as never;
    },
  );
  return resolve;
}

function openCreate() {
  fireEvent.click(screen.getByRole("button", { name: "등록" }));
}

function fillName(value: string) {
  fireEvent.change(screen.getByRole("textbox"), { target: { value } });
}

function toastTitle() {
  return document.querySelector('[data-slot="toast-title"]');
}

function toastDescription() {
  return document.querySelector('[data-slot="toast-description"]');
}

describe("TenantsAdmin 목록 불러오기", () => {
  test("목록 주소로 들어오면 서버에서 기관을 받아 이름 목록으로 보인다", async () => {
    renderAdmin();

    expect(await screen.findByText("한빛고")).toBeTruthy();
    expect(screen.getByText("기타 소속")).toBeTruthy();
    expect(state.fetches).toHaveLength(1);
    expect(state.fetches[0]).toBeInstanceOf(AbortSignal);
  });

  test("검색어는 이름에 포함된 기관만 남긴다", async () => {
    renderAdmin();
    await screen.findByText("한빛고");

    fireEvent.change(screen.getByLabelText("검색"), {
      target: { value: "한빛" },
    });

    expect(screen.getByText("한빛고")).toBeTruthy();
    expect(screen.queryByText("기타 소속")).toBeNull();
  });

  test("주소의 q 로 시작하면 그 검색어로 걸러진 목록을 보인다", async () => {
    renderAdmin("/admin/tenants?q=한빛");

    expect(await screen.findByText("한빛고")).toBeTruthy();
    expect(screen.queryByText("기타 소속")).toBeNull();
    expect(screen.getByLabelText("검색")).toHaveProperty("value", "한빛");
  });

  test("입력한 검색어는 주소의 q 에 써지고 비우면 지워진다", async () => {
    const { router } = renderAdmin();
    await screen.findByText("한빛고");

    fireEvent.change(screen.getByLabelText("검색"), {
      target: { value: "한빛" },
    });
    expect(new URLSearchParams(router.state.location.search).get("q")).toBe(
      "한빛",
    );

    fireEvent.change(screen.getByLabelText("검색"), { target: { value: "" } });
    expect(router.state.location.search).toBe("");
  });

  test("초기화를 누르면 목록을 다시 받는다", async () => {
    renderAdmin();
    await screen.findByText("한빛고");

    fireEvent.click(screen.getByRole("button", { name: "초기화" }));

    await waitFor(() => expect(state.fetches).toHaveLength(2));
  });
});

describe("TenantsAdmin 목록 스켈레톤", () => {
  test("처음 받는 동안은 표 스켈레톤이 보이고 응답이 오면 행으로 바뀐다", async () => {
    const resolve = await holdNextFetch();
    renderAdmin();

    expect(
      screen.getByRole("status", { name: "기관 목록을 불러오는 중입니다." }),
    ).toBeTruthy();
    expect(screen.queryByText("한빛고")).toBeNull();

    resolve();
    expect(await screen.findByText("한빛고")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  test("창 포커스 같은 백그라운드 재조회는 행을 그대로 두고 스켈레톤을 띄우지 않는다", async () => {
    const { client } = renderAdmin();
    await screen.findByText("한빛고");
    const resolve = await holdNextFetch();

    const refetching = client.refetchQueries({ queryKey: tenantKeys.list() });
    await waitFor(() => expect(state.fetches).toHaveLength(2));

    expect(screen.getByText("한빛고")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
    resolve();
    await refetching;
  });

  test("등록한 뒤 목록으로 돌아오면 옛 행 대신 스켈레톤을 거쳐 새 행이 보인다", async () => {
    state.created = {
      ...BASE,
      id: "tenant-new",
      code: "NEWC2345",
      name: "새기관",
    };
    const { router } = renderAdmin();
    await screen.findByText("한빛고");
    openCreate();
    fillName("새기관");
    openCreate();
    await screen.findByText("기관 상세 tenant-new");

    const resolve = await holdNextFetch();
    await router.navigate("/admin/tenants");

    expect(
      await screen.findByRole("status", {
        name: "기관 목록을 불러오는 중입니다.",
      }),
    ).toBeTruthy();
    expect(screen.queryByText("한빛고")).toBeNull();
    resolve();
    expect(await screen.findByText("한빛고")).toBeTruthy();
  });

  test("초기화를 누르면 스켈레톤을 거쳐 새로 받은 행이 보인다", async () => {
    renderAdmin();
    await screen.findByText("한빛고");
    const resolve = await holdNextFetch();

    fireEvent.click(screen.getByRole("button", { name: "초기화" }));

    expect(
      await screen.findByRole("status", {
        name: "기관 목록을 불러오는 중입니다.",
      }),
    ).toBeTruthy();
    resolve();
    expect(await screen.findByText("한빛고")).toBeTruthy();
  });
});

describe("TenantsAdmin 위닝(플래그 꺼짐)", () => {
  test("계약 열 없이 예전 칼럼만 보이고 행은 열리지 않는다", async () => {
    state.hqTenantAdmin = false;
    renderAdmin();

    expect(await screen.findByText("한빛고")).toBeTruthy();
    expect(screen.queryByText("계약 기간")).toBeNull();
    expect(screen.queryByText("MOU")).toBeNull();
    expect(screen.queryByRole("button", { name: "한빛고" })).toBeNull();
  });

  test("상세 주소로 들어와도 상세를 열지 않고 목록으로 돌려보낸다", async () => {
    state.hqTenantAdmin = false;
    const { router } = renderAdmin("/admin/tenants/tenant-7");

    expect(await screen.findByText("한빛고")).toBeTruthy();
    expect(router.state.location.pathname).toBe("/admin/tenants");
  });
});

describe("TenantsAdmin 표 접근성", () => {
  test("열 머리글은 scope col 을 가진다", async () => {
    renderAdmin();
    await screen.findByText("한빛고");
    expect(screen.getByRole("columnheader", { name: "이름" })).toHaveAttribute(
      "scope",
      "col",
    );
  });

  test("검색 입력은 접근 가능한 이름을 가진다", async () => {
    renderAdmin();
    await screen.findByText("한빛고");
    expect(screen.getByLabelText("검색")).toBeInTheDocument();
  });
});

describe("TenantsAdmin 발급 코드 모달(플래그 꺼짐)", () => {
  async function openIssuedDialog() {
    state.hqTenantAdmin = false;
    state.created = {
      ...BASE,
      id: "tenant-new",
      code: "NEWC2345",
      name: "새기관",
    };
    const view = renderAdmin();
    await screen.findByText("한빛고");
    openCreate();
    fillName("새기관");
    openCreate();
    return view;
  }

  test("제목을 접근 가능한 이름으로 가진 alertdialog 로 발급 코드를 보여 주고 목록으로 돌아온다", async () => {
    const { router } = await openIssuedDialog();

    const dialog = await screen.findByRole("alertdialog", {
      name: "기관을 발급했습니다",
    });
    expect(within(dialog).getByText("NEWC2345")).toBeTruthy();
    expect(router.state.location.pathname).toBe("/admin/tenants");
  });

  test("Esc 와 바깥 누름으로 닫히지 않고 확인으로만 닫힌다", async () => {
    await openIssuedDialog();
    const dialog = await screen.findByRole("alertdialog");

    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });
    fireEvent.pointerDown(document.body);
    fireEvent.mouseDown(document.body);
    fireEvent.pointerUp(document.body);
    fireEvent.mouseUp(document.body);
    fireEvent.click(document.body);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(within(dialog).getByText("NEWC2345")).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: "확인" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });
});

describe("TenantsAdmin 스쿨멘토(플래그 켜짐)", () => {
  test("계약 기간, MOU, 유예 종료일, 삭제 D-day 열을 보인다", async () => {
    renderAdmin();

    const row = (await screen.findByText("한빛고")).closest(
      "tr",
    ) as HTMLElement;
    for (const header of [
      "기관 유형",
      "소속코드",
      "계약 기간",
      "MOU",
      "유예 종료일",
      "삭제 D-day",
    ]) {
      expect(screen.getByText(header)).toBeTruthy();
    }
    expect(row.textContent).toContain("2026-03-01 ~ 2026-09-01");
    expect(
      within(row).getByRole("button", { name: "소속코드 복사" }),
    ).toBeTruthy();
    expect(row.textContent).toContain("협약 중");
    expect(row.textContent).toContain("2026-10-01");
    // 2026-09-21 KST 에서 삭제 가능일(유예 종료 다음 날 10-02)까지 11일.
    expect(row.textContent).toContain("삭제 가능일 D-11");
  });

  test("삭제 D-day 의 오늘은 기관 시간대로 센다(뉴욕은 서울보다 하루 늦다)", async () => {
    state.rows = [{ ...ROWS[0], time_zone: "America/New_York" }];
    renderAdmin();

    const row = (await screen.findByText("한빛고")).closest(
      "tr",
    ) as HTMLElement;
    // 시스템 시각 2026-09-21T03:00Z 는 뉴욕에서 09-20 이라 삭제 가능일 10-02 까지 12일.
    expect(row.textContent).toContain("삭제 가능일 D-12");
  });

  test.each([
    ["종료일만", { contract_start_date: null }, "~ 2026-09-01"],
    ["시작일만", { contract_end_date: null }, "2026-03-01 ~"],
  ])("계약 %s 있으면 있는 날짜만 보인다", async (_label, patch, expected) => {
    state.rows = [{ ...ROWS[0], ...patch }];
    renderAdmin();

    const row = (await screen.findByText("한빛고")).closest(
      "tr",
    ) as HTMLElement;
    expect(row.textContent).toContain(expected);
  });

  test("기타 소속에는 기타 뱃지를 붙이고 계약이 없으면 대시로 보인다", async () => {
    renderAdmin();

    const row = (await screen.findByText("기타 소속")).closest(
      "tr",
    ) as HTMLElement;
    expect(row.textContent).toContain("기타");
    expect(screen.getAllByText("기타")).toHaveLength(1);
    expect(row.textContent).toContain("-");
  });

  test("서버가 준 기본 유예 일수를 유예 종료일이 빈 기관에 쓴다", async () => {
    state.rows = [{ ...ROWS[0], grace_ends_on: null }];
    state.graceDays = 10;
    renderAdmin();

    // 계약 종료 09-01 + 10일 = 유예 종료 09-11, 삭제 가능일 09-12, 오늘 09-21 이라 지났다.
    expect(
      await screen.findByText("삭제 가능, 계약 종료 후 20일 지남"),
    ).toBeTruthy();
  });

  test("기관 이름을 누르면 그 기관의 상세 주소로 가고 상세 주소로 바로 들어와도 열린다", async () => {
    const { router } = renderAdmin();

    fireEvent.click(await screen.findByRole("button", { name: "한빛고" }));
    expect(await screen.findByText("기관 상세 tenant-7")).toBeTruthy();
    expect(router.state.location.pathname).toBe("/admin/tenants/tenant-7");
  });

  test("상세 주소로 바로 들어오면 목록을 거치지 않고 상세를 연다", async () => {
    renderAdmin("/admin/tenants/tenant-9/school-admins");

    expect(await screen.findByText("기관 상세 tenant-9")).toBeTruthy();
    expect(state.fetches).toHaveLength(0);
  });

  test("상세에서 브라우저 뒤로가기를 하면 목록으로 돌아온다", async () => {
    const { router } = renderAdmin();
    fireEvent.click(await screen.findByRole("button", { name: "한빛고" }));
    await screen.findByText("기관 상세 tenant-7");

    await router.navigate(-1);

    expect(await screen.findByText("기타 소속")).toBeTruthy();
    expect(router.state.location.pathname).toBe("/admin/tenants");
  });
});

describe("TenantsAdmin 등록", () => {
  const NEW_TENANT = {
    ...BASE,
    id: "tenant-new",
    code: "NEWC2345",
    name: "새기관",
  };

  test("등록 버튼은 등록 주소로 가고 그 주소로 바로 들어와도 폼이 열린다", async () => {
    const { router } = renderAdmin();
    await screen.findByText("한빛고");

    openCreate();
    expect(await screen.findByText("기관 관리 등록")).toBeTruthy();
    expect(router.state.location.pathname).toBe("/admin/tenants/new");
  });

  test("등록 주소로 바로 들어오면 폼이 열리고 목록은 받지 않는다", async () => {
    renderAdmin("/admin/tenants/new");

    expect(await screen.findByText("기관 관리 등록")).toBeTruthy();
    expect(state.fetches).toHaveLength(0);
  });

  test("스쿨멘토에서 등록하면 입력값을 보내고 목록을 갱신 대상으로 만든 뒤 새 기관의 상세 주소로 간다", async () => {
    state.created = NEW_TENANT;
    const { router, reset } = renderAdmin();
    await screen.findByText("한빛고");

    openCreate();
    fillName("  새기관 ");
    openCreate();

    expect(await screen.findByText("기관 상세 tenant-new")).toBeTruthy();
    expect(state.creates).toEqual([
      { name: "새기관", region: "서울", org_type: "기관", tier: "W" },
    ]);
    expect(router.state.location.pathname).toBe("/admin/tenants/tenant-new");
    expect(reset).toHaveBeenCalledWith({ queryKey: tenantKeys.list() });
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  test("등록 중에는 등록 버튼이 잠긴다", async () => {
    const api = await import("./api");
    let finish: () => void = () => {};
    vi.mocked(api.createTenant).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(NEW_TENANT as never);
        }),
    );
    renderAdmin("/admin/tenants/new");
    fillName("새기관");
    openCreate();

    expect(
      await screen.findByRole("button", { name: "등록 중..." }),
    ).toBeDisabled();
    finish();
    expect(await screen.findByText("기관 상세 tenant-new")).toBeTruthy();
  });

  test("취소하면 목록으로 돌아간다", async () => {
    const { router } = renderAdmin("/admin/tenants/new");
    await screen.findByText("기관 관리 등록");

    fireEvent.click(screen.getByRole("button", { name: "취소" }));

    expect(await screen.findByText("한빛고")).toBeTruthy();
    expect(router.state.location.pathname).toBe("/admin/tenants");
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});

describe("TenantsAdmin 등록 폼 이탈 보호", () => {
  test("입력한 채 취소하려 하면 확인창이 뜨고 계속 작성하면 폼에 머문다", async () => {
    const { router } = renderAdmin("/admin/tenants/new");
    await screen.findByText("기관 관리 등록");
    fillName("새기관");

    fireEvent.click(screen.getByRole("button", { name: "취소" }));

    const dialog = await screen.findByRole("alertdialog", {
      name: "저장하지 않은 변경이 있어요",
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "계속 수정" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(router.state.location.pathname).toBe("/admin/tenants/new");
    expect(screen.getByRole("textbox")).toHaveValue("새기관");
  });

  test("확인창에서 나가기를 고르면 목록으로 간다", async () => {
    renderAdmin("/admin/tenants/new");
    await screen.findByText("기관 관리 등록");
    fillName("새기관");

    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "나가기" }));

    expect(await screen.findByText("한빛고")).toBeTruthy();
  });

  test("새로고침과 탭 닫기는 입력한 동안에만 막는다", async () => {
    renderAdmin("/admin/tenants/new");
    await screen.findByText("기관 관리 등록");

    const clean = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);

    fillName("새기관");
    const dirty = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
  });
});

describe("TenantsAdmin 오류 안내", () => {
  test("목록 조회에 실패하면 서버 문구만 토스트로 보인다", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    state.listError = new ApiError({
      status: 500,
      code: "INTERNAL",
      detail: "기관 목록을 읽지 못했어요.",
    });
    renderAdmin();

    await waitFor(() =>
      expect(toastTitle()).toHaveTextContent("기관 관리 조회 실패"),
    );
    expect(toastDescription()).toHaveTextContent("기관 목록을 읽지 못했어요.");
    expect(alertSpy).not.toHaveBeenCalled();
  });

  test("등록에 실패하면 '등록 실패' 제목에 서버 문구를 보이고 폼에 머문다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    state.createError = new ApiError({
      status: 403,
      code: "NOT_SUPER_ADMIN",
      detail: "최고 관리자만 소속을 등록할 수 있습니다.",
    });
    const { router } = renderAdmin("/admin/tenants/new");
    await screen.findByText("기관 관리 등록");
    fillName("새기관");
    openCreate();

    await waitFor(() => expect(toastTitle()).toHaveTextContent("등록 실패"));
    expect(toastDescription()).toHaveTextContent(
      "최고 관리자만 소속을 등록할 수 있습니다.",
    );
    expect(router.state.location.pathname).toBe("/admin/tenants/new");
  });

  test("소속코드를 복사하면 '복사했습니다' 토스트가 보이고 코드는 토스트에 없다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    renderAdmin();
    const row = (await screen.findByText("한빛고")).closest(
      "tr",
    ) as HTMLElement;

    fireEvent.click(within(row).getByRole("button", { name: "소속코드 복사" }));

    await waitFor(() => expect(toastTitle()).toHaveTextContent("복사했습니다"));
    expect(writeText).toHaveBeenCalledWith("ABCD2345");
    expect(
      document.querySelector('[data-slot="toast-viewport"]')?.textContent,
    ).not.toContain("ABCD2345");
  });

  test("복사에 실패하면 실패 토스트가 보이고 로그에 코드가 남지 않는다", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi
          .fn()
          .mockRejectedValue(new DOMException("denied", "NotAllowedError")),
      },
    });
    renderAdmin();
    const row = (await screen.findByText("한빛고")).closest(
      "tr",
    ) as HTMLElement;

    fireEvent.click(within(row).getByRole("button", { name: "소속코드 복사" }));

    await waitFor(() =>
      expect(toastTitle()).toHaveTextContent("복사하지 못했습니다"),
    );
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("ABCD2345");
  });

  test("이름을 비우고 등록하면 등록 요청 없이 경고 토스트가 보인다", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    renderAdmin("/admin/tenants/new");
    await screen.findByText("기관 관리 등록");

    openCreate();

    await waitFor(() =>
      expect(toastTitle()).toHaveTextContent("이름 항목을 입력해주세요."),
    );
    expect(state.creates).toHaveLength(0);
    expect(alertSpy).not.toHaveBeenCalled();
  });
});

describe("TenantsAdmin view 권한", () => {
  test("view 권한이면 목록에 등록 버튼이 없다", async () => {
    canEdit = false;
    renderAdmin();
    await screen.findByText("한빛고");

    expect(screen.queryByRole("button", { name: "등록" })).toBeNull();
  });

  test("edit 권한이면 목록에 등록 버튼이 있다", async () => {
    renderAdmin();
    await screen.findByText("한빛고");

    expect(screen.getByRole("button", { name: "등록" })).toBeTruthy();
  });

  test("view 권한으로 등록 주소에 바로 들어오면 저장 버튼이 없고 취소만 남는다", async () => {
    canEdit = false;
    renderAdmin("/admin/tenants/new");
    await screen.findByText("기관 관리 등록");

    expect(screen.queryByRole("button", { name: "등록" })).toBeNull();
    expect(screen.getByRole("button", { name: "취소" })).toBeTruthy();
  });

  test("edit 권한이면 등록 폼에 등록 버튼이 있다", async () => {
    renderAdmin("/admin/tenants/new");
    await screen.findByText("기관 관리 등록");

    expect(screen.getByRole("button", { name: "등록" })).toBeTruthy();
  });
});
