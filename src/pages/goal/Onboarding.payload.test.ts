import { describe, expect, it } from "vitest";
import {
  MOCK_FLOW,
  NAESIN_EXAM_FLOW,
} from "@/components/goal/onboarding/onboardingOptions";
import type {
  MockRoundState,
  NaesinExamState,
} from "@/context/GoalOnboardingContext";
import { buildMockRoundsPayload, buildNaesinExamsPayload } from "./Onboarding";

// 로컬 E2E 버그(팀장 지시) — 서버 방어(api/_routes/goal/intake.ts 표시 창 검증)와 별개로
// 클라이언트도 화면에 보이지 않는 빈/스테일 회차・시험을 굳이 payload에 실어 보내지
// 않아야 한다. 순수 함수 두 개만 직접 검증한다(intake.naesinMogo.test.ts의
// 서버 쪽 창 검증 테스트와 같은 창 규칙을 공유).

function emptyExam(): NaesinExamState {
  return {
    groups: {
      korean: { avg: "", subjects: [] },
    },
  };
}

function filledExam(avg = "2"): NaesinExamState {
  return { groups: { korean: { avg, subjects: [] } } };
}

describe("buildNaesinExamsPayload", () => {
  it("lastExam이 없음('')이면 빈 객체를 돌려준다", () => {
    expect(buildNaesinExamsPayload("", {})).toEqual({});
  });

  it("창(선택 시험 포함 역순 최대 3개) 안의 값 있는 시험만 남긴다", () => {
    const exams: Record<string, NaesinExamState> = {};
    for (const exam of NAESIN_EXAM_FLOW) exams[exam.key] = emptyExam();
    exams.g3_s2mid = filledExam("2"); // 선택(창 안)
    exams.g3_s1final = filledExam("3"); // 창 안, 값 있음
    exams.g1_s1mid = filledExam("4"); // 창 밖 — 값이 있어도 제외돼야 한다

    const payload = buildNaesinExamsPayload("g3_s2mid", exams);
    expect(Object.keys(payload).sort()).toEqual(["g3_s1final", "g3_s2mid"]);
    expect(payload.g1_s1mid).toBeUndefined();
  });

  it("창 안이어도 완전히 빈 시험은 제외한다", () => {
    const exams: Record<string, NaesinExamState> = {};
    for (const exam of NAESIN_EXAM_FLOW) exams[exam.key] = emptyExam();
    exams.g1_s1mid = filledExam("2");

    const payload = buildNaesinExamsPayload("g1_s1mid", exams);
    expect(Object.keys(payload)).toEqual(["g1_s1mid"]);
  });
});

function emptyRound(): MockRoundState {
  return {
    kor: { grade: "", pct: "" },
    math: { grade: "", pct: "" },
    eng: { grade: "" },
    tam1: { grade: "", pct: "" },
    tam2: { grade: "", pct: "" },
  };
}

function filledRound(grade = "3"): MockRoundState {
  return {
    kor: { grade, pct: "" },
    math: { grade, pct: "" },
    eng: { grade },
    tam1: { grade, pct: "" },
    tam2: { grade, pct: "" },
  };
}

describe("buildMockRoundsPayload", () => {
  it("lastRound가 없음('')이면 빈 객체를 돌려준다", () => {
    expect(buildMockRoundsPayload("", {})).toEqual({});
  });

  it("창(선택 회차 포함 역순 최대 3개) 안의 값 있는 회차만 남긴다 — 팀장 재현 payload", () => {
    const rounds: Record<string, MockRoundState> = {};
    for (const round of MOCK_FLOW) rounds[round.key] = emptyRound();
    rounds.g2_jun = filledRound("3"); // 선택(창 안)
    rounds.g1_mar = filledRound("5"); // 창 밖 스테일 데이터 — 제외돼야 한다

    const payload = buildMockRoundsPayload("g2_jun", rounds);
    expect(Object.keys(payload)).toEqual(["g2_jun"]);
    expect(payload.g1_mar).toBeUndefined();
    // g2_mar・g1_oct는 창 안이지만 완전히 비어 있어 제외된다.
    expect(payload.g2_mar).toBeUndefined();
    expect(payload.g1_oct).toBeUndefined();
  });
});
