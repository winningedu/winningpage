// diagnosisScoring 엔진 — 서비스 1순위(§8 CASE-05, Q-14 해소 fit 85.3 정본) · 콜멘토 감지 신호
// (Q-36 해소, 배점 분리) · 고3 6월 이후 서비스 2종 제한(F-06, Q-13).
// 원본: scripts/verify-diagnosis-scoring.mjs S8 · F-06 블록 · 고3 6월 이후 제한 블록.

import { expect, test } from "vitest";
import {
  SERVICE_CODES,
  SERVICE_GRADE_FILTER,
  SERVICE_H3_LATE_CODES,
  SERVICE_PART_CAPS,
} from "@/data/diagnosisScoringTable.ts";
import {
  detectEmotionalSignal,
  rankServices,
  roundHalfUp,
  serviceCandidates,
} from "@/lib/diagnosisScoring.ts";
import {
  getCase,
  makeAreaScores,
  makeInput,
} from "./diagnosisScoringTestFixtures.ts";

/* ================================================================== *
 * S8. §8 CASE-05 — 서비스 1순위 (Q-14 해소 — fit 85.3 정본)
 * ================================================================== */

const ex04 = getCase("EX-04");
// 05_예시는 입력 내역이 없고 "목표관리 73점"이라 적혀 있으나, 03_서비스추천 산식 계산값은
// 85.3 이다 — 05_예시는 문서 오기로 확정됐다(Q-14 해소, 사용자 확정). areaPart 는 예시의
// 4영역으로 고정되고, 어려움 3개 체크(50) + 희망 교집합(20) + 영역 15.3 을 그대로 쓴다.
const case05Input = makeInput({
  obstacles: ["OBS_01", "OBS_02", "OBS_03"],
  wishes: ["WISH_02"],
});
const case05Areas = makeAreaScores(60, ex04.input.areaScores);
const ranked05 = rankServices(case05Input, case05Areas);
const goalCare =
  ranked05.all.find((service) => service.code === "GOAL_CARE") ?? null;

test("1순위 = 위닝 목표관리", () => {
  expect(ranked05.rank1?.code ?? null).toEqual(ex04.expected.service);
});
test("fit = 85.3 (배점표 05_예시는 73점이라 적혀 있으나 산식 계산값은 85.3 — 산식 정본)", () => {
  expect(goalCare ? roundHalfUp(goalCare.fit, 1) : null).toEqual(
    ex04.expected.fit,
  );
});
test("tier = HIGH (fit 85.3 >= SERVICE_BANDS.HIGH=80)", () => {
  expect(goalCare?.tier ?? null).toEqual(ex04.expected.tier);
});
// 불변식은 산식 확정과 무관하게 항상 지켜야 한다(B-03).
test("전 서비스 fit <= 100 (A3 불변식)", () => {
  expect(ranked05.all.every((service) => service.fit <= 100)).toBe(true);
});
test("areaPart = 30 × (1 − mean(41,39,56,60)/100) = 15.3", () => {
  expect(goalCare ? roundHalfUp(goalCare.areaPart, 1) : null).toEqual(15.3);
});

// 콜멘토 difficultyPart — Q-36 해소(사용자 확정 2026-08-11)로 자유서술 감지 단어의 +10 가산이
// 점수 계산에서 완전히 빠졌다. OBS_10·11·12 는 항목 3개 = threshold 3개라 3/3 체크가 이미
// 50*3/3=50 이라 가산이 없어도 cap 이 발동할 여지가 없다(정확히 50).
const callMentorFull = rankServices(
  makeInput({ obstacles: ["OBS_10", "OBS_11", "OBS_12"] }),
  makeAreaScores(50),
).all.find((s) => s.code === "CALL_MENTOR");
test("콜멘토 3/3 체크 difficultyPart = 50", () => {
  expect(callMentorFull?.difficultyPart ?? null).toEqual(
    SERVICE_PART_CAPS.difficulty,
  );
});
test("콜멘토 fit <= 100", () => {
  expect((callMentorFull?.fit ?? 0) <= 100).toBe(true);
});

// cap 자체는 방어 로직으로 남는다(B-03) — 발동 사례는 threshold < items.length 인 서비스에서
// 본다. GOAL_CARE 는 9개 항목/threshold 3 이라 9/9 체크면 가산 없이도 50*9/3=150 이 나와
// cap 이 없으면 fit 이 100 을 넘긴다.
const overCheckedGoalCare = rankServices(
  makeInput({
    obstacles: [
      "OBS_01",
      "OBS_02",
      "OBS_03",
      "OBS_04",
      "OBS_05",
      "OBS_06",
      "OBS_07",
      "OBS_08",
      "OBS_09",
    ],
  }),
  makeAreaScores(50),
).all.find((s) => s.code === "GOAL_CARE");
test("GOAL_CARE 9/9 체크는 cap 50 으로 접힌다(방어 로직 회귀 방지)", () => {
  expect(overCheckedGoalCare?.difficultyPart ?? null).toEqual(
    SERVICE_PART_CAPS.difficulty,
  );
});
test("GOAL_CARE fit <= 100", () => {
  expect((overCheckedGoalCare?.fit ?? 0) <= 100).toBe(true);
});

