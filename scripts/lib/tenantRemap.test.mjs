import { describe, expect, it } from "vitest";
import { buildTenantIdMap, remapTenantIds } from "./tenantRemap.mjs";

// buildTenantIdMap(sourceTenants, targetTenants) — tenants.id는 환경마다
// gen_random_uuid()로 새로 발급돼 dev/prod가 다르다(code도 랜덤 발급이라 복사
// 대상이 아니다). 환경 간 안정적인 자연키는 name뿐이라 name 기준으로 매핑한다.
describe("buildTenantIdMap", () => {
  it("동일한 name의 source id를 target id로 매핑한다", () => {
    const sourceTenants = [{ id: "dev-1", name: "위닝부산캠퍼스" }];
    const targetTenants = [{ id: "prod-1", name: "위닝부산캠퍼스" }];

    const idMap = buildTenantIdMap(sourceTenants, targetTenants);

    expect(idMap.get("dev-1")).toBe("prod-1");
  });
});
