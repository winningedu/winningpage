// W15 교사 엑셀 일괄업로드. 양식, 올리기와 붙여넣기, 행 판정 미리보기, 적용 결과, 읽기 오류, 휴대폰 안내를 검증한다.

import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  download: vi.fn(async () => {}),
}));
vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: mocks.getSession } },
}));
vi.mock("../useIdleLogout", () => ({ useIdleLogout: vi.fn() }));
vi.mock("./issuedFile", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./issuedFile")>()),
  downloadIssuedFile: mocks.download,
}));

import ConsoleGate from "../ConsoleGate";
import ConsoleLayout from "../ConsoleLayout";
import { type ApiHandler, adminMe, renderRoutes, stubApi } from "../testUtils";
import TeacherExcelPage from "./TeacherExcelPage";

const routes = [
  {
    path: "/teacher",
    Component: ConsoleGate,
    children: [
      {
        Component: ConsoleLayout,
        children: [{ path: "teachers/excel", Component: TeacherExcelPage }],
      },
    ],
  },
];

const PREVIEW = "POST /api/console/teachers/import-preview";
const IMPORT = "POST /api/console/teachers/import";
const PASTED =
  "박지훈\t010-1234-5678\t고2\t\t3반\n최유나\t010-1111-2222\t고2\t\t3반\n정하나\t\t고3\t\t1반";

function stubPage(routesOver: Record<string, ApiHandler> = {}) {
  return stubApi({
    "GET /api/console/me": { body: adminMe },
    "GET /api/console/enrollment-requests/count": { body: { count: 0 } },
    ...routesOver,
  });
}

