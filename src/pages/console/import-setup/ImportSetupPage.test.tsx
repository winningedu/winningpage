// W11 학생불러오기-일괄설정, W11a 확인 창. 화면에 보이는 글, 보낸 요청, 열린 창으로 검증한다.

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";

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
import ImportSetupPage from "./ImportSetupPage";

const routes = [
  {
    path: "/teacher",
    Component: ConsoleGate,
    children: [
      {
        Component: ConsoleLayout,
        children: [{ path: "import", Component: ImportSetupPage }],
      },
    ],
  },
];

const GROUPS = [
  { id: "g1", name: "A레벨", studentCount: 26 },
  { id: "g2", name: "C레벨", studentCount: 0 },
];

const YEAR = {
  schoolYear: 2026,
  toYear: 2027,
  rolledOver: false,
  gradeCounts: [
    { grade: "고1", count: 150 },
    { grade: "고2", count: 150 },
    { grade: "고3", count: 150 },
  ],
  graduatingGrades: ["고3"],
  lastRollover: null,
};

function stubImport(
  over: {
    groups?: unknown;
    year?: Partial<typeof YEAR>;
    extra?: Record<string, ApiHandler>;
  } = {},
) {
  return stubApi({
    "GET /api/console/me": { body: adminMe },
    "GET /api/console/enrollment-requests/count": { body: { count: 0 } },
    "GET /api/console/groups": { body: { groups: over.groups ?? GROUPS } },
    "GET /api/console/school-year": { body: { ...YEAR, ...over.year } },
    ...over.extra,
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

describe("ImportSetupPage 머리와 그룹 목록", () => {
  it("제목, 부제, 등록된 그룹을 보여준다", async () => {
    stubImport();
    renderRoutes(routes, "/teacher/import");

    expect(
      await screen.findByRole("heading", { name: "학생불러오기-일괄설정" }),
    ).toBeTruthy();
    expect(
      screen.getByText("명단 엑셀 올리기, 학년그룹 일괄 변경, 그룹(레벨) 관리"),
    ).toBeTruthy();
    expect(await screen.findByText("A레벨")).toBeTruthy();
    expect(screen.getByText("C레벨")).toBeTruthy();
    // 휴대폰 부제와 구역 제목
    expect(screen.getAllByText("그룹(레벨) 관리")).toHaveLength(2);
    expect(
      screen.getByText(
        "명단 엑셀 올리기와 학년그룹 일괄 변경은 PC나 태블릿에서 할 수 있어요",
      ),
    ).toBeTruthy();
  });
});

describe("ImportSetupPage 그룹 추가", () => {
  const GROUP_LABEL = "그룹(레벨이 구분되어 있으면 입력, 없으면 빈칸)";

  it("이름을 넣고 추가하면 요청을 보내고 칸을 비우며 목록에 새 그룹이 보인다", async () => {
    const groups = [...GROUPS];
    const calls = stubApi({
      "GET /api/console/me": { body: adminMe },
      "GET /api/console/enrollment-requests/count": { body: { count: 0 } },
      "GET /api/console/school-year": { body: YEAR },
      "GET /api/console/groups": () => ({ body: { groups } }),
      "POST /api/console/groups": () => {
        groups.push({ id: "g3", name: "B레벨", studentCount: 0 });
        return { body: { ok: true, groupId: "g3" } };
      },
    });
    renderRoutes(routes, "/teacher/import");

    const input = (await screen.findByLabelText(
      GROUP_LABEL,
    )) as HTMLInputElement;
    expect(
      (screen.getByRole("button", { name: "추가" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.change(input, { target: { value: "  B레벨 " } });
    fireEvent.click(screen.getByRole("button", { name: "추가" }));

    expect(await screen.findByText("B레벨")).toBeTruthy();
    expect(
      calls.find((c) => c.key === "POST /api/console/groups")?.body,
    ).toEqual({ name: "B레벨" });
    expect(input.value).toBe("");
  });

  it("서버가 거절하면 서버 문구를 토스트로 보이고 입력을 남긴다", async () => {
    stubImport({
      extra: {
        "POST /api/console/groups": {
          status: 409,
          body: {
            error: {
              code: "GROUP_EXISTS",
              message: "이미 있는 그룹 이름이에요.",
            },
          },
        },
      },
    });
    renderRoutes(routes, "/teacher/import");

    const input = (await screen.findByLabelText(
      GROUP_LABEL,
    )) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "A레벨" } });
    fireEvent.click(screen.getByRole("button", { name: "추가" }));

    expect(await screen.findByText("이미 있는 그룹 이름이에요.")).toBeTruthy();
    await waitFor(() => expect(input.value).toBe("A레벨"));
  });
});

describe("ImportSetupPage 그룹 삭제", () => {
  it("소속 학생이 없는 그룹은 확인 창에서 삭제하고 목록에서 빠진다", async () => {
    const groups = [...GROUPS];
    const calls = stubApi({
      "GET /api/console/me": { body: adminMe },
      "GET /api/console/enrollment-requests/count": { body: { count: 0 } },
      "GET /api/console/school-year": { body: YEAR },
      "GET /api/console/groups": () => ({ body: { groups } }),
      "POST /api/console/groups/delete": () => {
        groups.pop();
        return { body: { ok: true } };
      },
    });
    renderRoutes(routes, "/teacher/import");

    fireEvent.click(await screen.findByRole("button", { name: "C레벨 삭제" }));
    expect(await screen.findByText("C레벨 그룹을 삭제할까요?")).toBeTruthy();
    expect(
      screen.getByText(
        "소속 학생이 없는 그룹이에요. 삭제하면 학생정보편집, 담당학급배정, 필터의 보기에서 빠져요",
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "삭제" }));

    await waitFor(() => expect(screen.queryByText("C레벨")).toBeNull());
    expect(
      calls.find((c) => c.key === "POST /api/console/groups/delete")?.body,
    ).toEqual({ groupId: "g2" });
  });
});

describe("ImportSetupPage 그룹 삭제 막힘", () => {
  it("소속 학생이 있으면 이유를 알리고 삭제 버튼을 막으며 취소로 닫는다", async () => {
    const calls = stubImport();
    renderRoutes(routes, "/teacher/import");

    fireEvent.click(await screen.findByRole("button", { name: "A레벨 삭제" }));
    expect(await screen.findByText("A레벨 그룹을 지울 수 없어요")).toBeTruthy();
    expect(
      screen.getByText(
        "소속 학생이 26명 있어 지울 수 없어요. 학생정보편집에서 학생의 그룹을 먼저 바꿔 주세요",
      ),
    ).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "삭제" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    await waitFor(() =>
      expect(screen.queryByText("A레벨 그룹을 지울 수 없어요")).toBeNull(),
    );
    expect(calls.some((c) => c.key.includes("groups/delete"))).toBe(false);
  });
});

describe("ImportSetupPage ③ 학년그룹 일괄 변경", () => {
  it("진급 대상 줄, 양식 내려받기, 빈 입력칸의 미리보기 막힘을 보여준다", async () => {
    stubImport();
    renderRoutes(routes, "/teacher/import");

    expect(await screen.findByText("③ 학년그룹 일괄 변경")).toBeTruthy();
    expect(
      await screen.findByText(
        "진급 대상: 1학년 150명과 2학년 150명은 학년 +1, 3학년 150명은 졸업 처리",
      ),
    ).toBeTruthy();
    const links = screen.getAllByRole("link", { name: "샘플 엑셀 양식" });
    expect(links.map((l) => l.getAttribute("href"))).toContain(
      "/templates/grade-bulk-change.xlsx",
    );
    expect(
      screen.getByPlaceholderText("변경할 명단을 붙여넣으세요"),
    ).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "미리보기" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("졸업 학년이 없으면 졸업 문구를 빼고 쓴다", async () => {
    stubImport({
      year: {
        gradeCounts: [
          { grade: "중1", count: 22 },
          { grade: "중2", count: 22 },
        ],
        graduatingGrades: ["중3", "고3"],
      },
    });
    renderRoutes(routes, "/teacher/import");

    expect(
      await screen.findByText("진급 대상: 1학년 22명과 2학년 22명은 학년 +1"),
    ).toBeTruthy();
  });

  it("이미 실행한 학년도는 입력칸과 미리보기를 막고 안내를 보인다", async () => {
    stubImport({ year: { rolledOver: true } });
    renderRoutes(routes, "/teacher/import");

    expect(
      await screen.findByText(
        "이번 학년도에는 이미 실행했어요. 같은 학년도에 다시 실행할 수 없어요",
      ),
    ).toBeTruthy();
    expect(
      (
        screen.getByPlaceholderText(
          "변경할 명단을 붙여넣으세요",
        ) as HTMLTextAreaElement
      ).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "미리보기" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});

const PREVIEW = {
  rows: [
    {
      line: 1,
      displayName: "김*늘",
      from: { grade: "고1", groupName: null, className: "4", number: 7 },
      to: { grade: "고2", groupName: null, className: "3", number: 8 },
      studentId: "s1",
      result: "applied",
    },
    {
      line: 2,
      displayName: "이*수",
      from: { grade: "고3", groupName: "A레벨", className: "1", number: null },
      to: null,
      studentId: "s2",
      result: "graduating",
    },
    {
      line: 3,
      displayName: "박*준*",
      from: null,
      to: null,
      studentId: null,
      result: "same_name",
    },
    {
      line: 4,
      displayName: "최*민",
      from: { grade: "고1", groupName: null, className: "2", number: 3 },
      to: { grade: "고2", groupName: null, className: null, number: null },
      studentId: "s4",
      result: "check_target",
    },
  ],
  applyRows: [{ studentId: "s1", groupId: null, className: "3", number: 8 }],
  summary: { graduate: 150, promote: 300, waiting: 3 },
};

async function previewIt(extra: Record<string, ApiHandler> = {}) {
  const calls = stubImport({
    extra: {
      "POST /api/console/school-year/rollover/preview": { body: PREVIEW },
      ...extra,
    },
  });
  renderRoutes(routes, "/teacher/import");
  const textarea = (await screen.findByPlaceholderText(
    "변경할 명단을 붙여넣으세요",
  )) as HTMLTextAreaElement;
  fireEvent.change(textarea, { target: { value: "김하늘,1학년,,4,7,,,3,8" } });
  fireEvent.click(screen.getByRole("button", { name: "미리보기" }));
  return calls;
}

describe("ImportSetupPage 미리보기", () => {
  it("입력한 명단과 toYear 로 요청하고 줄마다 값과 결과를 표로 보인다", async () => {
    const calls = await previewIt();

    expect(await screen.findByText("김*늘")).toBeTruthy();
    expect(calls.find((c) => c.key.endsWith("rollover/preview"))?.body).toEqual(
      { toYear: 2027, text: "김하늘,1학년,,4,7,,,3,8" },
    );
    for (const header of [
      "이름",
      "기존 학년그룹, 그룹, 반, 번호",
      "새 학년그룹, 그룹, 반, 번호",
      "결과",
    ]) {
      expect(screen.getByRole("columnheader", { name: header })).toBeTruthy();
    }
    expect(screen.getByText("1학년, 없음, 4반, 7번")).toBeTruthy();
    expect(screen.getByText("2학년, 없음, 3반, 8번")).toBeTruthy();
    expect(screen.getByText("3학년, A레벨, 1반, 번호 미입력")).toBeTruthy();
    expect(screen.getByText("박*준*")).toBeTruthy();
    expect(screen.getByText("반영")).toBeTruthy();
    expect(screen.getByText("3학년은 졸업 처리 대상")).toBeTruthy();
    expect(screen.getByText("같은 이름이 2명 이상(사람이 확인)")).toBeTruthy();
    expect(screen.getAllByText("새 반과 번호 확인").length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        "결과 종류: 반영, 현재 학생을 찾을 수 없음, 3학년은 졸업 처리 대상, 새 반과 번호 확인, 같은 새 반과 번호가 중복, 같은 이름이 2명 이상(사람이 확인), 새 반에 담임 없음(안내만, 반영됨)",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "적용" })).toBeTruthy();
  });
});

/** 미리보기 응답을 release 를 부를 때까지 붙잡아 둔다. */
function holdPreview() {
  const original = globalThis.fetch;
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const res = await original(input, init);
      if (String(input).endsWith("rollover/preview")) await gate;
      return res;
    }),
  );
  return release;
}

describe("ImportSetupPage 미리보기 중 입력", () => {
  it("응답을 기다리는 동안 입력칸과 미리보기 버튼을 막는다", async () => {
    stubImport({
      extra: {
        "POST /api/console/school-year/rollover/preview": { body: PREVIEW },
      },
    });
    const release = holdPreview();
    renderRoutes(routes, "/teacher/import");
    const textarea = (await screen.findByPlaceholderText(
      "변경할 명단을 붙여넣으세요",
    )) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "김하늘" } });
    fireEvent.click(screen.getByRole("button", { name: "미리보기" }));

    await waitFor(() => expect(textarea.disabled).toBe(true));
    release();
    expect(await screen.findByText("김*늘")).toBeTruthy();
    expect(textarea.disabled).toBe(false);
  });

  it("요청한 뒤 명단이 바뀌었으면 늦게 온 응답을 버린다", async () => {
    stubImport({
      extra: {
        "POST /api/console/school-year/rollover/preview": { body: PREVIEW },
      },
    });
    const release = holdPreview();
    renderRoutes(routes, "/teacher/import");
    const textarea = (await screen.findByPlaceholderText(
      "변경할 명단을 붙여넣으세요",
    )) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "김하늘" } });
    fireEvent.click(screen.getByRole("button", { name: "미리보기" }));
    await waitFor(() => expect(textarea.disabled).toBe(true));

    fireEvent.change(screen.getByLabelText("명단 엑셀 파일"), {
      target: {
        files: [
          xlsxFile([
            ["이름", "학년", "반", "번호"],
            ["홍길동", "1학년", "4", "7"],
          ]),
        ],
      },
    });
    await waitFor(() => expect(textarea.value).toContain("홍길동"));
    release();

    await waitFor(() => expect(textarea.disabled).toBe(false));
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("button", { name: "적용" })).toBeNull();
  });
});

