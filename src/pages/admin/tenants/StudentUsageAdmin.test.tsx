import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const db = vi.hoisted(() => ({
  upserts: [] as {
    rows: Record<string, unknown>[];
    options: Record<string, unknown> | undefined;
  }[],
  upsertError: null as { message: string } | null,
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: "user-1" } } },
      }),
    },
    from: vi.fn(() => ({
      upsert: async (
        rows: Record<string, unknown>[],
        options?: Record<string, unknown>,
      ) => {
        db.upserts.push({ rows, options });
        return { error: db.upsertError };
      },
    })),
  },
}));

vi.mock("@/pages/admin/service-credit/api", () => ({
  searchStudents: vi.fn(),
}));

vi.mock("./api", () => ({ fetchStudentUsage: vi.fn() }));

import { searchStudents } from "@/pages/admin/service-credit/api";
import * as api from "./api";
import StudentUsageAdmin from "./StudentUsageAdmin";

const KEYS = ["diagnose", "target", "growth", "suhaeng", "inquiry", "selfeval"];

function usage(overrides: Record<string, unknown> = {}) {
  return {
    ok: true as const,
    data: {
      tenant: { id: "t-1", name: "한빛고", isCatchAll: false },
      programs: KEYS.map((programKey) => ({
        programKey,
        allowed: true,
        denyReason: null,
        monthUsed: 1,
        monthLimit: 3,
        monthRemaining: 2,
        termUsed: 4,
        termLimit: 24,
        termRemaining: 20,
        monthResetsOn: "2026-12-01",
        termResetsOn: "2027-03-01",
        setting: null,
        override:
          programKey === "diagnose"
            ? { monthlyLimit: 5, termLimit: null }
            : null,
        ...(programKey === "growth" ? overrides : {}),
      })),
    },
  };
}

beforeEach(() => {
  db.upserts = [];
  db.upsertError = null;
  vi.resetAllMocks();
  vi.mocked(searchStudents).mockResolvedValue({
    ok: true,
    data: [
      { id: "s-1", name: "김하늘", email: "a@x.kr" },
      { id: "s-2", name: "이바다", email: "b@x.kr" },
    ],
  });
  vi.mocked(api.fetchStudentUsage).mockResolvedValue(usage());
});

async function search() {
  fireEvent.change(screen.getByLabelText("학생 검색"), {
    target: { value: "김" },
  });
  fireEvent.click(screen.getByRole("button", { name: "검색" }));
  await screen.findByText("김하늘");
}

describe("StudentUsageAdmin", () => {
  test("학생을 보면 6개 서비스의 이번 달과 학기 사용, 남은 횟수와 조정값을 보인다", async () => {
    render(<StudentUsageAdmin />);
    await search();
    fireEvent.click(screen.getByRole("button", { name: "김하늘 보기" }));

    expect(await screen.findByText("한빛고")).toBeTruthy();
    const rows = screen.getAllByTestId("usage-row");
    expect(rows.map((r) => r.dataset.program)).toEqual(KEYS);
    expect(rows[0]?.textContent).toContain("이번 달 사용 1 / 남은 2");
    expect(rows[0]?.textContent).toContain("학기 사용 4 / 남은 20");
    expect(
      (screen.getByLabelText("학습진단 월 조정") as HTMLInputElement).value,
    ).toBe("5");
    expect(
      (screen.getByLabelText("성장설계 월 조정") as HTMLInputElement).value,
    ).toBe("");
  });

  test("막힌 서비스는 사유 문구를 보인다", async () => {
    vi.mocked(api.fetchStudentUsage).mockResolvedValue(
      usage({ allowed: false, denyReason: "month_cap" }),
    );
    render(<StudentUsageAdmin />);
    await search();
    fireEvent.click(screen.getByRole("button", { name: "김하늘 보기" }));

    expect(
      await screen.findByText(
        "이번 달 이용 횟수를 모두 썼어요. 다음 달 1일부터 다시 이용할 수 있어요.",
      ),
    ).toBeTruthy();
  });

  test("여러 학생을 골라 고친 서비스만 한 배열로 upsert 한다", async () => {
    render(<StudentUsageAdmin />);
    await search();
    fireEvent.click(screen.getByRole("button", { name: "김하늘 보기" }));
    await screen.findByText("한빛고");
    fireEvent.click(screen.getByLabelText("이바다 선택"));
    fireEvent.change(screen.getByLabelText("성장설계 월 조정"), {
      target: { value: "2" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "선택한 2명에게 저장" }),
    );

    await waitFor(() => expect(db.upserts).toHaveLength(1));
    expect(db.upserts[0]?.options).toEqual({
      onConflict: "profile_id,program_key",
    });
    expect(db.upserts[0]?.rows).toEqual([
      {
        profile_id: "s-1",
        program_key: "growth",
        monthly_limit: 2,
        term_limit: null,
        updated_by: "user-1",
      },
      {
        profile_id: "s-2",
        program_key: "growth",
        monthly_limit: 2,
        term_limit: null,
        updated_by: "user-1",
      },
    ]);
    expect(await screen.findByText("저장했어요.")).toBeTruthy();
  });

  test("고친 칸이 없으면 저장 버튼이 막혀 있다", async () => {
    render(<StudentUsageAdmin />);
    await search();
    fireEvent.click(screen.getByRole("button", { name: "김하늘 보기" }));
    await screen.findByText("한빛고");

    expect(
      (
        screen.getByRole("button", {
          name: "선택한 1명에게 저장",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  test("잘못된 값은 보내지 않고 안내한다", async () => {
    render(<StudentUsageAdmin />);
    await search();
    fireEvent.click(screen.getByRole("button", { name: "김하늘 보기" }));
    await screen.findByText("한빛고");
    fireEvent.change(screen.getByLabelText("성장설계 월 조정"), {
      target: { value: "0" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "선택한 1명에게 저장" }),
    );

    expect(
      await screen.findByText("한도는 1 이상 32767 이하의 정수로 넣어 주세요."),
    ).toBeTruthy();
    expect(db.upserts).toHaveLength(0);
  });

  test("기관 설정으로 되돌리기는 고른 학생의 6개 서비스 한도를 null 로 보낸다", async () => {
    render(<StudentUsageAdmin />);
    await search();
    fireEvent.click(screen.getByRole("button", { name: "김하늘 보기" }));
    await screen.findByText("한빛고");
    fireEvent.click(
      screen.getByRole("button", { name: "기관 설정으로 되돌리기" }),
    );

    await waitFor(() => expect(db.upserts).toHaveLength(1));
    const rows = db.upserts[0]?.rows ?? [];
    expect(rows).toHaveLength(6);
    expect(
      rows.every((r) => r.monthly_limit === null && r.term_limit === null),
    ).toBe(true);
  });

  test("저장 실패는 메시지를 보인다", async () => {
    db.upsertError = { message: "denied" };
    render(<StudentUsageAdmin />);
    await search();
    fireEvent.click(screen.getByRole("button", { name: "김하늘 보기" }));
    await screen.findByText("한빛고");
    fireEvent.change(screen.getByLabelText("성장설계 월 조정"), {
      target: { value: "2" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "선택한 1명에게 저장" }),
    );

    expect(
      await screen.findByText("저장하지 못했어요. 권한을 확인해 주세요."),
    ).toBeTruthy();
  });
});