// F-17(2026-08-12 확정, Q-14①② 종결) — 체크 1·2개(threshold 미만) 배분은 **비례 배분**으로
// 확정한다. all-or-nothing 이었다면 1·2개 체크는 difficultyPart=0 이어야 하는데, 실제로는 0이
// 아니라 threshold 대비 비례한 값이 나와야 한다(GOAL_CARE threshold=3).
// areaScores(0) + WISH_01 로 areaPart(30)·wishPart(20)를 채워 fit 이 SERVICE_BANDS.LOW(50) 를
// 넘게 만든다 — `.all` 은 tier != null(fit >= LOW) 인 서비스만 남기므로, 낮춰 두지 않으면
// difficultyPart 만 작은 1·2개 체크 케이스가 tier=null 로 걸러져 애초에 찾을 수 없다.
const goalCare1Check = rankServices(
  makeInput({ obstacles: ["OBS_01"], wishes: ["WISH_01"] }),
  makeAreaScores(0),
).all.find((s) => s.code === "GOAL_CARE");
const goalCare2Check = rankServices(
  makeInput({ obstacles: ["OBS_01", "OBS_02"], wishes: ["WISH_01"] }),
  makeAreaScores(0),
).all.find((s) => s.code === "GOAL_CARE");
test("F-17 — 1개 체크(threshold 3) = 50/3 비례 배분(all-or-nothing 이면 0)", () => {
  expect(roundHalfUp(goalCare1Check?.difficultyPart ?? -1, 2)).toEqual(
    roundHalfUp((SERVICE_PART_CAPS.difficulty * 1) / 3, 2),
  );
});
test("F-17 — 2개 체크(threshold 3) = 50×2/3 비례 배분(all-or-nothing 이면 0)", () => {
  expect(roundHalfUp(goalCare2Check?.difficultyPart ?? -1, 2)).toEqual(
    roundHalfUp((SERVICE_PART_CAPS.difficulty * 2) / 3, 2),
  );
});
test("F-17 — 1개 체크 < 2개 체크 < 3개 체크(단조 증가, 계단식 all-or-nothing 아님)", () => {
  expect(
    (goalCare1Check?.difficultyPart ?? 0) <
      (goalCare2Check?.difficultyPart ?? 0) &&
      (goalCare2Check?.difficultyPart ?? 0) < SERVICE_PART_CAPS.difficulty,
  ).toBe(true);
});

// Q-36 해소 — 자유서술 감지 단어(정탐·오탐·부정문 오탐 불문)는 콜멘토 적합도 점수에서 완전히
// 분리됐다. 후보에 남으려면 tier 가 있어야 하므로(fit >= 50) 체크 2개 + 영역 0점으로 구간 안에
// 들여놓고 q19 만 바꿔 가며 difficultyPart 가 흔들리지 않는지 본다.
const callMentorDifficulty = (text) =>
  rankServices(
    makeInput({ obstacles: ["OBS_10", "OBS_11"], freeText: text }),
    makeAreaScores(0),
  ).all.find((s) => s.code === "CALL_MENTOR")?.difficultyPart ?? null;
const keywordFreePart = callMentorDifficulty("오늘 날씨가 좋아요");
test("픽스처 전제: 감지 단어 없는 콜멘토가 후보에 남는다", () => {
  expect(keywordFreePart != null).toBe(true);
});
test("정탐 '요즘 너무 불안해요' 도 점수는 불변(배점 분리, 승격)", () => {
  expect(callMentorDifficulty("요즘 너무 불안해요")).toEqual(keywordFreePart);
});
test("오탐 '서울대 가고 싶어요' 도 점수는 불변(승격)", () => {
  expect(callMentorDifficulty("서울대 가고 싶어요")).toEqual(keywordFreePart);
});
test("오탐 '울산에서 통학해요' 도 점수는 불변(승격)", () => {
  expect(callMentorDifficulty("울산에서 통학해요")).toEqual(keywordFreePart);
});
test("부정문 오탐 '비교하지 않으려 해요' 도 점수는 불변(승격)", () => {
  expect(callMentorDifficulty("비교하지 않으려 해요")).toEqual(keywordFreePart);
});

