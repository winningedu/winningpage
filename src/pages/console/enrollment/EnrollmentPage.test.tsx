// W7 이용현황. 반별 총원, 서비스별 이용 인원, 정원 입력, 집계 엑셀 출력을 검증한다.

import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  writeFile: vi.fn(),
  aoaToSheet: vi.fn((grid: unknown) => ({ grid })),
}));
vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: mocks.getSession } },
}));
vi.mock("xlsx", () => ({
  utils: {
    book_new: () => ({ sheets: [] as unknown[] }),
    aoa_to_sheet: mocks.aoaToSheet,
    book_append_sheet: (book: { sheets: unknown[] }, sheet: unknown) =>
      book.sheets.push(sheet),
  },
  writeFile: mocks.writeFile,
}));
vi.mock("../useIdleLogout", () => ({ useIdleLogout: vi.fn() }));

import ConsoleGate from "../ConsoleGate";
import ConsoleLayout from "../ConsoleLayout";
import {
  type ApiHandler,
  adminMe,
  homeroomMe,
  renderRoutes,
  stubApi,
} from "../testUtils";
import EnrollmentPage from "./EnrollmentPage";

const routes = [
  {
    path: "/teacher",
    Component: ConsoleGate,
    children: [
      {
        Component: ConsoleLayout,
        children: [
          { path: "enrollment", Component: EnrollmentPage },
          { index: true, Component: () => <p>대시보드 화면</p> },
        ],
      },
    ],
  },
];

const SUMMARY_URL = "GET /api/console/enrollment/summary";

const services = (n: number[]) => ({
  diagnosis: n[0],
  goal: n[1],
  growth: n[2],
  performance: n[3],
  selfeval: n[4],
  inquiry: n[5],
});

const classRow = (over: Record<string, unknown> = {}) => ({
  classId: "c1",
  grade: "고1",
  groupName: null,
  className: "1",
  homeroomName: "김담임",
  total: 30,
  capacity: 32,
  joined: 28,
  services: services([28, 21, 9, 6, 3, 0]),
  goalRateAvg: 57,
  ...over,
});

const SCHOOL = {
  asOf: "2026-11-05",
  orgType: "학교",
  classes: [
    classRow(),
    classRow({
      classId: "c2",
      className: "2",
      homeroomName: null,
      total: 31,
      capacity: null,
      joined: 29,
      services: services([29, 10, 0, 0, 0, 0]),
      goalRateAvg: null,
    }),
  ],
};

function stubPage(
  over: Record<string, ApiHandler> = {},
  me: unknown = adminMe,
) {
  return stubApi({
    "GET /api/console/me": { body: me },
    "GET /api/console/enrollment-requests/count": { body: { count: 0 } },
    [SUMMARY_URL]: { body: SCHOOL },
    ...over,
  });
}

beforeEach(() => {
  mocks.getSession.mockResolvedValue({
    data: { session: { user: { id: "u" }, access_token: "tok" } },
  });
});

