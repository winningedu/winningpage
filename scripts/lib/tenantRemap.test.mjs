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

  it("name의 대소문자·앞뒤 공백 차이를 정규화해 매핑한다(DB 백필과 동일 규칙)", () => {
    const sourceTenants = [{ id: "dev-1", name: " winning busan " }];
    const targetTenants = [{ id: "prod-1", name: "WINNING BUSAN" }];

    const idMap = buildTenantIdMap(sourceTenants, targetTenants);

    expect(idMap.get("dev-1")).toBe("prod-1");
  });

  it("source에 있는 name이 target에 없으면 부분 매핑 대신 에러를 던진다", () => {
    const sourceTenants = [{ id: "dev-1", name: "위닝부산캠퍼스" }];
    const targetTenants = [];

    expect(() => buildTenantIdMap(sourceTenants, targetTenants)).toThrow(
      /타깃 DB에 없는 테넌트.*위닝부산캠퍼스/,
    );
  });
});

// remapTenantIds(rows, idMap) — products/coupons처럼 tenant_id(FK)를 가진
// 시딩 대상 행에 idMap을 적용해 source id를 target id로 치환한다.
describe("remapTenantIds", () => {
  it("tenant_id가 null인 행은 그대로 둔다", () => {
    const rows = [{ id: "p1", tenant_id: null }];
    const idMap = new Map();

    const result = remapTenantIds(rows, idMap);

    expect(result).toEqual([{ id: "p1", tenant_id: null }]);
  });
});
