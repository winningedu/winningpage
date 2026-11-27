import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { beforeEach, describe, expect, test, vi } from "vitest";

const http = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock("@/lib/http/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/http/client")>()),
  api: http,
}));

import { ApiError } from "@/lib/http/client";
import StudentUsageAdmin from "./StudentUsageAdmin";

const KEYS = ["diagnose", "target", "growth", "suhaeng", "inquiry", "selfeval"];

function usage(overrides: Record<string, unknown> = {}) {
  return {
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
        programKey === "diagnose" ? { monthlyLimit: 5, termLimit: 5 } : null,
      ...(programKey === "growth" ? overrides : {}),
    })),
  };
}

// ky 응답처럼 .json(schema)로 바디를 검증해 돌려준다.
const reply = (body: unknown) => ({
  json: async (schema: { parse: (value: unknown) => unknown }) =>
    schema.parse(body),
});

const failure = (detail: string) => ({
  json: async () => {
    throw new ApiError({ status: 403, code: "FORBIDDEN", detail });
  },
});

function Probe() {
  return <output data-testid="search">{useLocation().search}</output>;
}

function renderAt(path = "/admin/serviceCreditAdjust") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <StudentUsageAdmin />
        <Probe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const saved = () => reply({ saved: 1 });

// PUT 으로 보낸 바디의 rows 를 호출 순서대로 모은다.
const sentRows = () =>
  http.put.mock.calls.map(
    ([, options]) =>
      (options as { json: { rows: Record<string, unknown>[] } }).json.rows,
  );

beforeEach(() => {
  vi.resetAllMocks();
  http.get.mockImplementation((path: string) =>
    path === "admin/students/search"
      ? reply({
          items: [
            { id: "s-1", name: "김하늘", email: "a@x.kr", isAdmin: false },
            { id: "s-2", name: "이바다", email: "b@x.kr", isAdmin: false },
          ],
        })
      : reply(usage()),
  );
  http.put.mockImplementation(saved);
});

async function search() {
  fireEvent.change(screen.getByLabelText("학생 검색"), {
    target: { value: "김" },
  });
  fireEvent.click(screen.getByRole("button", { name: "검색" }));
  await screen.findByText("김하늘");
}

// 값이 오는 시점을 test 가 정하는 사용 현황 응답.
function heldUsage() {
  let release: (body: unknown) => void = () => {};
  const body = new Promise<unknown>((resolve) => {
    release = resolve;
  });
  return {
    release,
    response: {
      json: async (schema: { parse: (value: unknown) => unknown }) =>
        schema.parse(await body),
    },
  };
}

describe("StudentUsageAdmin 스켈레톤", () => {
  test("사용 현황을 기다리는 동안 스켈레톤을 보이고 오면 서비스 행으로 바뀐다", async () => {
    const held = heldUsage();
    http.get.mockImplementation(() => held.response);
    renderAt("/admin/serviceCreditAdjust?student=s-1");

    expect(
      await screen.findByRole("status", {
        name: "사용 현황을 불러오는 중입니다.",
      }),
    ).toBeTruthy();
    expect(screen.queryAllByTestId("usage-row")).toHaveLength(0);

    held.release(usage());
    expect(await screen.findAllByTestId("usage-row")).toHaveLength(6);
    expect(
      screen.queryByRole("status", { name: "사용 현황을 불러오는 중입니다." }),
    ).toBeNull();
  });

  test("학생 검색을 기다리는 동안 스켈레톤을 보이고 오면 학생 목록으로 바뀐다", async () => {
    let release: (body: unknown) => void = () => {};
    const body = new Promise<unknown>((resolve) => {
      release = resolve;
    });
    http.get.mockImplementation(() => ({
      json: async (schema: { parse: (value: unknown) => unknown }) =>
        schema.parse(await body),
    }));
    renderAt();
    expect(
      screen.queryByRole("status", { name: "학생을 검색하는 중입니다." }),
    ).toBeNull();

    fireEvent.change(screen.getByLabelText("학생 검색"), {
      target: { value: "김" },
    });
    fireEvent.click(screen.getByRole("button", { name: "검색" }));

    expect(
      await screen.findByRole("status", { name: "학생을 검색하는 중입니다." }),
    ).toBeTruthy();

    release({
      items: [{ id: "s-1", name: "김하늘", email: "a@x.kr", isAdmin: false }],
    });
    expect(await screen.findByText("김하늘")).toBeTruthy();
    expect(
      screen.queryByRole("status", { name: "학생을 검색하는 중입니다." }),
    ).toBeNull();
  });

  test("학생을 고르기 전에는 스켈레톤을 보이지 않는다", () => {
    renderAt();

    expect(
      screen.queryByRole("status", { name: "사용 현황을 불러오는 중입니다." }),
    ).toBeNull();
  });

  test("저장하면 사용 현황이 스켈레톤을 거쳐 새로 받은 값으로 바뀐다", async () => {
    renderAt("/admin/serviceCreditAdjust?student=s-1");
    await screen.findByText("한빛고");
    fireEvent.change(screen.getByLabelText("성장설계 월 조정"), {
      target: { value: "9" },
    });
    const held = heldUsage();
    http.get.mockImplementation(() => held.response);
    fireEvent.click(
      screen.getByRole("button", { name: "선택한 1명에게 저장" }),
    );

    expect(
      await screen.findByRole("status", {
        name: "사용 현황을 불러오는 중입니다.",
      }),
    ).toBeTruthy();
    expect(screen.queryByLabelText("성장설계 월 조정")).toBeNull();

    held.release(usage({ override: { monthlyLimit: 9, termLimit: null } }));
    expect(
      ((await screen.findByLabelText("성장설계 월 조정")) as HTMLInputElement)
        .value,
    ).toBe("9");
  });
});

