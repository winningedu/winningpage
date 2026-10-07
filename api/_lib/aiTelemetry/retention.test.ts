import { describe, expect, it } from "vitest";
import {
  AI_TELEMETRY_RETENTION_DAYS,
  retentionCutoffIso,
} from "./retention.js";

describe("retentionCutoffIso", () => {
  it("기본 보존 기간(365일) 전 시각을 ISO 문자열로 돌려준다", () => {
    const now = new Date("2026-10-07T00:00:00.000Z");
    expect(AI_TELEMETRY_RETENTION_DAYS).toBe(365);
    expect(retentionCutoffIso(now)).toBe("2025-10-07T00:00:00.000Z");
  });

  it("일수를 넘기면 그만큼 전 시각을 돌려준다", () => {
    const now = new Date("2026-10-07T12:30:00.000Z");
    expect(retentionCutoffIso(now, 30)).toBe("2026-09-07T12:30:00.000Z");
  });
});
