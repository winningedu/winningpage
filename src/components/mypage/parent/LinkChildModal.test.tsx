import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LinkChildModal from "./LinkChildModal";

// 학생 화면(ProfileTab)과 같은 스위치: studentEnrollment 사이트(스쿨멘토)는
// "학생 고유코드", 그 외(위닝에듀)는 "연결코드"로 부른다.

const { siteMock, rpc } = vi.hoisted(() => ({
  siteMock: { features: { studentEnrollment: false } },
  rpc: vi.fn(),
}));

vi.mock("@/config/site", () => ({ site: siteMock }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc } }));

function fillCode() {
  for (let i = 0; i < 6; i += 1) {
    fireEvent.change(screen.getByLabelText(new RegExp(`${i + 1}번째 자리`)), {
      target: { value: "A" },
    });
  }
}

async function submitUnknownCode() {
  rpc.mockResolvedValue({
    data: null,
    error: { message: "link_code_not_found" },
  });
  fillCode();
  fireEvent.click(screen.getByRole("button", { name: /연결|확인|요청/ }));
}

describe("LinkChildModal 코드 명칭", () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it("학생 등록 사이트는 학생 고유코드로 안내한다", async () => {
    siteMock.features.studentEnrollment = true;
    render(<LinkChildModal open onClose={() => {}} />);

    expect(screen.getByText("학생 고유코드를 입력해주세요")).toBeVisible();
    expect(screen.getByLabelText("학생 고유코드 1번째 자리")).toBeVisible();

    await submitUnknownCode();
    expect(
      await screen.findByText(/일치하는 학생 고유코드가 없습니다/),
    ).toBeVisible();
    expect(document.body.textContent).not.toContain("연결코드");
  });

  it("그 외 사이트는 연결코드로 안내한다", async () => {
    siteMock.features.studentEnrollment = false;
    render(<LinkChildModal open onClose={() => {}} />);

    expect(screen.getByText("연결코드를 입력해주세요")).toBeVisible();
    expect(screen.getByLabelText("연결코드 1번째 자리")).toBeVisible();

    await submitUnknownCode();
    expect(
      await screen.findByText(/일치하는 연결코드가 없습니다/),
    ).toBeVisible();
  });
});
