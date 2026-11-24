import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, test, vi } from "vitest";

const db = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  loadError: null as Error | null,
  patchError: null as Error | null,
  patches: [] as {
    id: string;
    updatedAt: string;
    values: Record<string, unknown>;
  }[],
  fetches: [] as { id: string; signal: AbortSignal | undefined }[],
  /** 전체 관리자 목록 요청이 받은 기관 id. */
  adminFetches: [] as string[],
  /** 값이 있으면 상세와 전체 관리자 응답이 이 약속이 풀릴 때까지 기다린다. */
  hold: null as Promise<void> | null,
  /** 저장 응답이 돌려줄 새 updated_at. */
  nextUpdatedAt: "2026-11-06T01:00:00Z",
}));

vi.mock("./api", () => ({
  fetchTenantDetail: vi.fn(async (id: string, signal?: AbortSignal) => {
    db.fetches.push({ id, signal });
    await db.hold;
    if (db.loadError) throw db.loadError;
    return db.row;
  }),
  fetchSchoolAdmins: vi.fn(async (id: string) => {
    db.adminFetches.push(id);
    await db.hold;
    return { items: [], address: null };
  }),
  patchTenant: vi.fn(
    async (body: {
      id: string;
      updatedAt: string;
      values: Record<string, unknown>;
    }) => {
      if (db.patchError) throw db.patchError;
      db.patches.push(body);
      return { id: body.id, updated_at: db.nextUpdatedAt };
    },
  ),
}));

vi.mock("./SchoolAdminPanel", () => ({
  default: ({
    tenantId,
    tenantName,
  }: {
    tenantId: string;
    tenantName: string;
  }) => <div>전체 관리자 패널 {`${tenantId}/${tenantName}`}</div>,
}));

vi.mock("./ServiceSettingsPanel", () => ({
  default: ({
    tenantId,
    termMonths,
    isCatchAll,
  }: {
    tenantId: string;
    termMonths: number | null;
    isCatchAll: boolean;
  }) => (
    <div>
      서비스 설정 패널 {`${tenantId}/${termMonths}/${String(isCatchAll)}`}
    </div>
  ),
}));

import { ApiError } from "@/lib/http/client";
import { ConfirmAdminHost } from "@/pages/admin/shared/confirmAdmin";
import TenantDetail from "./TenantDetail";
import { tenantKeys } from "./tenantQueries";

const ROW = {
  id: "tenant-7",
  code: "ABCD2345",
  name: "한빛고",
  region: "서울",
  org_type: "학교",
  tier: "B",
  contract_start_date: "2026-03-01",
  contract_end_date: "2027-02-28",
  term_months: 6,
  mou_status: "signed",
  grace_ends_on: null,
  trial_start_date: "2026-11-20",
  trial_end_date: "2026-12-19",
  contact_name: "김담당",
  contact_phone: null,
  contact_mobile: null,
  contact_email: null,
  address: "서울시 중구 1",
  main_phone: null,
  homepage: null,
  is_catch_all: false,
  updated_at: "2026-11-05T05:00:00Z",
};

beforeEach(() => {
  db.row = { ...ROW };
  db.loadError = null;
  db.patchError = null;
  db.patches = [];
  db.fetches = [];
  db.adminFetches = [];
  db.hold = null;
  db.nextUpdatedAt = "2026-11-06T01:00:00Z";
});

function problem(status: number, code: string, detail: string) {
  return new ApiError({ status, code, detail });
}

function renderDetail(path = "/admin/tenants/tenant-7") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const reset = vi.spyOn(client, "resetQueries");
  const router = createMemoryRouter(
    [
      { path: "/admin/tenants", element: <div>기관 목록 화면</div> },
      { path: "/admin/tenants/:id/*", element: <TenantDetail /> },
    ],
    { initialEntries: [path] },
  );
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
      <ConfirmAdminHost />
    </QueryClientProvider>,
  );
  return { router, reset };
}

const SAVE = () => screen.getByRole("button", { name: "저장" });