function useMobileScreen() {
  // useIsMobile 은 innerWidth 로 가른다(768 미만)
  window.innerWidth = 500;
  window.matchMedia = ((query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

const manyClasses = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    classRow({
      classId: `m${i}`,
      className: `${i + 1}`,
      homeroomName: `담임${i + 1}`,
    }),
  );

afterEach(() => {
  window.innerWidth = 1024;
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("W7 이용현황", () => {
  it("학교 전체 이용 학생 요약, 정원 기준 가입률, 반별 표를 보여 준다", async () => {
    stubPage();

    renderRoutes(routes, "/teacher/enrollment");

    expect(
      await screen.findByText("집계 기준: 학교 전체, 2026.11.05 기준"),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "이용현황" })).toBeTruthy();
    const donut = screen.getByRole("region", { name: "서비스 이용 학생" });
    expect(within(donut).getByText("57 / 61명")).toBeTruthy();
    expect(within(donut).getByText("93%")).toBeTruthy();
    expect(within(donut).getByText("학교 전체 가입률 94%")).toBeTruthy();
    expect(within(donut).getByText("정원 미입력 반 1개는 제외")).toBeTruthy();

    const first = screen.getByRole("row", { name: /김담임/ });
    expect(within(first).getByText("1학년")).toBeTruthy();
    expect(within(first).getByText("1반")).toBeTruthy();
    expect(within(first).getByText("30 / 32")).toBeTruthy();
    expect(within(first).getByText("28 / 30")).toBeTruthy();
    expect(within(first).getByText("28명 (93%)")).toBeTruthy();
    expect(within(first).getByText("57%")).toBeTruthy();

    const second = screen.getByRole("row", { name: /담임 미배정/ });
    expect(within(second).getByText("31")).toBeTruthy();
  });

  it("학년그룹을 고르면 요약과 표가 그 범위로 줄고, 반은 학년그룹을 고른 뒤에만 고를 수 있다", async () => {
    stubPage({
      [SUMMARY_URL]: {
        body: {
          ...SCHOOL,
          classes: [
            ...SCHOOL.classes,
            classRow({
              classId: "c3",
              grade: "고2",
              className: "1",
              homeroomName: "유담임",
              total: 20,
              capacity: null,
              joined: 10,
              services: services([10, 0, 0, 0, 0, 0]),
            }),
          ],
        },
      },
    });
    renderRoutes(routes, "/teacher/enrollment");
    await screen.findByText("유담임");
    const classSelect = screen.getByLabelText("반") as HTMLSelectElement;
    expect(classSelect.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("학년그룹"), {
      target: { value: "고2" },
    });

    expect(screen.queryByText("김담임")).toBeNull();
    expect(screen.getByText("유담임")).toBeTruthy();
    expect(
      await screen.findByText("집계 기준: 2학년, 2026.11.05 기준"),
    ).toBeTruthy();
    const donut = screen.getByRole("region", { name: "서비스 이용 학생" });
    expect(within(donut).getByText("10 / 20명")).toBeTruthy();
    expect(classSelect.disabled).toBe(false);
    expect(
      within(classSelect)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["전체", "1반"]);

    fireEvent.change(classSelect, { target: { value: "c3" } });
    expect(
      screen.getByText("집계 기준: 2학년 1반, 2026.11.05 기준"),
    ).toBeTruthy();
  });

  it("학원은 학년그룹을 학년 칸에 같이 적고 집계 기준을 학원 전체로 쓴다", async () => {
    stubPage({
      [SUMMARY_URL]: {
        body: {
          asOf: "2026-11-05",
          orgType: "학원",
          classes: [
            classRow({ groupName: "A레벨", homeroomName: "서지안" }),
            classRow({
              classId: "c9",
              groupName: null,
              className: "1",
              homeroomName: "이가은",
            }),
          ],
        },
      },
    });

    renderRoutes(routes, "/teacher/enrollment");

    expect(
      await screen.findByText("집계 기준: 학원 전체, 2026.11.05 기준"),
    ).toBeTruthy();
    const academy = screen.getByRole("row", { name: /서지안/ });
    expect(within(academy).getByText("1학년-A레벨")).toBeTruthy();
    const plain = screen.getByRole("row", { name: /이가은/ });
    expect(within(plain).getByText("1학년")).toBeTruthy();
  });

  it("조회 범위에 학생이 없으면 표 자리에 안내를 보이고 0명으로 요약한다", async () => {
    stubPage({
      [SUMMARY_URL]: {
        body: {
          ...SCHOOL,
          classes: [
            classRow({
              total: 0,
              joined: 0,
              capacity: null,
              services: services([0, 0, 0, 0, 0, 0]),
              goalRateAvg: null,
            }),
          ],
        },
      },
    });

    renderRoutes(routes, "/teacher/enrollment");

    expect(
      await screen.findByText(
        "조회 범위에 학생이 없어요. 학년그룹이나 반을 바꿔 보세요",
      ),
    ).toBeTruthy();
    const donut = screen.getByRole("region", { name: "서비스 이용 학생" });
    expect(within(donut).getByText("0 / 0명")).toBeTruthy();
    expect(screen.queryByRole("row", { name: /김담임/ })).toBeNull();
    expect(screen.getByText("총 1개 학급")).toBeTruthy();
  });

  it("정원 입력에서 바꾼 반만 저장하고, 저장하면 알림을 보이고 입력을 닫고 다시 읽는다", async () => {
    let summaryCalls = 0;
    const calls = stubPage({
      [SUMMARY_URL]: () => {
        summaryCalls += 1;
        return { body: SCHOOL };
      },
      "PATCH /api/console/classes/capacity": {
        body: { ok: true, updated: 1 },
      },
    });
    renderRoutes(routes, "/teacher/enrollment");
    fireEvent.click(await screen.findByRole("button", { name: "정원 입력" }));

    expect(screen.queryByRole("button", { name: "정원 입력" })).toBeNull();
    expect(
      screen.getByText(
        "정원을 넣지 않은 반은 가입자 수만 보여요. 가입률은 정원을 넣은 반만 계산해요",
      ),
    ).toBeTruthy();
    expect((screen.getByLabelText("1반 정원") as HTMLInputElement).value).toBe(
      "32",
    );
    expect((screen.getByLabelText("2반 정원") as HTMLInputElement).value).toBe(
      "",
    );

    fireEvent.change(screen.getByLabelText("2반 정원"), {
      target: { value: "33" },
    });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(await screen.findByText("정원을 저장했어요")).toBeTruthy();
    expect(
      calls.find((c) => c.key === "PATCH /api/console/classes/capacity")?.body,
    ).toEqual({ items: [{ classId: "c2", capacity: 33 }] });
    await waitFor(() => expect(summaryCalls).toBe(2));
    expect(screen.getByRole("button", { name: "정원 입력" })).toBeTruthy();
    expect(screen.queryByLabelText("2반 정원")).toBeNull();
  });

  it("비운 칸은 정원 없음으로 보내고, 취소하면 아무것도 보내지 않는다", async () => {
    const calls = stubPage({
      "PATCH /api/console/classes/capacity": {
        body: { ok: true, updated: 1 },
      },
    });
    renderRoutes(routes, "/teacher/enrollment");
    fireEvent.click(await screen.findByRole("button", { name: "정원 입력" }));
    fireEvent.change(screen.getByLabelText("1반 정원"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await screen.findByText("정원을 저장했어요");
    expect(
      calls.find((c) => c.key === "PATCH /api/console/classes/capacity")?.body,
    ).toEqual({ items: [{ classId: "c1", capacity: null }] });

    fireEvent.click(screen.getByRole("button", { name: "정원 입력" }));
    fireEvent.change(screen.getByLabelText("1반 정원"), {
      target: { value: "5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "취소" }));

    expect(screen.queryByLabelText("1반 정원")).toBeNull();
    expect(
      calls.filter((c) => c.key === "PATCH /api/console/classes/capacity"),
    ).toHaveLength(1);
  });

  it("정원이 숫자가 아니거나 1 미만이면 저장 버튼이 막히고, 저장에 실패하면 입력을 둔 채 오류 알림을 보인다", async () => {
    stubPage({
      "PATCH /api/console/classes/capacity": { status: 500, body: {} },
    });
    renderRoutes(routes, "/teacher/enrollment");
    fireEvent.click(await screen.findByRole("button", { name: "정원 입력" }));

    fireEvent.change(screen.getByLabelText("1반 정원"), {
      target: { value: "0" },
    });
    expect(
      (screen.getByRole("button", { name: "저장" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    fireEvent.change(screen.getByLabelText("1반 정원"), {
      target: { value: "40" },
    });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(
      await screen.findByText("정원을 저장하지 못했어요. 다시 시도해 주세요"),
    ).toBeTruthy();
    expect((screen.getByLabelText("1반 정원") as HTMLInputElement).value).toBe(
      "40",
    );
  });

  it("엑셀 출력은 보이는 범위의 집계 표를 내려받고 출력 기록을 서버에 남긴다", async () => {
    const calls = stubPage({
      "POST /api/console/enrollment/export": { body: { ok: true } },
    });
    renderRoutes(routes, "/teacher/enrollment");

    fireEvent.click(await screen.findByRole("button", { name: "엑셀 출력" }));

    await waitFor(() => expect(mocks.writeFile).toHaveBeenCalledTimes(1));
    expect(mocks.writeFile.mock.calls[0]?.[1]).toBe(
      "스쿨멘토_이용현황_20261105.xlsx",
    );
    const grid = mocks.aoaToSheet.mock.calls[0]?.[0] as unknown[][];
    expect(grid[0]).toEqual(["이용현황"]);
    expect(grid.some((r) => r[0] === "김담임" && r[3] === 30)).toBe(true);
    expect(
      calls.find((c) => c.key === "POST /api/console/enrollment/export")?.body,
    ).toEqual({ classCount: 2 });
  });

  it("정원을 입력하는 동안에는 엑셀 출력 버튼을 숨긴다", async () => {
    stubPage();
    renderRoutes(routes, "/teacher/enrollment");
    await screen.findByRole("button", { name: "엑셀 출력" });

    fireEvent.click(screen.getByRole("button", { name: "정원 입력" }));

    expect(screen.queryByRole("button", { name: "엑셀 출력" })).toBeNull();
  });

  it("출력 기록을 남기지 못하면 파일을 내려받지 않고 오류 알림을 보인다", async () => {
    stubPage({
      "POST /api/console/enrollment/export": { status: 500, body: {} },
    });
    renderRoutes(routes, "/teacher/enrollment");

    fireEvent.click(await screen.findByRole("button", { name: "엑셀 출력" }));

    expect(
      await screen.findByText("엑셀을 만들지 못했어요. 다시 시도해 주세요"),
    ).toBeTruthy();
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });

  it("파일을 만들다 실패해도 오류 알림을 보인다", async () => {
    mocks.writeFile.mockImplementationOnce(() => {
      throw new Error("write failed");
    });
    stubPage({
      "POST /api/console/enrollment/export": { body: { ok: true } },
    });
    renderRoutes(routes, "/teacher/enrollment");

    fireEvent.click(await screen.findByRole("button", { name: "엑셀 출력" }));

    expect(
      await screen.findByText("엑셀을 만들지 못했어요. 다시 시도해 주세요"),
    ).toBeTruthy();
  });

  it("표는 50개 반씩 쪽으로 나눈다", async () => {
    stubPage({
      [SUMMARY_URL]: { body: { ...SCHOOL, classes: manyClasses(51) } },
    });
    renderRoutes(routes, "/teacher/enrollment");

    expect(await screen.findByText("1 / 2 페이지, 1~50번째")).toBeTruthy();
    expect(screen.queryByText("담임51")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "다음" }));

    expect(screen.getByText("담임51")).toBeTruthy();
    expect(screen.queryByText("담임1")).toBeNull();
  });

  it("휴대폰은 표 대신 반 카드를 그리고, 20개씩 더 보기로 잇는다", async () => {
    useMobileScreen();
    stubPage({
      [SUMMARY_URL]: { body: { ...SCHOOL, classes: manyClasses(25) } },
    });
    renderRoutes(routes, "/teacher/enrollment");

    await screen.findByText("담임1");
    expect(screen.queryByRole("table")).toBeNull();
    const card = screen.getByRole("article", { name: "담임1" });
    expect(within(card).getByText("1학년 1반")).toBeTruthy();
    expect(within(card).getByText("28 / 30")).toBeTruthy();
    expect(within(card).getByText("28명 (93%)")).toBeTruthy();
    expect(screen.queryByText("담임21")).toBeNull();
    expect(screen.getByText("20 / 25반")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "더 보기" }));

    expect(screen.getByText("담임25")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "더 보기" })).toBeNull();
  });

  it("휴대폰에서는 엑셀 출력을 두지 않고 정원 입력은 본문에서 한다", async () => {
    useMobileScreen();
    stubPage();
    renderRoutes(routes, "/teacher/enrollment");
    await screen.findByText("김담임");
    expect(screen.queryByRole("button", { name: "엑셀 출력" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "정원 입력" }));

    expect(screen.getByLabelText("1반 정원")).toBeTruthy();
    expect(screen.getByRole("button", { name: "저장" })).toBeTruthy();
  });

  it("담임이 열면 대시보드로 돌려보낸다", async () => {
    const calls = stubPage({}, homeroomMe);
    renderRoutes(routes, "/teacher/enrollment");

    expect(await screen.findByText("대시보드 화면")).toBeTruthy();
    expect(calls.some((c) => c.key === SUMMARY_URL)).toBe(false);
  });

  it("집계를 읽지 못하면 오류 안내만 보인다", async () => {
    stubPage({ [SUMMARY_URL]: { status: 500, body: {} } });
    renderRoutes(routes, "/teacher/enrollment");

    expect(
      await screen.findByText("이용현황을 불러오지 못했어요"),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "정원 입력" })).toBeNull();
  });
});
