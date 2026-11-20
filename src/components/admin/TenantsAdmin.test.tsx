// 본사 기관 목록(5번 본사 관리 화면). 사이트 플래그 hqTenantAdmin 이 꺼져 있으면(위닝) 예전 그대로다.

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  hqTenantAdmin: true,
  rows: [] as Record<string, unknown>[],
  selects: [] as string[],
  graceDays: 30 as number | null,
  created: null as Record<string, unknown> | null,
  listError: null as { message: string; code?: string } | null,
  createError: null as { message: string; code?: string } | null,
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

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === "app_settings") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data:
                  state.graceDays === null ? null : { value: state.graceDays },
                error: null,
              }),
            }),
          }),
        };
      }
      return {
        select: (columns: string) => {
          state.selects.push(columns);
          return {
            order: async () => ({ data: state.rows, error: state.listError }),
          };
        },
      };
    }),
    rpc: vi.fn(async () => ({ data: state.created, error: state.createError })),
  },
}));

vi.mock("@/pages/admin/tenants/TenantDetail", () => ({
  default: ({ tenantId, onBack }: { tenantId: string; onBack: () => void }) => (
    <div>
      <span>기관 상세 {tenantId}</span>
      <button type="button" onClick={onBack}>
        목록으로
      </button>
    </div>
  ),
}));

import { Toaster } from "@/components/ui/toast";
import TenantsAdmin from "./TenantsAdmin";

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
  state.selects = [];
  state.graceDays = 30;
  state.created = null;
  state.listError = null;
  state.createError = null;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-21T03:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("TenantsAdmin 위닝(플래그 꺼짐)", () => {
  test("계약 열 없이 예전 칼럼만 읽고 행은 열리지 않는다", async () => {
    state.hqTenantAdmin = false;
    render(<TenantsAdmin config={CONFIG} />);

    expect(await screen.findByText("한빛고")).toBeTruthy();
    expect(state.selects).toEqual([
      "id, code, name, region, org_type, tier, created_at",
    ]);
    expect(screen.queryByText("계약 기간")).toBeNull();
    expect(screen.queryByText("MOU")).toBeNull();
    expect(screen.queryByRole("button", { name: "한빛고" })).toBeNull();
  });
});

describe("TenantsAdmin 표 접근성", () => {
  test("열 머리글은 scope col 을 가진다", async () => {
    render(<TenantsAdmin config={CONFIG} />);
    await screen.findByText("한빛고");
    expect(screen.getByRole("columnheader", { name: "이름" })).toHaveAttribute(
      "scope",
      "col",
    );
  });

  test("검색 입력은 접근 가능한 이름을 가진다", async () => {
    render(<TenantsAdmin config={CONFIG} />);
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
    render(<TenantsAdmin config={CONFIG} />);
    await screen.findByText("한빛고");
    fireEvent.click(screen.getByRole("button", { name: "등록" }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "새기관" },
    });
    fireEvent.click(screen.getByRole("button", { name: "등록" }));
  }

  test("제목을 접근 가능한 이름으로 가진 alertdialog 로 발급 코드를 보여 준다", async () => {
    await openIssuedDialog();

    const dialog = await screen.findByRole("alertdialog", {
      name: "기관을 발급했습니다",
    });
    expect(within(dialog).getByText("NEWC2345")).toBeTruthy();
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
    render(<TenantsAdmin config={CONFIG} />);

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

  test.each([
    ["종료일만", { contract_start_date: null }, "~ 2026-09-01"],
    ["시작일만", { contract_end_date: null }, "2026-03-01 ~"],
  ])("계약 %s 있으면 있는 날짜만 보인다", async (_label, patch, expected) => {
    state.rows = [{ ...ROWS[0], ...patch }];
    render(<TenantsAdmin config={CONFIG} />);

    const row = (await screen.findByText("한빛고")).closest(
      "tr",
    ) as HTMLElement;
    expect(row.textContent).toContain(expected);
  });

  test("기타 소속에는 기타 뱃지를 붙이고 계약이 없으면 대시로 보인다", async () => {
    render(<TenantsAdmin config={CONFIG} />);

    const row = (await screen.findByText("기타 소속")).closest(
      "tr",
    ) as HTMLElement;
    expect(row.textContent).toContain("기타");
    expect(screen.getAllByText("기타")).toHaveLength(1);
    expect(row.textContent).toContain("-");
  });

  test("기본 유예 일수는 app_settings 에서 읽어 유예 종료일이 빈 기관에 쓴다", async () => {
    state.rows = [{ ...ROWS[0], grace_ends_on: null }];
    state.graceDays = 10;
    render(<TenantsAdmin config={CONFIG} />);

    // 계약 종료 09-01 + 10일 = 유예 종료 09-11, 삭제 가능일 09-12, 오늘 09-21 이라 지났다.
    expect(
      await screen.findByText("삭제 가능, 계약 종료 후 20일 지남"),
    ).toBeTruthy();
  });

  test("기관 이름을 누르면 상세를 열고 목록으로 돌아온다", async () => {
    render(<TenantsAdmin config={CONFIG} />);

    fireEvent.click(await screen.findByRole("button", { name: "한빛고" }));
    expect(screen.getByText("기관 상세 tenant-7")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "목록으로" }));
    expect(await screen.findByText("기타 소속")).toBeTruthy();
  });

  test("등록하면 발급 모달 대신 새 기관의 상세를 연다", async () => {
    state.created = {
      ...BASE,
      id: "tenant-new",
      code: "NEWC2345",
      name: "새기관",
    };
    render(<TenantsAdmin config={CONFIG} />);
    await screen.findByText("한빛고");

    fireEvent.click(screen.getByRole("button", { name: "등록" }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "새기관" },
    });
    fireEvent.click(screen.getByRole("button", { name: "등록" }));

    await waitFor(() =>
      expect(screen.getByText("기관 상세 tenant-new")).toBeTruthy(),
    );
  });
});

