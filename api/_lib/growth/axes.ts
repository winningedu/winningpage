// 성장설계 5축 판정 모듈(위닝 A~E, 명세 No.64~72, 103, 152).
// 활동이 어느 축의 근거인지 분류는 생성 6단계(모델)가 하고, 이 모듈은 결과를 세고 판정한다.

export type Axis = "A" | "B" | "C" | "D" | "E";
export type Grade = "고1" | "고2" | "고3";
export type AxisVerdict = "confirmed" | "caution" | "none";

export const AXES: readonly Axis[] = ["A", "B", "C", "D", "E"];

export const AXIS_NAMES: Record<Axis, string> = {
  A: "학업역량",
  B: "진로 및 전공적합성",
  C: "탐구 및 자기주도성",
  D: "공동체역량",
  E: "발전가능성",
};

export type AxisRequirement = {
  required: number;
  guideline: string;
  // B 고1 만 true(진로 강요 금지, No.67)
  optional?: boolean;
  // D 축 경고 문구(No.69)
  warning?: string;
};

const D_WARNING = "가장 비기 쉬운 축이라 3학년에 몰아서 만들 수 없다";

// No.66~70
export const AXIS_REQUIREMENTS: Record<Grade, Record<Axis, AxisRequirement>> = {
  고1: {
    A: { required: 3, guideline: "개념을 정확히 쓴 기록 3건" },
    B: { required: 1, guideline: "진로가 드러난 기록 1건(없어도 됨)", optional: true },
    C: { required: 2, guideline: "스스로 질문을 만든 기록 2건" },
    D: { required: 2, guideline: "모둠 역할 기록 2건", warning: D_WARNING },
    E: { required: 1, guideline: "방법이 하나여도 됨" },
  },
  고2: {
    A: { required: 5, guideline: "판단 근거로 쓴 기록 5건" },
    B: { required: 4, guideline: "진로가 드러난 기록 4건" },
    C: { required: 2, guideline: "기준을 스스로 정하거나 바꾼 기록 2건" },
    D: { required: 1, guideline: "학급 및 학년 단위 기여 기록 1건 이상", warning: D_WARNING },
    E: { required: 2, guideline: "방법이 두 종류 이상" },
  },
  고3: {
    A: { required: 3, guideline: "심화 개념을 다룬 기록 3건" },
    B: { required: 6, guideline: "진로가 드러난 기록 6건" },
    C: { required: 2, guideline: "한계를 인정하고 후속을 설계한 기록 2건" },
    D: { required: 1, guideline: "후배나 동료를 이끈 기록 1건", warning: D_WARNING },
    E: { required: 2, guideline: "같은 주제를 다른 방법으로 다시 다룬 기록" },
  },
};

export type AxisEvidence = { activityId: string; axis: Axis };
export type AxisCount = { count: number; activityIds: string[] };

// No.64, No.152: 활동 한 건은 여러 축의 근거가 될 수 있고, 같은 축에서는 중복 제거한다.
export function countAxisEvidence(evidence: AxisEvidence[]): Record<Axis, AxisCount> {
  const result: Record<Axis, AxisCount> = {
    A: { count: 0, activityIds: [] },
    B: { count: 0, activityIds: [] },
    C: { count: 0, activityIds: [] },
    D: { count: 0, activityIds: [] },
    E: { count: 0, activityIds: [] },
  };
  for (const { activityId, axis } of evidence) {
    const bucket = result[axis];
    if (bucket.activityIds.includes(activityId)) continue;
    bucket.activityIds.push(activityId);
    bucket.count += 1;
  }
  return result;
}

// No.65: 0건 아직 없음, required 이상 확인됨, 그 사이 주의.
export function judgeAxis(count: number, required: number): AxisVerdict {
  if (count <= 0) return "none";
  if (count >= required) return "confirmed";
  return "caution";
}

export const VERDICT_LABELS: Record<AxisVerdict, string> = {
  confirmed: "확인됨",
  caution: "주의",
  none: "아직 없음",
};

