// MentorApplicationsAdmin 증빙 파일 열람 오류 안내. 스토리지 원문 대신 매핑된 안내만 토스트로 보인다.

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const APPLICATION = {
  id: "m1",
  name: "김지원",
  status: "접수",
  proof_file_path: "m1/proof.pdf",
  created_at: "2026-01-01T00:00:00Z",
};

const signed = vi.hoisted(() => ({
  error: { message: "permission denied for 홍길동", statusCode: "403" },
}));

vi.mock("@/lib/supabase", () => {
  type Result = { data: unknown; error: unknown };
  const query = (result: Result): Promise<Result> =>
    Object.assign(Promise.resolve(result), {
      select: () => query(result),
      order: () => query(result),
      eq: () => query(result),
    });
  return {
    supabase: {
      from: () => ({
        select: () => query({ data: [APPLICATION], error: null }),
      }),
      storage: {
        from: () => ({
          createSignedUrl: async () => ({
            data: null,
            error: signed.error,
          }),
        }),
      },
    },
  };
});

vi.mock("@/pages/admin/shared/AdminEngine", () => ({
  AdminTable: ({
    rows,
    onEdit,
  }: {
    rows: { id: string; name: string }[];
    onEdit: (row: unknown) => void;
  }) => (
    <div>
      {rows.map((row) => (
        <button key={row.id} type="button" onClick={() => onEdit(row)}>
          {`열기 ${row.name}`}
        </button>
      ))}
    </div>
  ),
}));

import { Toaster, toast } from "@/components/ui/toast";
import MentorApplicationsAdmin from "./MentorApplicationsAdmin";

const CONFIG = { title: "신청 관리", searchPlaceholder: "검색", columns: [] };

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  toast.close();
  vi.restoreAllMocks();
});

test("증빙 파일 열람에 실패하면 원문 없이 안내만 토스트로 보인다", async () => {
  const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
  render(
    <>
      <MentorApplicationsAdmin config={CONFIG} />
      <Toaster />
    </>,
  );

  fireEvent.click(await screen.findByRole("button", { name: "열기 김지원" }));
  fireEvent.click(
    await screen.findByRole("button", { name: /증빙 파일 열람/ }),
  );

  await waitFor(() => {
    expect(
      document.querySelector('[data-slot="toast-title"]'),
    ).toHaveTextContent("증빙 파일 열람 실패");
    expect(
      document.querySelector('[data-slot="toast-description"]'),
    ).toHaveTextContent("권한이 없거나 로그인이 만료됐습니다.");
  });
  expect(document.body.textContent).not.toContain("홍길동");
  expect(alertSpy).not.toHaveBeenCalled();
});

test("증빙 파일이 스토리지에 없으면 자동으로 닫히지 않는 경고 토스트로 알린다", async () => {
  signed.error = { message: "Object not found", statusCode: "404" };
  const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
  const addSpy = vi.spyOn(toast, "add");
  render(
    <>
      <MentorApplicationsAdmin config={CONFIG} />
      <Toaster />
    </>,
  );

  fireEvent.click(await screen.findByRole("button", { name: "열기 김지원" }));
  fireEvent.click(
    await screen.findByRole("button", { name: /증빙 파일 열람/ }),
  );

  await waitFor(() =>
    expect(addSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "warning",
        priority: "high",
        timeout: 0,
      }),
    ),
  );
  expect(document.body.textContent).not.toContain("Object not found");
  expect(alertSpy).not.toHaveBeenCalled();
});
