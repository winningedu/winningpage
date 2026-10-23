import { describe, expect, it } from "vitest";
import {
  buildInsertSql,
  classifyTables,
  detachPaymentGrants,
  filterLiveGrants,
  filterQaLinks,
  insertableColumns,
  nullDanglingRefs,
  orderTables,
  refColumns,
  syncTargets,
} from "./devCopy.mjs";

// classifyTables({ tables, fks, runtimeTables, alwaysInclude }) -
// 유저/런타임 데이터 테이블(excluded)과 dev에서 통째로 복사할 테이블(included)을
// 카탈로그 행에서 계산한다. fks: [{ child, parent }], parent는 "public.x" 또는 "auth.users".
describe("classifyTables", () => {
  it("profiles 또는 auth.users를 직접 참조하는 테이블은 제외한다", () => {
    const { included, excluded } = classifyTables({
      tables: ["faqs", "orders", "profiles", "goal_students"],
      fks: [
        { child: "orders", parent: "public.profiles" },
        { child: "profiles", parent: "auth.users" },
        { child: "goal_students", parent: "auth.users" },
      ],
    });

    expect(included).toEqual(["faqs"]);
    expect(excluded).toEqual(["goal_students", "orders", "profiles"]);
  });

  it("FK가 없어도 명시한 런타임 로그 테이블은 제외하고, dev에 없는 이름은 무시한다", () => {
    const { included, excluded } = classifyTables({
      tables: ["faqs", "board_views"],
      fks: [],
      runtimeTables: ["board_views", "not_in_dev"],
    });

    expect(included).toEqual(["faqs"]);
    expect(excluded).toEqual(["board_views"]);
  });

  it("제외된 테이블을 참조하는 자식 테이블도 제외한다(부모 행이 없어 FK가 깨진다)", () => {
    const { included, excluded } = classifyTables({
      tables: ["orders", "order_items", "order_item_notes", "faqs"],
      fks: [
        { child: "orders", parent: "public.profiles" },
        { child: "order_items", parent: "public.orders" },
        { child: "order_item_notes", parent: "public.order_items" },
      ],
    });

    expect(included).toEqual(["faqs"]);
    expect(excluded).toEqual(["order_item_notes", "order_items", "orders"]);
  });

  it("alwaysInclude 테이블은 유저 FK가 있어도 포함하고 그 자식도 제외로 번지지 않는다", () => {
    const { included, excluded } = classifyTables({
      tables: ["tenants", "products", "profiles"],
      fks: [
        { child: "tenants", parent: "public.profiles" },
        { child: "profiles", parent: "public.tenants" },
        { child: "profiles", parent: "auth.users" },
        { child: "products", parent: "public.tenants" },
      ],
      alwaysInclude: ["tenants"],
    });

    expect(included).toEqual(["products", "tenants"]);
    expect(excluded).toEqual(["profiles"]);
  });
});

// orderTables(tables, fks) - 참조되는 테이블이 먼저 오는 적재 순서.
describe("orderTables", () => {
  it("부모 테이블을 자식보다 먼저 두고, 같은 단계는 이름순이다", () => {
    const { order, cyclic } = orderTables(
      ["order_items", "orders", "a_table", "tenants"],
      [
        { child: "order_items", parent: "public.orders" },
        { child: "orders", parent: "public.tenants" },
      ],
    );

    expect(order).toEqual(["a_table", "tenants", "orders", "order_items"]);
    expect(cyclic).toEqual([]);
  });

  it("자기참조와 대상 집합 밖 테이블로의 FK는 무시한다", () => {
    const { order } = orderTables(
      ["categories", "faqs"],
      [
        { child: "categories", parent: "public.categories" },
        { child: "faqs", parent: "public.profiles" },
        { child: "faqs", parent: "auth.users" },
      ],
    );

    expect(order).toEqual(["categories", "faqs"]);
  });

  it("순환 FK 테이블은 cyclic으로 알리고 순서 끝에 이름순으로 붙인다", () => {
    const { order, cyclic } = orderTables(
      ["b", "a", "root", "leaf"],
      [
        { child: "a", parent: "public.b" },
        { child: "b", parent: "public.a" },
        { child: "a", parent: "public.root" },
        { child: "leaf", parent: "public.a" },
      ],
    );

    expect(order).toEqual(["root", "a", "b", "leaf"]);
    expect(cyclic).toEqual(["a", "b"]);
  });
});

