// W8 학습진단 현황. v3 payload 는 엔진이 저장한 scores 를 코드 키로 읽는다(judge-report 3-4).

import { describe, expect, test } from "vitest";
import { AREAS } from "../../../src/lib/diagnosis-v3/codes.js";
import { sheetRows } from "../../../src/lib/diagnosis-v3/sheet.js";
import { COPY_SHEETS } from "../../../src/lib/diagnosis-v3/source/copyText.js";
import {
  stateLabel,
  summarizeReport,
  URGENCY_LABEL,
  urgencyOfV3,
} from "./diagnosisStatus.js";
import { v3Payload } from "./diagnosisV3TestKit.js";

const DIAGNOSED_AT = "2026-11-09T01:00:00Z";

describe("summarizeReport with a v3 payload", () => {
  test("urgency is the stored engine level, not the console lowest-score rule", () => {
    // lowest area is 40 (console rule would say very_high); the engine stored L3
    const status = summarizeReport(v3Payload({ level: "L3" }), DIAGNOSED_AT);
    expect(status.urgency).toBe("high");
  });

  test("averages are the stored page totals and the weakest is the first of the engine order", () => {
    const status = summarizeReport(v3Payload(), DIAGNOSED_AT);
    expect(status.executionAvg).toBe(62);
    expect(status.readinessAvg).toBe(63);
    expect(status.weakest).toEqual({
      name: AREAS.P1_EXEC.label,
      score: 40,
      status: "취약", // 06 r20-r23: PAGE1 WEAK label
    });
    expect(status.diagnosedAt).toBe("2026-11-09");
  });
});

describe("v3 tables trace to the sheets", () => {
  test("engine levels L1..L4 map to the 06_긴급도 labels the console already shows", () => {
    // copy 06_긴급도 r5-r8: URG_L1 낮음, URG_L2 보통, URG_L3 높음, URG_L4 매우 높음
    const rows = COPY_SHEETS["06_긴급도"] ?? [];
    for (const [level, id] of [
      ["L1", "URG_L1"],
      ["L2", "URG_L2"],
      ["L3", "URG_L3"],
      ["L4", "URG_L4"],
    ] as const) {
      const sheetLabel = rows.find((r) => r.c[0] === id)?.c[1];
      const scores = v3Payload({ level }).scores;
      expect(URGENCY_LABEL[urgencyOfV3(scores)]).toBe(sheetLabel);
    }
  });

  test("area state labels are the 06_임계값 r20-r23 cells, MIND uses PAGE1", () => {
    const cell = (r: number) =>
      String(sheetRows("06_임계값").find((x) => x.r === r)?.c[1]);
    expect(cell(20)).toBe(
      `PAGE1 ${stateLabel("TOP", "page1")} / PAGE2 ${stateLabel("TOP", "page2")}`,
    );
    expect(cell(23)).toBe(
      `PAGE1 ${stateLabel("WEAK", "page1")} / PAGE2 ${stateLabel("WEAK", "page2")}`,
    );
    expect(stateLabel("LOW", "page2")).toBe("보완 필요");
  });
});

describe("summarizeReport with a v2 payload", () => {
  test("still reads the Korean area labels and applies the console urgency rule", () => {
    const area = (name: string, score: number) => ({ name, score, status: "" });
    const status = summarizeReport(
      {
        learningAxes: [area("목표 설정", 40), area("계획 설계", 80)],
        readiness: { areas: [area("교과 관리", 90)] },
      },
      DIAGNOSED_AT,
    );
    expect(status.urgency).toBe("very_high");
    expect(status.executionAvg).toBe(60);
    expect(status.readinessAvg).toBe(90);
  });
});