// 감지 신호(signals.emotional, diagnosisReport 가 조립)는 점수와 분리된 별도 산출이다. 오탐을
// 포함해도 무방하다는 것이 이번 설계 의도다 — 후속 판정자(사람/LLM)가 '참고 후보'로 읽는다.
test("신호: 정탐 '요즘 너무 불안해요' → hit=true", () => {
  expect(detectEmotionalSignal("요즘 너무 불안해요").hit).toBe(true);
});
test("신호: '요즘 너무 불안해요' → matchedKeywords 에 '불안' 포함", () => {
  expect(
    detectEmotionalSignal("요즘 너무 불안해요").matchedKeywords.includes(
      "불안",
    ),
  ).toEqual(true);
});
test("신호: 오탐 '서울대 가고 싶어요' 도 hit=true('울' 매칭 — 오탐 특성 그대로)", () => {
  expect(detectEmotionalSignal("서울대 가고 싶어요").hit).toBe(true);
});
test("신호: 감지 단어 없으면 hit=false · matchedKeywords=[]", () => {
  expect(detectEmotionalSignal("오늘 날씨가 좋아요")).toEqual({
    hit: false,
    matchedKeywords: [],
  });
});
test("신호: freeText 빈 문자열도 hit=false", () => {
  expect(detectEmotionalSignal("")).toEqual({
    hit: false,
    matchedKeywords: [],
  });
});

// 전 서비스 fit < 50 → 카드 0장(SVC_NONE 경로). 만점 영역 + 무체크 + 무희망이면 fit 은 전부 0 이다.
const noneRanked = rankServices(makeInput(), makeAreaScores(100));
test("전 서비스 tier=null 이면 all = []", () => {
  expect(noneRanked.all).toEqual([]);
});
test("rank1 = null", () => {
  expect(noneRanked.rank1).toEqual(null);
});
test("rank2 = null", () => {
  expect(noneRanked.rank2).toEqual(null);
});

// 학년 필터 — M3·N수생은 2종만 후보다(배점표 1번).
const m3Ranked = rankServices(
  makeInput({
    profile: { name: null, gradeLevel: "M3", schoolType: null },
    obstacles: ["OBS_01", "OBS_02", "OBS_03"],
    difficulties: ["DIF_10"],
  }),
  makeAreaScores(20),
);
test("M3 후보는 목표관리·콜멘토 2종뿐", () => {
  expect(
    m3Ranked.all.every((service) =>
      ["GOAL_CARE", "CALL_MENTOR"].includes(service.code),
    ),
  ).toBe(true);
});
test("M3 에서 자기평가서(DIF_10 체크)는 후보에서 빠진다", () => {
  expect(!m3Ranked.all.some((s) => s.code === "SELF_REVIEW")).toBe(true);
});

/* ---- F-06 고3 6월 이후 서비스 2종 제한 (Q-13) ---- */

