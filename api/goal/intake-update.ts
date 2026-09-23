// POST /api/goal/intake-update
// Authorization: Bearer <access_token>
//
// 목표관리 온보딩 값(목표 대학·내신·모의고사) 중 한 구간만 부분 수정한다. 전체
// 재온보딩(관리자 전용 소프트 리셋, api/goal/admin/reset-student.ts)과는 별개다 —
// 여기는 학생 본인이 항목 하나를 고치는 경로다(QA 2차 시트 행25・31・32).
//
// 요청 바디:
//   { section: "target", upperUniversity: {university, department},
//                          lowerUniversity: {university, department} }
//   { section: "naesin", naesin: <온보딩 Step4Naesin과 같은 모양> }
//   { section: "mock",   mockExam: <온보딩 Step5MockExam과 같은 모양> }
//
// 검증·계산은 전부 intake.ts의 함수를 그대로 재사용한다(validateTarget/
// validateNaesinInput/validateMockExamInput/computeEngineDerivedFields) —
// 온보딩과 다른 규칙으로 갈리면 두 화면이 서로 다른 이야기를 하게 된다.
//
// 어떤 구간을 고치든 합격가능성(base_*/rate_*)을 항상 다시 계산한다 — 목표
// 대학뿐 아니라 내신·모의고사 원점수도 확률 계산의 직접 입력이라(currentScore/
// currentMogo), 하나만 갱신하고 확률을 그대로 두면 화면마다 다른 확률이 보인다.
// 다만 요일별 목표 학습시간(study_schedule/week_ideal/week_min)은 이 작업
// 범위 밖이라(자습 시간·하루 일과 편집 화면 없음) 건드리지 않는다 — 기존 저장값을
// buildInitialStudentState의 weeklySchedule 오버라이드로 그대로 재사용한다.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  computeEngineDerivedFields,
  deriveMogo,
  deriveNaesin,
  validateMockExamInput,
  validateNaesinInput,
  validateTarget,
} from "./intake.js";
import { buildGoalDirectionReport } from "../_lib/goalDirectionReport.js";
import {
  buildStudentPayload,
  fetchProfileName,
  fetchStudentRow,
  fetchStudentStateRow,
  narrowGoalSession,
  openGoalSession,
  PAID_MESSAGE,
  saveGoalDirectionReport,
  upsertStudentRow,
} from "../_lib/goalRepo.js";
import { sendError } from "../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

function fail(detail: string) {
  return { status: 400, body: { detail } };
}

/**
 * 요청 바디가 다른 학생의 profileId를 주장하면 403. 정상 경로는 profileId 자체를
 * 보내지 않는다 — 항상 세션(openGoalSession)에서 나온 본인 id만 쓴다. 이 검증은
 * 클라이언트 버그나 변조로 다른 학생 id를 실수로/의도로 실어 보내는 경우에 대한
 * 방어선이다.
 */
export function ensureOwnProfile(
  bodyProfileId: unknown,
  sessionProfileId: string,
): { error?: { status: number; body: { detail: string } } } {
  if (bodyProfileId == null) return {};
  if (String(bodyProfileId) !== sessionProfileId) {
    return { error: { status: 403, body: { detail: "본인 정보만 수정할 수 있습니다." } } };
  }
  return {};
}
