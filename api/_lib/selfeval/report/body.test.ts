import { describe, expect, it } from "vitest";
import { readBody } from "./body.js";
import { SAMPLE_BODY, SAMPLE_MEMOS, SAMPLE_RECORDS } from "./sample.testkit.js";

const ctx = { records: SAMPLE_RECORDS, memos: SAMPLE_MEMOS };

const flat = (sections: unknown) => readBody(sections, ctx).sentences;

describe("readBody", () => {
  it("numbers by the sentence span so a two sentence object takes two numbers", () => {
    const body = flat({
      paragraphs: [
        {
          sentences: [
            { text: "가함. 나함.", evidence: [] },
            { text: "다함.", evidence: [] },
          ],
        },
      ],
    });
    expect(body.map((x) => x.n)).toEqual([1, 3]);
  });

  it("numbers the sentence objects from 1 across paragraphs", () => {
    const body = readBody(SAMPLE_BODY, ctx);
    expect(body.sentences.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(body.paragraphs.map((p) => p.length)).toEqual([4, 3, 2]);
  });

  it("puts main evidence first and keeps the stored order inside a weight", () => {
    const s = flat(SAMPLE_BODY);
    expect(s[2]?.refs.map((r) => r.refId)).toEqual([
      "rec-p2",
      "log-2",
      "rec-p4",
    ]);
  });

  it("drops evidence that points to an in-progress record and marks the sentence for confirmation", () => {
    const s = flat({
      paragraphs: [
        {
          sentences: [
            {
              text: "결과 문장.",
              evidence: [
                {
                  sourceType: "D",
                  refId: "rec-d2",
                  item: "result",
                  weight: "main",
                },
              ],
            },
          ],
        },
      ],
    });
    expect(s[0]?.refs).toEqual([]);
    expect(s[0]?.needsConfirm).toBe(true);
  });

  it("drops evidence for unknown ids and memos that are not in the report", () => {
    const s = flat({
      paragraphs: [
        {
          sentences: [
            {
              text: "문장.",
              evidence: [
                {
                  sourceType: "P",
                  refId: "nope",
                  item: "method",
                  weight: "main",
                },
                {
                  sourceType: "H",
                  refId: "log-9",
                  item: "method",
                  weight: "main",
                },
              ],
            },
          ],
        },
      ],
    });
    expect(s[0]?.needsConfirm).toBe(true);
  });

  it("reads the old stored shapes and keeps a student edit as a linked sentence", () => {
    const s = flat({
      paragraphs: [
        {
          sentences: [
            {
              text: "옛 문장.",
              evidence: { activityId: "rec-p1", field: "method" },
            },
            { text: "학생 문장.", evidence: { student: true } },
            { text: "근거 없음.", evidence: null },
          ],
        },
      ],
    });
    expect(s[0]?.refs[0]).toMatchObject({ refId: "rec-p1", item: "method" });
    expect(s[0]?.needsConfirm).toBe(false);
    expect(s[1]?.refs).toEqual([]);
    expect(s[1]?.needsConfirm).toBe(false);
    expect(s[2]?.needsConfirm).toBe(true);
  });

  it("marks a sentence for confirmation when an in-progress evidence was dropped, even if other evidence remains", () => {
    const s = flat({
      paragraphs: [
        {
          sentences: [
            {
              text: "결과 문장.",
              evidence: [
                {
                  sourceType: "P",
                  refId: "rec-p1",
                  item: "method",
                  weight: "main",
                },
                {
                  sourceType: "D",
                  refId: "rec-d2",
                  item: "result",
                  weight: "sub",
                },
              ],
            },
          ],
        },
      ],
    });
    expect(s[0]?.refs.map((r) => r.refId)).toEqual(["rec-p1"]);
    expect(s[0]?.needsConfirm).toBe(true);
  });

  it("drops evidence with a missing weight like the result screen does", () => {
    const s = flat({
      paragraphs: [
        {
          sentences: [
            {
              text: "문장.",
              evidence: [{ sourceType: "P", refId: "rec-p1", item: "method" }],
            },
          ],
        },
      ],
    });
    expect(s[0]?.refs).toEqual([]);
    expect(s[0]?.needsConfirm).toBe(true);
  });
});
