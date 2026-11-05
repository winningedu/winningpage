// W8 서비스별 현황표의 서비스마다 다른 열 값. 쪽에 보이는 학생만 읽는다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadDiagnosisStatus } from "./diagnosisStatus.js";
import type { ServiceKey } from "./serviceUsage.js";

export async function loadServiceDetail(
  admin: SupabaseClient,
  service: ServiceKey,
  studentIds: string[],
): Promise<Map<string, object>> {
  switch (service) {
    case "diagnosis":
      return loadDiagnosisStatus(admin, studentIds);
    default:
      return new Map();
  }
}
