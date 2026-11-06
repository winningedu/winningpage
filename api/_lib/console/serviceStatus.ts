// W8 서비스별 현황표의 서비스마다 다른 열 값. 쪽에 보이는 학생만 읽는다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadDiagnosisStatus } from "./diagnosisStatus.js";
import { loadGoalStatus } from "./goalStatus.js";
import { loadGrowthStatus } from "./growthStatus.js";
import { loadPerformanceStatus } from "./performanceStatus.js";
import type { ServiceKey } from "./serviceUsage.js";
import { loadInquiryStatus, loadSelfevalStatus } from "./sessionStatus.js";

export async function loadServiceDetail(
  admin: SupabaseClient,
  service: ServiceKey,
  studentIds: string[],
): Promise<Map<string, object>> {
  switch (service) {
    case "diagnosis":
      return loadDiagnosisStatus(admin, studentIds);
    case "goal":
      return loadGoalStatus(admin, studentIds, new Date(), { streak: true });
    case "growth":
      return loadGrowthStatus(admin, studentIds);
    case "performance":
      return loadPerformanceStatus(admin, studentIds);
    case "selfeval":
      return loadSelfevalStatus(admin, studentIds);
    case "inquiry":
      return loadInquiryStatus(admin, studentIds);
  }
}
