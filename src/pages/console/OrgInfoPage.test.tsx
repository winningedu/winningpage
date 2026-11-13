// W17 내정보관리. 저장, 최종확인, 조회 전용 상태와 본사 대행 저장을 검증한다.

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: mocks.getSession } },
}));
vi.mock("./useIdleLogout", () => ({ useIdleLogout: vi.fn() }));

import ConsoleGate from "./ConsoleGate";
import ConsoleLayout from "./ConsoleLayout";
import OrgInfoPage from "./OrgInfoPage";
import {
  type ApiHandler,
  adminMe,
  proxyMe,
  renderRoutes,
  stubApi,
} from "./testUtils";

const routes = [
  {
    path: "/teacher",
    Component: ConsoleGate,
    children: [
      {
        Component: ConsoleLayout,
        children: [{ path: "org-info", Component: OrgInfoPage }],
      },
    ],
  },
];

const ORG = {
  tenantId: "t1",
  updatedAt: "2026-11-05T00:00:00.100000+00:00",
  code: "SM26HB83",
  name: "한빛고등학교",
  address: "서울시 한빛구 학교로 12",
  mainPhone: "02-123-4567",
  contactPhone: "02-123-4568",
  contactMobile: "010-2468-1357",
  homepage: "https://hanbit.hs.kr",
  contactEmail: "manager@hanbit.hs.kr",
  infoConfirmedAt: null as string | null,
};
const SAVED_AT = "2026-11-05T00:30:00.200000+00:00";
const SAVED = {
  name: ORG.name,
  address: ORG.address,
  mainPhone: ORG.mainPhone,
  contactPhone: ORG.contactPhone,
  contactMobile: ORG.contactMobile,
  homepage: ORG.homepage,
  contactEmail: ORG.contactEmail,
};

function stubOrg(
  over: {
    org?: Partial<typeof ORG>;
    me?: unknown;
    patch?: ApiHandler;
    confirm?: ApiHandler;
  } = {},
) {
  return stubApi({
    "GET /api/console/me": { body: over.me ?? adminMe },
    "GET /api/console/org-info": { body: { ...ORG, ...over.org } },
    "PATCH /api/console/org-info": over.patch ?? {
      body: { ok: true, updatedAt: SAVED_AT },
    },
    "POST /api/console/org-info/confirm": over.confirm ?? {
      body: { ok: true, infoConfirmedAt: "2026-11-05T00:00:00Z" },
    },
    "GET /api/console/enrollment-requests/count": { body: { count: 0 } },
  });
}

const field = (label: string) =>
  screen.findByLabelText(label) as Promise<HTMLInputElement>;
const clickSave = () =>
  fireEvent.click(screen.getByRole("button", { name: "저장" }));

