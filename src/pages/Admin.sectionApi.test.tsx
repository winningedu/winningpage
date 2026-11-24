import "@testing-library/jest-dom/vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const engine = vi.hoisted(() => ({
  fetchSectionList: vi.fn(),
  fetchSectionRow: vi.fn(),
  createSectionRow: vi.fn(),
  updateSectionRow: vi.fn(),
  updateSectionMeta: vi.fn(),
  deleteSectionRow: vi.fn(),
  markSectionReviewed: vi.fn(),
  fetchExportChunk: vi.fn(),
}));

vi.mock("./admin/engine/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./admin/engine/api")>()),
  ...engine,
}));

// 실제 설정에는 서버 페이지네이션과 공용 내보내기를 함께 켠 비민감 섹션이 아직 없다.
vi.mock("./admin/configs/admission", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./admin/configs/admission")>();
  return {
    ...actual,
    admissionConfigs: {
      ...actual.admissionConfigs,
      admissionResults: {
        ...actual.admissionConfigs.admissionResults,
        excel: true,
      },
    },
  };
});

vi.mock("./admin/shared/csvExport", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./admin/shared/csvExport")>()),
  downloadCsvText: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signOut: async () => ({ error: null }),
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
    },
  },
}));

vi.mock("./admin/shared/adminSession", () => ({
  getFreshSupabaseAccessTokenOrSignOut: async () => "token",
}));

import { Toaster } from "@/components/ui/toast";
import { ApiError } from "@/lib/http/client";
import { renderSectionRoutes } from "./admin/engine/testRouter";
import { ConfirmAdminHost } from "./admin/shared/confirmAdmin";
import { downloadCsvText } from "./admin/shared/csvExport";

function renderSection(section: string) {
  return renderSectionRoutes(section, `/admin/${section}`, {
    extras: (
      <>
        <Toaster />
        <ConfirmAdminHost />
      </>
    ),
  });
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("섹션 목록 조회", () => {
  it("전량 섹션은 page 없이 조회하고 행을 그린다", async () => {
    engine.fetchSectionList.mockResolvedValue({
      items: [{ id: 7, title: "가을 팝업", sort_order: 1 }],
      total: 1,
    });

    renderSection("popups");

    expect(await screen.findByText("가을 팝업")).toBeInTheDocument();
    expect(engine.fetchSectionList).toHaveBeenCalledWith(
      "popups",
      undefined,
      expect.any(AbortSignal),
    );
  });

  it("서버 페이지 섹션은 page 와 q 로 조회하고 전체 건수를 보인다", async () => {
    engine.fetchSectionList.mockResolvedValue({
      items: [{ id: 1, university_name: "가나대" }],
      total: 1234,
    });

    renderSection("admissionResults");

    await screen.findByText("가나대");
    expect(engine.fetchSectionList).toHaveBeenCalledWith(
      "admissionResults",
      { page: 1, q: "" },
      expect.any(AbortSignal),
    );
    expect(screen.getAllByText("1,234").length).toBeGreaterThan(0);
  });

  it("조회가 실패하면 빈 목록과 오류 안내를 보인다", async () => {
    engine.fetchSectionList.mockRejectedValue(
      new ApiError({
        status: 500,
        code: "INTERNAL_ERROR",
        detail: "서버 오류",
      }),
    );

    renderSection("popups");

    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="toast-title"]'),
      ).toHaveTextContent("팝업 관리 조회 실패"),
    );
  });
});

const POPUP = { id: 7, title: "가을 팝업", sort_order: 1 };

function listOf(...items: Record<string, unknown>[]) {
  return { items, total: items.length };
}

