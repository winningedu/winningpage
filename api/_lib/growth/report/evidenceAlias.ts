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

const UUID_SOURCE =
  "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
/** 별칭 또는 UUID 토큰. 앞뒤가 ASCII 영숫자이면 토큰이 아니다. */
const TOKEN_SOURCE = `(?<![A-Za-z0-9])(?:${UUID_SOURCE}|a\\d+)(?![A-Za-z0-9])`;
/** 별칭과 쉼표, 공백만 든 괄호 덩어리. 앞 공백까지 잡는다. */
const GROUP_RE = new RegExp(
  `\\s*[(\\[]\\s*${TOKEN_SOURCE}(?:\\s*,\\s*${TOKEN_SOURCE})*\\s*,?\\s*[)\\]]`,
  "g",
);
const BARE_RE = new RegExp(`(,\\s*)?(${TOKEN_SOURCE})(\\s*,)?`, "g");
const TOKEN_RE = new RegExp(TOKEN_SOURCE, "g");

/** 토큰이 별칭 표에 있으면 별칭을, 없으면 null 을 돌려준다. UUID 는 별칭으로 바꾼다. */
function knownAlias(table: AliasTable, token: string): string | null {
  if (table.aliasToId.has(token)) return token;
  return (
    table.idToAlias.get(token) ??
    table.idToAlias.get(token.toLowerCase()) ??
    null
  );
}

/** 문자열에서 표에 있는 별칭과 UUID 를 지우고 찾은 별칭을 found 에 쌓는다. 지운 흔적은 다듬는다. */
function cleanText(table: AliasTable, text: string, found: string[]): string {
  let changed = false;
  let out = text.replace(GROUP_RE, (match) => {
    const aliases = (match.match(TOKEN_RE) ?? []).map((t) =>
      knownAlias(table, t),
    );
    if (aliases.some((a) => a === null)) return match;
    for (const a of aliases) if (a !== null) found.push(a);
    changed = true;
    return "";
  });
  out = out.replace(BARE_RE, (match, before, token, after) => {
    const alias = knownAlias(table, token);
    if (alias === null) return match;
    found.push(alias);
    changed = true;
    // 뒤 쉼표가 있으면 그것을, 없으면 앞 쉼표를 함께 지운다.
    if (after !== undefined) return before ?? "";
    return "";
  });
  if (!changed) return text;
  return out
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ ([,.])/g, "$1")
    .trim();
}

const EVIDENCE_KEYS = new Set([
  "evidence_ids",
  "evidenceIds",
  "linked",
  "activityId",
]);
/** 근거 개념이 없어 본문에서 찾은 별칭을 버리는 키. */
const NO_EVIDENCE_KEYS = new Set(["narrative", "planDraft", "signals"]);
/** 이 키의 배열 항목은 evidence_ids 를 가진 행이나 항목이다. */
const EVIDENCE_IDS_ENTRY_KEYS = new Set(["rows", "items"]);
/** 이 키의 배열 항목은 evidenceIds 를 가진 match 항목이다. */
const EVIDENCE_IDS_CAMEL_ENTRY_KEYS = new Set(["aligned", "conflicting"]);

type Owner = { found: string[] } | null;

function ownKeyOf(
  obj: Record<string, unknown>,
  parentKey: string | null,
): "evidence_ids" | "evidenceIds" | null {
  if (parentKey !== null && EVIDENCE_IDS_ENTRY_KEYS.has(parentKey))
    return "evidence_ids";
  if (parentKey !== null && EVIDENCE_IDS_CAMEL_ENTRY_KEYS.has(parentKey))
    return "evidenceIds";
  if ("evidence_ids" in obj) return "evidence_ids";
  if ("evidenceIds" in obj) return "evidenceIds";
  if (typeof obj.id === "string" && "status" in obj) return "evidence_ids";
  return null;
}

function scrubValue(
  table: AliasTable,
  value: unknown,
  owner: Owner,
  parentKey: string | null,
): unknown {
  if (typeof value === "string") {
    const found: string[] = [];
    const cleaned = cleanText(table, value, found);
    if (owner) owner.found.push(...found);
    return cleaned;
  }
  if (Array.isArray(value))
    return value.map((v) => scrubValue(table, v, owner, parentKey));
  if (typeof value !== "object" || value === null) return value;
  const obj = value as Record<string, unknown>;
  const ownKey = ownKeyOf(obj, parentKey);
  const own: Owner = ownKey ? { found: [] } : owner;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(obj)) {
    if (EVIDENCE_KEYS.has(key)) {
      out[key] = v;
    } else if (NO_EVIDENCE_KEYS.has(key)) {
      out[key] = scrubValue(table, v, null, key);
    } else {
      out[key] = scrubValue(table, v, own, key);
    }
  }
  if (ownKey && own && own.found.length > 0) {
    const current = Array.isArray(obj[ownKey])
      ? (obj[ownKey] as unknown[])
      : [];
    out[ownKey] = [...new Set([...current, ...own.found])];
  }
  return out;
}

/**
 * 모델이 학생에게 보이는 본문에 적은 활동 별칭과 UUID 를 지우고 근거 필드로 옮긴다.
 * 근거 필드가 아닌 모든 문자열에서 별칭 표에 있는 토큰만 찾는다.
 * 찾은 별칭은 그 문자열을 담은 가장 가까운 행, 항목, 섹션의 근거에 기존 근거 뒤로 덧붙이고,
 * 근거 개념이 없는 narrative, planDraft, signals 에서 찾은 것은 버린다. 3개 절단은 이후 단계가 맡는다.
 * 표에 없는 a 숫자는 건드리지 않는다. 입력은 바꾸지 않는다.
 */
export function scrubAliasText(table: AliasTable, value: unknown): unknown {
  return scrubValue(table, value, null, null);
}