function useMobileScreen() {
  window.innerWidth = 500;
  window.matchMedia = ((query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

const paste = (text: string) =>
  fireEvent.change(screen.getByLabelText("붙여넣기"), {
    target: { value: text },
  });

beforeEach(() => {
  mocks.getSession.mockResolvedValue({
    data: { session: { user: { id: "u" }, access_token: "tok" } },
  });
});

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

describe("W15 기본 화면", () => {
  it("양식 내려받기와 올리기, 붙여넣기 칸을 보이고 내용이 있어야 올릴 수 있다", async () => {
    stubPage();

    renderRoutes(routes, "/teacher/teachers/excel");

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "교사 엑셀 일괄업로드",
      }),
    ).toBeTruthy();
    expect(screen.getByText("1. 양식 내려받기")).toBeTruthy();
    const link = screen.getByRole("link", { name: "양식 내려받기(.xlsx)" });
    expect(link.getAttribute("href")).toBe("/templates/teacher-roster.xlsx");
    expect(
      screen.getByText(
        "양식 5칸: 교사명, 전화번호, 학년, 그룹, 반. 예시 2행이 들어 있어요",
      ),
    ).toBeTruthy();
    expect(screen.getByText("2. 파일 올리기 또는 붙여넣기")).toBeTruthy();
    expect(screen.getByRole("button", { name: "파일 선택" })).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "올리기" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});

describe("W15 휴대폰", () => {
  it("PC 전용 안내만 보이고 양식과 올리기는 그리지 않는다", async () => {
    useMobileScreen();
    stubPage();

    renderRoutes(routes, "/teacher/teachers/excel");

    expect(
      (
        await screen.findAllByText(
          "교사 엑셀 일괄업로드는 PC나 태블릿에서 할 수 있어요",
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "올리기" })).toBeNull();
    expect(
      screen.queryByRole("link", { name: "양식 내려받기(.xlsx)" }),
    ).toBeNull();
  });
});

const verdictsBody = (...verdicts: string[]) => ({
  rows: verdicts.map((verdict, index) => ({ index, verdict })),
});

describe("W15 미리보기", () => {
  it("붙여넣은 줄을 서버에 보내 판정을 줄마다 칩으로 보이고 적용 가능 건수와 오류 건수를 알린다", async () => {
    const calls = stubPage({
      [PREVIEW]: {
        body: verdictsBody("new", "phone_conflict", "format_error"),
      },
    });

    renderRoutes(routes, "/teacher/teachers/excel");
    await screen.findByText("1. 양식 내려받기");
    paste(PASTED);
    fireEvent.click(screen.getByRole("button", { name: "올리기" }));

    expect(await screen.findByText("3. 행 판정 미리보기")).toBeTruthy();
    expect(calls.find((c) => c.key === PREVIEW)?.body).toEqual({
      rows: [
        {
          name: "박지훈",
          phone: "010-1234-5678",
          grade: "고2",
          group: "",
          className: "3반",
        },
        {
          name: "최유나",
          phone: "010-1111-2222",
          grade: "고2",
          group: "",
          className: "3반",
        },
        {
          name: "정하나",
          phone: "",
          grade: "고3",
          group: "",
          className: "1반",
        },
      ],
    });
    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0] as HTMLElement).getByText("신규")).toBeTruthy();
    expect(
      within(rows[1] as HTMLElement).getByText("전화번호 오류"),
    ).toBeTruthy();
    expect(within(rows[2] as HTMLElement).getByText("형식 오류")).toBeTruthy();
    expect(
      screen.getByText("적용 가능 1건, 오류 2건. 오류 행은 적용하지 않아요"),
    ).toBeTruthy();
  });

  it("취소하면 처음 화면으로 돌아간다", async () => {
    stubPage({ [PREVIEW]: { body: verdictsBody("new", "new", "new") } });

    renderRoutes(routes, "/teacher/teachers/excel");
    await screen.findByText("1. 양식 내려받기");
    paste(PASTED);
    fireEvent.click(screen.getByRole("button", { name: "올리기" }));
    await screen.findByText("3. 행 판정 미리보기");
    fireEvent.click(screen.getByRole("button", { name: "취소" }));

    expect(await screen.findByText("1. 양식 내려받기")).toBeTruthy();
    expect(
      (screen.getByLabelText("붙여넣기") as HTMLTextAreaElement).value,
    ).toBe("");
  });

  it("파일 선택으로 읽은 줄을 칸에 채우고 읽을 수 없는 파일은 오류로 알린다", async () => {
    stubPage();
    renderRoutes(routes, "/teacher/teachers/excel");
    await screen.findByText("1. 양식 내려받기");
    const input = screen.getByLabelText("교사 엑셀 파일");

    const sheet = XLSX.utils.aoa_to_sheet([
      ["교사명", "전화번호", "학년", "그룹", "반"],
      ["박지훈", "010-1234-5678", "고2", "", "3반"],
    ]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "S");
    const bytes = XLSX.write(book, { type: "array", bookType: "xlsx" });
    fireEvent.change(input, {
      target: { files: [new File([bytes], "teachers.xlsx")] },
    });
    await waitFor(() =>
      expect(
        (screen.getByLabelText("붙여넣기") as HTMLTextAreaElement).value,
      ).toBe("박지훈\t010-1234-5678\t고2\t\t3반"),
    );

    fireEvent.change(input, {
      target: { files: [new File(["x"], "teachers.pdf")] },
    });
    expect(
      await screen.findByText(
        /엑셀 파일을 읽을 수 없어요\. .xlsx, .xls, .csv 파일인지 확인/,
      ),
    ).toBeTruthy();
  });

  it("미리보기 요청이 실패하면 서버 문구를 보이고 입력은 남는다", async () => {
    stubPage({
      [PREVIEW]: {
        status: 400,
        body: {
          error: {
            code: "BAD_REQUEST",
            message: "행(최대 200개)을 확인해 주세요.",
          },
        },
      },
    });

    renderRoutes(routes, "/teacher/teachers/excel");
    await screen.findByText("1. 양식 내려받기");
    paste(PASTED);
    fireEvent.click(screen.getByRole("button", { name: "올리기" }));

    expect(
      await screen.findByText("행(최대 200개)을 확인해 주세요."),
    ).toBeTruthy();
    expect(
      (screen.getByLabelText("붙여넣기") as HTMLTextAreaElement).value,
    ).toBe(PASTED);
  });
});

