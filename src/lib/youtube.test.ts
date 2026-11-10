import { describe, expect, test } from "vitest";
import { parseYoutubeVideoId } from "./youtube";

describe("parseYoutubeVideoId", () => {
  test.each([
    ["https://www.youtube.com/watch?v=abcDEF12345", "abcDEF12345"],
    ["https://youtu.be/abcDEF12345?t=3", "abcDEF12345"],
    ["https://www.youtube.com/embed/abcDEF12345", "abcDEF12345"],
    ["https://www.youtube.com/shorts/abcDEF12345", "abcDEF12345"],
    ["https://example.com/watch?v=abcDEF12345", null],
    ["", null],
    [undefined, null],
  ])("%s", (url, expected) => {
    expect(parseYoutubeVideoId(url)).toBe(expected);
  });
});
