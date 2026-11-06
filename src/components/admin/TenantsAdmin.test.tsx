// 본사 기관 목록(5번 본사 관리 화면). 사이트 플래그 hqTenantAdmin 이 꺼져 있으면(위닝) 예전 그대로다.

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  hqTenantAdmin: true,
  rows: [] as Record<string, unknown>[],
  selects: [] as string[],
  graceDays: 30 as number | null,
  created: null as Record<string, unknown> | null,
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
            order: async () => ({ data: state.rows, error: null }),
          };
        },
      };
    }),
    rpc: vi.fn(async () => ({ data: state.created, error: null })),
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

const CONFIG = { title: "소속(테넌트) 관리", searchPlaceholder: "검색" };

beforeEach(() => {
  state.hqTenantAdmin = true;
  state.rows = ROWS;
  state.selects = [];
  state.graceDays = 30;
  state.created = null;
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

describe("TenantsAdmin 스쿨멘토(플래그 켜짐)", () => {
  test("계약 기간, MOU, 유예 종료일, 삭제 D-day 열을 보인다", async () => {
    render(<TenantsAdmin config={CONFIG} />);

    const row = (await screen.findByText("한빛고")).closest(
      "tr",
    ) as HTMLElement;
    for (const header of ["계약 기간", "MOU", "유예 종료일", "삭제 D-day"]) {
      expect(screen.getByText(header)).toBeTruthy();
    }
    expect(row.textContent).toContain("2026-03-01 ~ 2026-09-01");
    expect(row.textContent).toContain("협약 중");
    expect(row.textContent).toContain("2026-10-01");
    // 2026-09-21 KST 에서 삭제 가능일(유예 종료 다음 날 10-02)까지 11일.
    expect(row.textContent).toContain("삭제 가능일 D-11");
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
