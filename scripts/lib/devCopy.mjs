// dev -> 로컬 복사 스크립트(seed-from-dev.mjs)의 순수 로직.

const USER_ROOTS = new Set(["public.profiles", "auth.users"]);

// 유저/런타임 데이터(excluded)와 통째로 복사할 데이터(included)를 가른다.
// 제외 규칙: ① profiles/auth.users를 직접 참조하는 테이블 ② runtimeTables(FK 없는
// 로그성 테이블) ③ 제외된 테이블을 참조하는 자식(부모 행이 없어 FK가 깨진다).
// alwaysInclude는 ①②에 걸려도 포함하고 ③으로도 번지지 않는다.
// fks: [{ child, parent }] - parent는 "public.x" 또는 "auth.users".
export function classifyTables({
  tables,
  fks,
  runtimeTables = [],
  alwaysInclude = [],
}) {
  const keep = new Set(alwaysInclude);
  const known = new Set(tables);
  const excluded = new Set(
    [
      ...fks.filter((fk) => USER_ROOTS.has(fk.parent)).map((fk) => fk.child),
      ...runtimeTables,
    ].filter((t) => known.has(t) && !keep.has(t)),
  );
  for (let grew = true; grew; ) {
    grew = false;
    for (const { child, parent } of fks) {
      const parentName = parent.replace(/^public\./, "");
      if (
        excluded.has(parentName) &&
        known.has(child) &&
        !excluded.has(child) &&
        !keep.has(child)
      ) {
        excluded.add(child);
        grew = true;
      }
    }
  }
  return {
    included: tables.filter((t) => !excluded.has(t)).sort(),
    excluded: tables.filter((t) => excluded.has(t)).sort(),
  };
}

// 참조되는 테이블이 먼저 오는 적재 순서(Kahn, 같은 단계는 이름순).
// 자기참조와 tables 밖으로의 FK는 무시한다. 더 진행이 안 되면 남은 테이블 중
// 순환에 속한 것(cyclic)을 이름순으로 먼저 내보내고 계속한다.
export function orderTables(tables, fks) {
  const names = new Set(tables);
  const parentsOf = new Map(tables.map((t) => [t, new Set()]));
  for (const { child, parent } of fks) {
    const p = parent.replace(/^public\./, "");
    if (child !== p && names.has(child) && names.has(p)) {
      parentsOf.get(child).add(p);
    }
  }

  const order = [];
  const done = new Set();
  const cyclic = [];
  const remaining = () => [...tables].sort().filter((t) => !done.has(t));
  const emit = (t) => {
    order.push(t);
    done.add(t);
  };
  const reachesSelf = (start, pool) => {
    const seen = new Set();
    const stack = [...parentsOf.get(start)].filter((p) => pool.has(p));
    while (stack.length) {
      const n = stack.pop();
      if (n === start) return true;
      if (seen.has(n)) continue;
      seen.add(n);
      for (const p of parentsOf.get(n)) if (pool.has(p)) stack.push(p);
    }
    return false;
  };

  while (done.size < tables.length) {
    const left = remaining();
    const ready = left.filter((t) =>
      [...parentsOf.get(t)].every((p) => done.has(p)),
    );
    if (ready.length) {
      ready.forEach(emit);
      continue;
    }
    const pool = new Set(left);
    const loop = left.filter((t) => reachesSelf(t, pool));
    cyclic.push(...loop);
    loop.forEach(emit);
  }
  return { order, cyclic };
}

export function filterLiveGrants(rows, now) {
  return rows.filter(
    (r) =>
      r.revoked_at == null &&
      (r.expires_at == null || new Date(r.expires_at) > now),
  );
}

export function nullDanglingRefs(rows, { userRefCols, droppedRefCols }, qaIds) {
  return rows.map((row) => {
    const out = { ...row };
    for (const c of droppedRefCols) if (c in out) out[c] = null;
    for (const c of userRefCols) {
      if (c in out && out[c] != null && !qaIds.has(out[c])) out[c] = null;
    }
    return out;
  });
}

export function filterQaLinks(rows, qaIds) {
  return rows.filter((r) => qaIds.has(r.parent_id) && qaIds.has(r.student_id));
}

export function syncTargets(grants) {
  const seen = new Map();
  for (const { profile_id, program_key } of grants) {
    seen.set(`${profile_id}:${program_key}`, { profile_id, program_key });
  }
  return [...seen.values()];
}

// excludedTables에는 profiles도 들어 있어도 되지만 유저 참조는 먼저 판정한다.
export function refColumns(table, fks, excludedTables) {
  const userRefCols = [];
  const droppedRefCols = [];
  for (const fk of fks.filter((f) => f.child === table)) {
    if (USER_ROOTS.has(fk.parent)) userRefCols.push(...fk.columns);
    else if (excludedTables.has(fk.parent.replace(/^public\./, ""))) {
      droppedRefCols.push(...fk.columns);
    }
  }
  return { userRefCols, droppedRefCols };
}

export function insertableColumns(devCols, localCols) {
  const local = new Set(localCols.filter((c) => !c.generated).map((c) => c.name));
  return devCols
    .filter((c) => !c.generated && local.has(c.name))
    .map((c) => c.name);
}

const quoteIdent = (name) => `"${name.replace(/"/g, '""')}"`;

export function buildInsertSql({ schema, table, columns, rows }) {
  if (!rows.length) return "";
  const json = JSON.stringify(rows);
  let tag = "j";
  for (let n = 1; json.includes(`$${tag}$`); n++) tag = `j${n}`;
  const target = `${quoteIdent(schema)}.${quoteIdent(table)}`;
  const cols = columns.map(quoteIdent).join(", ");
  return (
    `INSERT INTO ${target} (${cols}) OVERRIDING SYSTEM VALUE\n` +
    `SELECT ${cols} FROM json_populate_recordset(NULL::${target}, $${tag}$${json}$${tag}$::json)\n` +
    `ON CONFLICT DO NOTHING;`
  );
}

export function detachPaymentGrants(rows) {
  return rows.map((r) =>
    r.granted_by === "payment" ? { ...r, granted_by: "qa" } : r,
  );
}