export type AxisEvaluation = {
  axis: Axis;
  name: string;
  count: number;
  required: number;
  verdict: AxisVerdict;
  verdictLabel: string;
  guideline: string;
  optional: boolean;
  warning?: string;
  activityIds: string[];
};

// gradeFilterIds 가 있으면 해당 학년 활동만 센다.
export function evaluateAxes(
  grade: Grade,
  evidence: AxisEvidence[],
  options?: { gradeFilterIds?: string[] },
): AxisEvaluation[] {
  const filter = options?.gradeFilterIds;
  const scoped = filter ? evidence.filter((e) => filter.includes(e.activityId)) : evidence;
  const counts = countAxisEvidence(scoped);
  return AXES.map((axis) => {
    const req = AXIS_REQUIREMENTS[grade][axis];
    const { count, activityIds } = counts[axis];
    const verdict = judgeAxis(count, req.required);
    return {
      axis,
      name: AXIS_NAMES[axis],
      count,
      required: req.required,
      verdict,
      verdictLabel: VERDICT_LABELS[verdict],
      guideline: req.guideline,
      optional: req.optional === true,
      ...(req.warning ? { warning: req.warning } : {}),
      activityIds,
    };
  });
}

// No.71: 3부 "반드시 필요한 다음 활동" 입력. 부족 건수가 큰 순, 동률은 축 순서 유지.
export function shortfalls(result: AxisEvaluation[]): AxisEvaluation[] {
  return result
    .filter((r) => r.verdict !== "confirmed" && !r.optional)
    .sort((a, b) => b.required - b.count - (a.required - a.count));
}

// 시안 "한눈에": count/required 비율이 가장 낮은 축. 동률이면 D 우선, 그 다음 알파벳.
export function weakestAxis(result: AxisEvaluation[]): AxisEvaluation | undefined {
  const rank = (a: Axis) => (a === "D" ? "" : a);
  return [...result].sort((a, b) => {
    const ra = a.count / a.required;
    const rb = b.count / b.required;
    if (ra !== rb) return ra - rb;
    return rank(a.axis).localeCompare(rank(b.axis));
  })[0];
}

// No.72: 위닝 5축이 대학 평가요소의 어디에 대응하는지(시안 2부 머리 표).
export const AXIS_TO_UNIVERSITY_FACTORS: Record<Axis, { factor: string; detail: string }> = {
  A: { factor: "학업역량", detail: "학업성취도, 학업태도" },
  B: { factor: "진로역량", detail: "계열 관련 교과 이수 노력, 계열 관련 교과 성취도" },
  C: { factor: "학업역량·진로역량", detail: "학업역량의 탐구력, 진로역량의 진로 탐색 활동과 경험" },
  D: { factor: "공동체역량", detail: "협업과 소통, 나눔과 배려, 성실성과 규칙준수, 리더십" },
  E: { factor: "세 역량 전반", detail: "세 역량 전반의 변화 추이. 공식 항목에는 없지만 성장 궤적을 보는 축" },
};

// No.103: 완료 시 변화 예측. 축별 건수에 추가분을 더해 다시 판정한다.
export function projectAxes(
  current: Record<Axis, number>,
  additions: { axis: Axis }[],
  grade: Grade,
): AxisEvaluation[] {
  const total: Record<Axis, number> = { ...current };
  for (const { axis } of additions) total[axis] += 1;
  return AXES.map((axis) => {
    const req = AXIS_REQUIREMENTS[grade][axis];
    const count = total[axis];
    const verdict = judgeAxis(count, req.required);
    return {
      axis,
      name: AXIS_NAMES[axis],
      count,
      required: req.required,
      verdict,
      verdictLabel: VERDICT_LABELS[verdict],
      guideline: req.guideline,
      optional: req.optional === true,
      ...(req.warning ? { warning: req.warning } : {}),
      activityIds: [],
    };
  });
}
