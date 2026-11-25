// 회원 행 스키마: tenants 보기 권한이 없는 관리자에게는 서버가 tenant_name 을 null 로 보낸다.

import { expect, test } from "vitest";
import { formatValue } from "@/pages/admin/shared/csvExport";
import { memberRowSchema } from "./api";

test("tenant_name 이 null 이어도 행을 받고 빈 값과 같게 그려진다", () => {
  const row = memberRowSchema.parse({ id: "p-1", tenant_name: null });

  expect(row.tenant_name).toBeNull();
  expect(formatValue(row.tenant_name)).toBe(formatValue(""));
});