beforeEach(() => {
  mocks.getSession.mockResolvedValue({
    data: { session: { user: { id: "u" }, access_token: "tok" } },
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("OrgInfoPage 입력", () => {
  it("불러온 값을 칸에 채우고 소속코드는 바꿀 수 없다", async () => {
    stubOrg();

    renderRoutes(routes, "/teacher/org-info");

    expect((await field("교육기관명(필수)")).value).toBe("한빛고등학교");
    expect((await field("주소")).value).toBe("서울시 한빛구 학교로 12");
    expect((await field("대표번호")).value).toBe("02-123-4567");
    expect((await field("담당자 전화")).value).toBe("02-123-4568");
    expect((await field("담당자 핸드폰")).value).toBe("010-2468-1357");
    expect((await field("홈페이지 주소")).value).toBe("https://hanbit.hs.kr");
    expect((await field("담당자 이메일")).value).toBe("manager@hanbit.hs.kr");
    const code = await field("소속코드");
    expect(code.value).toBe("SM26HB83");
    expect(code.disabled).toBe(true);
    expect(
      screen.getByText("교육기관 기본 정보를 등록하고 조회합니다"),
    ).toBeTruthy();
    expect(screen.getByText("소속코드는 바꿀 수 없어요")).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 1, name: "내정보관리" }),
    ).toBeTruthy();
  });

  it("저장된 홈페이지가 없으면 http:// 를 미리 채우고 저장된 값은 그대로 보인다", async () => {
    stubOrg({ org: { homepage: null } as never });
    renderRoutes(routes, "/teacher/org-info");

    expect((await field("홈페이지 주소")).value).toBe("http://");
  });

  it("홈페이지에 http:// 만 남기면 비운 것으로 보고 빈 값으로 저장한다", async () => {
    const calls = stubOrg({ org: { homepage: null } as never });
    renderRoutes(routes, "/teacher/org-info");
    await field("홈페이지 주소");

    clickSave();
    fireEvent.click(
      await screen.findByRole("button", { name: "최종확인(저장)" }),
    );

    await screen.findByText(/저장했어요/);
    const patch = calls.find((c) => c.key.startsWith("PATCH"));
    expect(patch?.body).toMatchObject({ homepage: "" });
  });

  it("비운 채 확인 단계에서 수정하기로 돌아오면 http:// 를 다시 채운다", async () => {
    stubOrg({ org: { homepage: null } as never });
    renderRoutes(routes, "/teacher/org-info");
    await field("홈페이지 주소");
    clickSave();

    fireEvent.click(await screen.findByRole("button", { name: "수정하기" }));

    expect((await field("홈페이지 주소")).value).toBe("http://");
  });

  it("본사 대행과 최종확인이 끝난 화면에는 http:// 를 채우지 않는다", async () => {
    stubOrg({
      me: proxyMe,
      org: { homepage: null, infoConfirmedAt: "2026-11-05T00:00:00Z" } as never,
    });
    renderRoutes(routes, "/teacher/org-info");

    expect((await field("홈페이지 주소")).value).toBe("");
  });

  it("기관 정보를 읽지 못하면 다시 시도 안내를 보인다", async () => {
    stubApi({
      "GET /api/console/me": { body: adminMe },
      "GET /api/console/org-info": { status: 500, body: {} },
      "GET /api/console/enrollment-requests/count": { body: { count: 0 } },
    });

    renderRoutes(routes, "/teacher/org-info");

    expect(
      await screen.findByText(
        "기관 정보를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요",
      ),
    ).toBeTruthy();
  });

  it("값이 틀린 칸을 한꺼번에 오류로 보이고 서버로 보내지 않는다", async () => {
    const calls = stubOrg();
    renderRoutes(routes, "/teacher/org-info");
    fireEvent.change(await field("교육기관명(필수)"), {
      target: { value: "  " },
    });
    fireEvent.change(await field("대표번호"), { target: { value: "02-abc" } });
    fireEvent.change(await field("담당자 전화"), { target: { value: "x" } });
    fireEvent.change(await field("담당자 핸드폰"), {
      target: { value: "010 1234" },
    });
    fireEvent.change(await field("홈페이지 주소"), {
      target: { value: "hanbit.kr" },
    });
    fireEvent.change(await field("담당자 이메일"), {
      target: { value: "no-at" },
    });

    clickSave();

    expect(await screen.findByText("교육기관명을 입력해 주세요")).toBeTruthy();
    expect(
      screen.getAllByText("숫자와 하이픈만 쓸 수 있어요. 예: 02-123-4567"),
    ).toHaveLength(3);
    expect(
      screen.getByText(
        "주소 형식이 맞지 않아요. http:// 또는 https://로 시작하게 써 주세요",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText("이메일 형식이 맞지 않아요. 예: manager@hanbit.hs.kr"),
    ).toBeTruthy();
    expect((await field("대표번호")).getAttribute("aria-invalid")).toBe("true");
    expect(calls.some((c) => c.key.startsWith("PATCH"))).toBe(false);
  });

  it("비어 있어도 되는 항목은 비워도 저장 확인으로 넘어간다", async () => {
    stubOrg({ org: { homepage: null, contactEmail: "" } as never });
    renderRoutes(routes, "/teacher/org-info");
    await field("교육기관명(필수)");

    clickSave();

    expect(
      await screen.findByRole("button", { name: "최종확인(저장)" }),
    ).toBeTruthy();
  });
});

describe("OrgInfoPage 최종확인", () => {
  it("저장을 누르면 아직 서버에 보내지 않고 확인 단계로 간다", async () => {
    const calls = stubOrg();
    renderRoutes(routes, "/teacher/org-info");
    await field("교육기관명(필수)");

    clickSave();

    expect(
      await screen.findByText(
        "최종확인으로 저장하면 조회 전용이 돼요. 바꾸려면 본사에 요청해야 해요",
      ),
    ).toBeTruthy();
    expect((await field("주소")).readOnly).toBe(true);
    expect(screen.getByRole("button", { name: "수정하기" })).toBeTruthy();
    expect(calls.some((c) => c.key.startsWith("PATCH"))).toBe(false);
  });

  it("수정하기를 누르면 같은 값으로 입력 단계로 돌아간다", async () => {
    stubOrg();
    renderRoutes(routes, "/teacher/org-info");
    fireEvent.change(await field("주소"), { target: { value: "새 주소" } });
    clickSave();

    fireEvent.click(await screen.findByRole("button", { name: "수정하기" }));

    const address = await field("주소");
    expect(address.readOnly).toBe(false);
    expect(address.value).toBe("새 주소");
  });

  it("최종확인은 저장(PATCH) 뒤에 확정을 부르고 조회 전용으로 바뀐다", async () => {
    const calls = stubOrg();
    renderRoutes(routes, "/teacher/org-info");
    fireEvent.change(await field("교육기관명(필수)"), {
      target: { value: " 한빛고등학교 " },
    });
    clickSave();

    fireEvent.click(
      await screen.findByRole("button", { name: "최종확인(저장)" }),
    );

    expect(
      await screen.findByText(
        "저장했어요. 이제 조회만 할 수 있어요. 바꾸려면 본사에 요청해 주세요",
      ),
    ).toBeTruthy();
    const writes = calls.filter(
      (c) => c.key.startsWith("PATCH") || c.key.startsWith("POST"),
    );
    expect(writes.map((c) => c.key)).toEqual([
      "PATCH /api/console/org-info",
      "POST /api/console/org-info/confirm",
    ]);
    expect(writes[0]?.body).toEqual({ ...SAVED, tenantId: "t1" });
    // 확정은 방금 저장한 화면의 기관 id 와 갱신 시각에 건다.
    expect(writes[1]?.body).toEqual({ tenantId: "t1", updatedAt: SAVED_AT });
    expect(screen.getByText("입력값은 모두 조회만 가능해요")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "저장" })).toBeNull();
    expect(screen.queryByRole("button", { name: "최종확인(저장)" })).toBeNull();
    expect((await field("주소")).readOnly).toBe(true);
    // 기관명이 바뀌었을 수 있어 me 를 다시 읽는다(교 #231).
    expect(
      calls.filter((c) => c.key === "GET /api/console/me").length,
    ).toBeGreaterThan(1);
  });

  it("저장 요청이 400 이면 입력 단계로 돌아가 다시 검사한다", async () => {
    stubOrg({
      patch: {
        status: 400,
        body: { error: { code: "BAD_REQUEST", message: "x" } },
      },
    });
    renderRoutes(routes, "/teacher/org-info");
    await field("교육기관명(필수)");
    clickSave();

    fireEvent.click(
      await screen.findByRole("button", { name: "최종확인(저장)" }),
    );

    expect(await screen.findByRole("button", { name: "저장" })).toBeTruthy();
    expect((await field("주소")).readOnly).toBe(false);
  });

  it("저장 요청이 400 으로 입력 단계에 돌아와도 빈 홈페이지에는 http:// 가 다시 채워진다", async () => {
    stubOrg({
      org: { homepage: null } as never,
      patch: {
        status: 400,
        body: { error: { code: "BAD_REQUEST", message: "x" } },
      },
    });
    renderRoutes(routes, "/teacher/org-info");
    await field("홈페이지 주소");
    clickSave();

    fireEvent.click(
      await screen.findByRole("button", { name: "최종확인(저장)" }),
    );

    expect(await screen.findByRole("button", { name: "저장" })).toBeTruthy();
    expect((await field("홈페이지 주소")).value).toBe("http://");
  });

  it("이미 확정됐다는 응답(409)이면 다시 읽어 조회 전용으로 보인다", async () => {
    let confirmed = false;
    stubApi({
      "GET /api/console/me": { body: adminMe },
      "GET /api/console/org-info": () => ({
        body: {
          ...ORG,
          infoConfirmedAt: confirmed ? "2026-11-05T00:00:00Z" : null,
        },
      }),
      "PATCH /api/console/org-info": () => {
        confirmed = true;
        return {
          status: 409,
          body: { error: { code: "ALREADY_CONFIRMED", message: "x" } },
        };
      },
      "GET /api/console/enrollment-requests/count": { body: { count: 0 } },
    });
    renderRoutes(routes, "/teacher/org-info");
    await field("교육기관명(필수)");
    clickSave();

    fireEvent.click(
      await screen.findByRole("button", { name: "최종확인(저장)" }),
    );

    expect(
      await screen.findByText("입력값은 모두 조회만 가능해요"),
    ).toBeTruthy();
  });

  it("기관이 바뀐 세션이라는 응답(SESSION_CHANGED)이면 안내를 보이고 me 를 다시 읽는다", async () => {
    const calls = stubOrg({
      patch: {
        status: 409,
        body: {
          error: {
            code: "SESSION_CHANGED",
            message:
              "기관이 바뀌었어요. 화면을 새로 고친 뒤 다시 시도해 주세요.",
          },
        },
      },
    });
    renderRoutes(routes, "/teacher/org-info");
    await field("교육기관명(필수)");
    clickSave();
    const meReads = () =>
      calls.filter((c) => c.key === "GET /api/console/me").length;
    const before = meReads();

    fireEvent.click(
      await screen.findByRole("button", { name: "최종확인(저장)" }),
    );

    expect((await screen.findByRole("status")).textContent).toBe(
      "기관이 바뀌었어요. 화면을 새로 고친 뒤 다시 시도해 주세요.",
    );
    await waitFor(() => expect(meReads()).toBeGreaterThan(before));
    expect(calls.some((c) => c.key.startsWith("POST"))).toBe(false);
  });

  it("검토한 뒤 정보가 바뀌었다는 응답(INFO_CHANGED)이면 안내를 보이고 다시 읽어 수정 단계로 돌아간다", async () => {
    let reads = 0;
    stubApi({
      "GET /api/console/me": { body: adminMe },
      "GET /api/console/org-info": () => {
        reads += 1;
        return {
          body: {
            ...ORG,
            address: reads > 1 ? "본사가 고친 주소" : ORG.address,
          },
        };
      },
      "PATCH /api/console/org-info": {
        body: { ok: true, updatedAt: SAVED_AT },
      },
      "POST /api/console/org-info/confirm": {
        status: 409,
        body: {
          error: {
            code: "INFO_CHANGED",
            message:
              "그사이 기관 정보가 바뀌었어요. 내용을 다시 확인해 주세요.",
          },
        },
      },
      "GET /api/console/enrollment-requests/count": { body: { count: 0 } },
    });
    renderRoutes(routes, "/teacher/org-info");
    await field("교육기관명(필수)");
    clickSave();

    fireEvent.click(
      await screen.findByRole("button", { name: "최종확인(저장)" }),
    );

    expect((await screen.findByRole("status")).textContent).toBe(
      "그사이 기관 정보가 바뀌었어요. 내용을 다시 확인해 주세요.",
    );
    await waitFor(async () =>
      expect((await field("주소")).value).toBe("본사가 고친 주소"),
    );
    expect((await field("주소")).readOnly).toBe(false);
    expect(screen.getByRole("button", { name: "저장" })).toBeTruthy();
  });

  it("서버 오류면 오류 토스트를 보이고 확인 단계에 머문다", async () => {
    stubOrg({ confirm: { status: 500, body: {} } });
    renderRoutes(routes, "/teacher/org-info");
    await field("교육기관명(필수)");
    clickSave();

    fireEvent.click(
      await screen.findByRole("button", { name: "최종확인(저장)" }),
    );

    expect((await screen.findByRole("status")).textContent).toBe(
      "저장하지 못했어요. 잠시 뒤 다시 시도해 주세요",
    );
    expect(screen.getByRole("button", { name: "최종확인(저장)" })).toBeTruthy();
  });
});

