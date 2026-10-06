import { describe, expect, it } from "vitest";
import {
  BADGE_LABELS,
  FORMAT_LABELS,
  groupSectionsByPart,
  normalizeSections,
} from "./reportLogic";

const raw = (over: Record<string, unknown> = {}) => ({
  id: "1-2",
  title: "장기 목표",
  format: "prose",
  badge: "fact",
  status: "ok",
  evidence_ids: ["a", "b"],
  body: { text: "본문" },
  ...over,
});

function one(input: unknown[]) {
  const [s] = normalizeSections(input);
  if (!s) throw new Error("정규화 결과가 비었어요");
  return s;
}

describe("normalizeSections", () => {
  it("형식 라벨과 배지 라벨과 근거 수를 만든다", () => {
    const s = one([raw()]);
    expect(FORMAT_LABELS[s.format ?? "prose"]).toBe("서술");
    expect(s.badge && BADGE_LABELS[s.badge]).toBe("확인된 사실");
    expect(BADGE_LABELS.proposal).toBe("제안");
    expect(s.evidenceCount).toBe(2);
    expect(s.part).toBe(1);
  });

  it("배지가 없거나 모르는 값이면 null 로 두고 기본 배지를 만들지 않는다", () => {
    expect(one([raw({ badge: undefined })]).badge).toBeNull();
    expect(one([raw({ badge: "weird" })]).badge).toBeNull();
    expect(one([raw({ badge: "proposal" })]).badge).toBe("proposal");
  });

  it("모양이 깨진 항목은 버리고 형식이 깨지면 자료 없음으로 둔다", () => {
    const out = normalizeSections([
      null,
      { id: 3 },
      raw({ id: "2-1", format: "weird" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.format).toBeNull();
    expect(out[0]?.status).toBe("no_data");
  });

  it("no_data 사유는 body.reason, 없으면 no_data_reason 순으로 읽는다", () => {
    const a = one([
      raw({
        status: "no_data",
        body: { reason: "사유A" },
        no_data_reason: "B",
      }),
    ]);
    const b = one([
      raw({ status: "no_data", body: null, no_data_reason: "사유B" }),
    ]);
    expect(a.reason).toBe("사유A");
    expect(b.reason).toBe("사유B");
  });
});

describe("groupSectionsByPart", () => {
  it("1부 2부 3부 순서로 묶고 부 안에서는 번호 순으로 정렬한다", () => {
    const sections = normalizeSections([
      raw({ id: "3-1", badge: "fact" }),
      raw({ id: "1-10" }),
      raw({ id: "1-2" }),
      raw({ id: "2-1" }),
    ]);
    const groups = groupSectionsByPart(sections);
    expect(groups.map((g) => g.part)).toEqual([1, 2, 3]);
    expect(groups[0]?.sections.map((s) => s.id)).toEqual(["1-2", "1-10"]);
    expect(groups[0]?.title).toBe("1부 지금까지 무엇을 했는가");
    expect(groups[1]?.title).toBe("2부 위닝 A부터 E 5축 진단");
    expect(groups[2]?.title).toBe("3부 남은 기간 설계");
  });
});
