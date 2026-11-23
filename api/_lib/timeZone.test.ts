import type { VercelRequest } from "@vercel/node";
import { describe, expect, test } from "vitest";
import { InvalidTimeZoneError, readTimeZone } from "./timeZone.js";

const reqWith = (headers: Record<string, string | string[] | undefined>) =>
  ({ headers }) as unknown as VercelRequest;

describe("readTimeZone", () => {
  test("유효한 IANA 이름을 돌려준다", () => {
    expect(readTimeZone(reqWith({ "x-time-zone": "Asia/Seoul" }))).toBe(
      "Asia/Seoul",
    );
  });

  test("헤더가 없으면 undefined 다", () => {
    expect(readTimeZone(reqWith({}))).toBeUndefined();
  });

  test.each(["KST", "+09:00", "UTC+9", ""])(
    "%j 는 InvalidTimeZoneError",
    (v) => {
      expect(() => readTimeZone(reqWith({ "x-time-zone": v }))).toThrow(
        InvalidTimeZoneError,
      );
    },
  );

  test("값이 여러 개로 들어오면 거부한다", () => {
    expect(() =>
      readTimeZone(reqWith({ "x-time-zone": ["Asia/Seoul", "UTC"] })),
    ).toThrow(InvalidTimeZoneError);
  });
});
