// 학생 현황 화면 테스트. 서버 호출은 api(ky 클라이언트)를 가짜로 바꿔 검증한다.
// 목록 상태(page, q, filter)는 URL 검색 파라미터에, 상세는 /admin/goalStudents/:id 라우트에 있다.
// QA — GoalStudentDetail 은 학생을 바꿔도 이전 학생의 재발송 결과를 남기지 않아야 한다.
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Toaster, toast } from "@/components/ui/toast";
import { ApiError } from "@/lib/http/client";
import { TestQueryProvider } from "@/pages/admin/engine/testQuery";
import { ConfirmAdminHost } from "@/pages/admin/shared/confirmAdmin";
import GoalStudentsAdmin, { GoalStudentDetail } from "./GoalStudentsAdmin";

const http = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock("@/lib/http/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/http/client")>()),
  api: http,
}));

/** ky 응답처럼 await 도 되고 .json() 도 되는 가짜. */
const reply = (body?: unknown) =>
  Object.assign(Promise.resolve(undefined), { json: async () => body });

/** 호출 시점이 아니라 await, .json() 할 때 거부되는 가짜(ky 응답과 같다). */
const rejecting = (error: unknown) => ({
  // biome-ignore lint/suspicious/noThenProperty: ky 응답처럼 await 할 수 있어야 한다.
  then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.reject(error).then(resolve, reject),
  json: () => Promise.reject(error),
});

const holder = vi.hoisted(() => ({
  detail: null as Record<string, unknown> | null,
  detailError: null as unknown,
  list: { items: [], total: 0, searchTruncated: false } as Record<
    string,
    unknown
  >,
  resend: {
    sent: 1,
    failed: 0,
    skipped: 0,
    recipients: [] as unknown[],
  } as Record<string, unknown>,
}));

const row = (id: string, over: Record<string, unknown> = {}) => ({
  profile_id: id,
  status: "active",
  record_count: 2,
  student: { profile_id: id, grade: "고2", school_type: "일반고" },
  profile: { id, name: `이름-${id}`, phone: "01012345678" },
  ...over,
});

const detailOf = (id: string, over: Record<string, unknown> = {}) => ({
  student: { profile_id: id },
  state: null,
  profile: { id, name: "김학생", phone: "01012345678", email: "a@b.c" },
  logs: [],
  cuts: {},
  ...over,
});

beforeEach(() => {
  holder.detail = null;
  holder.detailError = null;
  holder.list = { items: [], total: 0, searchTruncated: false };
  http.get.mockReset();
  http.post.mockReset();
  http.get.mockImplementation((url: string) => {
    if (url === "goal/admin/students") return reply(holder.list);
    if (url.endsWith("/records")) return reply({ items: [], total: 0 });
    if (holder.detailError) {
      return rejecting(holder.detailError);
    }
    return reply(holder.detail);
  });
  http.post.mockImplementation((url: string) =>
    reply(url.endsWith("resend-report") ? holder.resend : undefined),
  );
});

