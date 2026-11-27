// 요청 헤더 X-Time-Zone 읽기. 화면을 보는 사람의 시간대(IANA 이름)를 브라우저가 실어 보낸다.

import type { VercelRequest } from "@vercel/node";
import { isValidTimeZone } from "../../src/lib/time/zone.js";

/** 헤더가 있는데 유효한 시간대 이름이 아닐 때. defineHandler 가 400 INVALID_TIME_ZONE 으로 바꾼다. */
export class InvalidTimeZoneError extends Error {
  constructor() {
    super("X-Time-Zone 이 올바른 시간대 이름이 아닙니다.");
    this.name = "InvalidTimeZoneError";
  }
}

/** 시간대가 꼭 필요한 라우트에 헤더가 없을 때. defineHandler 가 400 TIME_ZONE_REQUIRED 로 바꾼다. */
export class TimeZoneRequiredError extends Error {
  constructor() {
    super("X-Time-Zone 헤더가 필요합니다.");
    this.name = "TimeZoneRequiredError";
  }
}

/** 없으면 undefined, 있으면 유효한 이름만 돌려주고 그 밖은 InvalidTimeZoneError. */
export function readTimeZone(
  req: Pick<VercelRequest, "headers">,
): string | undefined {
  const raw = req.headers["x-time-zone"];
  if (raw === undefined) return undefined;
  if (!isValidTimeZone(raw)) throw new InvalidTimeZoneError();
  return raw;
}
