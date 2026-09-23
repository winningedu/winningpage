// scripts/seed-prod-from-dev.mjs가 tenant_id(FK → public.tenants(id))를 가진
// 테이블(products/coupons 등)을 시딩할 때 쓰는 순수 모듈. DB 접속 없음.
//
// tenants.id는 환경마다 gen_random_uuid()로 새로 발급돼 dev/prod가 다르다
// (code도 랜덤 발급이라 복사 대상이 아니다). 환경 간 안정 키는 name뿐이라
// name(정규화: upper+trim, DB 백필과 동일 규칙)을 기준으로 매핑한다.

function normalizeName(name) {
  return name.trim().toUpperCase();
}

// [{id,name}] × [{id,name}] → Map<sourceId, targetId>.
export function buildTenantIdMap(sourceTenants, targetTenants) {
  const targetByName = new Map(
    targetTenants.map((t) => [normalizeName(t.name), t.id]),
  );

  const idMap = new Map();
  const missing = [];
  for (const source of sourceTenants) {
    const targetId = targetByName.get(normalizeName(source.name));
    if (targetId === undefined) {
      missing.push(source.name);
      continue;
    }
    idMap.set(source.id, targetId);
  }

  if (missing.length > 0) {
    throw new Error(`타깃 DB에 없는 테넌트: ${missing.join(", ")}`);
  }

  return idMap;
}

// rows의 tenant_id를 idMap으로 치환한다. null/undefined는 그대로 둔다.
export function remapTenantIds(rows, idMap) {
  return rows.map((row) => {
    if (row.tenant_id === null || row.tenant_id === undefined) return row;
    const target = idMap.get(row.tenant_id);
    if (target === undefined) {
      throw new Error(
        `remapTenantIds: idMap에 없는 tenant_id(${row.tenant_id}) — 행: ${JSON.stringify(row)}`,
      );
    }
    return { ...row, tenant_id: target };
  });
}
