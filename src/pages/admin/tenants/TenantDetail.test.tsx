import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const db = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  selectError: null as { message: string } | null,
  /** 첫 조회 뒤의 재조회가 돌려줄 행(비면 row 를 다시 준다). */
  rereads: [] as (Record<string, unknown> | null)[],
  updated: [] as {
    values: Record<string, unknown>;
    filters: Record<string, unknown>;
  }[],
  updateResult: { data: [{ id: "tenant-7" }], error: null } as {
    data: unknown;
    error: { message: string; code?: string } | null;
  },
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: db.rereads.length > 0 ? db.rereads.shift() : db.row,
            error: db.selectError,
          }),
        }),
      }),
      update: (values: Record<string, unknown>) => {
        const filters: Record<string, unknown> = {};
        const chain = {
          eq: (col: string, value: unknown) => {
            filters[col] = value;
            return chain;
          },
          select: async () => {
            db.updated.push({ values, filters });
            return db.updateResult;
          },
        };
        return chain;
      },
    })),
  },
}));

vi.mock("./SchoolAdminPanel", () => ({
  default: ({
    tenantId,
    tenantName,
  }: {
    tenantId: string;
    tenantName: string;
  }) => <div>학교 관리자 패널 {`${tenantId}/${tenantName}`}</div>,
}));

import TenantDetail from "./TenantDetail";

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
  db.selectError = null;
  db.updated = [];
  db.rereads = [];
  db.updateResult = { data: [{ id: "tenant-7" }], error: null };
  vi.spyOn(window, "alert").mockImplementation(() => {});
});

function renderDetail(onBack = vi.fn(), onSaved = vi.fn()) {
  render(
    <TenantDetail tenantId="tenant-7" onBack={onBack} onSaved={onSaved} />,
  );
  return { onBack, onSaved };
}