describe("ImportSetupPage 미리보기 실패", () => {
  it("서버가 거절하면 서버 문구를 토스트로 보이고 표를 그리지 않는다", async () => {
    await previewIt({
      "POST /api/console/school-year/rollover/preview": {
        status: 400,
        body: {
          error: { code: "BAD_REQUEST", message: "입력 값을 확인해 주세요." },
        },
      },
    });

    expect(await screen.findByText("입력 값을 확인해 주세요.")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });
});

describe("ImportSetupPage W11a 적용 확인", () => {
  it("적용을 누르면 요약을 보이고 취소하면 요청 없이 닫는다", async () => {
    const calls = await previewIt();

    fireEvent.click(await screen.findByRole("button", { name: "적용" }));
    expect(
      await screen.findByText("학년그룹 일괄 변경을 적용할까요?"),
    ).toBeTruthy();
    expect(screen.getByText("졸업 처리 대상")).toBeTruthy();
    expect(screen.getByText("150명")).toBeTruthy();
    expect(screen.getByText("학년 +1 대상")).toBeTruthy();
    expect(screen.getByText("300명")).toBeTruthy();
    expect(
      screen.getByText("반 배정 대기(명단에 없거나 반과 번호를 비운 학생)"),
    ).toBeTruthy();
    expect(screen.getByText("3명")).toBeTruthy();
    expect(
      screen.getByText("한 학년도에 한 번만 실행할 수 있어요"),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    await waitFor(() =>
      expect(screen.queryByText("학년그룹 일괄 변경을 적용할까요?")).toBeNull(),
    );
    expect(screen.getByRole("table")).toBeTruthy();
    expect(
      calls.some((c) => c.key === "POST /api/console/school-year/rollover"),
    ).toBe(false);
  });

  it("확인하면 미리보기 줄을 보내 적용하고, 완료 토스트와 이미 실행 상태로 바뀐다", async () => {
    let rolledOver = false;
    const calls = await previewIt({
      "GET /api/console/school-year": () => ({
        body: { ...YEAR, rolledOver },
      }),
      "POST /api/console/school-year/rollover": () => {
        rolledOver = true;
        return {
          body: {
            ok: true,
            graduated: 150,
            promoted: 300,
            skipped: 2,
            assigned: 297,
          },
        };
      },
    });

    fireEvent.click(await screen.findByRole("button", { name: "적용" }));
    fireEvent.click(await screen.findByRole("button", { name: "확인" }));

    expect(
      await screen.findByText(
        "학년그룹 일괄 변경을 적용했어요. 학년 +1 297명, 졸업 처리 150명, 반영하지 못한 3명은 미배정 목록에서 확인해 주세요",
      ),
    ).toBeTruthy();
    expect(
      calls.find((c) => c.key === "POST /api/console/school-year/rollover")
        ?.body,
    ).toEqual({
      toYear: 2027,
      rows: [{ studentId: "s1", groupId: null, className: "3", number: 8 }],
    });
    expect(
      await screen.findByText(
        "이번 학년도에는 이미 실행했어요. 같은 학년도에 다시 실행할 수 없어요",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect(
      (screen.getByRole("button", { name: "미리보기" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("응답의 졸업과 진급이 모두 0이면 이미 실행한 것으로 보고 성공 토스트 없이 안내만 보인다", async () => {
    let rolledOver = false;
    await previewIt({
      "GET /api/console/school-year": () => ({
        body: { ...YEAR, rolledOver },
      }),
      "POST /api/console/school-year/rollover": () => {
        rolledOver = true;
        return {
          body: {
            ok: true,
            graduated: 0,
            promoted: 0,
            skipped: 2,
            assigned: 0,
          },
        };
      },
    });

    fireEvent.click(await screen.findByRole("button", { name: "적용" }));
    fireEvent.click(await screen.findByRole("button", { name: "확인" }));

    expect(
      await screen.findByText(
        "이번 학년도에는 이미 실행했어요. 같은 학년도에 다시 실행할 수 없어요",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/학년그룹 일괄 변경을 적용했어요/)).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("적용이 실패하면 창을 열어 둔 채 서버 문구를 토스트로 보인다", async () => {
    await previewIt({
      "POST /api/console/school-year/rollover": {
        status: 409,
        body: {
          error: { code: "NUMBER_TAKEN", message: "이미 사용 중인 번호예요." },
        },
      },
    });

    fireEvent.click(await screen.findByRole("button", { name: "적용" }));
    fireEvent.click(await screen.findByRole("button", { name: "확인" }));

    expect(await screen.findByText("이미 사용 중인 번호예요.")).toBeTruthy();
    expect(screen.getByText("학년그룹 일괄 변경을 적용할까요?")).toBeTruthy();
  });
});

describe("ImportSetupPage 입력을 고친 뒤", () => {
  it("미리보기 뒤에 명단을 고치면 낡은 표와 적용 버튼을 치운다", async () => {
    await previewIt();
    await screen.findByText("김*늘");

    fireEvent.change(
      screen.getByPlaceholderText("변경할 명단을 붙여넣으세요"),
      {
        target: { value: "다른 명단" },
      },
    );

    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("button", { name: "적용" })).toBeNull();
  });
});

function xlsxFile(aoa: string[][]): File {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(aoa),
    "Sheet1",
  );
  const data = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  return new File([data], "roster.xlsx");
}

describe("ImportSetupPage ① 명단 엑셀 올리기", () => {
  it("안내 글, 파일 선택 버튼, 양식 링크를 보인다", async () => {
    stubImport();
    renderRoutes(routes, "/teacher/import");

    expect(await screen.findByText("① 명단 엑셀 올리기")).toBeTruthy();
    expect(
      screen.getByText("엑셀 파일을 여기에 끌어다 놓거나 파일 선택을 누르세요"),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "파일 선택" })).toBeTruthy();
    expect(
      screen
        .getAllByRole("link", { name: "샘플 엑셀 양식" })
        .map((l) => l.getAttribute("href")),
    ).toContain("/templates/student-roster.xlsx");
  });

  it("고른 파일의 줄을 ③ 입력칸에 채운다", async () => {
    stubImport();
    renderRoutes(routes, "/teacher/import");

    const input = (await screen.findByLabelText(
      "명단 엑셀 파일",
    )) as HTMLInputElement;
    fireEvent.change(input, {
      target: {
        files: [
          xlsxFile([
            ["이름", "학년", "반", "번호"],
            ["홍길동", "1학년", "4", "7"],
          ]),
        ],
      },
    });

    await waitFor(() =>
      expect(
        (
          screen.getByPlaceholderText(
            "변경할 명단을 붙여넣으세요",
          ) as HTMLTextAreaElement
        ).value,
      ).toBe("홍길동\t1학년\t\t4\t7\t\t\t\t"),
    );
  });

  it("끌어다 놓은 파일도 읽는다", async () => {
    stubImport();
    renderRoutes(routes, "/teacher/import");

    const zone = (
      await screen.findByText(
        "엑셀 파일을 여기에 끌어다 놓거나 파일 선택을 누르세요",
      )
    ).parentElement as HTMLElement;
    fireEvent.drop(zone, {
      dataTransfer: {
        files: [
          xlsxFile([
            ["이름", "학년", "반", "번호"],
            ["김하늘", "2학년", "3", "12"],
          ]),
        ],
      },
    });

    await waitFor(() =>
      expect(
        (
          screen.getByPlaceholderText(
            "변경할 명단을 붙여넣으세요",
          ) as HTMLTextAreaElement
        ).value,
      ).toBe("김하늘\t2학년\t\t3\t12\t\t\t\t"),
    );
  });

  it("읽을 줄이 없는 파일은 오류 토스트를 보이고 입력칸을 그대로 둔다", async () => {
    stubImport();
    renderRoutes(routes, "/teacher/import");

    const input = (await screen.findByLabelText(
      "명단 엑셀 파일",
    )) as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [xlsxFile([["이름", "학년", "반", "번호"]])] },
    });

    expect(await screen.findByText("엑셀에서 읽을 줄이 없어요")).toBeTruthy();
    expect(
      (
        screen.getByPlaceholderText(
          "변경할 명단을 붙여넣으세요",
        ) as HTMLTextAreaElement
      ).value,
    ).toBe("");
  });
});

describe("ImportSetupPage 휴대폰", () => {
  const desktopWidth = window.innerWidth;
  afterEach(() => {
    window.innerWidth = desktopWidth;
  });

  it("768 미만에서는 ① 과 ③ 을 그리지 않고 학년도 정보도 요청하지 않는다", async () => {
    window.innerWidth = 500;
    const calls = stubImport();
    renderRoutes(routes, "/teacher/import");

    expect(await screen.findByText("A레벨")).toBeTruthy();
    expect(screen.queryByText("① 명단 엑셀 올리기")).toBeNull();
    expect(screen.queryByText("③ 학년그룹 일괄 변경")).toBeNull();
    expect(calls.some((c) => c.key === "GET /api/console/school-year")).toBe(
      false,
    );
  });
});

describe("ImportSetupPage 권한 없음", () => {
  it("담임이 열면 리다이렉트 없이 안내를 보이고 학생 관리로 보낸다", async () => {
    stubApi({
      "GET /api/console/me": { body: homeroomMe },
      "GET /api/console/enrollment-requests/count": { body: { count: 0 } },
    });
    const { router } = renderRoutes(
      [
        {
          path: "/teacher",
          Component: ConsoleGate,
          children: [
            {
              Component: ConsoleLayout,
              children: [
                { path: "import", Component: ImportSetupPage },
                { path: "students", Component: () => <p>학생 관리 화면</p> },
              ],
            },
          ],
        },
      ],
      "/teacher/import",
    );

    expect(
      await screen.findByText("이 메뉴는 학교 전체 관리자만 쓸 수 있어요"),
    ).toBeTruthy();
    expect(
      screen.getByText("담당 학급 관리는 학생 관리에서 할 수 있어요"),
    ).toBeTruthy();
    expect(router.state.location.pathname).toBe("/teacher/import");
    fireEvent.click(screen.getByRole("button", { name: "학생 관리로 가기" }));
    expect(await screen.findByText("학생 관리 화면")).toBeTruthy();
    expect(router.state.location.pathname).toBe("/teacher/students");
  });
});

describe("ImportSetupPage 이미 실행한 학년도의 ① 올리기", () => {
  it("끌어다 놓기와 파일 선택을 막는다", async () => {
    stubImport({ year: { rolledOver: true } });
    renderRoutes(routes, "/teacher/import");

    await screen.findByText(
      "이번 학년도에는 이미 실행했어요. 같은 학년도에 다시 실행할 수 없어요",
    );
    // 잠금은 ③ 이 알린 다음 한 번 더 그려져야 반영된다.
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "파일 선택" }) as HTMLButtonElement)
          .disabled,
      ).toBe(true),
    );
    expect(
      (screen.getByLabelText("명단 엑셀 파일") as HTMLInputElement).disabled,
    ).toBe(true);
    const zone = screen.getByText(
      "엑셀 파일을 여기에 끌어다 놓거나 파일 선택을 누르세요",
    ).parentElement as HTMLElement;
    fireEvent.drop(zone, {
      dataTransfer: {
        files: [
          xlsxFile([
            ["이름", "학년", "반", "번호"],
            ["김하늘", "2학년", "3", "12"],
          ]),
        ],
      },
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(
      (
        screen.getByPlaceholderText(
          "변경할 명단을 붙여넣으세요",
        ) as HTMLTextAreaElement
      ).value,
    ).toBe("");
  });
});

describe("ImportSetupPage 샘플 파일 이름", () => {
  it("두 양식 링크가 정한 파일 이름으로 내려받게 하고 주소는 그대로 둔다", async () => {
    stubImport();
    renderRoutes(routes, "/teacher/import");

    expect(await screen.findByText("③ 학년그룹 일괄 변경")).toBeTruthy();
    const links = screen.getAllByRole("link", { name: "샘플 엑셀 양식" });
    const byHref = Object.fromEntries(
      links.map((l) => [l.getAttribute("href"), l.getAttribute("download")]),
    );
    expect(byHref).toEqual({
      "/templates/student-roster.xlsx": "스쿨멘토_학생불러오기_샘플.xlsx",
      "/templates/grade-bulk-change.xlsx":
        "스쿨멘토_학년그룹일괄변경_샘플.xlsx",
    });
  });
});

describe("ImportSetupPage 목록 불러오기 실패 안내", () => {
  it("그룹과 학년도 정보를 못 불러오면 다시 시도하라고 함께 안내한다", async () => {
    stubImport({
      extra: {
        "GET /api/console/groups": { status: 500, body: {} },
        "GET /api/console/school-year": { status: 500, body: {} },
      },
    });
    renderRoutes(routes, "/teacher/import");

    expect(
      await screen.findByText(
        "그룹을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요",
      ),
    ).toBeTruthy();
    expect(
      await screen.findByText(
        "학년도 정보를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요",
      ),
    ).toBeTruthy();
  });
});
