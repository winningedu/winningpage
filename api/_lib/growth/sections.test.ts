// 성장설계 리포트 37항목 레지스트리, 스키마 테스트(No.90~94).
import { describe, expect, test } from "vitest";
import {
  expectedSectionIds,
  type Narrative,
  overviewCards,
  parentVisibleSections,
  SECTION_FORMATS,
  SECTION_REGISTRY,
  type SectionItem,
  validateNarrative,
  validateSectionItem,
  validateSections,
} from "./sections.js";

describe("SECTION_REGISTRY", () => {
  test("37항목이고 부별 14/10/13 이다(No.90, No.92~94)", () => {
    expect(SECTION_REGISTRY).toHaveLength(37);
    const count = (p: number) =>
      SECTION_REGISTRY.filter((s) => s.part === p).length;
    expect([count(1), count(2), count(3)]).toEqual([14, 10, 13]);
  });

  test("id 중복이 없고 형식은 6종 안이다(No.91)", () => {
    const ids = SECTION_REGISTRY.map((s) => s.id);
    expect(new Set(ids).size).toBe(37);
    for (const s of SECTION_REGISTRY)
      expect(SECTION_FORMATS).toContain(s.format);
    expect(SECTION_FORMATS).toHaveLength(6);
  });

  test("배지: 1, 2부와 3-1 은 fact, 3부 나머지는 proposal 이다(No.5)", () => {
    for (const s of SECTION_REGISTRY) {
      const expected = s.part === 3 && s.id !== "3-1" ? "proposal" : "fact";
      expect(s.badge, s.id).toBe(expected);
    }
  });

  test("externalData 는 1-14, 3-8, 3-9, 3-10, gradeSensitive 는 1-12, 1-13, 1-14, 3-10 이다(No.87, No.112)", () => {
    const pick = (k: "externalData" | "gradeSensitive") =>
      SECTION_REGISTRY.filter((s) => s[k]).map((s) => s.id);
    expect(pick("externalData")).toEqual(["1-14", "3-8", "3-9", "3-10"]);
    expect(pick("gradeSensitive")).toEqual(["1-12", "1-13", "1-14", "3-10"]);
  });

  test("대표 항목의 형식이 시안과 같다", () => {
    const fmt = (id: string) =>
      SECTION_REGISTRY.find((s) => s.id === id)?.format;
    expect([
      fmt("1-3"),
      fmt("1-4"),
      fmt("1-12"),
      fmt("1-8"),
      fmt("2-7"),
      fmt("3-13"),
    ]).toEqual(["diagram", "bar", "line", "list", "prose", "list"]);
  });
});

const okItem = (id: string, over: Partial<SectionItem> = {}): SectionItem => {
  const def = SECTION_REGISTRY.find((d) => d.id === id);
  if (!def) throw new Error(`unknown ${id}`);
  return {
    id,
    title: def.title,
    format: def.format,
    badge: def.badge,
    status: "ok",
    evidence_ids: [],
    body: { rows: [] },
    ...over,
  };
};
const allItems = () => SECTION_REGISTRY.map((d) => okItem(d.id));
const allIds = () => SECTION_REGISTRY.map((d) => d.id);

describe("validateSectionItem", () => {
  test("올바른 ok 항목은 통과한다", () => {
    expect(validateSectionItem(okItem("1-1"))).toEqual({
      ok: true,
      errors: [],
    });
  });

  test("ok 인데 body 가 없으면 실패한다", () => {
    const r = validateSectionItem({ ...okItem("1-1"), body: undefined });
    expect(r.ok).toBe(false);
  });

  test("no_data 인데 no_data_reason 이 없으면 실패하고 있으면 통과한다(No.87)", () => {
    const base = okItem("1-14", { status: "no_data", body: null });
    expect(validateSectionItem(base).ok).toBe(false);
    expect(
      validateSectionItem({ ...base, no_data_reason: "입결 자료 없음" }).ok,
    ).toBe(true);
  });

  test("형식, 배지 값이 허용 집합 밖이거나 객체가 아니면 실패한다", () => {
    expect(validateSectionItem({ ...okItem("1-1"), format: "pie" }).ok).toBe(
      false,
    );
    expect(validateSectionItem({ ...okItem("1-1"), badge: "x" }).ok).toBe(
      false,
    );
    expect(validateSectionItem(null).ok).toBe(false);
  });
});

describe("validateSections", () => {
  test("전체 37항목이 기대 id 와 정확히 일치하면 통과한다", () => {
    expect(validateSections(allItems(), allIds())).toEqual({
      ok: true,
      errors: [],
    });
  });

  test("누락, 초과, 중복 id 를 오류로 보고한다", () => {
    const missing = validateSections(allItems().slice(1), allIds());
    expect(missing.ok).toBe(false);
    expect(missing.errors.join()).toContain("1-1");
    const extra = validateSections([...allItems(), okItem("1-1")], allIds());
    expect(extra.ok).toBe(false);
    const unknown = validateSections(
      [...allItems(), { ...okItem("1-1"), id: "9-9" }],
      allIds(),
    );
    expect(unknown.errors.join()).toContain("9-9");
  });

  test("레지스트리와 형식, 배지가 다르면 실패한다", () => {
    const items = allItems();
    items[0] = { ...items[0], format: "bar" } as SectionItem;
    items[1] = { ...items[1], badge: "proposal" } as SectionItem;
    const r = validateSections(items, allIds());
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThanOrEqual(2);
  });
});