afterEach(() => {
  cleanup();
  toast.close();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const noop = () => {};

function renderDetail(
  profileId = "student-a",
  onNavigateWithPrefill?: (k: string, p: Record<string, unknown>) => void,
) {
  holder.detail = detailOf(profileId);
  return render(
    <TestQueryProvider>
      <GoalStudentDetail
        profileId={profileId}
        onBack={noop}
        onNavigateWithPrefill={onNavigateWithPrefill}
      />
      <Toaster />
      <ConfirmAdminHost />
    </TestQueryProvider>,
  );
}

describe("GoalStudentDetail 로드", () => {
  it("학생 상세와 기록을 서버 API 로 읽는다", async () => {
    renderDetail("student-a");
    await screen.findByText("student-a");
    expect(http.get).toHaveBeenCalledWith(
      "goal/admin/students/student-a",
      expect.objectContaining({ signal: expect.anything() }),
    );
    expect(http.get).toHaveBeenCalledWith(
      "goal/admin/students/student-a/records",
      expect.objectContaining({ searchParams: { limit: 30 } }),
    );
  });

  it("서버가 404 면 학생 행을 찾을 수 없다고 안내하고 토스트는 없다", async () => {
    holder.detailError = new ApiError({
      status: 404,
      code: "NOT_FOUND",
      detail: "해당 학생을 찾을 수 없습니다.",
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <TestQueryProvider>
        <GoalStudentDetail profileId="student-a" onBack={noop} />
        <Toaster />
      </TestQueryProvider>,
    );
    await screen.findByText("학생 행을 찾을 수 없습니다.");
    expect(document.querySelector('[data-slot="toast-title"]')).toBeNull();
  });

  it("그 밖의 조회 실패는 안내 토스트로 보이고 alert 는 쓰지 않는다", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    holder.detailError = new ApiError({
      status: 500,
      code: "INTERNAL_ERROR",
      detail: "서버 오류",
    });
    render(
      <TestQueryProvider>
        <GoalStudentDetail profileId="student-a" onBack={noop} />
        <Toaster />
      </TestQueryProvider>,
    );
    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="toast-title"]'),
      ).toHaveTextContent("학생 상세 조회 실패"),
    );
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it("빠진 컷 만들기는 컷 화면으로 가는 프리필을 넘긴다", async () => {
    const prefill = vi.fn();
    holder.detail = detailOf("student-a", {
      student: {
        profile_id: "student-a",
        school_type: "일반고",
        ideal_university: "서울대",
        ideal_department: "경영",
        ideal_naesin_cut: null,
        ideal_jungsi_cut: 1,
        min_naesin_cut: 1,
        min_jungsi_cut: 1,
      },
      state: { profile_id: "student-a", status: "awaiting_cuts" },
    });
    render(
      <TestQueryProvider>
        <GoalStudentDetail
          profileId="student-a"
          onBack={noop}
          onNavigateWithPrefill={prefill}
        />
      </TestQueryProvider>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "상한 내신 컷 만들기" }),
    );
    expect(prefill).toHaveBeenCalledWith("goalUniversityCuts", {
      cut_type: "normal",
      university_name: "서울대",
      department_name: "경영",
    });
  });
});

describe("GoalStudentDetail 재발송", () => {
  it("재발송을 서버에 요청하고, 학생 A의 결과가 학생 B 화면으로 넘어가지 않는다", async () => {
    const { rerender } = renderDetail("student-a");
    await screen.findByText("student-a");

    fireEvent.click(screen.getByRole("button", { name: "다시 보내기" }));
    await screen.findByText("연결된 학부모가 없어 보낼 대상이 없습니다.");
    expect(http.post).toHaveBeenCalledWith(
      "goal/admin/resend-report",
      expect.objectContaining({
        json: expect.objectContaining({
          studentProfileId: "student-a",
          kind: "daily",
        }),
      }),
    );

    holder.detail = detailOf("student-b");
    rerender(
      <TestQueryProvider>
        <GoalStudentDetail profileId="student-b" onBack={noop} />
      </TestQueryProvider>,
    );
    await screen.findByText("student-b");
    expect(
      screen.queryByText("연결된 학부모가 없어 보낼 대상이 없습니다."),
    ).not.toBeInTheDocument();
  });

  it("서버가 거부하면 서버 문구를 그대로 보인다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    http.post.mockImplementation(() =>
      rejecting(
        new ApiError({
          status: 400,
          code: "VALIDATION_FAILED",
          detail: "2주 이내 기간만 다시 보낼 수 있습니다.",
        }),
      ),
    );
    renderDetail();
    await screen.findByText("student-a");
    fireEvent.click(screen.getByRole("button", { name: "다시 보내기" }));
    await screen.findByText("2주 이내 기간만 다시 보낼 수 있습니다.");
  });
});

