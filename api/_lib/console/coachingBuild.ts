// 학생 한 명의 코칭 계산 한 벌(자료 읽기, 판정, 6축, 5대 역량, 문구). 코칭 조회와 서비스 상세가 같이 쓴다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { ymdIn } from "../../../src/lib/time/day.js";
import {
  coachingTypeOf,
  computeAxes,
  computeCompetencies,
  executionVerdict,
  indicatorsOf,
  learningVerdict,
  linkageVerdict,
  signalOf,
  urgencyOfAreas,
} from "./coaching.js";
import { loadCoachingData } from "./coachingData.js";
import { buildCoachingText } from "./coachingText.js";
import type { ServiceKey } from "./serviceUsage.js";

export async function buildCoaching(
  admin: SupabaseClient,
  studentId: string,
  used: ServiceKey[],
  enrollmentGrade: string | null,
  /** 보는 사람의 시간대. 접속 일수와 문구의 "이번 달"이 이 시간대의 날짜를 따른다. */
  viewerZone: string,
) {
  const data = await loadCoachingData(admin, studentId, used, viewerZone);
  const { metrics, targets } = data;
  const axesResult = computeAxes(metrics);
  const careerLink = axesResult.axes.find((a) => a.key === "careerLink");
  const week = metrics.goal?.week;
  const verdicts = {
    execution: executionVerdict({
      usesGoal: metrics.used.goal,
      daysSinceLastSeen: data.goalFacts?.daysSinceLastSeen ?? null,
      ...(week ? { week } : {}),
    }),
    learning: learningVerdict(
      data.diagnosisAreas?.version === "v3"
        ? {
            urgency: urgencyOfAreas(data.diagnosisAreas),
            executionAvg: data.diagnosisAreas.scores.page1.total,
          }
        : metrics.diagnosis
          ? {
              areas: metrics.diagnosis.areas,
              executionAvg: indicatorsOf(metrics).dxExecution.score as number,
            }
          : null,
    ),
    linkage: linkageVerdict(careerLink?.score ?? null),
  };
  const { signal, subLine } = signalOf(verdicts, axesResult.axes);

  const type = coachingTypeOf({
    verdicts,
    axes: axesResult.axes,
    achievementPct: week?.achievementPct ?? null,
    usesInquiry: metrics.used.inquiry,
  });
  const competencies = computeCompetencies(metrics);
  const text = buildCoachingText({
    grade: data.grade ?? enrollmentGrade,
    month: Number(ymdIn(new Date(), viewerZone).slice(5, 7)),
    department: targets?.ideal?.department || targets?.min?.department || null,
    metrics,
    axes: axesResult,
    competencies,
    verdicts,
    type,
    goal: data.goalFacts,
    pendingPerformance: data.pendingPerformance,
    inquiryTopic: data.inquiryTopic,
    inquiryStage: data.inquiryStage,
    selfevalStage: data.selfevalStage,
    targets,
    growthKeywords: data.growthKeywords,
    gradeCheck: null,
  });
  return {
    data,
    axesResult,
    verdicts,
    type,
    competencies,
    text,
    signal,
    subLine,
    week,
  };
}
