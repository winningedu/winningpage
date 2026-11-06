import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const db = vi.hoisted(() => ({
  settings: [] as Record<string, unknown>[],
  defaults: null as Record<string, unknown> | null,
  upserts: [] as {
    values: Record<string, unknown>;
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
    from: vi.fn((table: string) => {
      if (table === "app_settings") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: db.defaults ? { value: db.defaults } : null,
                error: null,
              }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: async () => ({ data: db.settings, error: null }),
        }),
        upsert: async (
          values: Record<string, unknown>,
          options?: Record<string, unknown>,
        ) => {
          db.upserts.push({ values, options });
          return { error: db.upsertError };
        },
      };
    }),
  },
}));

import ServiceSettingsPanel from "./ServiceSettingsPanel";

const DEFAULTS = {
  diagnose: { monthly_limit: 1 },
  suhaeng: {
    monthly_limit: 10,
    term_limit_by_term_months: { "6": 24, "3": 12 },
  },
};

beforeEach(() => {
  db.settings = [];
  db.defaults = DEFAULTS;
  db.upserts = [];
  db.upsertError = null;
});

function renderPanel(
  props: Partial<{ termMonths: number | null; isCatchAll: boolean }> = {},
) {
  render(
    <ServiceSettingsPanel
      tenantId="tenant-7"
      termMonths={props.termMonths === undefined ? 6 : props.termMonths}
      isCatchAll={props.isCatchAll ?? false}
    />,
  );
}

describe("ServiceSettingsPanel", () => {
  test("설정이 없는 6개 서비스는 모두 제공 안 함으로 사 #5 순서에 보인다", async () => {
    renderPanel();

    const toggles = await screen.findAllByRole("checkbox");
    expect(toggles).toHaveLength(6);
    expect(toggles.every((t) => !(t as HTMLInputElement).checked)).toBe(true);
    expect(
      screen.getAllByTestId("service-row").map((r) => r.dataset.program),
    ).toEqual([
      "diagnose",
      "target",
      "growth",
      "suhaeng",
      "inquiry",
      "selfeval",
    ]);
  });

  test("목표관리 행에만 98.1 안내를 보인다", async () => {
    renderPanel();
    await screen.findAllByRole("checkbox");

    const notices = screen.getAllByText(
      "목표관리는 이용 횟수를 세지 않아요. 한도를 넣어도 지금은 막히지 않아요.",
    );
    expect(notices).toHaveLength(1);
    const target = screen
      .getAllByTestId("service-row")
      .find((row) => row.dataset.program === "target");
    expect(target?.contains(notices[0] as Node)).toBe(true);
  });

  test("켜면 기본 한도가 채워지고 학기 한도는 학기 길이로 고른다", async () => {
    renderPanel({ termMonths: 3 });
    fireEvent.click(await screen.findByLabelText("수행평가 제공"));

    expect(
      (screen.getByLabelText("수행평가 월 한도") as HTMLInputElement).value,
    ).toBe("10");
    expect(
      (screen.getByLabelText("수행평가 학기 한도") as HTMLInputElement).value,
    ).toBe("12");
  });

  test("학기 길이가 비어 있으면 학기 한도를 비우고 먼저 정하라고 안내한다(결정 102.16)", async () => {
    renderPanel({ termMonths: null });
    fireEvent.click(await screen.findByLabelText("수행평가 제공"));

    expect(
      (screen.getByLabelText("수행평가 학기 한도") as HTMLInputElement).value,
    ).toBe("");
    expect(screen.getByText("학기 길이를 먼저 정해 주세요")).toBeTruthy();
  });

  test("저장은 그 행 하나를 updated_by 와 함께 upsert 한다", async () => {
    renderPanel();
    fireEvent.click(await screen.findByLabelText("학습진단 제공"));
    fireEvent.change(screen.getByLabelText("학습진단 월 한도"), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "학습진단 저장" }));

    await waitFor(() => expect(db.upserts).toHaveLength(1));
    expect(db.upserts[0]?.values).toEqual({
      tenant_id: "tenant-7",
      program_key: "diagnose",
      enabled: true,
      starts_on: null,
      ends_on: null,
      monthly_limit: 2,
      term_limit: null,
      updated_by: "user-1",
      updated_at: expect.any(String),
    });
    expect(db.upserts[0]?.options).toEqual({
      onConflict: "tenant_id,program_key",
    });
    expect(await screen.findByText("저장했어요.")).toBeTruthy();
  });

  test("잘못된 한도는 저장하지 않고 안내한다", async () => {
    renderPanel();
    fireEvent.click(await screen.findByLabelText("학습진단 제공"));
    fireEvent.change(screen.getByLabelText("학습진단 월 한도"), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "학습진단 저장" }));

    expect(
      await screen.findByText("한도는 1 이상 32767 이하의 정수로 넣어 주세요."),
    ).toBeTruthy();
    expect(db.upserts).toHaveLength(0);
  });

  test("저장 실패는 메시지를 보인다", async () => {
    db.upsertError = { message: "permission denied" };
    renderPanel();
    fireEvent.click(await screen.findByLabelText("학습진단 제공"));
    fireEvent.click(screen.getByRole("button", { name: "학습진단 저장" }));

    expect(
      await screen.findByText(
        "저장하지 못했어요. 기관 수정 권한을 확인해 주세요.",
      ),
    ).toBeTruthy();
  });

  test("기타 기관은 설정을 막고 안내한다(결정 94)", async () => {
    renderPanel({ isCatchAll: true });

    expect(
      await screen.findByText("기타 기관은 서비스를 제공하지 않아요."),
    ).toBeTruthy();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });
});