describe("GoalStudentDetail 온보딩 리셋 확인", () => {
  it("확인창에서 취소하면 리셋 요청을 보내지 않는다", async () => {
    renderDetail();
    fireEvent.click(await screen.findByRole("button", { name: "온보딩 리셋" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("온보딩 이전 상태로 되돌립니다.");
    fireEvent.click(within(dialog).getByRole("button", { name: "취소" }));
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(http.post).not.toHaveBeenCalled();
  });

  it("확인하면 리셋을 요청하고 성공 토스트를 보인 뒤 새로고침한다", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    renderDetail();

    fireEvent.click(await screen.findByRole("button", { name: "온보딩 리셋" }));
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "리셋",
      }),
    );

    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="toast-title"]'),
      ).toHaveTextContent("온보딩 리셋이 완료되었습니다."),
    );
    expect(http.post).toHaveBeenCalledWith("goal/admin/reset-student", {
      json: { profileId: "student-a" },
    });
    expect(reload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2500);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("2초 안에 화면을 벗어나면 새로고침하지 않는다", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    renderDetail();

    fireEvent.click(await screen.findByRole("button", { name: "온보딩 리셋" }));
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "리셋",
      }),
    );
    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="toast-title"]'),
      ).toHaveTextContent("온보딩 리셋이 완료되었습니다."),
    );
    cleanup();
    await vi.advanceTimersByTimeAsync(2500);
    expect(reload).not.toHaveBeenCalled();
  });

  it("리셋이 실패하면 안내 토스트를 보이고 버튼이 다시 켜진다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    http.post.mockImplementation(() =>
      rejecting(
        new ApiError({
          status: 500,
          code: "INTERNAL_ERROR",
          detail: "리셋 처리에 실패했습니다.",
        }),
      ),
    );
    renderDetail();
    fireEvent.click(await screen.findByRole("button", { name: "온보딩 리셋" }));
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "리셋",
      }),
    );
    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="toast-title"]'),
      ).toHaveTextContent("온보딩 리셋 실패"),
    );
    expect(screen.getByRole("button", { name: "온보딩 리셋" })).toBeEnabled();
  });
});

const config = {
  title: "목표 학생",
  searchPlaceholder: "검색",
} as unknown as Parameters<typeof GoalStudentsAdmin>[0]["config"];

function Probe() {
  const location = useLocation();
  return (
    <div data-testid="location">{location.pathname + location.search}</div>
  );
}

function renderRoutes(
  entry: string,
  onNavigateWithPrefill?: (k: string, p: Record<string, unknown>) => void,
) {
  const element = (
    <GoalStudentsAdmin
      config={config}
      {...(onNavigateWithPrefill ? { onNavigateWithPrefill } : {})}
    />
  );
  return render(
    <TestQueryProvider>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/admin/goalStudents" element={element} />
          <Route path="/admin/goalStudents/:id" element={element} />
        </Routes>
        <Probe />
        <Toaster />
      </MemoryRouter>
    </TestQueryProvider>,
  );
}

const listCalls = () =>
  http.get.mock.calls.filter(([url]) => url === "goal/admin/students");