describe("섹션 쓰기", () => {
  it("등록은 POST 로 고정값 포함 payload 를 id 없이 보내고 목록을 다시 받는다", async () => {
    engine.fetchSectionList.mockResolvedValue(listOf(POPUP));
    engine.createSectionRow.mockResolvedValue({ id: 8, title: "신규" });
    renderSection("popups");
    await screen.findByText("가을 팝업");

    fireEvent.click(screen.getByRole("button", { name: "등록" }));
    fireEvent.change(
      (await screen.findAllByRole("textbox"))[0] as HTMLElement,
      {
        target: { value: "신규" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() =>
      expect(engine.createSectionRow).toHaveBeenCalledTimes(1),
    );
    const [key, values] = engine.createSectionRow.mock.calls[0] ?? [];
    expect(key).toBe("popups");
    expect(values).toMatchObject({ title: "신규", is_active: true });
    expect(values).not.toHaveProperty("id");
    expect(values).not.toHaveProperty("created_at");
    await waitFor(() =>
      expect(engine.fetchSectionList.mock.calls.length).toBeGreaterThan(1),
    );
  });

  it("수정은 PATCH 로 보내고 목록을 다시 받는다", async () => {
    engine.fetchSectionList.mockResolvedValue(
      listOf({
        ...POPUP,
        is_active: true,
        created_at: "2026-11-01T00:00:00Z",
      }),
    );
    engine.fetchSectionRow.mockResolvedValue({
      ...POPUP,
      is_active: true,
      created_at: "2026-11-01T00:00:00Z",
    });
    engine.updateSectionRow.mockResolvedValue(POPUP);
    renderSection("popups");
    await screen.findByText("가을 팝업");

    fireEvent.click(screen.getByRole("button", { name: "수정" }));
    fireEvent.change(await screen.findByDisplayValue("가을 팝업"), {
      target: { value: "겨울 팝업" },
    });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() =>
      expect(engine.updateSectionRow).toHaveBeenCalledTimes(1),
    );
    const [key, id, values] = engine.updateSectionRow.mock.calls[0] ?? [];
    expect([key, id]).toEqual(["popups", 7]);
    expect(values).toMatchObject({ title: "겨울 팝업" });
    expect(values).not.toHaveProperty("id");
    expect(values).not.toHaveProperty("created_at");
    await waitFor(() =>
      expect(engine.fetchSectionList.mock.calls.length).toBeGreaterThan(1),
    );
  });

  it("DB_UNIQUE_VIOLATION 이면 컬럼 라벨이 든 23505 문구를 보인다", async () => {
    engine.fetchSectionList.mockResolvedValue(listOf(POPUP));
    engine.createSectionRow.mockRejectedValue(
      new ApiError({
        status: 409,
        code: "DB_UNIQUE_VIOLATION",
        detail: "이미 등록된 값입니다(중복).",
        problem: {
          type: "about:blank",
          title: "conflict",
          status: 409,
          detail: "이미 등록된 값입니다(중복).",
          code: "DB_UNIQUE_VIOLATION",
          columns: ["title"],
        },
      }),
    );
    renderSection("popups");
    await screen.findByText("가을 팝업");

    fireEvent.click(screen.getByRole("button", { name: "등록" }));
    fireEvent.change(
      (await screen.findAllByRole("textbox"))[0] as HTMLElement,
      {
        target: { value: "신규" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="toast-description"]'),
      ).toHaveTextContent(
        "「제목」 값이 이미 등록돼 있습니다. 다른 값으로 바꿔 주세요.",
      ),
    );
    expect(
      document.querySelector('[data-slot="toast-title"]'),
    ).toHaveTextContent("등록 실패");
  });

  it("삭제는 확인 뒤 DELETE 하고 목록을 다시 받는다", async () => {
    engine.fetchSectionList.mockResolvedValue(listOf(POPUP));
    engine.deleteSectionRow.mockResolvedValue(undefined);
    renderSection("popups");
    await screen.findByText("가을 팝업");

    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    expect(engine.deleteSectionRow).not.toHaveBeenCalled();
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "삭제",
      }),
    );

    await waitFor(() =>
      expect(engine.deleteSectionRow).toHaveBeenCalledWith("popups", 7),
    );
    await waitFor(() =>
      expect(engine.fetchSectionList.mock.calls.length).toBeGreaterThan(1),
    );
  });

  it("검토 완료는 reviewed 를 POST 하고 목록을 다시 받는다", async () => {
    engine.fetchSectionList.mockResolvedValue(
      listOf({ id: "k1", title: "주제 패턴" }),
    );
    engine.markSectionReviewed.mockResolvedValue({ id: "k1" });
    renderSection("winningSuhaengTopicDb");
    await screen.findByText("주제 패턴");

    fireEvent.click(screen.getByRole("button", { name: "검토 완료" }));

    await waitFor(() =>
      expect(engine.markSectionReviewed).toHaveBeenCalledWith(
        "winningSuhaengTopicDb",
        "k1",
      ),
    );
    await waitFor(() =>
      expect(engine.fetchSectionList.mock.calls.length).toBeGreaterThan(1),
    );
  });
});

describe("서버 페이지 섹션 내보내기", () => {
  it("next 가 null 일 때까지 청크를 받아 한 파일로 만든다", async () => {
    engine.fetchSectionList.mockResolvedValue({
      items: [{ id: 1, university_name: "가나대" }],
      total: 3,
    });
    engine.fetchExportChunk
      .mockResolvedValueOnce({
        items: [
          { id: 1, university_name: "가나대" },
          { id: 2, university_name: "나다대" },
        ],
        next: 2,
      })
      .mockResolvedValueOnce({
        items: [{ id: 3, university_name: "다라대" }],
        next: null,
      });
    renderSection("admissionResults");
    await screen.findByText("가나대");

    fireEvent.click(screen.getByRole("button", { name: "엑셀 다운로드" }));

    await waitFor(() => expect(downloadCsvText).toHaveBeenCalledTimes(1));
    expect(engine.fetchExportChunk.mock.calls).toEqual([
      ["admissionResults", 0, ""],
      ["admissionResults", 2, ""],
    ]);
    const body = vi.mocked(downloadCsvText).mock.calls[0]?.[2] ?? "";
    expect(body.split("\n")).toHaveLength(3);
    expect(body).toContain("다라대");
  });
});
