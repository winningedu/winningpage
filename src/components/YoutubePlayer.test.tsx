import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import YoutubePlayer from "./YoutubePlayer";

type PlayerEvents = { onError?: (event: { data: number }) => void };
const created: PlayerEvents[] = [];
const destroy = vi.fn();

function installFakeYt() {
  (window as unknown as { YT?: unknown }).YT = {
    Player: class {
      constructor(_el: unknown, opts: { events: PlayerEvents }) {
        created.push(opts.events);
      }
      destroy = destroy;
    },
  };
}

beforeEach(() => {
  created.length = 0;
  destroy.mockClear();
  document.head.innerHTML = "";
  (
    window as unknown as { onYouTubeIframeAPIReady?: unknown }
  ).onYouTubeIframeAPIReady = undefined;
  installFakeYt();
});

describe("YoutubePlayer", () => {
  test("nocookie 임베드 iframe을 enablejsapi와 함께 그린다", () => {
    render(<YoutubePlayer videoId="abcDEF12345" title="영상 제목" />);
    const frame = screen.getByTitle("영상 제목");
    expect(frame).toHaveAttribute(
      "src",
      `https://www.youtube-nocookie.com/embed/abcDEF12345?rel=0&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`,
    );
  });

  test("autoplay면 autoplay=1이 붙는다", () => {
    render(<YoutubePlayer videoId="abcDEF12345" title="영상 제목" autoplay />);
    expect(screen.getByTitle("영상 제목").getAttribute("src")).toContain(
      "&autoplay=1",
    );
  });

  test("플레이어 오류가 나면 iframe 대신 재생 불가 안내를 보인다", async () => {
    render(<YoutubePlayer videoId="abcDEF12345" title="영상 제목" />);
    await vi.waitFor(() => expect(created).toHaveLength(1));
    act(() => created[0]?.onError?.({ data: 150 }));
    expect(screen.getByRole("status")).toHaveTextContent(
      "재생할 수 없는 영상이에요",
    );
    expect(screen.queryByTitle("영상 제목")).toBeNull();
  });

  test("오류가 없으면 iframe이 그대로 남는다", async () => {
    render(<YoutubePlayer videoId="abcDEF12345" title="영상 제목" />);
    await vi.waitFor(() => expect(created).toHaveLength(1));
    expect(screen.getByTitle("영상 제목")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });

  test("API 스크립트 태그는 플레이어가 둘이어도 한 번만 붙는다", () => {
    (window as unknown as { YT?: unknown }).YT = undefined;
    render(
      <>
        <YoutubePlayer videoId="abcDEF12345" title="하나" />
        <YoutubePlayer videoId="abcDEF12346" title="둘" />
      </>,
    );
    expect(
      document.querySelectorAll(
        'script[src="https://www.youtube.com/iframe_api"]',
      ),
    ).toHaveLength(1);
  });

  test.each([2, 5, 100, 101, 150, 153])(
    "오류 코드 %i도 재생 불가 안내를 보인다",
    async (data) => {
      render(<YoutubePlayer videoId="abcDEF12345" title="영상 제목" />);
      await vi.waitFor(() => expect(created).toHaveLength(1));
      act(() => created[0]?.onError?.({ data }));
      expect(screen.getByRole("status")).toHaveTextContent(
        "재생할 수 없는 영상이에요",
      );
    },
  );

  test("언마운트하면 플레이어를 destroy한다", async () => {
    const { unmount } = render(
      <YoutubePlayer videoId="abcDEF12345" title="영상 제목" />,
    );
    await vi.waitFor(() => expect(created).toHaveLength(1));
    unmount();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  test("이전에 등록된 onYouTubeIframeAPIReady 핸들러도 호출한다", async () => {
    vi.resetModules();
    (window as unknown as { YT?: unknown }).YT = undefined;
    const previous = vi.fn();
    (
      window as unknown as { onYouTubeIframeAPIReady?: () => void }
    ).onYouTubeIframeAPIReady = previous;
    const { default: Fresh } = await import("./YoutubePlayer");
    render(<Fresh videoId="abcDEF12345" title="영상 제목" />);
    installFakeYt();
    act(() =>
      (
        window as unknown as { onYouTubeIframeAPIReady: () => void }
      ).onYouTubeIframeAPIReady(),
    );
    expect(previous).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(created).toHaveLength(1));
  });

  test("API 스크립트를 못 불러와도 iframe이 그대로 남는다", async () => {
    vi.resetModules();
    (window as unknown as { YT?: unknown }).YT = undefined;
    const { default: Fresh } = await import("./YoutubePlayer");
    render(<Fresh videoId="abcDEF12345" title="영상 제목" />);
    const script = document.querySelector("script") as HTMLScriptElement;
    act(() => script.onerror?.(new Event("error")));
    expect(screen.getByTitle("영상 제목")).toBeInTheDocument();
    cleanup();
  });
});
