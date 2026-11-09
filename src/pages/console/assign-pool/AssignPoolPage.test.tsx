// W12 미배정 목록. 목록, 동명 재학생 확인, 배치(성공, 번호 중복, 충돌), 빈 상태와 오류를 검증한다.

import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: mocks.getSession } },
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
import AssignPoolPage from "./AssignPoolPage";

const routes = [
  {
    path: "/teacher",
    Component: ConsoleGate,
    children: [
      {
        Component: ConsoleLayout,
        children: [
          { index: true, Component: () => <p>대시보드 화면</p> },
          { path: "unassigned", Component: AssignPoolPage },
        ],
      },
    ],
  },
];

const classes = {
  classes: [
    {
      id: "c3",
      grade: "고2",
      groupId: null,
      groupName: null,
      name: "3",
      hasHomeroom: true,
    },
    {
      id: "c4",
      grade: "고2",
      groupId: null,
      groupName: null,
      name: "4",
      hasHomeroom: true,
    },
    {
      id: "d1",
      grade: "고1",
      groupId: "g1",
      groupName: "A레벨",
      name: "1",
      hasHomeroom: true,
    },
  ],
};

const poolStudent = (id: string, over: Record<string, unknown> = {}) => ({
  studentId: id,
  name: id === "p1" ? "김*늘" : "노*윤",
  enrollmentVersion: 4,
  grade: null,
  sameNameCount: 0,
  sameNameEnrolled: [],
  ...over,
});

const p1 = poolStudent("p1", {
  grade: "고2",
  sameNameCount: 2,
  sameNameEnrolled: [
    {
      grade: "고2",
      groupName: null,
      className: "4",
      number: 7,
      usedServiceCount: 3,
      serviceTotal: 6,
    },
    {
      grade: "고1",
      groupName: "A레벨",
      className: "2",
      number: null,
      usedServiceCount: 2,
      serviceTotal: 6,
    },
  ],
});

const LIST_URL = "GET /api/console/assign-pool?page=1";
const PATCH_URL = "PATCH /api/console/students/enrollment";

function listBody(items: unknown[]) {
  return {
    total: items.length,
    page: 1,
    pageSize: 50,
    pageCount: items.length > 0 ? 1 : 0,
    items,
  };
}

function stubPage(
  routesOver: Record<string, ApiHandler> = {},
  me: unknown = adminMe,
) {
  return stubApi({
    "GET /api/console/me": { body: me },
    "GET /api/console/enrollment-requests/count": { body: { count: 0 } },
    "GET /api/console/classes": { body: classes },
    [LIST_URL]: { body: listBody([p1, poolStudent("p2")]) },
    ...routesOver,
  });
}

