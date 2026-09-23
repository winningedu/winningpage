// QA 2차 시트 행37·51 후속 — 성장 리포트 자기 열람 표지의 studentName은 새 fetch를
// 추가하지 않고 GoalAppLayout이 이미 구독하는 캐시(goalStudentQueryOptions)에서
// 파생된다. GoalSidebar.test.ts의 deriveDailyRecordDone과 같은 방침 — 페이지 전체
// (react-router/react-query/AuthProvider 의존)는 마운트하지 않고 순수 파생 함수만
// 검증한다.
import { describe, expect, it } from "vitest";
import type { FetchGoalStudentResult } from "@/lib/goalApi";
import { deriveGrowthReportStudentName } from "./GrowthReport";

describe("deriveGrowthReportStudentName", () => {
  it("kind:'onboarded'면 profile.name을 반환한다", () => {
    const result: FetchGoalStudentResult = {
      kind: "onboarded",
      student: {
        onboarded: true,
        status: "active",
        profile: {
          name: "김민준",
          schoolType: "고등학교",
          grade: "고2",
          schoolCutType: "9등급제",
        },
        targets: {
          ideal: {},
          min: {},
        },
        scores: {
          currentScore: null,
          convertedGrade: null,
          currentMogo: null,
          remainNaesin: null,
          remainMogo: null,
          lastNaesinExam: "",
          lastMogoExam: "",
        },
        baseProbs: {
          idealSusi: null,
          idealJungsi: null,
          minSusi: null,
          minJungsi: null,
        },
        rates: {
          idealSusiBonus: null,
          idealJungsiBonus: null,
          minSusiBonus: null,
          minJungsiBonus: null,
        },
        cumulativeBonus: {
          idealSusi: 0,
          idealJungsi: 0,
          minSusi: 0,
          minJungsi: 0,
        },
        probs: {
          idealSusi: null,
          idealJungsi: null,
          minSusi: null,
          minJungsi: null,
        },
        weeklySchedule: {},
        weekIdeal: 0,
        weekMin: 0,
        actualStartDate: null,
        recordCount: 0,
        // biome-ignore lint/suspicious/noExplicitAny: profile.name 외 나머지 GoalStudentPayload 필드는 픽스처 부담을 줄이려 any로 넓힌다.
      } as any,
    };

    expect(deriveGrowthReportStudentName(result)).toBe("김민준");
  });

  it("onboarded가 아니면 null을 반환한다(자리를 지어내지 않는다)", () => {
    expect(deriveGrowthReportStudentName({ kind: "not-onboarded" })).toBeNull();
    expect(deriveGrowthReportStudentName(undefined)).toBeNull();
  });
});
