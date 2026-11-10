import "@testing-library/jest-dom/vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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
      `https://www.youtube-nocookie.com/embed/abcDEF12345?rel=0&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}&autoplay=1`,
    );
    expect(frame).toHaveAttribute("title", "늦은 시작과 높은 꿈");

    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    await waitFor(() => expect(document.querySelector("iframe")).toBeNull());
  });

  test("플레이어 오류가 나면 창 안에 재생 불가 안내를 보인다", async () => {
    const created: { onError?: (e: { data: number }) => void }[] = [];
    (window as unknown as { YT: unknown }).YT = {
      Player: class {
        constructor(_el: unknown, opts: { events: (typeof created)[number] }) {
          created.push(opts.events);
        }
      },
    };
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "열기" }));
    await screen.findByRole("dialog");
    await waitFor(() => expect(created).toHaveLength(1));
    act(() => created[0].onError?.({ data: 100 }));

    expect(screen.getByRole("status")).toHaveTextContent(
      "재생할 수 없는 영상이에요",
    );
    expect(document.querySelector("iframe")).toBeNull();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
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