// filterLiveGrants(rows, now) - QA 계정의 "살아있는" 부여만 복사한다:
// revoked_at이 null이고 (expires_at이 null이거나 now보다 미래).
describe("filterLiveGrants", () => {
  const now = new Date("2026-10-23T00:00:00Z");
  const grant = (id, over = {}) => ({
    id,
    revoked_at: null,
    expires_at: null,
    ...over,
  });

  it("회수되지 않았고 만료 전이거나 무기한인 부여만 남긴다", () => {
    const rows = [
      grant("open"),
      grant("future", { expires_at: "2026-11-01T00:00:00Z" }),
      grant("expired", { expires_at: "2026-10-01T00:00:00Z" }),
      grant("revoked", { revoked_at: "2026-10-02T00:00:00Z" }),
      grant("expires_now", { expires_at: "2026-10-23T00:00:00Z" }),
    ];

    expect(filterLiveGrants(rows, now).map((r) => r.id)).toEqual([
      "open",
      "future",
    ]);
  });
});

// nullDanglingRefs(rows, { userRefCols, droppedRefCols }, qaIds) - 복사하지 않는
// 행을 가리키는 FK 컬럼을 NULL로 만든다. userRefCols는 QA id일 때만 유지하고,
// droppedRefCols(제외된 테이블 참조: order_id 등)는 항상 비운다.
describe("nullDanglingRefs", () => {
  const qaIds = new Set(["qa-1", "qa-2"]);
  const cols = {
    userRefCols: ["profile_id", "revoked_by"],
    droppedRefCols: ["order_id", "order_item_id"],
  };

  it("주문 참조를 비우고 QA가 아닌 유저 참조도 비우되 QA 참조는 유지한다", () => {
    const rows = [
      {
        id: 1,
        profile_id: "qa-1",
        revoked_by: "real-admin",
        order_id: "o-1",
        order_item_id: 7,
        program_key: "target",
      },
      { id: 2, profile_id: "qa-2", revoked_by: "qa-1", order_id: null },
    ];

    const out = nullDanglingRefs(rows, cols, qaIds);

    expect(out[0]).toEqual({
      id: 1,
      profile_id: "qa-1",
      revoked_by: null,
      order_id: null,
      order_item_id: null,
      program_key: "target",
    });
    expect(out[1].revoked_by).toBe("qa-1");
    expect(rows[0]?.order_id).toBe("o-1");
  });
});

// filterQaLinks(rows, qaIds) - parent_id와 student_id가 모두 QA 계정인 연결만 남긴다.
describe("filterQaLinks", () => {
  it("양쪽이 모두 QA인 부모-자녀 연결만 남긴다", () => {
    const qaIds = new Set(["p1", "s1"]);
    const rows = [
      { id: 1, parent_id: "p1", student_id: "s1" },
      { id: 2, parent_id: "p1", student_id: "real-student" },
      { id: 3, parent_id: "real-parent", student_id: "s1" },
    ];

    expect(filterQaLinks(rows, qaIds).map((r) => r.id)).toEqual([1]);
  });
});

// syncTargets(grants) - program_access 캐시를 다시 계산할 (profile_id, program_key) 쌍.
describe("syncTargets", () => {
  it("복사한 부여에서 중복 없는 (profile_id, program_key) 쌍을 뽑는다", () => {
    const grants = [
      { profile_id: "a", program_key: "target" },
      { profile_id: "a", program_key: "target" },
      { profile_id: "a", program_key: "growth" },
      { profile_id: "b", program_key: "target" },
    ];

    expect(syncTargets(grants)).toEqual([
      { profile_id: "a", program_key: "target" },
      { profile_id: "a", program_key: "growth" },
      { profile_id: "b", program_key: "target" },
    ]);
  });
});

