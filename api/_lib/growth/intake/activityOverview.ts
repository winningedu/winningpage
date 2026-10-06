// 시작 화면용 활동 개요(순수 함수). survey GET 이 쓴다.
// "위닝에 저장된 활동 N건, 교과 M건, 창체 K건, 1학년 자료 충분도" 를 한 번에 만든다.

import { firstYearSufficiency } from "../tracks.js";
import {
  type ActivityRow,
  countByGroup,
  countBySemester,
  countBySource,
  filterMaterialActivities,
  type SourceCounts,
} from "./collectSummary.js";

export function buildActivityOverview(input: {
  rows: readonly ActivityRow[];
  thresholds: { enough: number };
}): {
  total: number;
  bySource: SourceCounts;
  byGroup: ReturnType<typeof countByGroup>;
  firstYear: ReturnType<typeof firstYearSufficiency>;
} {
  const material = filterMaterialActivities(input.rows);
  const bySource = countBySource(material);
  const { bySemester } = countBySemester(material);
  return {
    total: bySource.total,
    bySource,
    byGroup: countByGroup(material),
    firstYear: firstYearSufficiency(bySemester, input.thresholds),
  };
}
