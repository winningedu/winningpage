// 섹션 화면의 업로드, 삭제 정리, 임베딩 요청, 환불 완료 호출 배선.

import "@testing-library/jest-dom/vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const engine = vi.hoisted(() => ({
  fetchSectionList: vi.fn(),
  fetchSectionRow: vi.fn(),
  createSectionRow: vi.fn(),
  updateSectionRow: vi.fn(),
  deleteSectionRow: vi.fn(),
  issueUpload: vi.fn(),
  previewUpload: vi.fn(),
  removeUploads: vi.fn(),
  completeRefund: vi.fn(),
  requestEmbedding: vi.fn(),
}));
const put = vi.hoisted(() => vi.fn());

vi.mock("./admin/engine/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./admin/engine/api")>()),
  ...engine,
}));
vi.mock("@/lib/storage/signedUpload", () => ({ putSignedUpload: put }));

const auth = vi.hoisted(() => ({
  signOut: vi.fn(async () => ({ error: null })),
}));
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signOut: auth.signOut,
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
    },
  },
}));

import { Toaster } from "@/components/ui/toast";
import { ApiError } from "@/lib/http/client";
import { renderSectionRoutes } from "./admin/engine/testRouter";
import { ConfirmAdminHost } from "./admin/shared/confirmAdmin";

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

const listOf = (...items: Record<string, unknown>[]) => ({
  items,
  total: items.length,
});

const BANNERS = "https://x.supabase.co/storage/v1/object/public/banners/";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("업로드와 삭제 정리", () => {
  it("이미지 필드 업로드는 현재 섹션 키로 서버 발급을 받고 임시 읽기 주소를 폼에 넣는다", async () => {
    engine.fetchSectionList.mockResolvedValue(listOf());
    engine.issueUpload.mockResolvedValue({
      path: "tmp-1",
      uploadUrl: "https://up/1?token=t",
    });
    engine.previewUpload.mockResolvedValue("https://read/tmp-1");
    put.mockResolvedValue(undefined);
    engine.createSectionRow.mockResolvedValue({ id: 1 });
    renderSection("popups");
    await screen.findByRole("button", { name: "등록" });

    fireEvent.click(screen.getByRole("button", { name: "등록" }));
    await screen.findByRole("button", { name: "저장" });
    const input = document.querySelector('input[type="file"]');
    fireEvent.change(input as Element, {
      target: {
        files: [new File(["x"], "a.png", { type: "image/png" })],
      },
    });

    await waitFor(() =>
      expect(engine.issueUpload).toHaveBeenCalledWith(
        "popups",
        expect.objectContaining({ field: "image_url", fileName: "a.png" }),
      ),
    );
    await waitFor(() =>
      expect(engine.previewUpload).toHaveBeenCalledWith("popups", "tmp-1"),
    );
  });

  it("행을 지우면 그 행이 쓰던 banners 파일을 서버 삭제로 정리한다", async () => {
    engine.fetchSectionList.mockResolvedValue(
      listOf({ id: 7, title: "가을 팝업", image_url: `${BANNERS}admin/a.png` }),
    );
    engine.deleteSectionRow.mockResolvedValue(undefined);
    engine.removeUploads.mockResolvedValue(undefined);
    renderSection("popups");
    await screen.findByText("가을 팝업");

    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "삭제",
      }),
    );

    await waitFor(() =>
      expect(engine.removeUploads).toHaveBeenCalledWith("popups", [
        "admin/a.png",
      ]),
    );
  });

  it("저장이 UPLOAD_EXPIRED 로 거절되면 서버 안내문을 보인다", async () => {
    const detail = "올린 파일이 만료됐어요. 파일을 다시 올려 주세요.";
    engine.fetchSectionList.mockResolvedValue(
      listOf({ id: 7, title: "가을 팝업", sort_order: 1, is_active: true }),
    );
    engine.fetchSectionRow.mockResolvedValue({
      id: 7,
      title: "가을 팝업",
      sort_order: 1,
      is_active: true,
    });
    engine.updateSectionRow.mockRejectedValue(
      new ApiError({ status: 409, code: "UPLOAD_EXPIRED", detail }),
    );
    renderSection("popups");
    await screen.findByText("가을 팝업");

    fireEvent.click(screen.getByRole("button", { name: "수정" }));
    fireEvent.change(await screen.findByDisplayValue("가을 팝업"), {
      target: { value: "겨울 팝업" },
    });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="toast-description"]'),
      ).toHaveTextContent(detail),
    );
  });
});

