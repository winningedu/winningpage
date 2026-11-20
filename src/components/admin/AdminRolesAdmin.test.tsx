// 권한 묶음 관리의 오류 안내. DB 원문 대신 매핑된 안내만 토스트로 보인다.

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  roles: [] as Record<string, unknown>[],
  loadError: null as { message: string; code?: string } | null,
  deleteError: null as { message: string; code?: string } | null,
  insertError: null as { message: string; code?: string } | null,
  insertData: null as { id: string } | null,
  deleteCalls: 0,
}));

vi.mock("@/lib/supabase", () => {
  // 어떤 체인이든 끝에서 await 하면 { data, error } 가 나오는 가짜 쿼리 빌더.
  type Result = { data: unknown; error: unknown };
  const query = (result: Result): Promise<Result> =>
    Object.assign(Promise.resolve(result), {
      select: () => query(result),
      order: () => query(result),
      eq: () => query(result),
    });
  return {
    supabase: {
      from: (table: string) => ({
        select: () =>
          query(
            table === "admin_roles"
              ? { data: state.roles, error: state.loadError }
              : { data: [], error: null },
          ),
        delete: () => {
          state.deleteCalls += 1;
          return query({ data: null, error: state.deleteError });
        },
        insert: () => ({
          select: () => ({
            single: async () => ({
              data: state.insertData,
              error: state.insertError,
            }),
          }),
        }),
      }),
    },
  };
});

import { Toaster, toast } from "@/components/ui/toast";
import { ConfirmAdminHost } from "@/pages/admin/shared/confirmAdmin";
import AdminRolesAdmin from "./AdminRolesAdmin";

const CONFIG = { title: "권한 관리", searchPlaceholder: "검색" };

function renderRoles() {
  render(
    <>
      <AdminRolesAdmin config={CONFIG} />
      <Toaster />
      <ConfirmAdminHost />
    </>,
  );
}

function expectToast(title: string, description: string) {
  return waitFor(() => {
    expect(
      document.querySelector('[data-slot="toast-title"]'),
    ).toHaveTextContent(title);
    expect(
      document.querySelector('[data-slot="toast-description"]'),
    ).toHaveTextContent(description);
  });
}

beforeEach(() => {
  state.roles = [];
  state.loadError = null;
  state.deleteError = null;
  state.insertError = null;
  state.deleteCalls = 0;
  state.insertData = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  toast.close();
  vi.restoreAllMocks();
});

describe("AdminRolesAdmin 오류 안내", () => {
  test("조회에 실패하면 원문 없이 안내만 토스트로 보인다", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    state.loadError = {
      message: "permission denied for 홍길동",
      code: "42501",
    };
    renderRoles();

    await expectToast("권한 관리 조회 실패", "코드: 42501");
    expect(document.body.textContent).not.toContain("홍길동");
    expect(alertSpy).not.toHaveBeenCalled();
  });

  test("삭제에 실패하면 '삭제 실패' 토스트가 보인다", async () => {
    state.roles = [
      { id: "r1", name: "운영팀", is_super: false, is_system: false },
    ];
    state.deleteError = { message: "fk violation", code: "23505" };
    renderRoles();

    fireEvent.click(await screen.findByRole("button", { name: "삭제" }));
    fireEvent.click(
      await within(await screen.findByRole("alertdialog")).findByRole(
        "button",
        { name: "삭제" },
      ),
    );

    await expectToast("삭제 실패", "이미 등록된 값입니다(중복)");
  });

  test("등록에 실패하면 원문 없이 안내만 토스트로 보인다", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    state.insertError = {
      message: "permission denied for 홍길동",
      code: "42501",
    };
    renderRoles();

    fireEvent.click(await screen.findByRole("button", { name: "등록하기" }));
    fireEvent.change(await screen.findByLabelText("권한 묶음 이름"), {
      target: { value: "운영팀" },
    });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await expectToast("저장 실패", "코드: 42501");
    expect(document.body.textContent).not.toContain("홍길동");
    expect(alertSpy).not.toHaveBeenCalled();
  });

  test("등록 응답에 오류도 데이터도 없으면 만들지 못했다는 안내가 보인다", async () => {
    renderRoles();

    fireEvent.click(await screen.findByRole("button", { name: "등록하기" }));
    fireEvent.change(await screen.findByLabelText("권한 묶음 이름"), {
      target: { value: "운영팀" },
    });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      const shown = Array.from(
        document.querySelectorAll(
          '[data-slot="toast-title"], [data-slot="toast-description"]',
        ),
      )
        .map((node) => node.textContent)
        .join(" ");
      expect(shown).toContain("권한 묶음을 만들지 못했습니다.");
    });
  });

  test("삭제 확인창에서 취소하면 삭제하지 않고, 확인창은 취소에 포커스가 간다", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    state.roles = [
      { id: "r1", name: "운영팀", is_super: false, is_system: false },
    ];
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
    expect(state.deleteCalls).toBe(0);
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  test("이름이 비면 자동으로 닫히지 않는 경고 토스트가 보인다", async () => {
    const addSpy = vi.spyOn(toast, "add");
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    renderRoles();

    fireEvent.click(await screen.findByRole("button", { name: "등록하기" }));
    fireEvent.click(await screen.findByRole("button", { name: "저장" }));

    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="toast-title"]'),
      ).toHaveTextContent("권한 묶음 이름을 입력해 주세요."),
    );
    expect(addSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "warning",
        priority: "high",
        timeout: 0,
      }),
    );
    expect(alertSpy).not.toHaveBeenCalled();
  });

  test("저장에 성공하면 성공 토스트가 보인다", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    state.insertData = { id: "r-new" };
    renderRoles();

    fireEvent.click(await screen.findByRole("button", { name: "등록하기" }));
    fireEvent.change(await screen.findByLabelText("권한 묶음 이름"), {
      target: { value: "운영팀" },
    });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="toast-title"]'),
      ).toHaveTextContent("저장했습니다."),
    );
    expect(alertSpy).not.toHaveBeenCalled();
  });
});