describe("TenantDetail 기관 정보 탭", () => {
  test("주소로 바로 들어오면 id 로 상세를 불러와 입력칸을 채우고 소속코드는 읽기 전용이다", async () => {
    renderDetail();

    expect(await screen.findByDisplayValue("한빛고")).toBeTruthy();
    expect(db.fetches[0]?.id).toBe("tenant-7");
    expect(db.fetches[0]?.signal).toBeInstanceOf(AbortSignal);
    const code = screen.getByLabelText("소속코드") as HTMLInputElement;
    expect(code.value).toBe("ABCD2345");
    expect(code.readOnly).toBe(true);
    expect(
      (screen.getByLabelText("계약 시작일") as HTMLInputElement).value,
    ).toBe("2026-03-01");
    expect(
      (screen.getByLabelText("학기 길이") as HTMLSelectElement).value,
    ).toBe("6");
    expect((screen.getByLabelText("MOU") as HTMLSelectElement).value).toBe(
      "signed",
    );
  });

  test("시범 시작일과 종료일을 불러와 고쳐 저장한다(결정 117)", async () => {
    renderDetail();
    await screen.findByDisplayValue("한빛고");
    expect(
      (screen.getByLabelText("시범 시작일") as HTMLInputElement).value,
    ).toBe("2026-11-20");

    fireEvent.change(screen.getByLabelText("시범 종료일"), {
      target: { value: "2026-12-31" },
    });
    fireEvent.click(SAVE());

    await waitFor(() => expect(db.patches).toHaveLength(1));
    expect(db.patches[0]?.values).toMatchObject({
      trial_start_date: "2026-11-20",
      trial_end_date: "2026-12-31",
    });
  });

  test("시범 종료일만 비우면 저장하지 않고 안내를 보인다", async () => {
    renderDetail();
    await screen.findByDisplayValue("한빛고");
    fireEvent.change(screen.getByLabelText("시범 종료일"), {
      target: { value: "" },
    });
    fireEvent.click(SAVE());

    expect(
      await screen.findByText("시범 시작일과 종료일을 함께 입력해 주세요."),
    ).toBeTruthy();
    expect(db.patches).toHaveLength(0);
  });

  test("MOU 칸 옆에 계약 종료일 기준 안내를 보인다(결정 102.7)", async () => {
    renderDetail();
    await screen.findByDisplayValue("한빛고");

    expect(
      screen.getByText("서비스는 계약 종료일 기준으로 막혀요"),
    ).toBeTruthy();
  });

  test("저장은 id 와 불러온 updatedAt 과 값을 보내고 소속코드는 보내지 않는다", async () => {
    const { reset } = renderDetail();
    fireEvent.change(await screen.findByDisplayValue("한빛고"), {
      target: { value: "한빛고등학교" },
    });
    fireEvent.change(screen.getByLabelText("유예 종료일"), {
      target: { value: "2027-03-30" },
    });
    fireEvent.click(SAVE());

    await waitFor(() => expect(db.patches).toHaveLength(1));
    expect(db.patches[0]).toMatchObject({
      id: "tenant-7",
      updatedAt: "2026-11-05T05:00:00Z",
      values: {
        name: "한빛고등학교",
        grace_ends_on: "2027-03-30",
        contract_end_date: "2027-02-28",
        term_months: 6,
        contact_phone: null,
      },
    });
    expect(Object.keys(db.patches[0]?.values ?? {})).not.toContain("code");
    expect(await screen.findByText("저장했어요.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "한빛고등학교" })).toBeTruthy();
    // 저장하면 목록이 낡은 값을 보이지 않게 비우고 스켈레톤 뒤에 다시 받는다.
    expect(reset).toHaveBeenCalledWith({ queryKey: tenantKeys.list() });
  });

  test("저장 뒤 다시 저장하면 서버가 돌려준 새 updatedAt 을 보낸다", async () => {
    renderDetail();
    fireEvent.change(await screen.findByDisplayValue("한빛고"), {
      target: { value: "한빛1" },
    });
    fireEvent.click(SAVE());
    await screen.findByText("저장했어요.");
    fireEvent.change(screen.getByDisplayValue("한빛1"), {
      target: { value: "한빛2" },
    });
    fireEvent.click(SAVE());

    await waitFor(() => expect(db.patches).toHaveLength(2));
    expect(db.patches[1]?.updatedAt).toBe("2026-11-06T01:00:00Z");
  });

  test("저장 중에는 저장 버튼이 잠긴다", async () => {
    const api = await import("./api");
    let finish: () => void = () => {};
    vi.mocked(api.patchTenant).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () =>
            resolve({ id: "tenant-7", updated_at: "2026-11-06T01:00:00Z" });
        }),
    );
    renderDetail();
    await screen.findByDisplayValue("한빛고");
    fireEvent.click(SAVE());

    expect(
      await screen.findByRole("button", { name: "저장 중..." }),
    ).toBeDisabled();
    finish();
    expect(await screen.findByText("저장했어요.")).toBeTruthy();
  });

  test("날짜 순서가 틀리면 저장하지 않고 안내를 보인다", async () => {
    renderDetail();
    await screen.findByDisplayValue("한빛고");
    fireEvent.change(screen.getByLabelText("계약 시작일"), {
      target: { value: "2027-03-01" },
    });
    fireEvent.click(SAVE());

    expect(
      await screen.findByText("계약 시작일은 종료일보다 늦을 수 없어요."),
    ).toBeTruthy();
    expect(db.patches).toHaveLength(0);
  });

  test("409 CONFLICT 면 다른 관리자가 먼저 고쳤다고 알리고 목록은 다시 받지 않는다", async () => {
    db.patchError = problem(
      409,
      "CONFLICT",
      "다른 관리자가 먼저 고쳤어요. 새로 불러온 뒤 다시 저장해 주세요.",
    );
    const { reset } = renderDetail();
    await screen.findByDisplayValue("한빛고");
    fireEvent.click(SAVE());

    expect(
      await screen.findByText(
        "다른 관리자가 먼저 고쳤어요. 새로 불러온 뒤 다시 저장해 주세요.",
      ),
    ).toBeTruthy();
    expect(reset).not.toHaveBeenCalled();
  });

  test("403 FORBIDDEN 이면 권한 안내를 보인다", async () => {
    db.patchError = problem(
      403,
      "FORBIDDEN",
      "저장하지 못했어요. 기관 수정 권한을 확인해 주세요.",
    );
    renderDetail();
    await screen.findByDisplayValue("한빛고");
    fireEvent.click(SAVE());

    expect(
      await screen.findByText(
        "저장하지 못했어요. 기관 수정 권한을 확인해 주세요.",
      ),
    ).toBeTruthy();
  });

  test.each([
    ["CONTRACT_ORDER", "계약 시작일은 종료일보다 늦을 수 없어요."],
    ["GRACE_ORDER", "유예 종료일은 계약 종료일과 같거나 그 뒤여야 해요."],
    ["TRIAL_ORDER", "시범 시작일은 종료일보다 늦을 수 없어요."],
  ])(
    "서버가 %s 로 거절하면 날짜 순서 문구를 보인다",
    async (code, expected) => {
      db.patchError = problem(400, code, "서버가 쓴 다른 문구");
      renderDetail();
      await screen.findByDisplayValue("한빛고");
      fireEvent.click(SAVE());

      expect(await screen.findByText(expected)).toBeTruthy();
    },
  );

  test("그 밖의 거절은 서버 문구를 저장 실패 뒤에 붙여 보인다", async () => {
    db.patchError = problem(500, "INTERNAL", "서버 오류");
    renderDetail();
    await screen.findByDisplayValue("한빛고");
    fireEvent.click(SAVE());

    expect(await screen.findByText("저장 실패: 서버 오류")).toBeTruthy();
  });
});

