// 목표 등급 역산과 입결 대비(명세 No.7·78·80·81·156·157, 시안 1-14·3-10).
// 합격 가능성을 계산하지 않는다. 모든 출력은 위닝 내부 기준 참고 자료다.

export type AdmissionCut = { year: number; grade: number | null };

export type AdmissionComparison = {
  latest: number | null;
  diff: number | null;
  diffText: string | null;
  status: "within" | "gap" | "no_data";
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

// 입결 대비(No.80, 시안 1-14). 최신 연도 컷만 쓴다.
export function compareWithAdmission(input: {
  estimate: number | null;
  cuts: AdmissionCut[];
  label?: string;
}): AdmissionComparison {
  const valid = input.cuts.filter((c) => c.grade !== null);
  const latestCut = valid.reduce<AdmissionCut | null>(
    (best, c) => (best === null || c.year > best.year ? c : best),
    null,
  );
  const latest = latestCut?.grade ?? null;
  const diff =
    input.estimate === null || latest === null
      ? null
      : round2(input.estimate - latest);
  return {
    latest,
    diff,
    diffText: diff === null ? null : `${diff}등급`,
    status: diff === null ? "no_data" : diff <= 0 ? "within" : "gap",
  };
}

// 입결 옆에 항상 붙이는 고정 고지(No.78·80).
export const ADMISSION_DISCLAIMER =
  "입결은 참고 자료이며 합격 가능성을 뜻하지 않아요.";

export type BacksolveResult = {
  requiredAverage: number | null;
  reachable: boolean | null;
  basis: string;
  status: "ok" | "unreachable" | "no_data" | "already_met";
};

// 목표 등급 역산(No.81, No.156). 남은 학기 공통 평균 x 를 구한다.
export function backsolveTarget(input: {
  system: "five" | "nine";
  completed: { key: string; average: number; units?: number }[];
  remainingSemesters: { key: string; units?: number }[];
  targetCut: number;
  countedSemesters?: string[];
}): BacksolveResult {
  // 전형별 반영 학기 데이터가 없어 지정이 없으면 전 학기를 반영한다(가정).
  // 이수 단위가 없으면 모든 학기를 동일 가중 1 로 본다(가정).
  const counted = input.countedSemesters;
  const isCounted = (key: string): boolean =>
    counted === undefined || counted.includes(key);
  const weight = (u?: number): number => u ?? 1;
  const completed = input.completed.filter((c) => isCounted(c.key));
  const remaining = input.remainingSemesters.filter((c) => isCounted(c.key));
  const doneSum = completed.reduce(
    (a, c) => a + c.average * weight(c.units),
    0,
  );
  const doneUnits = completed.reduce((a, c) => a + weight(c.units), 0);
  const leftUnits = remaining.reduce((a, c) => a + weight(c.units), 0);
  const noResult = (
    status: BacksolveResult["status"],
    reachable: boolean | null,
    basis: string,
  ): BacksolveResult => ({ requiredAverage: null, reachable, basis, status });

  if (
    !Number.isFinite(input.targetCut) ||
    (completed.length === 0 && remaining.length === 0)
  ) {
    return noResult("no_data", null, "역산에 쓸 학기 정보가 아직 없어요");
  }
  // 남은 학기가 없으면 역산할 수 없으니 현재 평균과 목표만 비교한다.
  if (leftUnits === 0) {
    const current = doneSum / doneUnits;
    return current <= input.targetCut
      ? noResult(
          "already_met",
          true,
          "남은 학기 없이 현재 평균이 이미 목표 안에 있어요",
        )
      : noResult(
          "unreachable",
          false,
          "남은 학기가 없어 현재 평균으로는 목표에 닿지 않아요",
        );
  }
  const x = (input.targetCut * (doneUnits + leftUnits) - doneSum) / leftUnits;
  const requiredAverage = round2(x);
  const basis = `남은 학기 수와 이수 단위를 넣어 역산하면 ${requiredAverage}등급이 필요해요`;
  // 체계 최소(1등급)보다 낮은 값이 필요하면 그대로 적고 닿기 어렵다고 표시한다(No.156).
  if (x < 1)
    return { requiredAverage, reachable: false, basis, status: "unreachable" };
  return { requiredAverage, reachable: true, basis, status: "ok" };
}

export type TargetScheduleRow = {
  key: string;
  target: number | null;
  note: string | null;
};

// 3학년 2학기 행에만 붙는 고정 문구(시안 3-10).
const LAST_SEMESTER_KEY = "3-2";
const LAST_SEMESTER_NOTE = "교과전형이나 정시를 함께 볼 때만 반영돼요";

// 학기별 목표 표(시안 3-10). 남은 학기 공통 평균을 행마다 같은 값으로 보여준다.
export function targetScheduleRows(input: {
  remainingSemesters: { key: string }[];
  requiredAverage: number | null;
}): TargetScheduleRow[] {
  return input.remainingSemesters.map((s) => ({
    key: s.key,
    target: input.requiredAverage,
    note: s.key === LAST_SEMESTER_KEY ? LAST_SEMESTER_NOTE : null,
  }));
}
