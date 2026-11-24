// 권한 묶음 목록의 오류 안내와 삭제. 서버가 쓴 안내만 토스트로 보인다.

import "@testing-library/jest-dom/vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const http = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/lib/http/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/http/client")>()),
  api: http,
}));

import { toast } from "@/components/ui/toast";
import { ApiError } from "@/lib/http/client";
import { renderRoles, routeApi } from "./testHelpers";

const role = (over: Record<string, unknown>) => ({
  id: "r1",
  name: "운영팀",
  description: null,
  is_super: false,
  is_system: false,
  permissions: [],
  ...over,
});

function mockRoles(items: unknown[]) {
  routeApi(http.get, {
    "admin/roles": {
      items,
      resources: [
        {
          key: "popups",
          group_title: "메인 관리",
          label: "팝업",
          sort_order: 1,
        },
        {
          key: "banners",
          group_title: "메인 관리",
          label: "배너",
          sort_order: 2,
        },
        { key: "faq", group_title: "게시판 관리", label: "FAQ", sort_order: 3 },
      ],
    },
  });
}

const title = () => document.querySelector('[data-slot="toast-title"]');
const description = () =>
  document.querySelector('[data-slot="toast-description"]');

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  toast.close();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("AdminRolesAdmin 목록", () => {
  test("조회에 실패하면 제목과 서버 안내만 토스트로 보인다", async () => {
    routeApi(http.get, {
      "admin/roles": new ApiError({
        status: 403,
        code: "FORBIDDEN",
        detail: "이 메뉴를 쓸 권한이 없습니다.",
      }),
    });
    renderRoles();

    await waitFor(() => {
      expect(title()).toHaveTextContent("권한 관리 조회 실패");
      expect(description()).toHaveTextContent("이 메뉴를 쓸 권한이 없습니다.");
    });
  });

  test("포함 메뉴는 앞의 둘과 나머지 개수로 줄여 보인다", async () => {
    mockRoles([
      role({
        permissions: [
          { resourceKey: "popups", level: "edit" },
          { resourceKey: "banners", level: "view" },
          { resourceKey: "faq", level: "none" },
        ],
      }),
      role({ id: "r2", name: "최고", is_super: true }),
      role({ id: "r3", name: "빈 묶음" }),
    ]);
    renderRoles();

    expect(await screen.findByText("팝업, 배너 외 1개")).toBeInTheDocument();
    expect(screen.getByText("전체 메뉴 (자동 포함)")).toBeInTheDocument();
    expect(screen.getByText("없음")).toBeInTheDocument();
  });

  test("아이콘만 있는 삭제 버튼에는 aria-label이 있고, 기본 묶음은 사유가 이름에 담긴다", async () => {
    mockRoles([role({}), role({ id: "r2", name: "기본", is_system: true })]);
    renderRoles();

    await screen.findByText("운영팀");
    const buttons = screen.getAllByRole("button", { name: /삭제/ });
    expect(buttons[0]).toHaveAttribute("aria-label", "삭제");
    expect(buttons[1]).toHaveAttribute(
      "aria-label",
      "기본 묶음은 삭제할 수 없습니다",
    );
    expect(buttons[1]).toBeDisabled();
  });
});

describe("AdminRolesAdmin 삭제", () => {
  test("확인하면 DELETE 하고 목록을 다시 불러온다", async () => {
    mockRoles([role({})]);
    http.delete.mockResolvedValue(new Response(null, { status: 204 }));
    renderRoles();

    fireEvent.click(await screen.findByRole("button", { name: "삭제" }));
    fireEvent.click(
      await within(await screen.findByRole("alertdialog")).findByRole(
        "button",
        { name: "삭제" },
      ),
    );

    await waitFor(() =>
      expect(http.delete).toHaveBeenCalledWith("admin/roles/r1"),
    );
    await waitFor(() => expect(http.get.mock.calls.length).toBeGreaterThan(1));
  });

  test("확인창에서 취소하면 삭제하지 않고, 확인창은 취소에 포커스가 간다", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    mockRoles([role({})]);
    renderRoles();

    fireEvent.click(await screen.findByRole("button", { name: "삭제" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("'운영팀' 묶음을 삭제합니다.");
    expect(dialog).toHaveTextContent("아무 메뉴도 보이지 않게 됩니다");
    const cancel = within(dialog).getByRole("button", { name: "취소" });
    await waitFor(() => expect(cancel).toHaveFocus());
    fireEvent.click(cancel);

    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(http.delete).not.toHaveBeenCalled();
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  test("쓰는 관리자가 있어 거절되면 '삭제 실패' 토스트에 서버 안내가 보인다", async () => {
    mockRoles([role({})]);
    http.delete.mockRejectedValue(
      new ApiError({
        status: 409,
        code: "ROLE_IN_USE",
        detail: "이 권한 묶음을 쓰는 관리자가 있어 삭제할 수 없습니다.",
      }),
    );
    renderRoles();

    fireEvent.click(await screen.findByRole("button", { name: "삭제" }));
    fireEvent.click(
      await within(await screen.findByRole("alertdialog")).findByRole(
        "button",
        { name: "삭제" },
      ),
    );

    await waitFor(() => {
      expect(title()).toHaveTextContent("삭제 실패");
      expect(description()).toHaveTextContent("쓰는 관리자가 있어");
    });
  });
});
