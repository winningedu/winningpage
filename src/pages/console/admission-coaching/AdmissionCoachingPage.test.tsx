// W10 입시 상담코칭. 중3, 고3 학생 표, 학년그룹과 그룹과 반 조회, 코칭 이동, 3학년이 없는 상태를 검증한다.
// 상담 상태 4가지 고르기와 변경 일자(교 #51, 결정 2)도 검증한다.

import { fireEvent, screen, within } from "@testing-library/react";
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
import AdmissionCoachingPage from "./AdmissionCoachingPage";

const routes = [
  {
    path: "/teacher",
    Component: ConsoleGate,
    children: [
      {
        Component: ConsoleLayout,
        children: [
          { path: "admission-coaching", Component: AdmissionCoachingPage },
          { path: "coaching", Component: () => <p>코칭 화면</p> },
        ],
      },
    ],
  },
];

const classOf = (id: string, grade: string, name: string) => ({
  id,
  grade,
  groupId: null,
  groupName: null,
  name,
  hasHomeroom: true,
});

const CLASSES = {
  classes: [
    classOf("c1", "고2", "1"),
    classOf("c3", "고3", "3"),
    classOf("c4", "고3", "4"),
  ],
};

const student = (
  n: number,
  name: string,
  over: Record<string, unknown> = {},
) => ({
  studentId: `s${n}`,
  name,
  grade: "고3",
  groupName: null,
  className: "3",
  number: n,
  idealTarget: null,
  minTarget: null,
  execScore: null,
  urgency: null,
  counselStatus: "unset",
  counselChangedAt: null,
  ...over,
});

const body = (items: unknown[], over: Record<string, unknown> = {}) => ({
  total: items.length,
  page: 1,
  pageCount: 1,
  hasGrade3InScope: true,
  items,
  ...over,
});

const LIST_URL = "GET /api/console/admission-coaching?page=1";

const LIST = body([
  student(1, "정민서", {
    idealTarget: { university: "가나대", department: "경영학과" },
    minTarget: { university: "다라대", department: "경영학과" },
    execScore: 62,
    urgency: "mid",
    counselStatus: "needed",
    counselChangedAt: "2026-10-28T03:00:00Z",
  }),
  student(2, "한예준"),
]);