beforeEach(() => {
  mocks.getSession.mockResolvedValue({
    data: { session: { user: { id: "u" }, access_token: "tok" } },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("W12 미배정 목록 default", () => {
  it("미배정 학생을 표로 보이고 첫 학생의 동명 재학생을 확인 상자에 보인다", async () => {
    stubPage();

    renderRoutes(routes, "/teacher/unassigned");

    expect(await screen.findByText("김*늘")).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 1, name: "미배정 목록" }),
    ).toBeTruthy();
    expect(
      screen.getByText("학급이 정해지지 않은 학생을 학급에 배치합니다"),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "미배정 학생 2명" }),
    ).toBeTruthy();
    for (const head of [
      "이름",
      "동명 재학생 수",
      "학년그룹",
      "그룹",
      "반",
      "번호",
      "배치",
    ]) {
      expect(screen.getByRole("columnheader", { name: head })).toBeTruthy();
    }
    const row = screen.getByText("김*늘").closest("tr") as HTMLElement;
    expect(within(row).getByText("2명")).toBeTruthy();
    expect(within(row).getByRole("button", { name: "배치" })).toBeTruthy();
    const check = screen.getByTestId("same-name-check");
    expect(
      within(check).getByText("학생 선택: 김*늘. 동명 재학생 확인: 김*늘 2명"),
    ).toBeTruthy();
    expect(
      within(check).getByText("2학년 4반 7번, 이용 서비스 3/6"),
    ).toBeTruthy();
    expect(
      within(check).getByText("1학년-A레벨 2반 번호 미입력, 이용 서비스 2/6"),
    ).toBeTruthy();
  });

  it("다른 행을 누르면 그 학생의 동명 확인으로 바뀐다", async () => {
    stubPage();
    renderRoutes(routes, "/teacher/unassigned");
    const other = (await screen.findByText("노*윤")).closest(
      "tr",
    ) as HTMLElement;

    fireEvent.click(other);

    expect(
      within(screen.getByTestId("same-name-check")).getByText(
        "학생 선택: 노*윤. 동명 재학생 확인: 노*윤 0명",
      ),
    ).toBeTruthy();
  });

  it("미배정 학생이 없으면 0명 머리와 안내만 보이고 확인 상자는 없다", async () => {
    stubPage({ [LIST_URL]: { body: listBody([]) } });

    renderRoutes(routes, "/teacher/unassigned");

    expect(
      await screen.findByRole("heading", { name: "미배정 학생 0명" }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "미배정 학생이 없어요. 새 학생이 가입하거나 학년그룹 일괄 변경에서 반을 비운 학생이 생기면 여기에 나타나요",
      ),
    ).toBeTruthy();
    expect(screen.queryByTestId("same-name-check")).toBeNull();
  });

  it("목록을 읽지 못하면 오류 안내를 보인다", async () => {
    stubPage({ [LIST_URL]: { status: 500, body: {} } });

    renderRoutes(routes, "/teacher/unassigned");

    expect(
      await screen.findByText(
        "미배정 목록을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요",
      ),
    ).toBeTruthy();
  });

  it("반은 학년그룹을 고른 뒤에만 열리고 그 학년그룹의 반만 보이며, 검색하면 classId 로 다시 읽는다", async () => {
    const filtered = `GET /api/console/assign-pool?${new URLSearchParams({
      grade: "고2",
      classId: "c4",
      page: "1",
    })}`;
    const calls = stubPage({ [filtered]: { body: listBody([]) } });
    renderRoutes(routes, "/teacher/unassigned");
    await screen.findByText("김*늘");
    const classSelect = screen.getByLabelText("반") as HTMLSelectElement;
    expect(classSelect.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("학년그룹"), {
      target: { value: "고2" },
    });
    expect(classSelect.disabled).toBe(false);
    expect(Array.from(classSelect.options).map((o) => o.textContent)).toEqual([
      "전체",
      "3반",
      "4반",
    ]);
    fireEvent.change(classSelect, { target: { value: "c4" } });
    fireEvent.click(screen.getByRole("button", { name: "검색" }));

    expect(
      await screen.findByRole("heading", { name: "미배정 학생 0명" }),
    ).toBeTruthy();
    expect(calls.some((c) => c.key === filtered)).toBe(true);
  });

  it("주소의 반은 새로 열어도 남고, 학년그룹을 바꾸면 고른 반이 비워진다", async () => {
    stubPage({
      "GET /api/console/assign-pool?grade=%EA%B3%A02&classId=c4&page=1": {
        body: listBody([p1]),
      },
    });
    renderRoutes(routes, "/teacher/unassigned?grade=고2&classId=c4");
    await screen.findByText("김*늘");
    const classSelect = screen.getByLabelText("반") as HTMLSelectElement;
    expect(classSelect.value).toBe("c4");

    fireEvent.change(screen.getByLabelText("학년그룹"), {
      target: { value: "고1" },
    });

    expect(classSelect.value).toBe("");
  });

  it("담임이 주소로 열면 대시보드로 돌려보낸다", async () => {
    stubPage({}, homeroomMe);

    renderRoutes(routes, "/teacher/unassigned");

    expect(await screen.findByText("대시보드 화면")).toBeTruthy();
  });
});

