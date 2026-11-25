import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const db = vi.hoisted(() => ({
  settings: [] as Record<string, unknown>[],
  defaults: {} as Record<string, unknown>,
  loadError: null as Error | null,
  puts: [] as Record<string, unknown>[],
  /** 값이 있으면 조회 응답이 이 약속이 풀릴 때까지 기다린다. */
  hold: null as Promise<void> | null,
  putError: null as Error | null,
  /** 조회 호출 기록(signal 을 넘기는지 본다). */
  fetches: [] as { tenantId: string; signal: AbortSignal | undefined }[],
}));

vi.mock("./api", () => ({
  fetchServiceSettings: vi.fn(
    async (tenantId: string, signal?: AbortSignal) => {
      db.fetches.push({ tenantId, signal });
      await db.hold;
      if (db.loadError) throw db.loadError;
      return { items: db.settings, defaults: db.defaults };
    },
  ),
  putServiceSetting: vi.fn(async (body: Record<string, unknown>) => {
    if (db.putError) throw db.putError;
    db.puts.push(body);
    return body;
  }),
}));

import { ApiError } from "@/lib/http/client";
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
  db.loadError = null;
  db.puts = [];
  db.hold = null;
  db.putError = null;
  db.fetches = [];
});

function renderPanel(
  props: Partial<{ termMonths: number | null; isCatchAll: boolean }> = {},
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <ServiceSettingsPanel
        tenantId="tenant-7"
        termMonths={props.termMonths === undefined ? 6 : props.termMonths}
        isCatchAll={props.isCatchAll ?? false}
      />
    </QueryClientProvider>,
  );
}

describe("ServiceSettingsPanel", () => {
  test("응답을 기다리는 동안 설정 스켈레톤을 보이고 오면 서비스 행으로 바뀐다", async () => {
    let release: () => void = () => {};
    db.hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    renderPanel();

    expect(
      screen.getByRole("status", { name: "서비스 설정을 불러오는 중입니다." }),
    ).toBeTruthy();
    expect(screen.queryAllByTestId("service-row")).toHaveLength(0);

    release();
    expect(await screen.findAllByTestId("service-row")).toHaveLength(6);
    expect(screen.queryByRole("status")).toBeNull();
  });

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

  test("학기 길이가 비어 있으면 기본값이 없는 서비스도 안내하고 학기 한도 칸을 막는다(결정 102.16)", async () => {
    renderPanel({ termMonths: null });
    fireEvent.click(await screen.findByLabelText("학습진단 제공"));

    expect(screen.getByText("학기 길이를 먼저 정해 주세요")).toBeTruthy();
    expect(
      (screen.getByLabelText("학습진단 학기 한도") as HTMLInputElement)
        .disabled,
    ).toBe(true);
  });

  test("학기 길이가 비어 있으면 저장된 학기 한도가 있어도 null 로 저장한다", async () => {
    db.settings = [
      {
        program_key: "diagnose",
        enabled: true,
        starts_on: null,
        ends_on: null,
        monthly_limit: 2,
        term_limit: 8,
      },
    ];
    renderPanel({ termMonths: null });
    await screen.findByLabelText("학습진단 학기 한도");
    fireEvent.click(screen.getByRole("button", { name: "학습진단 저장" }));

    await waitFor(() => expect(db.puts).toHaveLength(1));
    expect(db.puts[0]?.term_limit).toBeNull();
    expect(db.puts[0]?.monthly_limit).toBe(2);
  });

  test("기본값을 읽지 못하면 불러오기 실패를 보이고 켤 수 없다", async () => {
    db.loadError = new ApiError({
      status: 500,
      code: "INTERNAL",
      detail: "서버 오류",
    });
    renderPanel();

    expect(
      await screen.findByText("서비스 설정을 불러오지 못했어요."),
    ).toBeTruthy();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  test("시작일과 종료일 칸을 고치면 그 날짜로 저장하고 한도 칸은 안내 문구를 보인다", async () => {
    renderPanel();
    fireEvent.click(await screen.findByLabelText("학습진단 제공"));
    fireEvent.change(screen.getByLabelText("학습진단 시작일"), {
      target: { value: "2026-03-01" },
    });
    fireEvent.change(screen.getByLabelText("학습진단 종료일"), {
      target: { value: "2026-08-31" },
    });
    fireEvent.click(screen.getByRole("button", { name: "학습진단 저장" }));

    await waitFor(() => expect(db.puts).toHaveLength(1));
    expect(db.puts[0]?.starts_on).toBe("2026-03-01");
    expect(db.puts[0]?.ends_on).toBe("2026-08-31");
    expect(screen.getByPlaceholderText("월 한도")).toBe(
      screen.getByLabelText("학습진단 월 한도"),
    );
    expect(screen.getByPlaceholderText("학기 한도")).toBe(
      screen.getByLabelText("학습진단 학기 한도"),
    );
  });

  test("저장은 그 행 하나를 PUT 하고 updated_by 는 보내지 않는다(서버가 채운다)", async () => {
    renderPanel();
    fireEvent.click(await screen.findByLabelText("학습진단 제공"));
    fireEvent.change(screen.getByLabelText("학습진단 월 한도"), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "학습진단 저장" }));

    await waitFor(() => expect(db.puts).toHaveLength(1));
    expect(db.puts[0]).toEqual({
      tenant_id: "tenant-7",
      program_key: "diagnose",
      enabled: true,
      starts_on: null,
      ends_on: null,
      monthly_limit: 2,
      term_limit: null,
      updated_at: expect.any(String),
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
    expect(db.puts).toHaveLength(0);
  });

  test("저장 실패는 메시지를 보인다", async () => {
    db.putError = new ApiError({
      status: 403,
      code: "FORBIDDEN",
      detail: "권한이 없어요.",
    });
    renderPanel();
    fireEvent.click(await screen.findByLabelText("학습진단 제공"));
    fireEvent.click(screen.getByRole("button", { name: "학습진단 저장" }));

    expect(
      await screen.findByText(
        "저장하지 못했어요. 기관 수정 권한을 확인해 주세요.",
      ),
    ).toBeTruthy();
  });

  test("조회에 기관 id 와 signal 을 넘기고 기타 기관은 조회하지 않는다", async () => {
    renderPanel();
    await screen.findAllByRole("checkbox");
    expect(db.fetches).toHaveLength(1);
    expect(db.fetches[0]?.tenantId).toBe("tenant-7");
    expect(db.fetches[0]?.signal).toBeInstanceOf(AbortSignal);
  });

  test("저장 중에는 저장 버튼이 모두 잠긴다", async () => {
    const api = await import("./api");
    let finish: () => void = () => {};
    vi.mocked(api.putServiceSetting).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve({});
        }),
    );
    renderPanel();
    fireEvent.click(await screen.findByLabelText("학습진단 제공"));
    fireEvent.click(screen.getByRole("button", { name: "학습진단 저장" }));

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "학습진단 저장" }),
      ).toBeDisabled(),
    );
    expect(
      screen.getByRole("button", { name: "목표관리 저장" }),
    ).toBeDisabled();
    finish();
    expect(await screen.findByText("저장했어요.")).toBeTruthy();
  });

  test("기타 기관은 설정을 막고 안내한다(결정 94)", async () => {
    renderPanel({ isCatchAll: true });

    expect(
      await screen.findByText("기타 기관은 서비스를 제공하지 않아요."),
    ).toBeTruthy();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(db.fetches).toHaveLength(0);
  });
});
