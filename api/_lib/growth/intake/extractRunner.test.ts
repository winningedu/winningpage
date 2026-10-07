import { beforeEach, describe, expect, it, vi } from "vitest";

const gemini = vi.hoisted(() => ({
  callText: vi.fn(),
  callVision: vi.fn(),
}));
vi.mock("../../gemini.js", () => gemini);

import { createAiTrace } from "../../aiTelemetry/trace.js";
import { runExtraction } from "./extractRunner.js";

const okJson = JSON.stringify({
  topic: "열 전달",
  concept: "전도",
  result: "차이를 확인",
  limitation: null,
});

function makeDb(bytes: Uint8Array = new TextEncoder().encode("본문")) {
  const blob = { arrayBuffer: async () => bytes.buffer };
  return {
    storage: {
      from: () => ({ download: async () => ({ data: blob, error: null }) }),
    },
  } as never;
}

const row = {
  id: "u1",
  file_name: "a.txt",
  mime_type: "text/plain",
  grade_label: "고1",
  semester: 1,
} as never;

const spyTrace = () => {
  const telemetry = createAiTrace({ service: "growth", feature: "extract" });
  return {
    telemetry,
    annotate: vi.spyOn(telemetry, "annotateLastCall"),
  };
};

beforeEach(() => {
  gemini.callText.mockReset();
  gemini.callVision.mockReset();
});

describe("runExtraction 계기판 기록", () => {
  it("텍스트 호출 옵션에 telemetry 를 싣고 파싱 성공이면 ok 로 표시한다", async () => {
    const t = spyTrace();
    gemini.callText.mockResolvedValue(okJson);
    const r = await runExtraction(makeDb(), row, "p", Date.now(), t.telemetry);
    expect(r.kind).toBe("parsed");
    expect(gemini.callText.mock.calls[0]?.[2].telemetry).toBe(t.telemetry);
    expect(t.annotate).toHaveBeenCalledWith({ validation: "ok" });
  });

  it("파싱 실패면 reason 을 issueCodes 로 표시한다", async () => {
    const t = spyTrace();
    gemini.callText.mockResolvedValue("not json");
    await runExtraction(makeDb(), row, "p", Date.now(), t.telemetry);
    expect(t.annotate).toHaveBeenCalledWith({
      validation: "failed",
      issueCodes: ["JSON 파싱 실패"],
    });
  });

  it("모델 호출이 던지면 annotate 하지 않고 upstream", async () => {
    const t = spyTrace();
    gemini.callText.mockRejectedValue(new Error("boom"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await runExtraction(makeDb(), row, "p", Date.now(), t.telemetry);
    expect(r.kind).toBe("upstream");
    expect(t.annotate).not.toHaveBeenCalled();
  });

  it("telemetry 없이도 옵션에 키를 넣지 않고 동작한다", async () => {
    gemini.callText.mockResolvedValue(okJson);
    const r = await runExtraction(makeDb(), row, "p", Date.now());
    expect(r.kind).toBe("parsed");
    const options = gemini.callText.mock.calls[0]?.[2] ?? {};
    expect("telemetry" in options).toBe(false);
  });
});
