// 자기평가와 심화탐구 현황(W8 자기평가 탭, 심화탐구 탭). 학생마다 가장 최근 세션의 진행 단계와 진행률을 읽는다.
// 단계 이름은 위닝에듀 운영 구조(6단계)를 따른다(결정 14). 진행률은 끝낸 단계 수 / 6 이고 완료한 세션은 100 이다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { readAll } from "./directory.js";

export const SELFEVAL_STEPS = [
  "시작",
  "기본 입력",
  "활동 선택",
  "분석 확인",
  "생성 결과",
  "검증과 저장",
] as const;

export const INQUIRY_STEPS = [
  "정보 입력",
  "주제 추천",
  "설계 리포트",
  "보고서 작성",
  "평가 리포트",
  "확정과 저장",
] as const;

export interface SelfevalStatus {
  stage: string;
  progressPct: number;
}

export interface InquiryStatus {
  stage: string;
  topicConfirmed: boolean;
  progressPct: number;
}

const ID_CHUNK = 100;
const TOTAL = 6;

const pct = (finished: number) => Math.round((finished / TOTAL) * 100);

/** 세션 current_step(0~6)에서 끝낸 단계 수. 시작과 기본 입력은 1 이 되면 함께 끝난다. */
export function selfevalFinished(step: number): number {
  const s = Math.min(Math.max(step, 0), TOTAL);
  if (s === 0 || s === TOTAL) return s;
  return s === TOTAL - 1 ? s : s + 1;
}

async function latestSessions<
  Row extends { profile_id: string; updated_at: string },
>(
  admin: SupabaseClient,
  table: string,
  columns: string,
  studentIds: string[],
): Promise<Map<string, Row>> {
  const latest = new Map<string, Row>();
  for (let i = 0; i < studentIds.length; i += ID_CHUNK) {
    const chunk = studentIds.slice(i, i + ID_CHUNK);
    const rows = await readAll<Row>(admin, table, columns, (q) =>
      q.in("profile_id", chunk),
    );
    for (const r of rows) {
      const seen = latest.get(r.profile_id);
      if (!seen || r.updated_at > seen.updated_at) latest.set(r.profile_id, r);
    }
  }
  return latest;
}

/** 세션이 있는 학생만 맵에 담는다. */
export async function loadSelfevalStatus(
  admin: SupabaseClient,
  studentIds: string[],
): Promise<Map<string, SelfevalStatus>> {
  const sessions = await latestSessions<{
    profile_id: string;
    updated_at: string;
    status: string;
    current_step: number;
  }>(
    admin,
    "selfeval_sessions",
    "profile_id, updated_at, status, current_step",
    studentIds,
  );
  return new Map(
    [...sessions].map(([id, s]) => {
      const finished = selfevalFinished(s.current_step);
      return [
        id,
        {
          stage: SELFEVAL_STEPS[Math.min(finished, TOTAL - 1)] ?? "",
          progressPct: s.status === "completed" ? 100 : pct(finished),
        },
      ];
    }),
  );
}

/** 세션이 있는 학생만 맵에 담는다. */
export async function loadInquiryStatus(
  admin: SupabaseClient,
  studentIds: string[],
): Promise<Map<string, InquiryStatus>> {
  const sessions = await latestSessions<{
    profile_id: string;
    updated_at: string;
    status: string;
    current_step: number;
    selected_topic_id: string | null;
  }>(
    admin,
    "inquiry_sessions",
    "profile_id, updated_at, status, current_step, selected_topic_id",
    studentIds,
  );
  return new Map(
    [...sessions].map(([id, s]) => {
      const step = Math.min(Math.max(s.current_step, 1), TOTAL);
      return [
        id,
        {
          stage: INQUIRY_STEPS[step - 1] ?? "",
          topicConfirmed: s.selected_topic_id !== null,
          progressPct: s.status === "completed" ? 100 : pct(step - 1),
        },
      ];
    }),
  );
}
