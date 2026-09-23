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
  appendProbabilityLog,
  buildStudentPayload,
  fetchProfileName,
  fetchStudentRow,
  fetchStudentStateRow,
  narrowGoalSession,
  openGoalSession,
  PAID_MESSAGE,
  upsertStudentRow,
} from "../_lib/goalRepo.js";
import { sendError } from "../_lib/httpResponse.js";
import {
  computeEngineDerivedFields,
  deriveMogo,
  deriveNaesin,
  deriveNaesinGroupAverages,
  isStoredNaesinAllNone,
  regenerateDirectionReports,
  validateMockExamInput,
  validateNaesinInput,
  validateTarget,
} from "./intake.js";

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
    return {
      error: {
        status: 403,
        body: { detail: "본인 정보만 수정할 수 있습니다." },
      },
    };
  }
  return {};
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * 요청 바디를 section별로 분기해 검증한다. 각 section의 실제 규칙(범위·필수값
 * 등)은 intake.ts의 validateTarget/validateNaesinInput/validateMockExamInput을
 * 그대로 위임한다 — 온보딩과 다른 규칙으로 갈리는 것을 막기 위해서다(파일 상단
 * 주석 참고). gradeLabel(고1/고2/고3)은 호출부가 학생의 기존 행에서 넘긴다 —
 * 학년 자체는 이 엔드포인트로 바꿀 수 없다.
 */
export function validateIntakeUpdateBody(body: unknown, gradeLabel: string) {
  if (!isPlainObject(body))
    return { error: fail("요청 본문이 올바르지 않습니다.") };

  if (body.section === "target") {
    const idealTarget = validateTarget(body.upperUniversity, "이상 목표");
    if (idealTarget.error) return { error: idealTarget.error };
    const minTarget = validateTarget(body.lowerUniversity, "최소 목표");
    if (minTarget.error) return { error: minTarget.error };
    return {
      value: {
        section: "target" as const,
        ideal: idealTarget.value,
        min: minTarget.value,
      },
    };
  }

  if (body.section === "naesin") {
    const naesinResult = validateNaesinInput(body.naesin, gradeLabel);
    if (naesinResult.error) return { error: naesinResult.error };
    return { value: { section: "naesin" as const, ...naesinResult.value } };
  }

  if (body.section === "mock") {
    const mockResult = validateMockExamInput(body.mockExam, gradeLabel);
    if (mockResult.error) return { error: mockResult.error };
    return { value: { section: "mock" as const, ...mockResult.value } };
  }

  return {
    error: fail(
      "수정할 항목(section)을 목표대학·내신·모의고사 중에서 선택해 주세요.",
    ),
  };
}

// ---------------------------------------------------------------------------
// 핸들러
// ---------------------------------------------------------------------------

