// 모델에게 보이는 활동 id 를 짧은 별칭(a1, a2 ...)으로 바꾸고 응답에서 되돌리는 순수 함수.
// 별칭 표는 context.activities 순서에서 매번 결정적으로 만들며 저장하지 않는다.

export type AliasTable = {
  idToAlias: Map<string, string>;
  aliasToId: Map<string, string>;
};

export function buildAliasTable(context: {
  activities: readonly { id: string }[];
}): AliasTable {
  const idToAlias = new Map<string, string>();
  const aliasToId = new Map<string, string>();
  context.activities.forEach((a, i) => {
    const alias = `a${i + 1}`;
    idToAlias.set(a.id, alias);
    aliasToId.set(alias, a.id);
  });
  return { idToAlias, aliasToId };
}

/** 활동 id 를 별칭으로. 모르는 값은 그대로 둔다. */
export function toAlias(table: AliasTable, id: string): string {
  return table.idToAlias.get(id) ?? id;
}

/** 별칭을 활동 id 로. 모르는 값은 그대로 둔다. */
export function toActivityId(table: AliasTable, alias: string): string {
  return table.aliasToId.get(alias) ?? alias;
}

const ID_ARRAY_KEYS = new Set(["evidence_ids", "evidenceIds", "linked"]);
const ID_STRING_KEYS = new Set(["activityId"]);

/** 응답 객체를 재귀로 돌며 근거 필드의 별칭만 활동 id 로 되돌린다. 본문 문자열은 건드리지 않는다. */
export function restoreEvidenceIds(table: AliasTable, value: unknown): unknown {
  if (Array.isArray(value))
    return value.map((v) => restoreEvidenceIds(table, v));
  if (typeof value !== "object" || value === null) return value;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    if (ID_ARRAY_KEYS.has(key) && Array.isArray(v)) {
      out[key] = v.map((x) =>
        typeof x === "string" ? toActivityId(table, x) : x,
      );
    } else if (ID_STRING_KEYS.has(key) && typeof v === "string") {
      out[key] = toActivityId(table, v);
    } else {
      out[key] = restoreEvidenceIds(table, v);
    }
  }
  return out;
}