describe("TenantDetail 탭 주소", () => {
  test("서비스 설정 탭 주소로 바로 들어와도 상세를 불러와 저장된 학기 길이와 기타 여부를 패널에 넘긴다", async () => {
    renderDetail("/admin/tenants/tenant-7/service-settings");

    expect(
      await screen.findByText("서비스 설정 패널 tenant-7/6/false"),
    ).toBeTruthy();
    expect(db.fetches[0]?.id).toBe("tenant-7");
    expect(screen.queryByLabelText("소속코드")).toBeNull();
  });

  test("전체 관리자 탭 주소로 바로 들어오면 그 기관의 패널을 연다", async () => {
    renderDetail("/admin/tenants/tenant-7/school-admins");

    expect(
      await screen.findByText("전체 관리자 패널 tenant-7/한빛고"),
    ).toBeTruthy();
  });

  test("탭을 누르면 그 탭의 주소로 이동한다", async () => {
    const { router } = renderDetail();
    await screen.findByDisplayValue("한빛고");

    fireEvent.click(screen.getByRole("tab", { name: "서비스 설정" }));
    expect(router.state.location.pathname).toBe(
      "/admin/tenants/tenant-7/service-settings",
    );
    expect(
      await screen.findByText("서비스 설정 패널 tenant-7/6/false"),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "전체 관리자" }));
    expect(router.state.location.pathname).toBe(
      "/admin/tenants/tenant-7/school-admins",
    );
    expect(
      await screen.findByText("전체 관리자 패널 tenant-7/한빛고"),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "기관 정보" }));
    expect(router.state.location.pathname).toBe("/admin/tenants/tenant-7");
  });

  test("선택한 탭의 내용은 그 탭을 이름으로 가진 tabpanel 안에 있다", async () => {
    renderDetail();
    await screen.findByDisplayValue("한빛고");

    const infoPanel = screen.getByRole("tabpanel", { name: "기관 정보" });
    expect(within(infoPanel).getByLabelText("소속코드")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "전체 관리자" }));

    const adminPanel = await screen.findByRole("tabpanel", {
      name: "전체 관리자",
    });
    expect(
      within(adminPanel).getByText("전체 관리자 패널 tenant-7/한빛고"),
    ).toBeTruthy();
  });

  test("방향키로 다음 탭에 초점을 옮긴다", async () => {
    renderDetail();
    await screen.findByDisplayValue("한빛고");
    const first = screen.getByRole("tab", { name: "기관 정보" });
    first.focus();

    fireEvent.keyDown(first, { key: "ArrowRight" });

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "서비스 설정" })).toHaveFocus(),
    );
  });

  test("학기 길이를 고쳐도 저장 전에는 패널이 저장된 값을 쓰고, 탭을 오가도 입력은 남는다", async () => {
    renderDetail();
    await screen.findByDisplayValue("한빛고");
    fireEvent.change(screen.getByLabelText("학기 길이"), {
      target: { value: "3" },
    });

    fireEvent.click(screen.getByRole("tab", { name: "서비스 설정" }));
    expect(
      await screen.findByText("서비스 설정 패널 tenant-7/6/false"),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "기관 정보" }));
    expect(
      (await screen.findByLabelText("학기 길이")) as HTMLSelectElement,
    ).toHaveValue("3");
  });
});

