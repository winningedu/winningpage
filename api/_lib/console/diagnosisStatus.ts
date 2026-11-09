// 학습진단 현황(W8 학습진단 탭, W10 학습 실행 역량과 긴급도). 학생마다 가장 최근 리포트의 영역별 점수를 읽는다.
// 긴급도는 위닝에듀 리포트의 값이 아니라 결정 3 으로 다시 낸다: 12개 영역 중 가장 낮은 점수가 45 미만 매우 높음,
// 60 미만 높음, 70 미만 보통, 그 밖에 낮음. 스쿨멘토 콘솔에만 적용한다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { readAll } from "./directory.js";
import { kstDateOffset } from "./kstDate.js";

export type Urgency = "very_high" | "high" | "mid" | "low";

export interface DiagnosisStatus {
  urgency: Urgency | null;
  /** 학습 실행 역량 6영역 평균(반올림). */
  executionAvg: number | null;
  /** 학교생활 준비도 6영역 평균(반올림). */
  readinessAvg: number | null;
  /** 학습 실행 역량 6영역 중 가장 낮은 영역. */
  weakest: { name: string; score: number; status: string } | null;
  /** 진단일(KST, YYYY-MM-DD). */
  diagnosedAt: string;
}

const ID_CHUNK = 100;

export interface Area {
  name: string;
  score: number;
  status: string;
}

function areasOf(value: unknown): Area[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((a) => {
    const { name, score, status } = (a ?? {}) as Record<string, unknown>;
    return typeof name === "string" &&
      typeof score === "number" &&
      Number.isFinite(score)
      ? [{ name, score, status: typeof status === "string" ? status : "" }]
      : [];
  });
}

export const mean = (areas: Area[]) =>
  areas.length === 0
    ? null
    : Math.round(areas.reduce((s, a) => s + a.score, 0) / areas.length);

/** 긴급도 화면 문구. 모든 콘솔 화면이 이 한 곳의 이름을 쓴다. */
export const URGENCY_LABEL: Record<Urgency, string> = {
  low: "낮음",
  mid: "보통",
  high: "높음",
  very_high: "매우 높음",
};

export function urgencyOfLowest(lowest: number): Urgency {
  if (lowest < 45) return "very_high";
  if (lowest < 60) return "high";
  if (lowest < 70) return "mid";
  return "low";
}

/** 리포트 본문의 1쪽(학습 실행 역량)과 2쪽(준비도) 영역. 점수를 읽는 곳은 여기 하나다. */
export function reportAreas(payload: unknown): {
  page1: Area[];
  page2: Area[];
} {
  const body = (payload ?? {}) as {
    learningAxes?: unknown;
    readiness?: { areas?: unknown };
  };
  return {
    page1: areasOf(body.learningAxes),
    page2: areasOf(body.readiness?.areas),
  };
}

/** 리포트 본문에서 현황 값을 뽑는다. 영역 점수가 하나도 없으면 값은 모두 null 이다. */
export function summarizeReport(
  payload: unknown,
  diagnosedAt: string,
): DiagnosisStatus {
  const { page1, page2 } = reportAreas(payload);
  const all = [...page1, ...page2];
  const weakest = page1.reduce<Area | null>(
    (low, a) => (low === null || a.score < low.score ? a : low),
    null,
  );
  return {
    urgency:
      all.length === 0
        ? null
        : urgencyOfLowest(Math.min(...all.map((a) => a.score))),
    executionAvg: mean(page1),
    readinessAvg: mean(page2),
    weakest,
    diagnosedAt: kstDateOffset(new Date(diagnosedAt), 0),
  };
}

/** 학습진단 리포트가 있는 학생만 맵에 담는다. 같은 학생의 리포트가 여럿이면 진단일이 가장 늦은 것. */
export async function loadDiagnosisStatus(
  admin: SupabaseClient,
  studentIds: string[],
): Promise<Map<string, DiagnosisStatus>> {
  const latest = new Map<string, { diagnosedAt: string; payload: unknown }>();
  for (let i = 0; i < studentIds.length; i += ID_CHUNK) {
    const chunk = studentIds.slice(i, i + ID_CHUNK);
    const rows = await readAll<{
      profile_id: string;
      diagnosed_at: string;
      payload: unknown;
    }>(
      admin,
      "diagnosis_reports",
      "profile_id, diagnosed_at, payload",
      (q) => q.in("profile_id", chunk),
      "attempt_id",
    );
    for (const r of rows) {
      const seen = latest.get(r.profile_id);
      if (!seen || r.diagnosed_at > seen.diagnosedAt) {
        latest.set(r.profile_id, {
          diagnosedAt: r.diagnosed_at,
          payload: r.payload,
        });
      }
    }
  }
  return new Map(
    [...latest].map(([id, r]) => [
      id,
      summarizeReport(r.payload, r.diagnosedAt),
    ]),
  );
}