describe("임베딩 요청", () => {
  it("지식 항목을 저장하면 요청은 보내되 응답을 기다리지 않고 저장 완료를 알린다", async () => {
    engine.fetchSectionList.mockResolvedValue(
      listOf({
        id: "k1",
        title: "주제 패턴",
        knowledge_type: "topic_pattern",
        grade: "고1",
        subject: "국어",
        content: "내용",
        is_active: true,
      }),
    );
    engine.fetchSectionRow.mockResolvedValue({
      id: "k1",
      title: "주제 패턴",
      knowledge_type: "topic_pattern",
      grade: "고1",
      subject: "국어",
      content: "내용",
      is_active: true,
    });
    engine.updateSectionRow.mockResolvedValue({
      id: "k1",
      knowledge_type: "topic_pattern",
    });
    engine.requestEmbedding.mockReturnValue(new Promise(() => {}));
    renderSection("winningSuhaengTopicDb");
    await screen.findByText("주제 패턴");

    fireEvent.click(screen.getByRole("button", { name: "수정" }));
    fireEvent.change(await screen.findByDisplayValue("주제 패턴"), {
      target: { value: "새 주제 패턴" },
    });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() =>
      expect(engine.requestEmbedding).toHaveBeenCalledWith(
        "k1",
        "topic_pattern",
      ),
    );
    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="toast-title"]'),
      ).toHaveTextContent("저장 완료"),
    );
  });
});

describe("환불 완료", () => {
  const REFUND = {
    id: 5,
    approval_status: "approved",
    status: "requested",
  };

  async function clickRefund() {
    fireEvent.click(await screen.findByRole("button", { name: "환불완료" }));
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "완료 처리",
      }),
    );
  }

  it("확인 뒤 complete-refund 를 한 번 부르고 성공 토스트를 보인다", async () => {
    engine.fetchSectionList.mockResolvedValue(listOf(REFUND));
    engine.completeRefund.mockResolvedValue({ refund: {} });
    renderSection("refundRequests");

    await clickRefund();

    await waitFor(() => expect(engine.completeRefund).toHaveBeenCalledWith(5));
    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="toast-title"]'),
      ).toHaveTextContent("환불 완료 처리되었습니다."),
    );
  });

  it("처리 중에는 같은 버튼을 다시 눌러도 요청을 더 보내지 않는다", async () => {
    engine.fetchSectionList.mockResolvedValue(listOf(REFUND));
    engine.completeRefund.mockReturnValue(new Promise(() => {}));
    renderSection("refundRequests");

    await clickRefund();
    await waitFor(() => expect(engine.completeRefund).toHaveBeenCalledTimes(1));
    await clickRefund();

    expect(engine.completeRefund).toHaveBeenCalledTimes(1);
  });

  it("실패하면 서버 안내문을 알림창으로 보인다", async () => {
    engine.fetchSectionList.mockResolvedValue(listOf(REFUND));
    engine.completeRefund.mockRejectedValue(
      new ApiError({
        status: 409,
        code: "WC036",
        detail: "지금 상태에서는 환불 완료 처리를 할 수 없습니다.",
      }),
    );
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    renderSection("refundRequests");

    await clickRefund();

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(
        "환불 완료 처리 실패: 지금 상태에서는 환불 완료 처리를 할 수 없습니다.",
      ),
    );
  });
});
