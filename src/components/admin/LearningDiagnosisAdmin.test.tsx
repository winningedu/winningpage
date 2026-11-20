import "@testing-library/jest-dom/vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  calls: [] as string[],
}));

// 어떤 체인이든 끝에서 await 하면 { data, error } 가 나오고, 부른 메서드 이름을 기록한다.
function chain(table: string) {
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") {
          return (resolve: (value: unknown) => void) =>
            resolve({
              data:
                table === "learning_diagnosis_questions"
                  ? [
                      {
                        id: "q1",
                        title: "가장 큰 고민",
                        description: "",
                        input_type: "single",
                        is_required: true,
                        is_active: true,
                        sort_order: 1,
                      },
                    ]
                  : [],
              error: null,
            });
        }
        return () => {
          db.calls.push(`${table}.${String(prop)}`);
          return proxy;
        };
      },
    },
  );
  return proxy;
}

vi.mock("@/lib/supabase", () => ({
  supabase: { from: (table: string) => chain(table) },
}));

import { Toaster, toast } from "@/components/ui/toast";
import { ConfirmAdminHost } from "@/pages/admin/shared/confirmAdmin";
import LearningDiagnosisAdmin from "./LearningDiagnosisAdmin";

function renderAdmin() {
  render(
    <>
      <LearningDiagnosisAdmin />
      <Toaster />
      <ConfirmAdminHost />
    </>,
  );
}

// 질문은 조회가 끝나면 모두 펼쳐진 채로 뜬다.
function questionDeleteButton() {
  return screen.findByRole("button", { name: "질문 삭제" });
}

beforeEach(() => {
  db.calls = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  toast.close();
  vi.restoreAllMocks();
});

describe("LearningDiagnosisAdmin 확인창과 토스트", () => {
  it("질문 삭제 확인창에서 취소하면 삭제하지 않는다", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderAdmin();

    fireEvent.click(await questionDeleteButton());
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(
      "질문을 삭제하면 질문 안의 답변도 함께 삭제됩니다. 삭제하시겠습니까?",
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "취소" }));

    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(db.calls).not.toContain("learning_diagnosis_questions.delete");
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("질문 삭제를 확인하면 삭제한다", async () => {
    renderAdmin();

    fireEvent.click(await questionDeleteButton());
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "삭제",
      }),
    );

    await waitFor(() =>
      expect(db.calls).toContain("learning_diagnosis_questions.delete"),
    );
  });

  it("질문 내용을 비우고 추가하면 자동으로 닫히지 않는 경고 토스트가 보인다", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const addSpy = vi.spyOn(toast, "add");
    renderAdmin();

    fireEvent.click(await screen.findByRole("button", { name: "질문 추가" }));

    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="toast-title"]'),
      ).toHaveTextContent("질문 내용을 입력하세요."),
    );
    expect(addSpy).toHaveBeenCalledWith(
      expect.objectContaining({ priority: "high", timeout: 0 }),
    );
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it("질문 저장에 성공하면 성공 토스트가 보인다", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    renderAdmin();

    await questionDeleteButton();
    fireEvent.click(screen.getByRole("button", { name: "질문 저장" }));

    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="toast-title"]'),
      ).toHaveTextContent("질문 저장 완료"),
    );
    expect(alertSpy).not.toHaveBeenCalled();
  });
});