test("고3 5월 31일 진단 → 6종 전부", () => {
  expect(serviceCandidates("H3", "2026-05-31").codes.length).toEqual(6);
});
// diagnosedAt 은 서버가 회원 시간대로 정한 YYYY-MM-DD 다. 월은 그 문자열에서 시간대 없이 읽는다.
test("고3 6월 1일 진단 → 2종", () => {
  expect(serviceCandidates("H3", "2026-06-01").codes).toEqual(
    SERVICE_H3_LATE_CODES,
  );
});
test("시각이 붙은 문자열도 날짜 부분의 월을 그대로 읽는다(시간대 변환 없음)", () => {
  expect(serviceCandidates("H3", "2026-05-31T20:00:00Z").codes.length).toEqual(
    6,
  );
});
test("월 판정은 실행 환경 시간대와 무관하다", () => {
  const original = process.env.TZ;
  try {
    process.env.TZ = "America/Los_Angeles";
    expect(serviceCandidates("H3", "2026-06-01").codes).toEqual(
      SERVICE_H3_LATE_CODES,
    );
    expect(serviceCandidates("H3", "2026-05-31").codes.length).toEqual(6);
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});
test("고3 7월 진단 → 2종", () => {
  expect(serviceCandidates("H3", "2026-07-10").codes).toEqual(
    SERVICE_H3_LATE_CODES,
  );
});
test("고3 6월 이후 판정 사유가 남는다", () => {
  expect(serviceCandidates("H3", "2026-07-10").reason).toEqual("H3_LATE");
});
// fail-open — 시각을 못 읽었다는 이유로 학생의 선택지를 줄이지 않는다.
test("diagnosedAt 없음 → 6종 전부", () => {
  expect(serviceCandidates("H3", null).codes.length).toEqual(6);
});
test("diagnosedAt 파싱 실패 → 6종 전부", () => {
  expect(serviceCandidates("H3", "not-a-date").codes.length).toEqual(6);
});
test("H1 은 시점과 무관하게 6종", () => {
  expect(serviceCandidates("H1", "2026-07-10").codes.length).toEqual(6);
});
test("M3 는 기존 표 그대로 2종", () => {
  expect(serviceCandidates("M3", "2026-07-10").reason).toEqual("M3");
});

const h3LateRanked = rankServices(
  makeInput({
    profile: { name: null, gradeLevel: "H3", schoolType: null },
    meta: { schemaVersion: null, diagnosedAt: "2026-07-10" },
    obstacles: ["OBS_01", "OBS_02", "OBS_03"],
    difficulties: ["DIF_10"],
  }),
  makeAreaScores(20),
);
test("고3 6월 이후 후보는 목표관리·콜멘토 2종뿐", () => {
  expect(
    h3LateRanked.all.every((service) =>
      SERVICE_H3_LATE_CODES.includes(service.code),
    ),
  ).toBe(true);
});
test("rankServices 가 판정 사유를 함께 낸다", () => {
  expect(h3LateRanked.filterReason).toEqual("H3_LATE");
});

/* ================================================================== *
 * 2순위 게이트 폐기 (QA 시트 행 343, 2026-09-02 확정)
 * 종전엔 second.fit >= 65 && rank1.fit - second.fit <= 20 이어야만 2순위가 채워졌다. 후보(tier
 * 필터 통과분)가 2개 이상이면 격차·최소점 무관하게 항상 2순위를 채우도록 바뀌었다.
 * ================================================================== */

// GOAL_CARE fit=100(difficulty 50 + wish 20 + area 30), SELF_REVIEW fit=50(difficulty 50 만,
// 위시·영역 0) — 격차 50(>20 옛 상한 초과)·SELF_REVIEW 65 미만(옛 하한 미달)인데도 후보가 2개면
// rank2 가 채워져야 한다.
const gateRanked = rankServices(
  makeInput({
    obstacles: ["OBS_01", "OBS_02", "OBS_03"],
    difficulties: ["DIF_10"],
    wishes: ["WISH_02"],
  }),
  makeAreaScores(0, { RECORD: 100 }),
);
test("2순위 게이트 폐기 — 격차 50(옛 상한 20 초과)이어도 후보 2개면 rank2 채움", () => {
  expect(gateRanked.rank1?.code).toEqual("GOAL_CARE");
  expect(gateRanked.rank2?.code).toEqual("SELF_REVIEW");
});
test("2순위 게이트 폐기 — SELF_REVIEW fit 50(옛 하한 65 미달)이어도 rank2 로 채택", () => {
  expect(gateRanked.rank2?.fit).toEqual(50);
});

// 후보가 1개뿐이면(다른 서비스는 tier=null) 기존과 동일하게 rank2 는 null 이다.
const singleCandidateRanked = rankServices(
  makeInput({ obstacles: ["OBS_01", "OBS_02", "OBS_03"] }),
  makeAreaScores(100),
);
test("후보 1개뿐이면 rank2 는 여전히 null", () => {
  expect(singleCandidateRanked.all.length).toEqual(1);
  expect(singleCandidateRanked.rank1?.code).toEqual("GOAL_CARE");
  expect(singleCandidateRanked.rank2).toEqual(null);
});

/* ================================================================== *
 * 고3 6월 이후 제한 · 성적 흐름 · 등급 표기
 * ================================================================== */

test("고3 12월 진단도 2종(연말까지 제한이 이어진다)", () => {
  expect(serviceCandidates("H3", "2026-12-20T00:00:00Z").codes).toEqual(
    SERVICE_H3_LATE_CODES,
  );
});
test("제한 2종은 전체 서비스 코드의 부분집합", () => {
  expect(
    SERVICE_H3_LATE_CODES.every((code) => SERVICE_CODES.includes(code)),
  ).toBe(true);
});
test("제한은 정확히 2종", () => {
  expect(SERVICE_H3_LATE_CODES.length).toEqual(2);
});
// 표를 채우면 1~5월 진단자까지 잘린다 — 시점 분기는 serviceCandidates 가 소유해야 한다.
test("SERVICE_GRADE_FILTER.H3 는 null 유지(시점 분기를 표에 넣지 않는다)", () => {
  expect(SERVICE_GRADE_FILTER.H3).toEqual(null);
});
test("M3 제한 2종과 같은 조합", () => {
  expect([...SERVICE_H3_LATE_CODES].sort()).toEqual(
    [...SERVICE_GRADE_FILTER.M3].sort(),
  );
});
