import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, test } from "vitest";
import VideoPlayerDialog from "./VideoPlayerDialog";

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        열기
      </button>
      <VideoPlayerDialog
        open={open}
        onOpenChange={setOpen}
        videoId="abcDEF12345"
        title="늦은 시작과 높은 꿈"
      />
    </>
  );
}

describe("VideoPlayerDialog", () => {
  test("열기 전에는 유튜브 플레이어를 불러오지 않는다", () => {
    const { container } = render(<Harness />);
    expect(container.ownerDocument.querySelector("iframe")).toBeNull();
  });

  test("열면 제목과 nocookie 플레이어가 보이고 닫기 버튼으로 닫으면 플레이어가 사라진다", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "열기" }));

    expect(
      await screen.findByRole("dialog", { name: "늦은 시작과 높은 꿈" }),
    ).toBeInTheDocument();
    const frame = document.querySelector("iframe");
    expect(frame).toHaveAttribute(
      "src",
      "https://www.youtube-nocookie.com/embed/abcDEF12345?autoplay=1&rel=0",
    );
    expect(frame).toHaveAttribute("title", "늦은 시작과 높은 꿈");

    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    await waitFor(() => expect(document.querySelector("iframe")).toBeNull());
  });

  test("Esc로 닫으면 플레이어가 사라진다", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "열기" }));
    await screen.findByRole("dialog");
    expect(document.querySelector("iframe")).not.toBeNull();

    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });
    await waitFor(() => expect(document.querySelector("iframe")).toBeNull());
  });
});
