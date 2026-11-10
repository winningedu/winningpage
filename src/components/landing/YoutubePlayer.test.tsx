import "@testing-library/jest-dom/vitest";
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import YoutubePlayer from "./YoutubePlayer";

type PlayerEvents = { onError?: (event: { data: number }) => void };
const created: PlayerEvents[] = [];

beforeEach(() => {
  created.length = 0;
  document.head.innerHTML = "";
  (window as unknown as { YT?: unknown }).YT = {
    Player: class {
      constructor(_el: unknown, opts: { events: PlayerEvents }) {
        created.push(opts.events);
      }
    },
  };
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
    act(() => created[0].onError?.({ data: 150 }));
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
});
