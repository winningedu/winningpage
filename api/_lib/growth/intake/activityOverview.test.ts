// 시작 화면 활동 개요 테스트. 시안 "위닝에 저장된 활동 14건" 문구를 재현한다.
import { describe, expect, test } from "vitest";
import { buildActivityOverview } from "./activityOverview.js";
import {
  type ActivityRow,
  filterMaterialActivities,
} from "./collectSummary.js";

const row = (over: Partial<ActivityRow> & { id: string }): ActivityRow => ({
  source_program: "manual",
  status: "confirmed",
  grade_label: "고2",
  semester: 1,
  subject_group: "국어",
  subject: "국어",
  ...over,
});

describe("buildActivityOverview", () => {
  test("시안: 활동 14건, 교과 11건, 창체 3건, 1학년 활동 4건이면 부족", () => {
    const rows: ActivityRow[] = [
      ...Array.from({ length: 4 }, (_, i) =>
        row({ id: `f${i}`, grade_label: "고1", semester: 1 }),
      ),
      ...Array.from({ length: 7 }, (_, i) => row({ id: `c${i}` })),
      ...Array.from({ length: 3 }, (_, i) =>
        row({ id: `e${i}`, subject_group: "창체" }),
      ),
    ];
    const o = buildActivityOverview({ rows, thresholds: { enough: 5 } });
    expect(o.total).toBe(14);
    expect(o.byGroup).toEqual({
      curricular: 11,
      extracurricular: 3,
      unclassified: 0,
    });
    expect(o.bySource.total).toBe(14);
    expect(o.firstYear).toEqual({
      count: 4,
      level: "insufficient",
      label: "부족",
    });
  });

  test("planned 는 분석 재료가 아니므로 개수에서 제외한다", () => {
    const rows = [row({ id: "a" }), row({ id: "b", status: "planned" })];
    expect(filterMaterialActivities(rows)).toHaveLength(1);
    const o = buildActivityOverview({ rows, thresholds: { enough: 5 } });
    expect(o.total).toBe(1);
  });
});
