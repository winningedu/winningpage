import { track } from "@vercel/analytics";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { trackEvent } from "./analytics";

vi.mock("@vercel/analytics", () => ({ track: vi.fn() }));

const trackMock = vi.mocked(track);

beforeEach(() => {
  trackMock.mockReset();
});

describe("trackEvent", () => {
  test("props 없는 허용 이벤트는 이름만 track에 넘긴다", () => {
    trackEvent("diagnosis_complete");
    expect(trackMock).toHaveBeenCalledWith("diagnosis_complete", undefined);
  });
});
