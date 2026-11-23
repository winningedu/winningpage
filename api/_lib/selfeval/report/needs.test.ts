import { describe, expect, it } from "vitest";
import { readBody } from "./body.js";
import { buildCh02 } from "./ch02.js";
import { buildCh03 } from "./ch03.js";
import { buildCh04 } from "./ch04.js";
import { findNextStepCandidates } from "./ch05.js";
import { buildNeeds } from "./needs.js";
import { sampleInput } from "./sample.testkit.js";

function needs(over: Parameters<typeof sampleInput>[0] = {}) {
  const input = sampleInput(over);
  const body = readBody(input.bodySections, input);
  const none = () => null;
  const ch02 = buildCh02(input, body, none);
  const ch03 = buildCh03(ch02, none);
  const ch04 = buildCh04(input, body, ch02, none);
  const candidates = findNextStepCandidates(input, body, ch02);
  return buildNeeds(input, body, ch02, ch03, ch04, candidates);
}

describe("buildNeeds", () => {
  it("lists exactly the text the model has to write", () => {
    expect(needs().map((n) => n.id)).toEqual([
      "summary:D2",
      "summary:P5",
      "reason:P5",
      "relation:P1",
      "relation:P2",
      "relation:D1",
      "relation:D3",
      "memo:H1",
      "memo:H2",
      "memo:H3",
      "memo:H4",
      "memoReason:H5",
      "memoRate",
      "next:memo_detail",
      "next:finish_in_progress",
      "next:verify_action",
      "next:use_elsewhere",
    ]);
  });

  it("limits relation quotes to 15 characters and other quotes to 30", () => {
    const list = needs();
    expect(list.find((n) => n.id === "relation:P1")?.maxQuote).toBe(15);
    expect(list.find((n) => n.id === "summary:P5")?.maxQuote).toBe(30);
  });

  it("allows only the tags and sentence numbers that belong to the item", () => {
    const rel = needs().find((n) => n.id === "relation:P2");
    expect(rel?.allowedTags).toEqual(
      expect.arrayContaining(["P2", "H2", "P4", "P1"]),
    );
    expect(rel?.allowedTags).not.toContain("D3");
    expect(rel?.allowedNumbers).toEqual([3, 5]);
  });

  it("requires a next step to carry its evidence tag", () => {
    const next = needs().find((n) => n.id === "next:verify_action");
    expect(next?.requiredTag).toBe("H4");
    expect(next?.sources.join(" ")).toContain("판매 장부");
  });

  it("does not ask for a memo rate sentence or memo texts without memos", () => {
    const ids = needs({ memos: [] }).map((n) => n.id);
    expect(ids).not.toContain("memoRate");
    expect(ids.some((i) => i.startsWith("memo:"))).toBe(false);
  });
});