describe("OrgInfoPage 조회 전용", () => {
  it("이미 확정된 기관은 칸이 잠기고 버튼 없이 안내만 보인다", async () => {
    stubOrg({ org: { infoConfirmedAt: "2026-11-01T00:00:00Z" } });

    renderRoutes(routes, "/teacher/org-info");

    expect(
      await screen.findByText(
        "저장했어요. 이제 조회만 할 수 있어요. 바꾸려면 본사에 요청해 주세요",
      ),
    ).toBeTruthy();
    expect((await field("교육기관명(필수)")).readOnly).toBe(true);
    expect(
      screen.getByText("교육기관 기본 정보를 등록하고 조회합니다"),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "저장" })).toBeNull();
  });

  it("최종확인이 끝난 기관은 본사 대행도 학교 관리자처럼 잠겨 있다", async () => {
    stubOrg({
      me: proxyMe,
      org: { infoConfirmedAt: "2026-11-01T00:00:00Z" },
    });

    renderRoutes(routes, "/teacher/org-info");

    expect((await field("교육기관명(필수)")).readOnly).toBe(true);
    expect(screen.getByText("입력값은 모두 조회만 가능해요")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "저장" })).toBeNull();
  });
});

describe("OrgInfoPage 본사 대행 저장", () => {
  it("확정 전에는 같은 칸을 고쳐 저장(PATCH)만 하고 최종확인은 부르지 않는다", async () => {
    const calls = stubOrg({ me: proxyMe });
    renderRoutes(routes, "/teacher/org-info");
    const address = await field("주소");
    expect(address.readOnly).toBe(false);
    expect(screen.getByText("소속코드는 바꿀 수 없어요")).toBeTruthy();

    fireEvent.change(address, { target: { value: "새 주소" } });
    clickSave();

    expect(await screen.findByText("저장했어요")).toBeTruthy();
    const writes = calls.filter(
      (c) => c.key.startsWith("PATCH") || c.key.startsWith("POST"),
    );
    expect(writes.map((c) => c.key)).toEqual(["PATCH /api/console/org-info"]);
    expect(writes[0]?.body).toEqual({
      ...SAVED,
      address: "새 주소",
      tenantId: "t1",
    });
    expect((await field("주소")).readOnly).toBe(false);
  });

  it("다른 탭에서 학교를 바꿔 SESSION_CHANGED 가 오면 안내를 보이고 me 를 다시 읽는다", async () => {
    const calls = stubOrg({
      me: proxyMe,
      patch: {
        status: 409,
        body: {
          error: {
            code: "SESSION_CHANGED",
            message:
              "기관이 바뀌었어요. 화면을 새로 고친 뒤 다시 시도해 주세요.",
          },
        },
      },
    });
    renderRoutes(routes, "/teacher/org-info");
    fireEvent.change(await field("주소"), { target: { value: "새 주소" } });
    const meReads = () =>
      calls.filter((c) => c.key === "GET /api/console/me").length;
    const before = meReads();

    clickSave();

    expect((await screen.findByRole("status")).textContent).toBe(
      "기관이 바뀌었어요. 화면을 새로 고친 뒤 다시 시도해 주세요.",
    );
    await waitFor(() => expect(meReads()).toBeGreaterThan(before));
  });

  it("값이 틀리면 학교 관리자와 같은 검사로 서버에 보내지 않는다", async () => {
    const calls = stubOrg({ me: proxyMe });
    renderRoutes(routes, "/teacher/org-info");
    fireEvent.change(await field("대표번호"), { target: { value: "abc" } });

    clickSave();

    expect(
      await screen.findByText("숫자와 하이픈만 쓸 수 있어요. 예: 02-123-4567"),
    ).toBeTruthy();
    expect(calls.some((c) => c.key.startsWith("PATCH"))).toBe(false);
  });

  it("저장 중 이미 확정됐다는 응답(409)이면 다시 읽어 조회 전용으로 보인다", async () => {
    let confirmed = false;
    stubApi({
      "GET /api/console/me": { body: proxyMe },
      "GET /api/console/org-info": () => ({
        body: {
          ...ORG,
          infoConfirmedAt: confirmed ? "2026-11-01T00:00:00Z" : null,
        },
      }),
      "PATCH /api/console/org-info": () => {
        confirmed = true;
        return {
          status: 409,
          body: { error: { code: "ALREADY_CONFIRMED", message: "x" } },
        };
      },
      "GET /api/console/enrollment-requests/count": { body: { count: 0 } },
    });
    renderRoutes(routes, "/teacher/org-info");
    await field("주소");

    clickSave();

    expect(
      await screen.findByText("입력값은 모두 조회만 가능해요"),
    ).toBeTruthy();
  });
});