describe("GoalStudentsAdmin 목록", () => {
  it("서버 목록을 그려 주고 검색 파라미터 기본값으로 요청한다", async () => {
    holder.list = {
      items: [row("s1"), row("s2")],
      total: 2,
      searchTruncated: false,
    };
    renderRoutes("/admin/goalStudents");
    await screen.findByText("이름-s1");
    expect(screen.getByText("이름-s2")).toBeInTheDocument();
    expect(listCalls().at(-1)?.[1]).toMatchObject({
      searchParams: { page: 1, q: "", filter: "all" },
    });
  });

  it("공용 페이지 이동은 page 파라미터를 URL 에 싣고 다음 페이지를 요청한다", async () => {
    holder.list = { items: [row("s1")], total: 25, searchTruncated: false };
    renderRoutes("/admin/goalStudents");
    await screen.findByRole("navigation", { name: "페이지 이동" });
    fireEvent.click(screen.getByRole("button", { name: "다음 페이지" }));
    await waitFor(() =>
      expect(listCalls().at(-1)?.[1]).toMatchObject({
        searchParams: { page: 2, q: "", filter: "all" },
      }),
    );
    expect(screen.getByTestId("location")).toHaveTextContent("page=2");
    expect(
      await screen.findByRole("button", { name: "2페이지" }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("필터를 누르면 filter 파라미터가 서버로 나가고 1페이지로 돌아간다", async () => {
    holder.list = { items: [row("s1")], total: 25, searchTruncated: false };
    renderRoutes("/admin/goalStudents?page=3");
    await screen.findByText("이름-s1");
    fireEvent.click(screen.getByRole("button", { name: "정지" }));
    await waitFor(() =>
      expect(listCalls().at(-1)?.[1]).toMatchObject({
        searchParams: { page: 1, q: "", filter: "paused" },
      }),
    );
    expect(screen.getByTestId("location")).toHaveTextContent("filter=paused");
  });

  it("검색어는 디바운스 뒤 q 파라미터로 나가고 1페이지로 돌아간다", async () => {
    holder.list = { items: [row("s1")], total: 25, searchTruncated: false };
    renderRoutes("/admin/goalStudents?page=2");
    await screen.findByText("이름-s1");
    fireEvent.change(
      screen.getByRole("textbox", { name: "학생 이름 또는 연락처 검색" }),
      { target: { value: " 김 " } },
    );
    await waitFor(() =>
      expect(listCalls().at(-1)?.[1]).toMatchObject({
        searchParams: { page: 1, q: "김", filter: "all" },
      }),
    );
  });

  it("검색 절단 안내를 보인다", async () => {
    holder.list = { items: [row("s1")], total: 1, searchTruncated: true };
    renderRoutes("/admin/goalStudents?q=%EA%B9%80");
    await screen.findByText(/검색어에 걸리는 회원이 500명을 넘습니다/);
  });

  it("머리글 칸은 열 머리글로 노출된다", async () => {
    renderRoutes("/admin/goalStudents");
    const header = await screen.findByRole("columnheader", { name: "이름" });
    expect(header).toHaveAttribute("scope", "col");
  });
});

describe("GoalStudentsAdmin 표 배치", () => {
  it("학생 목록 표는 이름 있는 스크롤 영역이고 관리 열은 오른쪽에 고정된다", async () => {
    holder.list = { items: [row("s1")], total: 1, searchTruncated: false };
    renderRoutes("/admin/goalStudents");

    const region = await screen.findByRole("region", { name: "학생 목록" });
    expect(region).toHaveAttribute("tabindex", "0");
    const header = screen.getByRole("columnheader", { name: "관리" });
    const cell = (
      await screen.findByRole("button", { name: "상세 보기" })
    ).closest("td") as HTMLElement;
    for (const el of [header, cell]) {
      expect(el).toHaveClass("sticky", "right-0");
    }
  });
});

describe("GoalStudentsAdmin 라우트", () => {
  it("상세 보기를 누르면 /admin/goalStudents/:id 로 가고 목록 파라미터를 들고 간다", async () => {
    holder.list = { items: [row("s1")], total: 25, searchTruncated: false };
    holder.detail = detailOf("s1");
    renderRoutes("/admin/goalStudents?page=2&filter=paused");
    fireEvent.click(await screen.findByRole("button", { name: "상세 보기" }));
    await screen.findByText("s1");
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/admin/goalStudents/s1?page=2&filter=paused",
    );
  });

  it("상세 URL 을 새로 열면(새로고침) 그 학생을 API 에서 읽는다", async () => {
    holder.detail = detailOf("s9");
    renderRoutes("/admin/goalStudents/s9");
    await screen.findByText("s9");
    expect(http.get).toHaveBeenCalledWith(
      "goal/admin/students/s9",
      expect.anything(),
    );
    expect(listCalls()).toHaveLength(0);
  });

  it("목록으로를 누르면 같은 page 와 filter 의 목록으로 돌아온다", async () => {
    holder.list = { items: [row("s1")], total: 25, searchTruncated: false };
    holder.detail = detailOf("s1");
    renderRoutes("/admin/goalStudents/s1?page=2&filter=paused");
    fireEvent.click(await screen.findByRole("button", { name: "목록으로" }));
    await screen.findByText("이름-s1");
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/admin/goalStudents?page=2&filter=paused",
    );
    expect(listCalls().at(-1)?.[1]).toMatchObject({
      searchParams: { page: 2, q: "", filter: "paused" },
    });
    expect(screen.getByRole("button", { name: "2페이지" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
