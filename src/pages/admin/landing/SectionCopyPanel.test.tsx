import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import SectionCopyPanel from "./SectionCopyPanel";

const mocks = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  upsert: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: mocks.row, error: null }),
        }),
      }),
      upsert: mocks.upsert,
    }),
  },
}));

beforeEach(() => {
  mocks.row = null;
  mocks.upsert.mockReset();
  mocks.upsert.mockResolvedValue({ error: null });
});

describe("SectionCopyPanel", () => {
  test("저장된 값을 입력창에 채운다", async () => {
    mocks.row = {
      section_key: "services",
      eyebrow: "라벨",
      title_main: "기존 큰제목",
      title_sub: "기존 중제목",
    };
    render(<SectionCopyPanel sectionKey="services" />);
    expect(await screen.findByLabelText("큰제목")).toHaveValue("기존 큰제목");
    expect(screen.getByLabelText("중제목")).toHaveValue("기존 중제목");
    expect(screen.getByLabelText("라벨")).toHaveValue("라벨");
  });

  test("입력 후 저장하면 섹션 키로 upsert하고 성공 메시지를 보인다", async () => {
    render(<SectionCopyPanel sectionKey="acceptance" />);
    fireEvent.change(await screen.findByLabelText("큰제목"), {
      target: { value: "새 큰제목" },
    });
    fireEvent.change(screen.getByLabelText("중제목"), {
      target: { value: "새 중제목" },
    });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(mocks.upsert).toHaveBeenCalledTimes(1));
    expect(mocks.upsert).toHaveBeenCalledWith(
      {
        section_key: "acceptance",
        eyebrow: null,
        title_main: "새 큰제목",
        title_sub: "새 중제목",
      },
      { onConflict: "section_key" },
    );
    expect(await screen.findByText("저장했습니다.")).toBeInTheDocument();
  });

  test("저장 실패 시 실패 메시지를 보인다", async () => {
    mocks.upsert.mockResolvedValue({ error: { message: "denied" } });
    render(<SectionCopyPanel sectionKey="mentor" />);
    fireEvent.change(await screen.findByLabelText("큰제목"), {
      target: { value: "제목" },
    });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(await screen.findByText(/저장하지 못했습니다/)).toBeInTheDocument();
  });

  test("큰제목이 비어 있으면 저장하지 않는다", async () => {
    render(<SectionCopyPanel sectionKey="mentor" />);
    await screen.findByLabelText("큰제목");
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(screen.getByText("큰제목을 입력하세요.")).toBeInTheDocument();
  });
});
