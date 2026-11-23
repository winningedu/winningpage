import { describe, expect, it } from "vitest";
import { MAX_TEXT_CHARS, validateCompose } from "./factCheck.js";
import type { ComposeNeed } from "./needs.js";

const need = (over: Partial<ComposeNeed> = {}): ComposeNeed => ({
  id: "summary:P1",
  kind: "summary",
  instruction: "",
  sources: [
    "가격 1,300원으로 올리면 이익이 약 24% 늘어난다는 결론을 냄. 매점 도우미",
  ],
  allowedTags: ["P1", "H2"],
  allowedNumbers: [3],
  maxQuote: 30,
  ...over,
});

const reply = (items: { id: string; text: string }[]) => ({ items });

const check = (text: string, n: ComposeNeed = need()) =>
  validateCompose(reply([{ id: n.id, text }]), [n]);

const codes = (r: ReturnType<typeof check>) =>
  r.ok ? [] : r.issues.map((i) => i.code);

describe("validateCompose", () => {
  it("accepts a sentence whose numbers, tags and quotes all come from the sources", () => {
    const text =
      '1,300원으로 올리면 약 24% 늘어난다는 결론을 낸 P1 기록. "매점 도우미"에서 시작함.';
    expect(check(text)).toEqual({ ok: true, texts: { "summary:P1": text } });
  });

  it("rejects a number that is not in the source records", () => {
    expect(codes(check("이익이 35% 늘어남."))).toContain(
      "number_not_in_source",
    );
  });

  it("rejects a tag that does not belong to the item", () => {
    expect(codes(check("D9 기록과 같은 흐름임."))).toContain("unknown_tag");
  });

  it("rejects a quote that is not verbatim in the source or is too long", () => {
    expect(codes(check('"가격을 낮추자"는 결론.'))).toContain(
      "quote_not_in_source",
    );
    expect(
      codes(
        check(
          '"가격 1,300원으로 올리면 이익이 약 24% 늘어난다는"까지.',
          need({ maxQuote: 15 }),
        ),
      ),
    ).toContain("quote_too_long");
  });

  it("rejects sentence numbers outside the item", () => {
    expect(codes(check("문장 ⑤에서 이어짐."))).toContain("bad_sentence_number");
    expect(check("문장 ③에서 이어짐.").ok).toBe(true);
  });

  it("requires the evidence tag for a next step", () => {
    const n = need({ id: "next:memo_detail", kind: "next", requiredTag: "H2" });
    expect(codes(check("이 부분을 보강하면 좋음.", n))).toContain(
      "missing_tag",
    );
    expect(check("H2 내용을 보강하면 좋음.", n).ok).toBe(true);
  });

  it("rejects banned characters, empty and over long text", () => {
    expect(codes(check("가격 \u00b7 이익"))).toContain("banned_char");
    expect(codes(check(" "))).toContain("empty_text");
    expect(MAX_TEXT_CHARS).toBe(200);
    expect(codes(check("가".repeat(MAX_TEXT_CHARS)))).not.toContain("too_long");
    expect(codes(check("가".repeat(MAX_TEXT_CHARS + 1)))).toContain("too_long");
  });

  it("reports a missing item and a reply that is not the expected shape", () => {
    expect(codes(validateCompose(reply([]), [need()]))).toContain(
      "missing_item",
    );
    expect(codes(validateCompose({ nope: 1 }, [need()]))).toContain(
      "invalid_shape",
    );
  });

  it("keeps the items that pass their own checks when others fail", () => {
    const a = need({ id: "summary:P1" });
    const b = need({ id: "summary:P2" });
    const r = validateCompose(
      reply([
        { id: a.id, text: "P1 기록이 출발점임." },
        { id: b.id, text: "가".repeat(MAX_TEXT_CHARS + 1) },
      ]),
      [a, b],
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.texts).toEqual({ "summary:P1": "P1 기록이 출발점임." });
      expect(r.issues.map((i) => i.path)).toEqual(["summary:P2"]);
    }
  });

  it("collects every problem with the item id as the path", () => {
    const r = check("35% D9");
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.issues.every((i) => i.path === "summary:P1")).toBe(true);
  });
});
