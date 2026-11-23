// 05장 단계 카드 재료 읽기(명세 No.166, 167, 197, 202). 읽기 결과를 문장으로 바꾸는 순수 함수만 둔다.
// 값이 없으면 none, 읽기에 실패하면 error 이며 문장을 만들지 않는다.

import type { GrowthSnapshot } from "../types.js";
import { dotDate } from "./date.js";
import type { StageSource } from "./inputs.js";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** 학습진단 최신 완료 결과의 학생용 첫 줄(payload.headlineLines)과 진단일. */
export function diagnosisSource(
  row: { diagnosed_at: string; payload: unknown } | null,
): StageSource<{ sentence: string; date: string }> {
  if (row === null || !isRecord(row.payload)) return { state: "none" };
  const lines = row.payload.headlineLines;
  const first = Array.isArray(lines)
    ? lines.find((l): l is string => typeof l === "string" && l.trim() !== "")
    : undefined;
  if (first === undefined) return { state: "none" };
  return {
    state: "ok",
    value: { sentence: first.trim(), date: dotDate(row.diagnosed_at) },
  };
}

/** 목표관리 학기 목표 문장 칸이 없어 콘솔과 같은 이상, 최소 목표 대학과 학과를 쓴다. */
export function goalSource(
  row: {
    ideal_university: string | null;
    ideal_department: string | null;
    min_university: string | null;
    min_department: string | null;
  } | null,
): StageSource<{ sentence: string }> {
  if (row === null) return { state: "none" };
  const join = (u: string | null, d: string | null) =>
    `${u ?? ""} ${d ?? ""}`.trim();
  const ideal = join(row.ideal_university, row.ideal_department);
  const min = join(row.min_university, row.min_department);
  const parts = [
    ideal !== "" ? `이상 ${ideal}` : "",
    min !== "" ? `최소 ${min}` : "",
  ].filter((p) => p !== "");
  return parts.length === 0
    ? { state: "none" }
    : { state: "ok", value: { sentence: parts.join(", ") } };
}

/** 성장설계 현재 학년 소주제와 실행계획 과제 순서를 한 줄로. 순서를 지어 쓰지 않는다. */
export function growthSource(
  snapshot: GrowthSnapshot | null,
  gradeLabel: "고1" | "고2" | "고3" | null,
): StageSource<{ sentence: string }> {
  if (snapshot === null || gradeLabel === null) return { state: "none" };
  const sub = snapshot.gradeSubthemes.find((s) => s.grade === gradeLabel);
  if (sub === undefined) return { state: "none" };
  const plan = snapshot.planItems
    .map((p, i) => `${i + 1}. ${p.title}`)
    .join(", ");
  return {
    state: "ok",
    value: {
      sentence:
        plan === ""
          ? `${gradeLabel} 소주제 ${sub.text}`
          : `${gradeLabel} 소주제 ${sub.text}, 실행계획 ${plan}`,
    },
  };
}
