import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import OrgCodeModal from "./OrgCodeModal";

vi.mock("@/lib/supabase", () => ({
  supabase: { rpc: vi.fn(async () => ({ data: [], error: null })) },
}));

describe("OrgCodeModal", () => {
  it("없는 소속코드는 소속코드를 다시 확인하라고 안내한다", async () => {
    render(<OrgCodeModal open profileId="p1" onClose={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText(/소속코드 입력/), {
      target: { value: "ABCD2345" },
    });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(
      await screen.findByText(
        "존재하지 않는 소속코드입니다. 소속코드를 다시 확인해 주세요.",
      ),
    ).toBeInTheDocument();
  });
});
