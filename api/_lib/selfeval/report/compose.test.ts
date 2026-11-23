import { describe, expect, it, vi } from "vitest";
import { buildComposePrompt, composeTexts } from "./compose.js";
import type { ComposeNeed } from "./needs.js";

const needs: ComposeNeed[] = [
  {
    id: "relation:P1",
    kind: "relation",
    instruction: "관계를 설명한다.",
    sources: ["이차함수 꼭짓점 24%"],
    allowedTags: ["P1"],
    allowedNumbers: [1],
    maxQuote: 15,
  },
];

const ok = JSON.stringify({
  items: [{ id: "relation:P1", text: "P1 기록이 출발점임." }],
});
const bad = JSON.stringify({
  items: [{ id: "relation:P1", text: "P1 기록이 35% 늘림." }],
});
const reply = (text: string, finishReason: string | null = "STOP") => ({
  text,
  finishReason,
});

describe("composeTexts", () => {
  it("makes one model call and returns the checked texts", async () => {
    const call = vi.fn().mockResolvedValue(reply(ok));
    const out = await composeTexts({
      needs,
      attemptsSoFar: 0,
      callStructured: call,
    });
    expect(out).toEqual({
      kind: "ok",
      texts: { "relation:P1": "P1 기록이 출발점임." },
      attempts: 1,
    });
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("retries once with the problem list and succeeds on the second reply", async () => {
    const call = vi
      .fn()
      .mockResolvedValueOnce(reply(bad))
      .mockResolvedValueOnce(reply(ok));
    const out = await composeTexts({
      needs,
      attemptsSoFar: 2,
      callStructured: call,
    });
    expect(out).toMatchObject({ kind: "ok", attempts: 2 });
    const second = call.mock.calls[1]?.[1] as string;
    expect(second).toContain("35%");
    expect(second).toContain("relation:P1");
  });

  it("gives up after the second invalid reply so the caller builds with code values only", async () => {
    const call = vi.fn().mockResolvedValue(reply(bad));
    const out = await composeTexts({
      needs,
      attemptsSoFar: 0,
      callStructured: call,
    });
    expect(out).toMatchObject({ kind: "invalid", attempts: 2 });
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("does not retry after an upstream failure", async () => {
    const call = vi.fn().mockRejectedValue(new Error("boom"));
    const out = await composeTexts({
      needs,
      attemptsSoFar: 0,
      callStructured: call,
    });
    expect(out).toEqual({ kind: "upstream", attempts: 1 });
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("stops at the attempt cap of 10 per report", async () => {
    const call = vi.fn().mockResolvedValue(reply(bad));
    expect(
      await composeTexts({ needs, attemptsSoFar: 10, callStructured: call }),
    ).toEqual({ kind: "exhausted", attempts: 0 });
    expect(call).not.toHaveBeenCalled();
    const last = await composeTexts({
      needs,
      attemptsSoFar: 9,
      callStructured: call,
    });
    expect(last).toMatchObject({ kind: "invalid", attempts: 1 });
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("skips the model when there is nothing to write", async () => {
    const call = vi.fn();
    expect(
      await composeTexts({ needs: [], attemptsSoFar: 0, callStructured: call }),
    ).toEqual({ kind: "ok", texts: {}, attempts: 0 });
    expect(call).not.toHaveBeenCalled();
  });
});

describe("buildComposePrompt", () => {
  it("lists every item with its sources and states the code owned values rule", () => {
    const p = buildComposePrompt(needs, []);
    expect(p.user).toContain("relation:P1");
    expect(p.user).toContain("이차함수 꼭짓점 24%");
    expect(p.system).toContain("숫자");
    expect(p.maxOutputTokens).toBeGreaterThanOrEqual(8192);
  });
});
