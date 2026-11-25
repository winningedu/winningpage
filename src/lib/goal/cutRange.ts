// goal_university_cuts.avg_cut 의 컷 종류별 허용 범위. 서버(api/_lib/goal)와 화면(엑셀 파서, 폼)이 같은 값을 본다.
// DB CHECK 는 두 스케일이 겹치는 1~9 구간의 혼입을 못 잡으므로 이 상수가 실질 방어선이다.

export type CutType = "normal" | "special" | "jungsi";

// goal_university_cuts_avg_cut_check 의 미러. normal, special 은 내신 등급, jungsi 는 백분위다.
export const GOAL_CUT_RANGE: Record<
  CutType,
  { min: number; max: number; unit: string; label: string }
> = {
  normal: {
    min: 1,
    max: 9,
    unit: "등급",
    label: "내신 등급 1~9 (작을수록 우세)",
  },
  special: {
    min: 1,
    max: 9,
    unit: "등급",
    label: "내신 등급 1~9 (작을수록 우세)",
  },
  jungsi: {
    min: 0,
    max: 100,
    unit: "백분위",
    label: "정시 백분위 0~100 (클수록 우세)",
  },
};
