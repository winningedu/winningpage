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

  test("role dialog 로 노출되고 접근 가능한 이름은 요청 제목이다", async () => {
    openGate();

    expect(
      await screen.findByRole("dialog", { name: "회원 목록 다운로드" }),
    ).toBeTruthy();
  });

  test("바깥을 눌러도 닫히지 않는다", async () => {
    openGate();
    await screen.findByLabelText("관리자 비밀번호");

    fireEvent.pointerDown(document.body);
    fireEvent.mouseDown(document.body);
    fireEvent.pointerUp(document.body);
    fireEvent.mouseUp(document.body);
    fireEvent.click(document.body);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(screen.getByLabelText("관리자 비밀번호")).toBeTruthy();
    expect(onGranted).not.toHaveBeenCalled();
  });

  test("확인 중에는 Esc 로 닫히지 않고 검증이 끝나면 정상 승인된다", async () => {
    let finishVerify: (value: { ok: true }) => void = () => {};
    log.verify.mockReturnValue(
      new Promise((resolve) => {
        finishVerify = resolve;
      }),
    );
    openGate();
    fireEvent.change(await screen.findByLabelText("관리자 비밀번호"), {
      target: { value: "pw-1234" },
    });
    fireEvent.change(screen.getByLabelText(/사유/), {
      target: { value: "월간 정산" },
    });
    fireEvent.click(screen.getByRole("button", { name: "확인" }));
    await screen.findByRole("button", { name: "확인 중…" });

    pressEscape();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(screen.getByLabelText("관리자 비밀번호")).toBeTruthy();
    expect(onGranted).not.toHaveBeenCalled();

    finishVerify({ ok: true });
    await vi.waitFor(() => expect(onGranted).toHaveBeenCalledTimes(1));
  });
});