// refColumns(table, fks, excludedTables) - nullDanglingRefs에 넘길 컬럼을 카탈로그
// FK에서 계산한다. fks: [{ child, parent, columns }].
describe("refColumns", () => {
  it("유저 테이블 참조와 제외 테이블 참조 컬럼을 나눠 돌려준다", () => {
    const fks = [
      { child: "grants", parent: "public.profiles", columns: ["profile_id"] },
      { child: "grants", parent: "auth.users", columns: ["revoked_by"] },
      { child: "grants", parent: "public.orders", columns: ["order_id"] },
      { child: "grants", parent: "public.products", columns: ["product_id"] },
      { child: "other", parent: "public.orders", columns: ["order_id"] },
    ];

    expect(refColumns("grants", fks, new Set(["orders", "profiles"]))).toEqual({
      userRefCols: ["profile_id", "revoked_by"],
      droppedRefCols: ["order_id"],
    });
  });
});

// insertableColumns(devCols, localCols) - 양쪽에 모두 있고 생성 컬럼이 아닌 컬럼.
// cols: [{ name, generated }]. 로컬 GoTrue/스키마 버전 차이를 흡수한다.
describe("insertableColumns", () => {
  it("dev와 로컬 교집합에서 생성 컬럼을 뺀다", () => {
    const dev = [
      { name: "id", generated: false },
      { name: "email", generated: false },
      { name: "confirmed_at", generated: true },
      { name: "dev_only", generated: false },
    ];
    const local = [
      { name: "id", generated: false },
      { name: "email", generated: false },
      { name: "confirmed_at", generated: true },
      { name: "local_only", generated: false },
    ];

    expect(insertableColumns(dev, local)).toEqual(["id", "email"]);
  });
});

// buildInsertSql - 행을 JSON 한 덩어리로 넘겨 json_populate_recordset으로 푼다.
// 배열/jsonb/vector 등 컬럼 타입별 직렬화를 DB 캐스팅에 맡기기 위해서다.
describe("buildInsertSql", () => {
  it("컬럼 목록과 달러 인용 JSON으로 멱등 INSERT를 만든다", () => {
    const sql = buildInsertSql({
      schema: "public",
      table: "faqs",
      columns: ["id", "question"],
      rows: [{ id: 1, question: "it's" }],
    });

    expect(sql).toMatch(
      /^INSERT INTO "public"\."faqs" \("id", "question"\) OVERRIDING SYSTEM VALUE\nSELECT "id", "question" FROM json_populate_recordset\(NULL::"public"\."faqs", \$j\$\[\{"id":1,"question":"it's"\}\]\$j\$::json\)\nON CONFLICT DO NOTHING;$/,
    );
  });

  it("행 JSON에 달러 태그가 들어 있으면 겹치지 않는 태그를 고른다", () => {
    const sql = buildInsertSql({
      schema: "public",
      table: "faqs",
      columns: ["q"],
      rows: [{ q: "price $j$ end" }],
    });

    expect(sql).toContain("$j1$[");
    expect(sql).toContain("]$j1$::json");
  });

  it("행이 없으면 빈 문자열을 돌려준다", () => {
    expect(
      buildInsertSql({
        schema: "public",
        table: "t",
        columns: ["a"],
        rows: [],
      }),
    ).toBe("");
  });
});

// detachPaymentGrants(rows) - 주문 참조를 비운 부여에서 granted_by='payment'를 'qa'로 바꾼다.
// CHECK pag_payment_{item,order}_pairing_check: (granted_by='payment') = (order_*_id IS NOT NULL).
// 'qa'는 actor 없이 허용되고, 다른 granted_by 값(admin, promotion, qa)은 그대로 둔다.
describe("detachPaymentGrants", () => {
  it("payment 부여만 qa로 바꾸고 나머지 컬럼과 다른 granted_by는 유지한다", () => {
    const rows = [
      { id: 1, granted_by: "payment", granted_by_actor: null, order_id: null },
      { id: 2, granted_by: "admin", granted_by_actor: "a-1", order_id: null },
      {
        id: 3,
        granted_by: "promotion",
        granted_by_actor: null,
        order_id: null,
      },
      { id: 4, granted_by: "qa", granted_by_actor: null, order_id: null },
    ];

    const out = detachPaymentGrants(rows);

    expect(out.map((r) => r.granted_by)).toEqual([
      "qa",
      "admin",
      "promotion",
      "qa",
    ]);
    expect(out[1].granted_by_actor).toBe("a-1");
    expect(rows[0]?.granted_by).toBe("payment");
  });
});