describe("TenantDetail 기관 정보 탭", () => {
  test("기관을 불러와 입력칸을 채우고 소속 코드는 읽기 전용이다", async () => {
    renderDetail();

    expect(await screen.findByDisplayValue("한빛고")).toBeTruthy();
    const code = screen.getByLabelText("소속 코드") as HTMLInputElement;
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

  test("MOU 칸 옆에 계약 종료일 기준 안내를 보인다(결정 102.7)", async () => {
    renderDetail();
    await screen.findByDisplayValue("한빛고");

    expect(
      screen.getByText("서비스는 계약 종료일 기준으로 막혀요"),
    ).toBeTruthy();
  });

  test("저장은 tenants 를 그 id 로 고치고 소속 코드는 보내지 않는다", async () => {
    const { onSaved } = renderDetail();
    fireEvent.change(await screen.findByDisplayValue("한빛고"), {
      target: { value: "한빛고등학교" },
    });
    fireEvent.change(screen.getByLabelText("유예 종료일"), {
      target: { value: "2027-03-30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(db.updated).toHaveLength(1));
    expect(db.updated[0]?.filters.id).toBe("tenant-7");
    expect(db.updated[0]?.values).toMatchObject({
      name: "한빛고등학교",
      grace_ends_on: "2027-03-30",
      contract_end_date: "2027-02-28",
      term_months: 6,
      contact_phone: null,
    });
    expect(Object.keys(db.updated[0]?.values ?? {})).not.toContain("code");
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  test("날짜 순서가 틀리면 저장하지 않고 안내를 보인다", async () => {
    renderDetail();
    await screen.findByDisplayValue("한빛고");
    fireEvent.change(screen.getByLabelText("계약 시작일"), {
      target: { value: "2027-03-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(
      await screen.findByText("계약 시작일은 종료일보다 늦을 수 없어요."),
    ).toBeTruthy();
    expect(db.updated).toHaveLength(0);
  });

  test("권한이 없어 바뀐 행이 없고 updated_at 도 그대로면 권한 안내를 보인다", async () => {
    db.updateResult = { data: [], error: null };
    renderDetail();
    await screen.findByDisplayValue("한빛고");
    db.rereads = [{ ...ROW }];
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(
      await screen.findByText(
        "저장하지 못했어요. 기관 수정 권한을 확인해 주세요.",
      ),
    ).toBeTruthy();
  });

  test("권한이 없어 바뀐 행이 없으면 저장되지 않았다고 알린다", async () => {
    db.updateResult = { data: [], error: null };
    renderDetail();
    await screen.findByDisplayValue("한빛고");
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(
      await screen.findByText(
        "저장하지 못했어요. 기관 수정 권한을 확인해 주세요.",
      ),
    ).toBeTruthy();
  });

  test("저장은 불러온 updated_at 이 그대로일 때만 고친다", async () => {
    renderDetail();
    await screen.findByDisplayValue("한빛고");
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(db.updated).toHaveLength(1));
    expect(db.updated[0]?.filters).toEqual({
      id: "tenant-7",
      updated_at: "2026-11-05T05:00:00Z",
    });
  });

  test("0행이고 다시 읽은 updated_at 이 바뀌었으면 다른 관리자가 먼저 고쳤다고 알린다", async () => {
    db.updateResult = { data: [], error: null };
    const { onSaved } = renderDetail();
    await screen.findByDisplayValue("한빛고");
    db.rereads = [{ ...ROW, updated_at: "2026-11-06T01:00:00Z" }];
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(
      await screen.findByText(
        "다른 관리자가 먼저 고쳤어요. 새로 불러온 뒤 다시 저장해 주세요.",
      ),
    ).toBeTruthy();
    expect(onSaved).not.toHaveBeenCalled();
  });

  test.each([
    ["tenants_contract_order", "계약 시작일은 종료일보다 늦을 수 없어요."],
    [
      "tenants_grace_after_end",
      "유예 종료일은 계약 종료일과 같거나 그 뒤여야 해요.",
    ],
  ])(
    "DB 가 23514 %s 로 거절하면 클라이언트 검증과 같은 날짜 순서 문구를 보인다",
    async (constraint, expected) => {
      db.updateResult = {
        data: null,
        error: {
          code: "23514",
          message: `new row for relation "tenants" violates check constraint "${constraint}"`,
        },
      };
      renderDetail();
      await screen.findByDisplayValue("한빛고");
      fireEvent.click(screen.getByRole("button", { name: "저장" }));

      expect(await screen.findByText(expected)).toBeTruthy();
    },
  );

  test("DB 가 거절하면 그 문구를 보인다", async () => {
    db.updateResult = { data: null, error: { message: "check violation" } };
    renderDetail();
    await screen.findByDisplayValue("한빛고");
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(await screen.findByText("저장 실패: check violation")).toBeTruthy();
  });
});

describe("TenantDetail 탭과 이동", () => {
  test("학교 관리자 탭은 그 기관의 패널을 연다", async () => {
    renderDetail();
    await screen.findByDisplayValue("한빛고");

    fireEvent.click(screen.getByRole("tab", { name: "학교 관리자" }));

    expect(screen.getByText("학교 관리자 패널 tenant-7/한빛고")).toBeTruthy();
    expect(screen.queryByLabelText("소속 코드")).toBeNull();
  });

  test("목록으로 버튼이 onBack 을 부른다", async () => {
    const { onBack } = renderDetail();
    await screen.findByDisplayValue("한빛고");

    fireEvent.click(screen.getByRole("button", { name: "목록으로" }));

    expect(onBack).toHaveBeenCalled();
  });

  test("기관을 찾지 못하면 안내와 목록으로 버튼을 보인다", async () => {
    db.row = null;
    const { onBack } = renderDetail();

    expect(await screen.findByText("기관을 찾을 수 없어요.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "목록으로" }));
    expect(onBack).toHaveBeenCalled();
  });

  test("불러오는 중에도 목록으로 버튼이 onBack 을 부른다", async () => {
    const { onBack } = renderDetail();

    expect(screen.getByText("데이터를 불러오는 중입니다.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "목록으로" }));
    expect(onBack).toHaveBeenCalled();
    await screen.findByDisplayValue("한빛고");
  });

  test("불러오기가 오류로 실패하면 찾을 수 없다고 하지 않고 불러오지 못했다고 알린다", async () => {
    db.row = null;
    db.selectError = { message: "network" };
    const { onBack } = renderDetail();

    expect(
      await screen.findByText("기관 정보를 불러오지 못했어요."),
    ).toBeTruthy();
    expect(screen.queryByText("기관을 찾을 수 없어요.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "목록으로" }));
    expect(onBack).toHaveBeenCalled();
  });
});
