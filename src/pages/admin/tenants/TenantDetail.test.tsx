import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const db = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  selectError: null as { message: string } | null,
  updated: [] as { values: Record<string, unknown>; id: unknown }[],
  updateResult: { data: [{ id: "tenant-7" }], error: null } as {
    data: unknown;
    error: { message: string } | null;
  },
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: db.row, error: db.selectError }),
        }),
      }),
      update: (values: Record<string, unknown>) => ({
        eq: (_col: string, id: unknown) => ({
          select: async () => {
            db.updated.push({ values, id });
            return db.updateResult;
          },
        }),
      }),
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
};

beforeEach(() => {
  db.row = { ...ROW };
  db.selectError = null;
  db.updated = [];
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
    expect(db.updated[0]?.id).toBe("tenant-7");
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

  test("기관을 찾지 못하면 안내를 보인다", async () => {
    db.row = null;
    renderDetail();

    expect(await screen.findByText("기관을 찾을 수 없어요.")).toBeTruthy();
  });
});
