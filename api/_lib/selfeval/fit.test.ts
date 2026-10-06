import { describe, expect, it } from "vitest";
import { computeFit, FIT_WEIGHTS, type FitContext } from "./fit.js";
import type { ActivityRecordLike, GrowthSnapshot } from "./types.js";

const rec = (o: Partial<ActivityRecordLike> = {}): ActivityRecordLike => ({
  id: "a1",
  sourceProgram: "performance",
  status: "confirmed",
  gradeLabel: "고2",
  semester: 1,
  subjectGroup: "수학",
  subject: "수학Ⅰ",
  topic: "표본 조사 설계",
  concept: null,
  method: null,
  result: null,
  limitation: null,
  numbers: [],
  sources: [],
  createdAt: "2026-01-01T00:00:00Z",
  ...o,
});

const ctx = (o: Partial<FitContext> = {}): FitContext => ({
  area: "subject",
  subject: "수학",
  activityName: null,
  others: [],
  growth: null,
  growthApplied: false,
  ...o,
});

const hit = (r: ReturnType<typeof computeFit>, key: string) =>
  r.signals.find((s) => s.key === key)?.hit;

const growth = (o: Partial<GrowthSnapshot> = {}): GrowthSnapshot => ({
  reportId: "g",
  issuedAt: "2026-09-01T00:00:00Z",
  narrativeTheme: null,
  gradeSubthemes: [],
  stage: null,
  weakAxes: [],
  alignedSignals: [],
  conflictingSignals: [],
  planItems: [],
  ...o,
});

const LONG =
  "설문지를 직접 만들어서 학교 학생들에게 배포하고 응답을 모아 정리했다. 그 과정을 기록했다";

describe("FIT_WEIGHTS", () => {
  it("기본 8신호 양수 합은 60", () => {
    const pos = [
      "same_subject",
      "has_judgment",
      "has_limitation",
      "numbers_two_plus",
      "self_made",
    ] as const;
    expect(pos.reduce((s, k) => s + FIT_WEIGHTS[k], 0)).toBe(60);
  });
});

describe("computeFit 기본 신호", () => {
  it("과목이 같으면(로마 숫자 무시) same_subject", () => {
    expect(hit(computeFit(rec(), ctx()), "same_subject")).toBe(true);
    expect(
      hit(
        computeFit(rec({ subjectGroup: "영어", subject: "영어" }), ctx()),
        "same_subject",
      ),
    ).toBe(false);
  });
  it("창체는 교과군이 영역 라벨로 시작하면 same_subject", () => {
    const c = ctx({ area: "club", subject: null });
    expect(
      hit(
        computeFit(rec({ subjectGroup: "동아리활동", subject: null }), c),
        "same_subject",
      ),
    ).toBe(true);
    expect(
      hit(
        computeFit(rec({ subjectGroup: "수학", subject: null }), c),
        "same_subject",
      ),
    ).toBe(false);
  });
  it("결과에 판단 낱말이 있으면 has_judgment", () => {
    expect(
      hit(
        computeFit(rec({ result: "결과를 해석했다" }), ctx()),
        "has_judgment",
      ),
    ).toBe(true);
    expect(
      hit(computeFit(rec({ result: "조사했다" }), ctx()), "has_judgment"),
    ).toBe(false);
  });
  it("한계가 있으면 has_limitation", () => {
    expect(
      hit(
        computeFit(rec({ limitation: "표본이 작다" }), ctx()),
        "has_limitation",
      ),
    ).toBe(true);
    expect(
      hit(computeFit(rec({ limitation: " " }), ctx()), "has_limitation"),
    ).toBe(false);
  });
  it("numbers 배열과 결과 속 수치 합이 2 이상이면 numbers_two_plus", () => {
    expect(
      hit(
        computeFit(rec({ numbers: ["30명"], result: "18명 찬성" }), ctx()),
        "numbers_two_plus",
      ),
    ).toBe(true);
    expect(
      hit(computeFit(rec({ numbers: ["30명"] }), ctx()), "numbers_two_plus"),
    ).toBe(false);
  });
  it("방법이나 출처에 직접 만든 낱말이 있으면 self_made", () => {
    expect(
      hit(computeFit(rec({ method: "설문 직접 제작" }), ctx()), "self_made"),
    ).toBe(true);
    expect(
      hit(computeFit(rec({ sources: ["직접 설계"] }), ctx()), "self_made"),
    ).toBe(true);
    expect(hit(computeFit(rec({ method: "검색" }), ctx()), "self_made")).toBe(
      false,
    );
  });
  it("방법과 결과가 40자 미만이면 too_short", () => {
    expect(hit(computeFit(rec({ method: "짧다" }), ctx()), "too_short")).toBe(
      true,
    );
    expect(hit(computeFit(rec({ method: LONG }), ctx()), "too_short")).toBe(
      false,
    );
  });
  it("비슷한 제목의 다른 활동이 있으면 repeated_topic", () => {
    const o = rec({ id: "a2", topic: "표본 조사 설계 심화" });
    expect(hit(computeFit(rec(), ctx({ others: [o] })), "repeated_topic")).toBe(
      true,
    );
    const d = rec({ id: "a3", topic: "우주 탐사 기록" });
    expect(hit(computeFit(rec(), ctx({ others: [d] })), "repeated_topic")).toBe(
      false,
    );
  });
  it("가장 가까운 앞선 활동과 2학기를 넘게 벌어지면 year_gap", () => {
    const early = rec({
      id: "e",
      gradeLabel: "고1",
      semester: 1,
      topic: "다른 주제 탐구",
    });
    const me = rec({ gradeLabel: "고2", semester: 2 });
    expect(hit(computeFit(me, ctx({ others: [early] })), "year_gap")).toBe(
      true,
    );
    const near = rec({
      id: "n",
      gradeLabel: "고2",
      semester: 1,
      topic: "또 다른 주제",
    });
    expect(
      hit(computeFit(me, ctx({ others: [early, near] })), "year_gap"),
    ).toBe(false);
  });
  it("학년 정보가 없거나 앞선 활동이 없으면 year_gap 아님", () => {
    expect(
      hit(
        computeFit(
          rec({ gradeLabel: null }),
          ctx({ others: [rec({ id: "x", gradeLabel: "고1" })] }),
        ),
        "year_gap",
      ),
    ).toBe(false);
    expect(hit(computeFit(rec(), ctx()), "year_gap")).toBe(false);
  });
});

