// 계약 종료 회원 삭제 화면(사 #162, #176, 결정 102.1, 102.3, 102.4). 기관을 고르면 미리보기를 읽고, 고른 학생만 삭제 API 로 보낸다.

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const db = vi.hoisted(() => ({
  tenants: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: () => ({
        not: () => ({
          order: async () => ({ data: db.tenants, error: null }),
        }),
      }),
    })),
  },
}));

vi.mock("./api", () => ({
  fetchMemberPurgePreview: vi.fn(),
  runMemberPurge: vi.fn(),
}));

import * as api from "./api";
import MemberPurgeAdmin from "./MemberPurgeAdmin";

const TENANT = {
  id: "tenant-7",
  code: "ABCD1234",
  name: "한빛고",
  contract_end_date: "2026-09-01",
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

function preview(dDay: number | null, students = STUDENTS) {
  return {
    ok: true as const,
    data: {
      contractEnd: "2026-09-01",
      graceEnd: "2026-10-01",
      deletableFrom: "2026-10-02",
      dDay,
      students,
    },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  db.tenants = [TENANT];
  vi.mocked(api.fetchMemberPurgePreview).mockResolvedValue(preview(-36));
});

async function openTenant() {
  render(<MemberPurgeAdmin />);
  const select = await screen.findByLabelText("기관");
  await screen.findByRole("option", { name: /한빛고/ });
  fireEvent.change(select, { target: { value: "tenant-7" } });
  await screen.findByText("김*늘");
}

describe("MemberPurgeAdmin", () => {
  test("기관을 고르면 계약 종료일, 유예 종료일, 삭제 가능일 안내와 학생 목록이 보이고 유료 전환 학생은 고를 수 없다", async () => {
    await openTenant();

    expect(api.fetchMemberPurgePreview).toHaveBeenCalledWith("tenant-7");
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
    vi.mocked(api.runMemberPurge).mockResolvedValue({
      ok: true,
      data: { deleted: 1, excluded: 1, skipped: 1, notProcessed: 0 },
    });
    await openTenant();
    fireEvent.click(screen.getByLabelText("박*준 선택"));

    fireEvent.click(screen.getByRole("button", { name: "삭제 실행" }));

    const dialog = await screen.findByRole("dialog");
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
      expect(api.runMemberPurge).toHaveBeenCalledWith({
        tenantId: "tenant-7",
        targetIds: ["s-1"],
      }),
    );
    expect(
      await screen.findByText("삭제 1명, 제외(유료 전환) 1명, 제외(직접) 1명"),
    ).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("먼저 고른 기관의 미리보기가 늦게 도착해도 지금 고른 기관의 목록을 덮어쓰지 않는다", async () => {
    db.tenants = [TENANT, { ...TENANT, id: "tenant-8", name: "새빛고" }];
    let resolveSlow: (value: ReturnType<typeof preview>) => void = () => {};
    vi.mocked(api.fetchMemberPurgePreview).mockImplementation((id) =>
      id === "tenant-7"
        ? new Promise((resolve) => {
            resolveSlow = resolve;
          })
        : Promise.resolve(
            preview(-36, [
              { ...STUDENTS[0], id: "s-9", name: "최*새", protected: false },
            ]),
          ),
    );
    render(<MemberPurgeAdmin />);
    const select = await screen.findByLabelText("기관");
    await screen.findByRole("option", { name: /새빛고/ });
    fireEvent.change(select, { target: { value: "tenant-7" } });
    fireEvent.change(select, { target: { value: "tenant-8" } });
    await screen.findByText("최*새");

    resolveSlow(preview(-36));
    await waitFor(() =>
      expect(api.fetchMemberPurgePreview).toHaveBeenCalledTimes(2),
    );
    await Promise.resolve();

    expect(screen.getByText("최*새")).toBeTruthy();
    expect(screen.queryByText("김*늘")).toBeNull();
  });

  test("처리하지 못한 학생이 있으면 다시 실행해 달라는 안내를 보여 주고, 없으면 보여 주지 않는다", async () => {
    vi.mocked(api.runMemberPurge).mockResolvedValueOnce({
      ok: true,
      data: { deleted: 1, excluded: 0, skipped: 0, notProcessed: 2 },
    });
    await openTenant();
    fireEvent.click(screen.getByRole("button", { name: "삭제 실행" }));
    let dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("기관 이름 입력"), {
      target: { value: "한빛고" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "삭제" }));

    expect(
      await screen.findByText(
        "처리하지 못한 학생 2명, 잠시 뒤 다시 실행해 주세요",
      ),
    ).toBeTruthy();

    vi.mocked(api.runMemberPurge).mockResolvedValueOnce({
      ok: true,
      data: { deleted: 1, excluded: 0, skipped: 0, notProcessed: 0 },
    });
    fireEvent.click(screen.getByRole("button", { name: "삭제 실행" }));
    dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("기관 이름 입력"), {
      target: { value: "한빛고" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "삭제" }));

    await screen.findByText("삭제 1명, 제외(유료 전환) 0명, 제외(직접) 0명");
    expect(screen.queryByText(/처리하지 못한 학생/)).toBeNull();
  });

  test("삭제 가능일 전에는 삭제 실행 버튼이 막히고 D-day 안내가 보인다", async () => {
    vi.mocked(api.fetchMemberPurgePreview).mockResolvedValue({
      ok: true,
      data: {
        contractEnd: "2999-09-01",
        graceEnd: "2999-10-01",
        deletableFrom: "2999-10-02",
        dDay: 12,
        students: STUDENTS,
      },
    });
    await openTenant();

    expect(
      (screen.getByRole("button", { name: "삭제 실행" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(screen.getByText(/삭제 가능일 D-/)).toBeTruthy();
  });

  test("서버가 아직 삭제할 수 없다고 하면 그 안내를 보여 주고 목록은 그대로 둔다", async () => {
    vi.mocked(api.runMemberPurge).mockResolvedValue({
      ok: false,
      message: "아직 삭제할 수 없는 기관입니다.",
    });
    await openTenant();
    fireEvent.click(screen.getByRole("button", { name: "삭제 실행" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("기관 이름 입력"), {
      target: { value: "한빛고" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "삭제" }));

    expect(
      await screen.findByText("아직 삭제할 수 없는 기관입니다."),
    ).toBeTruthy();
    expect(screen.getByText("김*늘")).toBeTruthy();
  });
});