describe("expectedSectionIds", () => {
  test("omit 가 비면 37개 전부, 있으면 해당 id 만 뺀다", () => {
    expect(expectedSectionIds({ omit: [] })).toEqual(allIds());
    const r = expectedSectionIds({ omit: ["3-8", "3-9"] });
    expect(r).toHaveLength(35);
    expect(r).not.toContain("3-8");
    expect(r).not.toContain("3-9");
  });
});

describe("validateNarrative", () => {
  const good = (): Narrative => ({
    theme: "데이터로 사회 문제를 읽는 사람",
    subthemes: [
      { grade: "고1", stage: "seed", text: "문제 발견" },
      { grade: "고2", stage: "flower", text: "방법 심화" },
      { grade: "고3", stage: "bloom", text: "융합 완성" },
    ],
  });

  test("올바른 서사는 통과하고 previous 도 허용한다(No.52, No.56)", () => {
    expect(validateNarrative(good()).ok).toBe(true);
    const withPrev = {
      ...good(),
      previous: {
        theme: "이전 주제",
        issuedAt: "2026-09-01",
        reason: "career_change",
      },
    };
    expect(validateNarrative(withPrev).ok).toBe(true);
  });

  test("theme 이 비어 있으면 실패한다", () => {
    expect(validateNarrative({ ...good(), theme: " " }).ok).toBe(false);
  });

  test("하위 주제가 3개가 아니면 실패한다", () => {
    const n = good();
    expect(
      validateNarrative({ ...n, subthemes: n.subthemes.slice(0, 2) }).ok,
    ).toBe(false);
  });

  test("학년 중복이면 실패한다", () => {
    const n = good();
    const dup = [n.subthemes[0], n.subthemes[0], n.subthemes[2]];
    expect(validateNarrative({ ...n, subthemes: dup }).ok).toBe(false);
  });

  test("단계가 학년과 짝이 아니면 실패한다(고1 seed, 고2 flower, 고3 bloom)", () => {
    const n = good();
    const bad = [
      { ...n.subthemes[0], stage: "bloom" },
      n.subthemes[1],
      n.subthemes[2],
    ];
    expect(validateNarrative({ ...n, subthemes: bad }).ok).toBe(false);
  });

  test("previous 의 reason 이 career_change 가 아니면 실패한다", () => {
    const bad = {
      ...good(),
      previous: { theme: "a", issuedAt: "d", reason: "x" },
    };
    expect(validateNarrative(bad).ok).toBe(false);
  });
});

describe("parentVisibleSections", () => {
  test("성적 민감 4항목을 제외하고 제외된 id 를 돌려준다(No.112)", () => {
    const r = parentVisibleSections(allItems());
    expect(r.items).toHaveLength(33);
    expect(r.excludedIds).toEqual(["1-12", "1-13", "1-14", "3-10"]);
    expect(r.items.map((i) => i.id)).not.toContain("1-12");
  });
});

describe("overviewCards", () => {
  const full = {
    consistencyPercent: 50,
    consistencyLabel: "갈리는 중",
    axesConfirmed: 2,
    axesTotal: 5,
    weakestAxisText: "D 축이 가장 부족해요",
    estimate: "2.5",
    actual: "2.3",
    curveLabel: "상승곡선",
    recommendedDone: 2,
    recommendedTotal: 8,
    brokenSemester: "고2-1",
    activityCount: 14,
  };

  test("6카드를 시안 라벨과 key 로 만든다", () => {
    const cards = overviewCards(full);
    expect(cards.map((c) => c.key)).toEqual([
      "consistency",
      "axes",
      "estimate",
      "recommendedCourses",
      "brokenSemester",
      "activities",
    ]);
    expect(cards.map((c) => c.label)).toEqual([
      "방향 일관성",
      "A부터 E 확인됨",
      "내부 추정 등급",
      "권장과목 이수",
      "끊긴 시기",
      "분석 활동",
    ]);
    expect(cards.map((c) => c.value)).toEqual([
      "50%",
      "2 / 5",
      "2.5",
      "2 / 8",
      "고2-1",
      "14건",
    ]);
    expect(cards[0]?.sub).toBe("갈리는 중");
    expect(cards[1]?.sub).toBe("D 축이 가장 부족해요");
    expect(cards[2]?.sub).toBe("실제 평균 2.3, 상승곡선");
  });

  test("가장 부족한 축 문구가 없으면 sub 를 생략한다", () => {
    const { weakestAxisText: _omit, ...rest } = full;
    expect(overviewCards(rest)[1]).not.toHaveProperty("sub");
  });

  test("추정 등급 sub 는 있는 값만 결합한다", () => {
    expect(overviewCards({ ...full, curveLabel: null })[2]?.sub).toBe(
      "실제 평균 2.3",
    );
    expect(overviewCards({ ...full, actual: null })[2]?.sub).toBe("상승곡선");
    expect(
      overviewCards({ ...full, actual: null, curveLabel: null })[2],
    ).not.toHaveProperty("sub");
  });

  test("값이 null 인 카드는 자료 없음 텍스트가 된다", () => {
    const cards = overviewCards({
      ...full,
      consistencyPercent: null,
      estimate: null,
      brokenSemester: null,
      activityCount: null,
    });
    expect(cards[0]?.value).toBe("자료 없음");
    expect(cards[2]?.value).toBe("자료 없음");
    expect(cards[4]?.value).toBe("자료 없음");
    expect(cards[5]?.value).toBe("자료 없음");
    expect(cards[1]?.value).toBe("2 / 5");
  });
});
