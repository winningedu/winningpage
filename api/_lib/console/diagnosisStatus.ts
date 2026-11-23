// 학습진단 현황(W8 학습진단 탭, W10 학습 실행 역량과 긴급도). 학생마다 가장 최근 리포트의 영역별 점수를 읽는다.
// 긴급도는 위닝에듀 리포트의 값이 아니라 결정 3 으로 다시 낸다: 12개 영역 중 가장 낮은 점수가 45 미만 매우 높음,
// 60 미만 높음, 70 미만 보통, 그 밖에 낮음. 스쿨멘토 콘솔에만 적용한다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { AREAS } from "../../../src/lib/diagnosis-v3/codes.js";
import { sheetRows, textCell } from "../../../src/lib/diagnosis-v3/sheet.js";
import {
  type AreaScore,
  type AreaState,
  type DiagnosisV3Scores,
  SCHEMA_VERSION,
} from "../../../src/lib/diagnosis-v3/types.js";
import { readAll } from "./directory.js";

export type Urgency = "very_high" | "high" | "mid" | "low";

export interface DiagnosisStatus {
  urgency: Urgency | null;
  /** 학습 실행 역량 6영역 평균(반올림). */
  executionAvg: number | null;
  /** 학교생활 준비도 6영역 평균(반올림). */
  readinessAvg: number | null;
  /** 학습 실행 역량 6영역 중 가장 낮은 영역. */
  weakest: { name: string; score: number; status: string } | null;
  /** 진단 시각(ISO Z). */
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

const mean = (areas: Area[]) =>
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

/** v3 URG_L1..L4 (07 URG, copy 04 URG_L1..L4: 낮음, 보통, 높음, 매우 높음) to the console's four steps. */
const URGENCY_OF_LEVEL: Record<DiagnosisV3Scores["urgency"]["level"], Urgency> =
  { L1: "low", L2: "mid", L3: "high", L4: "very_high" };

/** v3 payload 의 scores. 버전 표식이 v3 가 아니거나 scores 가 비면 null(옛 payload 는 라벨로 읽는다). */
export function v3ScoresOf(payload: unknown): DiagnosisV3Scores | null {
  const body = (payload ?? {}) as { version?: unknown; scores?: unknown };
  if (body.version !== SCHEMA_VERSION) return null;
  const s = body.scores as Partial<DiagnosisV3Scores> | undefined;
  return s?.page1 && s.page2 && s.urgency ? (s as DiagnosisV3Scores) : null;
}

/** 긴급도는 엔진이 저장한 URG 단계를 그대로 쓴다. 콘솔 규칙을 다시 적용하지 않는다. */
export const urgencyOfV3 = (scores: DiagnosisV3Scores): Urgency =>
  URGENCY_OF_LEVEL[scores.urgency.level];

// 06_임계값 r20-r23 column B: "PAGE1 <label> / PAGE2 <label>", highest state first.
const STATE_ROWS: Record<AreaState, number> = {
  TOP: 20,
  MID: 21,
  LOW: 22,
  WEAK: 23,
};
const STATE_LABELS = Object.fromEntries(
  Object.entries(STATE_ROWS).map(([state, r]) => {
    const row = sheetRows("06_임계값").find((x) => x.r === r);
    const m = /^PAGE1 (.+) \/ PAGE2 (.+)$/.exec(row ? textCell(row, 1) : "");
    if (!m) throw new Error(`06_임계값 r${r} state label`);
    return [state, { page1: m[1] as string, page2: m[2] as string }];
  }),
) as Record<AreaState, { page1: string; page2: string }>;

/** 영역 상태 라벨. MIND 는 PAGE1 라벨을 쓴다(06 r19). */
export const stateLabel = (state: AreaState, page: "page1" | "page2") =>
  STATE_LABELS[state][page];

/** v3 한 영역을 현황 줄로(영역명은 05_영역설정 B). */
const v3Area = (
  code: keyof typeof AREAS,
  area: AreaScore,
  page: "page1" | "page2",
): Area => ({
  name: AREAS[code].label,
  score: area.score,
  status: stateLabel(area.state, page),
});

function summarizeV3(scores: DiagnosisV3Scores, diagnosedAt: string) {
  const first = scores.page1.order[0];
  return {
    urgency: urgencyOfV3(scores),
    executionAvg: Math.round(scores.page1.total),
    readinessAvg: Math.round(scores.page2.total),
    weakest: first ? v3Area(first, scores.page1.areas[first], "page1") : null,
    diagnosedAt: new Date(diagnosedAt).toISOString(),
  };
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
  const v3 = v3ScoresOf(payload);
  if (v3) return summarizeV3(v3, diagnosedAt);
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
    diagnosedAt: new Date(diagnosedAt).toISOString(),
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