describe("W12 배치", () => {
  const fill = (row: HTMLElement, classValue: string, number: string) => {
    fireEvent.change(within(row).getByLabelText("학년그룹 선택"), {
      target: { value: "고2" },
    });
    fireEvent.change(within(row).getByLabelText("반 선택"), {
      target: { value: classValue },
    });
    fireEvent.change(within(row).getByLabelText("번호 입력"), {
      target: { value: number },
    });
  };

  it("학년그룹과 반을 고르기 전에는 배치할 수 없다", async () => {
    stubPage();
    renderRoutes(routes, "/teacher/unassigned");
    const row = (await screen.findByText("노*윤")).closest("tr") as HTMLElement;

    expect(
      (within(row).getByRole("button", { name: "배치" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (within(row).getByLabelText("반 선택") as HTMLSelectElement).disabled,
    ).toBe(true);
  });

  it("배치하면 현재 버전으로 PATCH 하고 알림을 보인 뒤 목록을 다시 읽는다", async () => {
    let placed = false;
    const calls = stubPage({
      [PATCH_URL]: () => {
        placed = true;
        return { body: { ok: true, enrollmentId: "e1", version: 5 } };
      },
      [LIST_URL]: () => ({
        body: listBody(placed ? [poolStudent("p2")] : [p1, poolStudent("p2")]),
      }),
    });
    renderRoutes(routes, "/teacher/unassigned");
    const row = (await screen.findByText("김*늘")).closest("tr") as HTMLElement;

    fill(row, "c3", "12");
    fireEvent.click(within(row).getByRole("button", { name: "배치" }));

    expect(
      await screen.findByText("김*늘 학생을 2학년 3반에 배치했어요"),
    ).toBeTruthy();
    expect(calls.find((c) => c.key === PATCH_URL)?.body).toEqual({
      studentId: "p1",
      expectedVersion: 4,
      grade: "고2",
      classId: "c3",
      number: 12,
    });
    await waitFor(() => expect(screen.queryByText("김*늘")).toBeNull());
    expect(
      screen.getByRole("heading", { name: "미배정 학생 1명" }),
    ).toBeTruthy();
  });

  it("번호를 비워 배치하면 번호 없이 보낸다", async () => {
    const calls = stubPage({
      [PATCH_URL]: { body: { ok: true, enrollmentId: "e1", version: 5 } },
    });
    renderRoutes(routes, "/teacher/unassigned");
    const row = (await screen.findByText("김*늘")).closest("tr") as HTMLElement;

    fill(row, "c3", "");
    fireEvent.click(within(row).getByRole("button", { name: "배치" }));

    await waitFor(() =>
      expect(calls.find((c) => c.key === PATCH_URL)?.body).toMatchObject({
        number: null,
      }),
    );
  });

  it("번호가 이미 쓰이면 가린 이름과 함께 그 행의 이름 아래에 보이고 다른 행은 그대로 쓸 수 있다", async () => {
    stubPage({
      [PATCH_URL]: {
        status: 409,
        body: {
          error: { code: "NUMBER_TAKEN", message: "이미 사용 중인 번호예요." },
          occupant: {
            grade: "고2",
            className: "3",
            number: 7,
            displayName: "윤*린",
          },
        },
      },
    });
    renderRoutes(routes, "/teacher/unassigned");
    const row = (await screen.findByText("김*늘")).closest("tr") as HTMLElement;

    fill(row, "c3", "7");
    fireEvent.click(within(row).getByRole("button", { name: "배치" }));

    expect(
      await within(row).findByText(
        "이미 사용 중인 번호예요(2학년 3반 7번, 윤*린). 다른 번호를 골라 주세요",
      ),
    ).toBeTruthy();
    expect(
      within(row).getByLabelText("번호 입력").getAttribute("aria-invalid"),
    ).toBe("true");
    const other = screen.getByText("노*윤").closest("tr") as HTMLElement;
    expect(
      (within(other).getByLabelText("학년그룹 선택") as HTMLSelectElement)
        .disabled,
    ).toBe(false);
  });

  it("다른 분이 먼저 바꿨거나 이미 배정됐으면 안내를 보이고 목록을 다시 읽는다", async () => {
    const calls = stubPage({
      [PATCH_URL]: {
        status: 409,
        body: {
          error: {
            code: "ALREADY_ASSIGNED",
            message: "이미 학급이 정해져 있어요.",
          },
        },
      },
    });
    renderRoutes(routes, "/teacher/unassigned");
    const row = (await screen.findByText("김*늘")).closest("tr") as HTMLElement;

    fill(row, "c3", "5");
    fireEvent.click(within(row).getByRole("button", { name: "배치" }));

    expect(
      await within(row).findByText("이미 학급이 정해져 있어요."),
    ).toBeTruthy();
    await waitFor(() =>
      expect(calls.filter((c) => c.key === LIST_URL).length).toBeGreaterThan(1),
    );
  });
});

describe("W12 휴대폰", () => {
  afterEach(() => {
    window.innerWidth = 1024;
  });

  it("표 대신 카드로 보이고 이름 아래에 동명 재학생 수가 붙는다", async () => {
    window.innerWidth = 500;
    stubPage();

    renderRoutes(routes, "/teacher/unassigned");

    expect(await screen.findByText("김*늘")).toBeTruthy();
    expect(screen.queryByRole("columnheader")).toBeNull();
    expect(screen.getByText("동명 재학생 2명")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "배치" })).toHaveLength(2);
  });
});
