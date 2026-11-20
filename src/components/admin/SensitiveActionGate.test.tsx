// 개인정보 반출 게이트의 닫기 규칙. 닫기는 취소일 뿐 승인이 되면 안 된다.

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const log = vi.hoisted(() => ({
  verify: vi.fn(),
  write: vi.fn(),
}));

vi.mock("@/lib/adminAccessLog", () => ({
  verifyAdminPassword: log.verify,
  writeAdminAccessLog: log.write,
}));

import { useSensitiveActionGate } from "./SensitiveActionGate";

const onGranted = vi.fn();

function Harness() {
  const { requestAccess, gate } = useSensitiveActionGate();
  return (
    <>
      <button
        type="button"
        onClick={() =>
          requestAccess({
            action: "download",
            resourceKey: "members",
            title: "회원 목록 다운로드",
            description: "회원 1건의 개인정보가 CSV로 저장됩니다.",
            rowCount: 1,
            onGranted,
          })
        }
      >
        열기
      </button>
      {gate}
    </>
  );
}

function openGate() {
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "열기" }));
}

function pressEscape() {
  fireEvent.keyDown(document.activeElement ?? document.body, {
    key: "Escape",
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  log.verify.mockResolvedValue({ ok: true });
  log.write.mockResolvedValue({ ok: true });
});

describe("SensitiveActionGate 닫기", () => {
  test("Esc 로 닫으면 게이트만 닫히고 onGranted 는 부르지 않는다", async () => {
    openGate();
    await screen.findByLabelText("관리자 비밀번호");

    pressEscape();

    await vi.waitFor(() =>
      expect(screen.queryByLabelText("관리자 비밀번호")).toBeNull(),
    );
    expect(onGranted).not.toHaveBeenCalled();
    expect(log.verify).not.toHaveBeenCalled();
    expect(log.write).not.toHaveBeenCalled();
  });
});
