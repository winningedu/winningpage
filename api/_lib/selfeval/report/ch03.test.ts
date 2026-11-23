import { describe, expect, it } from "vitest";
import { readBody } from "./body.js";
import { buildCh02 } from "./ch02.js";
import { buildCh03 } from "./ch03.js";
import type { ReportLink } from "./inputs.js";
import { sampleInput } from "./sample.testkit.js";

function run(
  over: Parameters<typeof sampleInput>[0] = {},
  text: (id: string) => string | null = () => null,
) {
  const input = sampleInput(over);
  const body = readBody(input.bodySections, input);
  const ch02 = buildCh02(input, body, text);
  return buildCh03(ch02, text).rows;
}

describe("buildCh03", () => {
  it("lists only core, main and reflection records by submit date", () => {
    expect(run().map((r) => r.tag)).toEqual(["P1", "P2", "D1", "D3"]);
  });

  it("decides the relation by code: writing performance inherits, writing deep deepens, other subject complements", () => {
    const rows = run();
    expect(rows.map((r) => r.relationLabel)).toEqual([
      "계승",
      "계승",
      "심화",
      "보완",
    ]);
    expect(rows[3]).toMatchObject({
      subject: "통합사회",
      sentenceNumbers: [9],
      role: "reflection",
      strengthLabel: null,
    });
    expect(rows[0]?.subject).toBeNull();
  });

  it("lets the link type decide the relation and shows the link strength", () => {
    const links: ReportLink[] = [
      {
        fromRecordId: "rec-p1",
        toRecordId: "rec-p2",
        linkType: "inherit",
        strength: "implicit",
      },
      {
        fromRecordId: "rec-p1",
        toRecordId: "rec-d1",
        linkType: "deepen",
        strength: "explicit",
      },
      {
        fromRecordId: "rec-p1",
        toRecordId: "rec-d3",
        linkType: "complement",
        strength: "implicit",
      },
    ];
    const rows = run({ links });
    expect(rows.find((r) => r.tag === "P2")).toMatchObject({
      relation: "inherit",
      strengthLabel: "학생 확인",
    });
    expect(rows.find((r) => r.tag === "D1")).toMatchObject({
      relation: "deepen",
      strengthLabel: "기록에 명시",
    });
    expect(rows.find((r) => r.tag === "D3")).toMatchObject({
      relation: "complement",
      strengthLabel: "학생 확인",
    });
  });

  it("takes the explanation from the composed text and leaves it empty when missing", () => {
    expect(run()[0]?.explanation).toBeNull();
    expect(
      run({}, (id) => (id === "relation:P1" ? "설명" : null))[0]?.explanation,
    ).toBe("설명");
  });
});
