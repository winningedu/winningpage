import { useEffect, useRef, useState } from "react";

type YtApi = {
  Player: new (
    el: HTMLIFrameElement,
    opts: { host: string; events: { onError: () => void } },
  ) => unknown;
};
type YtWindow = Window & {
  YT?: YtApi;
  onYouTubeIframeAPIReady?: () => void;
};

const API_SRC = "https://www.youtube.com/iframe_api";
let apiPromise: Promise<YtApi> | null = null;

/** IFrame Player API 스크립트를 한 번만 불러온다. */
function loadYoutubeApi(): Promise<YtApi> {
  const w = window as YtWindow;
  if (w.YT?.Player) return Promise.resolve(w.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<YtApi>((resolve, reject) => {
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      prev?.();
      if (w.YT) resolve(w.YT);
    };
    const script = document.createElement("script");
    script.src = API_SRC;
    script.onerror = () => {
      apiPromise = null;
      reject(new Error("youtube iframe api"));
    };
    document.head.appendChild(script);
  });
  return apiPromise;
}

type YoutubePlayerProps = {
  videoId: string;
  title: string;
  autoplay?: boolean;
};

/**
 * 유튜브 임베드(16:9). 플레이어가 오류를 알리면(비공개, 삭제, 퍼가기 막힘 등 모든 onError)
 * 플레이어 자리에 재생 불가 안내를 보인다(W2 unavailable). 스크립트를 못 불러오면 iframe을 그대로 둔다.
 * 영상이 바뀌면 호출하는 쪽이 key로 다시 마운트한다.
 */
export default function YoutubePlayer({
  videoId,
  title,
  autoplay,
}: YoutubePlayerProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    loadYoutubeApi()
      .then((yt) => {
        if (!alive || !frameRef.current) return;
        new yt.Player(frameRef.current, {
          host: "https://www.youtube-nocookie.com",
          events: { onError: () => alive && setFailed(true) },
        });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (failed) {
    return (
      <div
        role="status"
        className="flex aspect-video w-full items-center justify-center bg-surface-muted text-base font-semibold text-ink-strong"
      >
        재생할 수 없는 영상이에요
      </div>
    );
  }

  const src = `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}${autoplay ? "&autoplay=1" : ""}`;
  return (
    <iframe
      ref={frameRef}
      src={src}
      title={title}
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
      allowFullScreen
      className="aspect-video w-full border-0"
    />
  );
}
