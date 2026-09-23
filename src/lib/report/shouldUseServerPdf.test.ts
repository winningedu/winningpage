// 모바일·인앱 브라우저에서 window.print()/react-to-print(iframe 인쇄)가 무동작이거나
// 카카오톡 인앱처럼 다운로드가 서버 첨부 응답으로만 되는 환경을 판별한다.
import { describe, expect, it } from "vitest";
import { shouldUseServerPdf } from "./shouldUseServerPdf";

describe("shouldUseServerPdf", () => {
  it("카카오톡 인앱 브라우저 UA는 true다", () => {
    const ua =
      "Mozilla/5.0 (Linux; Android 13; SM-S911N) AppleWebKit/537.36 KAKAOTALK 10.9.5";
    expect(shouldUseServerPdf(ua)).toBe(true);
  });

  it("데스크톱 크롬 UA는 false다", () => {
    const ua =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
    expect(shouldUseServerPdf(ua)).toBe(false);
  });

  it.each([
    [
      "삼성 인터넷",
      "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 SamsungBrowser/24.0 Chrome/115.0.0.0 Mobile Safari/537.36",
    ],
    [
      "네이버 인앱",
      "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 NAVER(inapp; search; 1200; 12.5.1)",
    ],
    [
      "인스타그램 인앱",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Instagram 305.0.0",
    ],
    [
      "페이스북 인앱",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 FBAN/FBIOS FBAV/450.0",
    ],
    [
      "라인 인앱",
      "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Line/13.19.0",
    ],
    [
      "일반 iOS 사파리(모바일)",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    ],
    [
      "일반 Android 크롬(모바일)",
      "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36",
    ],
  ])("%s UA는 true다", (_label, ua) => {
    expect(shouldUseServerPdf(ua)).toBe(true);
  });
});