describe("W15 적용", () => {
  const importOk = (created: number, updated: number, accounts: unknown[]) => ({
    body: {
      ok: true,
      counts: { created, updated, accounts: accounts.length },
      accounts,
    },
  });

  it("오류 행을 뺀 줄을 덮어쓰기 선택과 함께 보내고 결과 문장과 안내 파일을 보인다", async () => {
    const calls = stubPage({
      [PREVIEW]: {
        body: verdictsBody("new", "phone_conflict", "format_error"),
      },
      [IMPORT]: importOk(1, 0, [
        {
          loginId: "SM26HB83K7MPQ2",
          tempPassword: "Ab3!xYz9Qk",
          rowIndexes: [0],
        },
      ]),
    });

    renderRoutes(routes, "/teacher/teachers/excel");
    await screen.findByText("1. 양식 내려받기");
    paste(PASTED);
    fireEvent.click(screen.getByRole("button", { name: "올리기" }));
    await screen.findByText("3. 행 판정 미리보기");
    fireEvent.click(screen.getByRole("radio", { name: "담임 이름 덮어쓰기" }));
    fireEvent.click(screen.getByRole("button", { name: "적용" }));

    expect(
      await screen.findByText(
        "신규 1명, 변경 0명, 계정 1개를 만들었어요. 오류 2건은 반영하지 않았어요.",
      ),
    ).toBeTruthy();
    const sent = calls.find((c) => c.key === IMPORT)?.body as {
      requestId: string;
      chunkIndex: number;
      mode: string;
      rows: unknown[];
    };
    expect(sent.mode).toBe("overwrite");
    expect(sent.chunkIndex).toBe(1);
    expect(sent.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(sent.rows).toEqual([
      {
        name: "박지훈",
        phone: "010-1234-5678",
        grade: "고2",
        group: "",
        className: "3반",
      },
    ]);
    expect(screen.queryByText("Ab3!xYz9Qk")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "안내 파일 내려받기" }));
    await waitFor(() =>
      expect(mocks.download).toHaveBeenCalledWith([
        {
          name: "박지훈",
          phoneLast4: "5678",
          grade: "고2",
          className: "3반",
          loginId: "SM26HB83K7MPQ2",
          tempPassword: "Ab3!xYz9Qk",
        },
      ]),
    );
  });

  it("20줄씩 나눠 같은 요청 번호로 보내고 중간에 실패하면 끝낸 묶음은 건너뛰고 이어서 보낸다", async () => {
    const lines = Array.from(
      { length: 45 },
      (_, i) => `교사${i}\t010-0000-${String(1000 + i)}\t고1\t\t${i + 1}반`,
    ).join("\n");
    let importCalls = 0;
    const calls = stubPage({
      [PREVIEW]: { body: verdictsBody(...Array(45).fill("new")) },
      [IMPORT]: () => {
        importCalls += 1;
        if (importCalls === 2) {
          return {
            status: 502,
            body: {
              error: {
                code: "AUTH_SYNC_FAILED",
                message: "잠시 뒤 다시 시도해 주세요.",
              },
            },
          };
        }
        return importOk(1, 0, []);
      },
    });

    renderRoutes(routes, "/teacher/teachers/excel");
    await screen.findByText("1. 양식 내려받기");
    paste(lines);
    fireEvent.click(screen.getByRole("button", { name: "올리기" }));
    await screen.findByText("3. 행 판정 미리보기");
    fireEvent.click(screen.getByRole("button", { name: "적용" }));

    expect(await screen.findByText("잠시 뒤 다시 시도해 주세요.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "적용" }));
    expect(await screen.findByText("적용을 마쳤어요")).toBeTruthy();

    const sent = calls
      .filter((c) => c.key === IMPORT)
      .map(
        (c) =>
          c.body as { requestId: string; chunkIndex: number; rows: unknown[] },
      );
    expect(sent.map((s) => [s.chunkIndex, s.rows.length])).toEqual([
      [1, 20],
      [2, 20],
      [2, 20],
      [3, 5],
    ]);
    expect(new Set(sent.map((s) => s.requestId)).size).toBe(1);
    expect(
      screen.getByText("신규 3명, 변경 0명, 계정 0개를 만들었어요."),
    ).toBeTruthy();
  });
});
