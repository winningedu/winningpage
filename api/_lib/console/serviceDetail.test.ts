// 서비스 상세 창: 학습진단 창이 v3 학생도 읽는지 본다.

import { expect, test } from "vitest";
import { diagnosisDetail } from "./diagnosisDetail.js";
import { v3Scores } from "./diagnosisV3TestKit.js";
import { serviceDetail } from "./serviceDetail.js";

type Built = Parameters<typeof serviceDetail>[1];

const builtOf = (data: Record<string, unknown>) =>
  ({ data, text: {} }) as unknown as Built;

test("a v3 student gets the diagnosis window built from the tagged v3 scores", () => {
  const scores = v3Scores({ level: "L2" });
  const detail = serviceDetail(
    "diagnosis",
    builtOf({
      metrics: { diagnosis: null },
      diagnosisAreas: { version: "v3", scores },
      diagnosisPreviousAreas: null,
      diagnosisPrevious: null,
      diagnosisMeta: null,
    }),
  );
  const { metrics, summary, bars, priorities } = diagnosisDetail(
    { version: "v3", scores },
    null,
    null,
  );
  expect(detail).toMatchObject({
    service: "diagnosis",
    title: "학습진단 상세",
    metrics,
    summary,
    bars,
    secondTable: priorities,
  });
});