describe("StudentUsageAdmin", () => {
  test("학생 검색이 실패하면 서버가 준 안내를 보여 준다", async () => {
    http.get.mockImplementation((path: string) =>
      path === "admin/students/search"
        ? failure("학생 검색 권한이 없어요.")
        : reply(usage()),
    );
    renderAt();
    fireEvent.change(screen.getByLabelText("학생 검색"), {
      target: { value: "김" },
    });
    fireEvent.click(screen.getByRole("button", { name: "검색" }));

    expect(await screen.findByText("학생 검색 권한이 없어요.")).toBeTruthy();
  });

  test("학생 검색은 서비스이용횟수조정 권한 구분으로 학생 검색 API 를 부른다", async () => {
    renderAt();
    await search();

    expect(http.get).toHaveBeenCalledWith(
      "admin/students/search",
      expect.objectContaining({
        searchParams: { q: "김", section: "serviceCreditAdjust" },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  test("학생을 보면 주소에 ?student 가 들어가고 그 학생의 사용 현황을 읽는다", async () => {
    renderAt();
    await search();
    fireEvent.click(screen.getByRole("button", { name: "김하늘 보기" }));

    await screen.findByText("한빛고");
    expect(screen.getByTestId("search").textContent).toBe("?student=s-1");
    expect(http.get).toHaveBeenCalledWith(
      "admin/tenants/student-usage",
      expect.objectContaining({
        searchParams: { profileId: "s-1" },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  test("주소에 ?student 가 있으면 새로 열어도 그 학생의 사용 현황을 보이고 저장 대상에 넣는다", async () => {
    renderAt("/admin/serviceCreditAdjust?student=s-1");

    expect(await screen.findByText("한빛고")).toBeTruthy();
    expect(
      (screen.getByLabelText("학습진단 월 조정") as HTMLInputElement).value,
    ).toBe("5");
    expect(
      screen.getByRole("button", { name: "선택한 1명에게 저장" }),
    ).toBeTruthy();
  });

  test("사용 현황을 못 읽으면 서버가 준 안내를 보여 준다", async () => {
    http.get.mockImplementation(() => failure("권한이 없어요."));
    renderAt("/admin/serviceCreditAdjust?student=s-1");

    expect(await screen.findByText("권한이 없어요.")).toBeTruthy();
  });

  test("학생을 보면 6개 서비스의 이번 달과 학기 사용, 남은 횟수와 조정값을 보인다", async () => {
    renderAt();
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
    const blank = screen.getByLabelText("성장설계 학기 조정");
    expect(blank.getAttribute("placeholder")).toBe("기관 설정 따름");
    expect(blank.getAttribute("inputmode")).toBe("numeric");
  });

  test("막힌 서비스는 사유 문구를 보인다", async () => {
    http.get.mockImplementation((path: string) =>
      path === "admin/students/search"
        ? reply({
            items: [
              { id: "s-1", name: "김하늘", email: "a@x.kr", isAdmin: false },
            ],
          })
        : reply(usage({ allowed: false, denyReason: "month_cap" })),
    );
    renderAt();
    await search();
    fireEvent.click(screen.getByRole("button", { name: "김하늘 보기" }));

    expect(
      await screen.findByText(
        "이번 달 이용 횟수를 모두 썼어요. 다음 달 1일부터 다시 이용할 수 있어요.",
      ),
    ).toBeTruthy();
  });

  test("여러 학생을 골라 고친 서비스만 한 배열로 PUT 한다", async () => {
    renderAt();
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

    await waitFor(() => expect(http.put).toHaveBeenCalledTimes(1));
    expect(http.put.mock.calls[0]?.[0]).toBe("admin/tenants/student-usage");
    // 변경자는 서버가 채우므로 보내지 않는다.
    expect(sentRows()[0]).toEqual([
      { profile_id: "s-1", program_key: "growth", monthly_limit: 2 },
      { profile_id: "s-2", program_key: "growth", monthly_limit: 2 },
    ]);
    expect(await screen.findByText("저장했어요.")).toBeTruthy();
  });

  test("월 칸만 고치면 월 한도 열만 보내 다른 학생의 학기 조정을 건드리지 않는다", async () => {
    renderAt();
    await search();
    fireEvent.click(screen.getByRole("button", { name: "김하늘 보기" }));
    await screen.findByText("한빛고");
    fireEvent.click(screen.getByLabelText("이바다 선택"));
    fireEvent.change(screen.getByLabelText("학습진단 월 조정"), {
      target: { value: "7" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "선택한 2명에게 저장" }),
    );

    await waitFor(() => expect(http.put).toHaveBeenCalledTimes(1));
    for (const row of sentRows()[0] ?? []) {
      expect(row).not.toHaveProperty("term_limit");
      expect(row.monthly_limit).toBe(7);
    }
  });

  test("월 칸과 학기 칸을 서로 다른 서비스에서 고치면 한 번의 PUT 에 열이 다른 행으로 보낸다", async () => {
    renderAt();
    await search();
    fireEvent.click(screen.getByRole("button", { name: "김하늘 보기" }));
    await screen.findByText("한빛고");
    fireEvent.change(screen.getByLabelText("학습진단 월 조정"), {
      target: { value: "7" },
    });
    fireEvent.change(screen.getByLabelText("성장설계 학기 조정"), {
      target: { value: "9" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "선택한 1명에게 저장" }),
    );

    await waitFor(() => expect(http.put).toHaveBeenCalledTimes(1));
    expect(sentRows()[0]).toEqual([
      { profile_id: "s-1", program_key: "diagnose", monthly_limit: 7 },
      { profile_id: "s-1", program_key: "growth", term_limit: 9 },
    ]);
  });

  test("새로 검색하면 고른 학생과 보던 화면을 비운다", async () => {
    renderAt();
    await search();
    fireEvent.click(screen.getByRole("button", { name: "김하늘 보기" }));
    await screen.findByText("한빛고");
    fireEvent.click(screen.getByRole("button", { name: "검색" }));

    await waitFor(() => expect(screen.queryByText("한빛고")).toBeNull());
    expect(screen.getByTestId("search").textContent).toBe("");
    expect(
      (screen.getByLabelText("김하늘 선택") as HTMLInputElement).checked,
    ).toBe(false);
  });

  test("다른 학생을 보아도 이미 고른 학생을 빼지 않는다", async () => {
    renderAt();
    await search();
    fireEvent.click(screen.getByLabelText("이바다 선택"));
    fireEvent.click(screen.getByRole("button", { name: "김하늘 보기" }));
    await screen.findByText("한빛고");

    expect(
      screen.getByRole("button", { name: "선택한 2명에게 저장" }),
    ).toBeTruthy();
  });

  test("고친 칸이 없으면 저장 버튼이 막혀 있다", async () => {
    renderAt();
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
    renderAt();
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
    expect(http.put).not.toHaveBeenCalled();
  });

  test("기관 설정으로 되돌리기는 고른 학생의 6개 서비스 한도를 null 로 보낸다", async () => {
    renderAt();
    await search();
    fireEvent.click(screen.getByRole("button", { name: "김하늘 보기" }));
    await screen.findByText("한빛고");
    fireEvent.click(
      screen.getByRole("button", { name: "기관 설정으로 되돌리기" }),
    );

    await waitFor(() => expect(http.put).toHaveBeenCalledTimes(1));
    const rows = sentRows()[0] ?? [];
    expect(rows).toHaveLength(6);
    expect(
      rows.every((r) => r.monthly_limit === null && r.term_limit === null),
    ).toBe(true);
  });

  test("저장 실패는 메시지를 보인다", async () => {
    http.put.mockImplementation(() =>
      failure("저장하지 못했어요. 권한을 확인해 주세요."),
    );
    renderAt();
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
