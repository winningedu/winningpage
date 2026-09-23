// regenerateDirectionReports 회귀 테스트 — 고객사 문구("목표대학을 변경하면
// 기존의 학습 data 반영이 새롭게 적용됩니다") 근거. 온보딩(intake.ts)과 내 정보 수정 부분
// 업데이트(intake-update.ts) 둘 다 이 함수를 공유하므로, 저장 호출 계약(naesin·jungsi
// 각 1건, source_type='intake', source_label='내 현재 위치')만 여기서 고정한다. 실제
// DB I/O(saveGoalDirectionReport 내부)는 로컬 스택 QA 몫이라 그 함수만 mock한다.
import { beforeEach, describe, expect, it, vi } from "vitest";

const saveGoalDirectionReportMock = vi.fn().mockResolvedValue(undefined);

vi.mock("../_lib/goalRepo.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../_lib/goalRepo.js")>();
  return {
    ...actual,
    saveGoalDirectionReport: (...args: unknown[]) =>
      saveGoalDirectionReportMock(...args),
  };
});

describe("regenerateDirectionReports", () => {
  beforeEach(() => {
    saveGoalDirectionReportMock.mockClear();
  });

  it("naesin·jungsi 두 kind 각각 source_type='intake'·source_label='내 현재 위치'로 저장한다", async () => {
    const { regenerateDirectionReports } = await import("./intake.js");
    const supabaseAdminStub = {} as never;

    await regenerateDirectionReports(supabaseAdminStub, "profile-1", {
      grade: "고3",
      naesin_scores: { lastExam: "g3_s1mid", scale: 9, overall: 2, exams: {} },
      mock_exam_scores: { lastRound: "", track: "", rounds: {} },
      converted_grade: 2,
      current_mogo: 0,
    });

    expect(saveGoalDirectionReportMock).toHaveBeenCalledTimes(2);

    const kinds = saveGoalDirectionReportMock.mock.calls.map(
      (call) => (call[2] as { kind: string }).kind,
    );
    expect(kinds.sort()).toEqual(["jungsi", "naesin"]);

    for (const call of saveGoalDirectionReportMock.mock.calls) {
      expect(call[0]).toBe(supabaseAdminStub);
      expect(call[1]).toBe("profile-1");
      expect(call[2]).toMatchObject({
        sourceType: "intake",
        sourceLabel: "내 현재 위치",
      });
    }
  });
});