function readBody(req: VercelRequest) {
  const body = req.body;
  if (typeof body !== "string") return body;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return sendError(res, "detail", 405, "Method not allowed");
  }

  try {
    // 1) 게이트 — 405 → 401 → 403 (intake.ts와 동일 규약).
    const session = await openGoalSession(req);
    if (session.error) {
      return sendError(
        res,
        "detail",
        session.error.status,
        session.error.body.detail as string,
      );
    }

    const { allowed } = session;
    if (!allowed) {
      return res.status(403).json({ detail: PAID_MESSAGE });
    }

    const { supabaseAdmin, profileId } = narrowGoalSession(session);

    const body = readBody(req);

    // 2) 다른 학생 id 방어.
    const ownCheck = ensureOwnProfile(
      isPlainObject(body) ? body.profileId : undefined,
      profileId,
    );
    if (ownCheck.error) {
      return res.status(ownCheck.error.status).json(ownCheck.error.body);
    }

    // 3) 온보딩을 아직 마치지 않은 학생은 고칠 대상 자체가 없다.
    const existing = await fetchStudentRow(supabaseAdmin, profileId);
    if (!existing?.onboarded_at) {
      return res.status(404).json({
        detail: "먼저 온보딩을 완료해 주세요.",
        reason: "not_onboarded",
      });
    }

    const gradeLabel: string = existing.grade; // 이미 '고1'/'고2'/'고3' 라벨(치환 없음).

    // 4) section별 입력 검증.
    const validated = validateIntakeUpdateBody(body, gradeLabel);
    if (validated.error) {
      return res.status(validated.error.status).json(validated.error.body);
    }
    const value = validated.value;

    // 5) 변경되지 않은 구간은 기존 행 값을 그대로 엔진 입력으로 되돌린다 — 세
    //    구간(목표대학·내신·모의고사) 중 하나만 와도 나머지 둘은 항상 필요하다
    //    (컷 재조회·확률 재계산이 세 값을 모두 요구하므로).
    const ideal =
      value.section === "target"
        ? value.ideal
        : {
            university: existing.ideal_university,
            department: existing.ideal_department,
          };
    const min =
      value.section === "target"
        ? value.min
        : {
            university: existing.min_university,
            department: existing.min_department,
          };

    const existingNaesinAllNone = isStoredNaesinAllNone(existing);
    const naesinDerived =
      value.section === "naesin"
        ? deriveNaesin({
            naesinAllNone: value.naesinAllNone,
            priorNaesinGrade: value.priorNaesinGrade,
            gradeLabel,
            naesinScale: value.naesinScale,
            naesinOverall: value.naesinOverall,
            selectedNaesinExam: value.selectedNaesinExam,
          })
        : {
            currentScore: existing.current_score,
            lastNaesinExam: existing.last_naesin_exam,
            remainNaesin: existing.remain_naesin,
          };
    const naesinAllNone =
      value.section === "naesin" ? value.naesinAllNone : existingNaesinAllNone;

    const mockDerived =
      value.section === "mock"
        ? deriveMogo({
            mockAllNone: value.mockAllNone,
            mockRounds: value.mockRounds,
            selectedMockRound: value.selectedMockRound,
            gradeLabel,
          })
        : {
            currentMogo: existing.current_mogo,
            lastMogoExam: existing.last_mogo_exam,
            remainMogo: existing.remain_mogo,
            resolvedRounds: undefined,
          };

    // 6~8) 온보딩과 완전히 같은 계산 경로 — computeEngineDerivedFields JSDoc 참고.
    //    weeklySchedule은 이 작업 범위 밖(자습 시간 편집 화면 없음)이라 기존 저장값을
    //    그대로 재사용한다 — buildInitialStudentState는 weeklySchedule을 요구만 할 뿐
    //    합격가능성(baseProbs)에는 관여하지 않는다(weekIdeal/weekMin 산출 전용).
    const now = new Date();
    const {
      cuts,
      missing,
      hasSusiCuts,
      hasJungsiCuts,
      state,
      baseProbsForStorage,
    } = await computeEngineDerivedFields(supabaseAdmin, {
      schoolType: existing.school_type,
      gradeLabel,
      naesinAllNone,
      currentScore: naesinDerived.currentScore,
      currentMogo: mockDerived.currentMogo,
      lastNaesinExam: naesinDerived.lastNaesinExam,
      lastMogoExam: mockDerived.lastMogoExam,
      remainNaesin: naesinDerived.remainNaesin,
      remainMogo: mockDerived.remainMogo,
      weeklySchedule: existing.study_schedule,
      ideal,
      min,
      now,
    });

    // 9) 컷 누락 — 이미 온보딩을 마친 학생을 다시 awaiting_cuts로 내리지 않는다
    //    (다른 화면들이 onboarded_at을 기준으로 접근을 허용하므로, 되돌리면
    //    자기 자신을 잠글 수 있다). 저장 전에 거절하고 기존 값은 그대로 둔다.
    if (!hasSusiCuts) {
      const susiMissing = missing.filter(
        (key) => key === "idealNaesin" || key === "minNaesin",
      );
      return res.status(422).json({
        detail: "목표 대학의 합격 기준 데이터가 아직 준비되지 않았습니다.",
        reason: "cut_not_found",
        missing: susiMissing,
      });
    }

    // 10) 저장 — profile_id만 걸고 나머지는 전부 이번에 실제로 바뀌는 컬럼만
    //     담는다. upsertStudentRow의 onConflict merge는 바디에 없는 컬럼을
    //     건드리지 않으므로 이 자체로 부분 업데이트가 된다.
    const rowUpdate: Record<string, unknown> = {
      profile_id: profileId,

      ideal_naesin_cut: cuts.idealNaesin,
      ideal_jungsi_cut: cuts.idealJungsi,
      min_naesin_cut: cuts.minNaesin,
      min_jungsi_cut: cuts.minJungsi,

      current_score: state.currentScore,
      converted_grade: state.convertedGrade,
      current_mogo: state.currentMogo,

      remain_naesin: state.remainNaesin,
      remain_mogo: state.remainMogo,
      last_naesin_exam: naesinDerived.lastNaesinExam,
      last_mogo_exam: mockDerived.lastMogoExam,

      base_ideal_susi: baseProbsForStorage.idealSusi,
      base_ideal_jungsi: baseProbsForStorage.idealJungsi,
      base_min_susi: baseProbsForStorage.minSusi,
      base_min_jungsi: baseProbsForStorage.minJungsi,

      rate_ideal_susi: hasSusiCuts ? state.rates.idealSusiBonus : null,
      rate_ideal_jungsi: hasJungsiCuts ? state.rates.idealJungsiBonus : null,
      rate_min_susi: hasSusiCuts ? state.rates.minSusiBonus : null,
      rate_min_jungsi: hasJungsiCuts ? state.rates.minJungsiBonus : null,
    };

    if (value.section === "target") {
      rowUpdate.ideal_university = value.ideal.university;
      rowUpdate.ideal_department = value.ideal.department;
      rowUpdate.min_university = value.min.university;
      rowUpdate.min_department = value.min.department;
    }

    if (value.section === "naesin") {
      rowUpdate.naesin_scores = {
        lastExam: value.naesinLastExamKey,
        scale: value.naesinScale,
        overall: value.naesinAllNone ? null : Number(value.naesinOverall),
        exams: value.naesinExams,
        groupAverages: deriveNaesinGroupAverages(
          value.naesinExams,
          value.selectedNaesinExam,
        ),
        ...(value.naesinAllNone
          ? { priorNaesinGrade: Number(value.priorNaesinGrade) }
          : {}),
      };
    }

    if (value.section === "mock") {
      rowUpdate.mock_exam_scores = {
        lastRound: value.mockLastRoundKey,
        track: value.mockTrack,
        rounds: mockDerived.resolvedRounds,
      };
    }

    const savedRow = await upsertStudentRow(supabaseAdmin, rowUpdate);

    // 11) 확률 스냅샷 — reason: "score_update"(goalRepo.ts ProbabilityLogReason,
    //     온보딩 이후 점수 수정 전용으로 이미 정의돼 있던 값).
    await appendProbabilityLog(
      supabaseAdmin,
      profileId,
      baseProbsForStorage,
      "score_update",
    );

    // 11-b) 학습방향 리포트("내 현재 위치") 재생성 — 팀장 결정(고객사 문구 "목표대학을
    //       변경하면 기존의 학습 data 반영이 새롭게 적용됩니다"가 그 의미다). target·
    //       naesin·mock 셋 중 무엇을 고쳤든 저장된 값이 바뀌었으므로 세 section 모두
    //       대상이다 — intake.ts와 같은 함수를 그대로 호출한다(재구현 금지, 실패 처리도
    //       intake.ts와 동일하게 이 catch 블록에 맡긴다).
    await regenerateDirectionReports(supabaseAdmin, profileId, savedRow);

    // 12) 응답 — GET /api/goal/student·POST /api/goal/intake와 완전히 같은 조립
    //     경로를 탄다(buildStudentPayload).
    const [stateRow, profileName] = await Promise.all([
      fetchStudentStateRow(supabaseAdmin, profileId),
      fetchProfileName(supabaseAdmin, profileId),
    ]);

    return res.status(200).json({
      ok: true,
      student: buildStudentPayload(
        savedRow,
        stateRow,
        state.schoolCutType,
        [],
        profileName,
      ),
    });
  } catch (error) {
    console.error("goal/intake-update error:", error);
    return sendError(res, "detail", 500, "처리 중 오류가 발생했습니다.");
  }
}