function stubPage(
  routesOver: Record<string, ApiHandler> = {},
  me: unknown = homeroomMe,
) {
  return stubApi({
    "GET /api/console/me": { body: me },
    "GET /api/console/enrollment-requests/count": { body: { count: 0 } },
    "GET /api/console/classes": { body: CLASSES },
    [LIST_URL]: { body: LIST },
    ...routesOver,
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

describe("W10 입시 상담코칭", () => {
  it("3학년 학생의 목표대학, 학습 실행 역량, 긴급도를 표로 보이고 값이 없으면 미가입, 미진단, 줄표로 적는다", async () => {
    stubPage();

    renderRoutes(routes, "/teacher/admission-coaching");

    expect(await screen.findByText("조회 결과 2명")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "입시 상담코칭" })).toBeTruthy();
    expect(
      screen.getByText(
        "입시를 앞둔 중3과 고3 학생의 목표와 진단 현황을 확인합니다",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText("상담 메모는 개인종합코칭의 교사 메모에 써 주세요"),
    ).toBeTruthy();
    expect(
      screen.getAllByRole("columnheader").map((h) => h.textContent),
    ).toEqual([
      "학생",
      "학년그룹/반",
      "이상 목표대학",
      "최소 목표대학",
      "학습 실행 역량",
      "학습진단 긴급도",
      "상담 상태",
      "변경 일자",
      "코칭",
    ]);

    const first = screen.getByRole("row", { name: /정민서/ });
    expect(within(first).getByText("3학년/3반")).toBeTruthy();
    expect(within(first).getByText("가나대 경영학과")).toBeTruthy();
    expect(within(first).getByText("다라대 경영학과")).toBeTruthy();
    expect(within(first).getByText("62점")).toBeTruthy();
    expect(within(first).getByText("보통")).toBeTruthy();
    expect(
      within(first)
        .getAllByRole("radio")
        .map((r) => [r.textContent, r.getAttribute("aria-checked")]),
    ).toEqual([
      ["미지정", "false"],
      ["상담예정", "false"],
      ["상담완료", "false"],
      ["상담필요", "true"],
    ]);
    expect(within(first).getByText("2026.10.28")).toBeTruthy();

    const empty = screen.getByRole("row", { name: /한예준/ });
    expect(within(empty).getAllByText("미가입")).toHaveLength(2);
    expect(within(empty).getByText("미진단")).toBeTruthy();
    expect(within(empty).getAllByText("-")).toHaveLength(2);
    expect(
      within(empty)
        .getByRole("radio", { name: "미지정" })
        .getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("관리자는 가린 이름과 3학년만 조회 칸, 학교 이름과 3학년 경로를 본다", async () => {
    stubPage(
      {
        [LIST_URL]: {
          body: body([student(1, "남*혁", { className: "1" })], {
            total: 150,
            pageCount: 3,
          }),
        },
      },
      adminMe,
    );
    renderRoutes(routes, "/teacher/admission-coaching");

    expect(await screen.findByText("조회 결과 150명")).toBeTruthy();
    expect(screen.getByRole("row", { name: /남\*혁/ })).toBeTruthy();
    expect(screen.getByText("1 / 3 페이지, 1~50번째")).toBeTruthy();
    const group = screen.getByLabelText("학년그룹") as HTMLSelectElement;
    expect(within(group).getByRole("option", { name: "3학년만" })).toBeTruthy();
    expect(
      screen.getByRole("navigation", { name: "현재 위치" }).textContent,
    ).toBe("한빛고등학교3학년");
  });

  it("담당 학급에 3학년이 없으면 안내만 보이고 조회 칸은 남는다", async () => {
    stubPage({
      [LIST_URL]: { body: body([], { total: 0, hasGrade3InScope: false }) },
    });
    renderRoutes(routes, "/teacher/admission-coaching");

    expect(
      await screen.findByText(
        "담당 학급에 중3, 고3 학생이 없습니다. 입시 상담코칭은 입시를 앞둔 중3, 고3 학생을 위한 화면입니다. 다른 학년 학생의 학습코칭은 개인종합코칭에서 볼 수 있습니다",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect(
      screen.queryByText("상담 메모는 개인종합코칭의 교사 메모에 써 주세요"),
    ).toBeNull();
    expect(screen.getByLabelText("학년그룹")).toBeTruthy();
    expect(screen.getByRole("button", { name: "조회" })).toBeTruthy();
  });

  it("반을 고르고 조회하면 그 조건으로 다시 읽고 경로에 반을 더한다", async () => {
    const calls = stubPage({
      "GET /api/console/admission-coaching?classId=c4&page=1": {
        body: body([student(5, "육*현", { className: "4" })]),
      },
    });
    renderRoutes(routes, "/teacher/admission-coaching");
    await screen.findByText("조회 결과 2명");
    const classSelect = screen.getByLabelText("반");
    expect(
      within(classSelect)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["전체", "3반", "4반"]);

    fireEvent.change(classSelect, { target: { value: "c4" } });
    fireEvent.click(screen.getByRole("button", { name: "조회" }));

    expect(await screen.findByText("조회 결과 1명")).toBeTruthy();
    expect(
      calls.some(
        (c) =>
          c.key === "GET /api/console/admission-coaching?classId=c4&page=1",
      ),
    ).toBe(true);
    expect(
      screen.getByRole("navigation", { name: "현재 위치" }).textContent,
    ).toBe("한빛고등학교3학년4반");
  });

  it("상담 상태를 누르면 바로 바뀌고 저장한 변경 일자가 보인다", async () => {
    const calls = stubPage({
      "PUT /api/console/counsel-status": {
        body: {
          ok: true,
          status: "scheduled",
          changedAt: "2026-11-04T15:30:00Z",
        },
      },
    });
    renderRoutes(routes, "/teacher/admission-coaching");
    const row = await screen.findByRole("row", { name: /한예준/ });

    fireEvent.click(within(row).getByRole("radio", { name: "상담예정" }));

    // 2026-11-04T15:30Z 는 KST 11월 5일
    expect(await within(row).findByText("2026.11.05")).toBeTruthy();
    expect(
      within(row)
        .getByRole("radio", { name: "상담예정" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      calls.find((c) => c.key === "PUT /api/console/counsel-status")?.body,
    ).toEqual({ studentId: "s2", status: "scheduled" });
  });

  it("이미 눌린 상담 상태를 다시 눌러도 저장하지 않는다", async () => {
    const calls = stubPage();
    renderRoutes(routes, "/teacher/admission-coaching");
    const row = await screen.findByRole("row", { name: /정민서/ });

    fireEvent.click(within(row).getByRole("radio", { name: "상담필요" }));

    expect(calls.some((c) => c.key.startsWith("PUT"))).toBe(false);
  });

  it("저장하지 못하면 이전 상태로 되돌리고 토스트로 알린다", async () => {
    stubPage({
      "PUT /api/console/counsel-status": { status: 500, body: {} },
    });
    renderRoutes(routes, "/teacher/admission-coaching");
    const row = await screen.findByRole("row", { name: /정민서/ });

    fireEvent.click(within(row).getByRole("radio", { name: "상담완료" }));

    expect(
      await screen.findByText(
        "상담 상태를 저장하지 못했어요. 다시 시도해 주세요",
      ),
    ).toBeTruthy();
    expect(
      within(row)
        .getByRole("radio", { name: "상담필요" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    expect(within(row).getByText("2026.10.28")).toBeTruthy();
  });

  it("코칭 버튼은 그 학생의 개인종합코칭으로 간다", async () => {
    stubPage();
    const { router } = renderRoutes(routes, "/teacher/admission-coaching");
    const row = await screen.findByRole("row", { name: /한예준/ });

    fireEvent.click(within(row).getByRole("button", { name: "코칭" }));

    expect(await screen.findByText("코칭 화면")).toBeTruthy();
    expect(router.state.location.search).toBe("?studentId=s2");
  });

  it("휴대폰은 표 대신 카드를 그리고 더 보기로 다음 쪽을 잇는다", async () => {
    useMobileScreen();
    stubPage({
      [LIST_URL]: {
        body: body(LIST.items.slice(0, 1), { total: 2, pageCount: 2 }),
      },
      "GET /api/console/admission-coaching?page=2": {
        body: body(LIST.items.slice(1), { total: 2, pageCount: 2, page: 2 }),
      },
    });
    renderRoutes(routes, "/teacher/admission-coaching");

    await screen.findByText("정민서");
    expect(screen.queryByRole("table")).toBeNull();
    const card = screen.getByRole("article");
    expect(within(card).getByText("가나대 경영학과")).toBeTruthy();
    expect(within(card).getByText("62점")).toBeTruthy();
    expect(
      within(card)
        .getByRole("radio", { name: "상담필요" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    expect(within(card).getByText("2026.10.28")).toBeTruthy();
    expect(screen.getByText("1 / 2명")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "더 보기" }));

    expect(await screen.findByText("한예준")).toBeTruthy();
    expect(screen.getAllByRole("article")).toHaveLength(2);
  });

  it("목록을 읽지 못하면 오류 안내를 보인다", async () => {
    stubPage({ [LIST_URL]: { status: 500, body: {} } });
    renderRoutes(routes, "/teacher/admission-coaching");

    expect(
      await screen.findByText(
        "입시 상담코칭 목록을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요",
      ),
    ).toBeTruthy();
  });
});
