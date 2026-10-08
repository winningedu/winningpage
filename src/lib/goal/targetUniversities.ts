// 목표 대학 이상/최소 2블록 매핑 — 대시보드 우측 레일(TargetUniversityRail)과 서브페이지
// "내 목표 대학"(TargetUniversity.tsx)이 공유한다. api/_lib/goal/repo.ts buildStudentPayload()
// 반환 shape 중 이 매핑이 실제로 읽는 필드만 입력으로 받는다(원래 pages/goal/Dashboard.tsx
// 로컬 함수였다 — mock 삭제 UoW로 공용 모듈 추출, 2026-08-20).

export type TargetUniversitiesInput = {
  jungsiAvailable: boolean;
  targets: {
    ideal: { university: string; department: string };
    min: { university: string; department: string };
  };
  probs: {
    idealSusi?: number | null;
    idealJungsi?: number | null;
    minSusi?: number | null;
    minJungsi?: number | null;
  };
};

/** null-safe 반올림, 확률 필드는 num()이 null을 낼 수 있어(§api/_lib/goal/repo.ts num()) 0으로 접는다. */
export function pctRound(value?: number | null) {
  return Math.round(value ?? 0);
}

export function mapTargetUniversities(student: TargetUniversitiesInput) {
  // jungsiAvailable(api/_lib/goal/repo.ts buildStudentPayload, §7-1-A)은 정시 컷 쌍(상한, 하한)이
  // 둘 다 있을 때만 true다 — 이상/최소 목표대학에 공통으로 적용되는 단일 플래그다.
  // false면 calcJeongsiProb 쪽 파이프라인이 이미 0을 낸다(pipeline.js:227-228)지만,
  // 그 0은 "가망 없음"이 아니라 "정시 컷 미확보"다. TargetUniversityRail의 RateRow가
  // 이 플래그로 값 자리를 "미산출"로 바꿔 실제 0%와 구분한다(이번 UoW가 메운 지점).
  const { jungsiAvailable } = student;
  return {
    upper: {
      label: "이상목표대학",
      university: student.targets.ideal.university,
      department: student.targets.ideal.department,
      susiRate: pctRound(student.probs.idealSusi),
      jeongsiRate: pctRound(student.probs.idealJungsi),
      jungsiAvailable,
    },
    lower: {
      label: "최소목표대학",
      university: student.targets.min.university,
      department: student.targets.min.department,
      susiRate: pctRound(student.probs.minSusi),
      jeongsiRate: pctRound(student.probs.minJungsi),
      jungsiAvailable,
    },
  };
}