describe("computeFit 점수", () => {
  it("전부 해당하면 100, 아무것도 없으면 0 이하로 내려가지 않는다", () => {
    const full = rec({
      method: `${LONG} 직접 만들었다`,
      result: "결과를 해석하고 판단했다 12명 30명",
      limitation: "표본 부족",
    });
    expect(computeFit(full, ctx()).score).toBe(100);
    const none = rec({ subjectGroup: "영어", subject: "영어" });
    expect(computeFit(none, ctx()).score).toBe(0);
  });
  it("정규화: same_subject 만 있고 too_short 이면 (18-10)/60*100 반올림", () => {
    expect(computeFit(rec(), ctx()).score).toBe(13);
  });
  it("reasons 에는 가점 신호 문장만 들어간다", () => {
    const r = computeFit(
      rec({ result: "해석했다", limitation: "한계" }),
      ctx(),
    );
    expect(r.reasons).toContain("결과에 대한 본인의 판단이 기록돼 있습니다");
    expect(r.reasons).toContain(
      "한계를 적어 두어 다음 단계로 이어지기 좋습니다",
    );
    expect(r.reasons.join("")).not.toContain("짧");
  });
  it("activityId 를 담는다", () => {
    expect(computeFit(rec({ id: "zz" }), ctx()).activityId).toBe("zz");
  });
});

describe("computeFit 성장설계 연동", () => {
  const base = rec({
    topic: "통계 해석 프로젝트",
    result: "표본 평균을 해석했다",
    method: "설문",
  });
  it("growthApplied 가 꺼져 있으면 연동 신호가 없다", () => {
    const r = computeFit(
      base,
      ctx({ growth: growth({ alignedSignals: ["통계 해석 활동"] }) }),
    );
    expect(r.signals.some((s) => s.key === "aligned_signal")).toBe(false);
  });
  it("aligned 는 신호당 +10, 합산 상한 40, 정규화하지 않는다", () => {
    const g = growth({ alignedSignals: ["통계 해석 활동", "표본 평균 이해"] });
    const off = computeFit(base, ctx());
    const on = computeFit(base, ctx({ growth: g, growthApplied: true }));
    const al = on.signals.find((s) => s.key === "aligned_signal");
    expect(al).toMatchObject({ hit: true, delta: 20 });
    const rawBase = off.signals.reduce((s, x) => s + x.delta, 0);
    expect(on.score).toBe(Math.max(0, Math.min(100, rawBase + 20)));
    expect(on.reasons.some((x) => x.includes("이번 방향의 핵심인"))).toBe(true);
  });
  it("aligned 상한은 40", () => {
    const g = growth({
      alignedSignals: [
        "통계 하나",
        "해석 둘",
        "표본 셋",
        "평균 넷",
        "설문 다섯",
        "프로젝트 여섯",
      ],
    });
    const al = computeFit(
      base,
      ctx({ growth: g, growthApplied: true }),
    ).signals.find((s) => s.key === "aligned_signal");
    expect(al?.delta).toBe(40);
  });
  it("conflicting 이 맞으면 -15", () => {
    const g = growth({ conflictingSignals: ["통계 위주 활동"] });
    const c = computeFit(
      base,
      ctx({ growth: g, growthApplied: true }),
    ).signals.find((s) => s.key === "conflicting_signal");
    expect(c).toMatchObject({ hit: true, delta: -15 });
  });
  it("부족 축 guideline 낱말이 있으면 fills_weak_axis +10 과 reason", () => {
    const g = growth({
      weakAxes: [
        {
          axis: "A",
          name: "교과",
          count: 0,
          required: 3,
          guideline: "통계 심화 탐구",
        },
      ],
    });
    const r = computeFit(base, ctx({ growth: g, growthApplied: true }));
    expect(r.signals.find((s) => s.key === "fills_weak_axis")).toMatchObject({
      hit: true,
      delta: 10,
    });
    expect(r.reasons).toContain(
      "성장설계가 지목한 부족 축을 채울 수 있는 기록입니다",
    );
  });
  it("연동 신호가 하나도 안 켜지면 정규화를 유지한다", () => {
    const g = growth({ alignedSignals: ["전혀 무관한 문장"] });
    const r = computeFit(rec(), ctx({ growth: g, growthApplied: true }));
    expect(r.score).toBe(13);
  });
  it("점수는 0~100 으로 클램프", () => {
    const full = rec({
      topic: "통계 해석",
      method: `${LONG} 직접 만들었다`,
      result: "해석 판단 12명 30명",
      limitation: "한계",
    });
    const g = growth({
      alignedSignals: ["통계 하나", "해석 둘", "판단 셋", "한계 넷"],
      weakAxes: [
        { axis: "A", name: "n", count: 0, required: 3, guideline: "통계 심화" },
      ],
    });
    expect(
      computeFit(full, ctx({ growth: g, growthApplied: true })).score,
    ).toBe(100);
  });
});