describe("TenantsAdmin 오류 안내", () => {
  test("목록 조회에 실패하면 원문 없이 제목과 안내만 토스트로 보인다", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    state.listError = { message: "relation tenants 홍길동", code: "42P01" };
    render(
      <>
        <TenantsAdmin config={CONFIG} />
        <Toaster />
      </>,
    );

    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="toast-title"]'),
      ).toHaveTextContent("기관 관리 조회 실패"),
    );
    expect(
      document.querySelector('[data-slot="toast-description"]'),
    ).toHaveTextContent("코드: 42P01");
    expect(document.body.textContent).not.toContain("홍길동");
    expect(alertSpy).not.toHaveBeenCalled();
  });

  test("등록에 실패하면 '등록 실패' 제목의 토스트가 보인다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    state.createError = { message: "duplicate", code: "23505" };
    render(
      <>
        <TenantsAdmin config={CONFIG} />
        <Toaster />
      </>,
    );
    await screen.findByText("한빛고");

    fireEvent.click(screen.getByRole("button", { name: "등록" }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "새기관" },
    });
    fireEvent.click(screen.getByRole("button", { name: "등록" }));

    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="toast-title"]'),
      ).toHaveTextContent("등록 실패"),
    );
    expect(
      document.querySelector('[data-slot="toast-description"]'),
    ).toHaveTextContent("이미 등록된 값입니다(중복)");
  });

  test("소속코드를 복사하면 '복사했습니다' 토스트가 보이고 코드는 토스트에 없다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(
      <>
        <TenantsAdmin config={CONFIG} />
        <Toaster />
      </>,
    );
    const row = (await screen.findByText("한빛고")).closest(
      "tr",
    ) as HTMLElement;

    fireEvent.click(within(row).getByRole("button", { name: "소속코드 복사" }));

    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="toast-title"]'),
      ).toHaveTextContent("복사했습니다"),
    );
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
    render(
      <>
        <TenantsAdmin config={CONFIG} />
        <Toaster />
      </>,
    );
    const row = (await screen.findByText("한빛고")).closest(
      "tr",
    ) as HTMLElement;

    fireEvent.click(within(row).getByRole("button", { name: "소속코드 복사" }));

    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="toast-title"]'),
      ).toHaveTextContent("복사하지 못했습니다"),
    );
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("ABCD2345");
  });

  test("이름을 비우고 등록하면 등록 요청 없이 경고 토스트가 보인다", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    render(
      <>
        <TenantsAdmin config={CONFIG} />
        <Toaster />
      </>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "등록" }));
    fireEvent.click(screen.getByRole("button", { name: "등록" }));

    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="toast-title"]'),
      ).toHaveTextContent("이름 항목을 입력해주세요."),
    );
    expect(alertSpy).not.toHaveBeenCalled();
  });
});