describe("TenantDetail 이동과 불러오기 실패", () => {
  test("목록으로 버튼은 목록 주소로 이동한다", async () => {
    const { router } = renderDetail();
    await screen.findByDisplayValue("한빛고");

    fireEvent.click(screen.getByRole("button", { name: "목록으로" }));

    expect(await screen.findByText("기관 목록 화면")).toBeTruthy();
    expect(router.state.location.pathname).toBe("/admin/tenants");
  });

  test("기관을 찾지 못하면(404) 안내와 목록으로 버튼을 보인다", async () => {
    db.loadError = problem(404, "NOT_FOUND", "기관을 찾을 수 없어요.");
    renderDetail();

    expect(await screen.findByText("기관을 찾을 수 없어요.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "목록으로" }));
    expect(await screen.findByText("기관 목록 화면")).toBeTruthy();
  });

  test("기관 상세 응답을 기다리는 동안 전체 관리자 목록 요청도 함께 나간다", async () => {
    let release: () => void = () => {};
    db.hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    renderDetail();

    await waitFor(() => expect(db.fetches).toHaveLength(1));
    expect(db.adminFetches).toEqual(["tenant-7"]);

    release();
    expect(await screen.findByDisplayValue("한빛고")).toBeTruthy();
    expect(db.adminFetches).toEqual(["tenant-7"]);
  });

  test("불러오는 중에도 목록으로 버튼이 목록으로 이동한다", async () => {
    renderDetail();

    expect(screen.getByText("데이터를 불러오는 중입니다.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "목록으로" }));
    expect(await screen.findByText("기관 목록 화면")).toBeTruthy();
  });

  test("불러오기가 오류로 실패하면 찾을 수 없다고 하지 않고 불러오지 못했다고 알린다", async () => {
    db.loadError = problem(500, "INTERNAL", "서버 오류");
    renderDetail();

    expect(
      await screen.findByText("기관 정보를 불러오지 못했어요."),
    ).toBeTruthy();
    expect(screen.queryByText("기관을 찾을 수 없어요.")).toBeNull();
  });
});

describe("TenantDetail 저장하지 않은 변경 보호", () => {
  test("고친 게 없으면 목록으로 나갈 때 확인창이 없다", async () => {
    renderDetail();
    await screen.findByDisplayValue("한빛고");

    fireEvent.click(screen.getByRole("button", { name: "목록으로" }));

    expect(await screen.findByText("기관 목록 화면")).toBeTruthy();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  test("고친 채 목록으로 나가려 하면 확인창이 뜨고 계속 수정하면 머문다", async () => {
    const { router } = renderDetail();
    fireEvent.change(await screen.findByDisplayValue("한빛고"), {
      target: { value: "한빛고등학교" },
    });

    fireEvent.click(screen.getByRole("button", { name: "목록으로" }));

    const dialog = await screen.findByRole("alertdialog", {
      name: "저장하지 않은 변경이 있어요",
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "계속 수정" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(router.state.location.pathname).toBe("/admin/tenants/tenant-7");
    expect(screen.getByDisplayValue("한빛고등학교")).toBeTruthy();
  });

  test("확인창에서 나가기를 고르면 목록으로 이동한다", async () => {
    renderDetail();
    fireEvent.change(await screen.findByDisplayValue("한빛고"), {
      target: { value: "한빛고등학교" },
    });

    fireEvent.click(screen.getByRole("button", { name: "목록으로" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "나가기" }));

    expect(await screen.findByText("기관 목록 화면")).toBeTruthy();
  });

  test("저장해서 깨끗해지면 확인창 없이 나간다", async () => {
    renderDetail();
    fireEvent.change(await screen.findByDisplayValue("한빛고"), {
      target: { value: "한빛고등학교" },
    });
    fireEvent.click(SAVE());
    await screen.findByText("저장했어요.");

    fireEvent.click(screen.getByRole("button", { name: "목록으로" }));

    expect(await screen.findByText("기관 목록 화면")).toBeTruthy();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  test("같은 기관의 다른 탭으로 옮길 때는 막지 않는다", async () => {
    const { router } = renderDetail();
    fireEvent.change(await screen.findByDisplayValue("한빛고"), {
      target: { value: "한빛고등학교" },
    });

    fireEvent.click(screen.getByRole("tab", { name: "전체 관리자" }));

    expect(await screen.findByText(/전체 관리자 패널/)).toBeTruthy();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(router.state.location.pathname).toBe(
      "/admin/tenants/tenant-7/school-admins",
    );
  });

  test("새로고침과 탭 닫기는 고친 동안에만 막는다", async () => {
    renderDetail();
    await screen.findByDisplayValue("한빛고");

    const clean = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);

    fireEvent.change(screen.getByDisplayValue("한빛고"), {
      target: { value: "한빛고등학교" },
    });
    const dirty = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
  });
});
