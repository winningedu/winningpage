// "목표까지 남은 격차" 3행(내신 등급 · 모의고사 · 학습 시간) — 순수 함수, supabase
// 미의존. TMP 목표관리 서비스기획서 §3.16 근거: 좁혀야 할 거리를 숫자로 보여준다
// ("0.98등급 격차", "백분위 4.3점 격차" 류). 기준 대학은 항상 이상 목표다(§3.4
// "학습량 산출의 상한선") — 호출부(TargetUniversity.tsx)가 이상 목표 컷/현재값만
// 넘긴다. 이 모듈은 "어느 대학 기준인지"는 모른다 — 그 표시는 호출부가 카드 meta로
// 한 번만 얹는다(행마다 반복하지 않는다).
//
// 값이 없는 축은 계산 함수가 null을 반환하고, 조립 함수(buildGapRows)가 그 행을
// 결과 배열에서 아예 뺀다 — 억지 산출 금지(스펙 원칙).

export type GapRow = {
  label: string;
  description: string;
  remaining: string;
};

/** 부족/우위/정확히 도달 3분기 문구. diff는 "목표 - 현재" 방향이 아니라 각 gap
 * 함수가 이미 "부족이면 양수"로 정규화해 넘긴 값이다. */
function formatRemaining(diff: number, unit: string): string {
  if (diff === 0) return "목표 도달";
  const magnitude = Math.abs(diff);
  return diff > 0 ? `${magnitude}${unit} 부족` : `${magnitude}${unit} 우위`;
}

/**
 * 내신 격차 = 현재 환산등급 - 이상 목표 내신 컷(등급 1~9, 작을수록 우세).
 * 양수 = 부족(등급을 더 낮춰야 함), 음수 = 이미 목표보다 우세. 소수 둘째 자리 반올림
 * (온보딩 화면의 등급 표시 정밀도와 동일 — buildStudentPayload scores.convertedGrade).
 */
export function naesinGap(
  currentConvertedGrade: number | null,
  targetNaesinCut: number | null,
): number | null {
  if (currentConvertedGrade == null || targetNaesinCut == null) return null;
  return Math.round((currentConvertedGrade - targetNaesinCut) * 100) / 100;
}

/**
 * 모의고사 격차 = 목표 정시 컷(백분위 0~100, 클수록 우세) - 현재 백분위.
 * naesinGap과 부등호 방향이 정반대다 — 내신은 작을수록, 백분위는 클수록 우세하기
 * 때문에 "현재-목표"가 아니라 "목표-현재"로 스케일을 반전시켜야 두 함수 모두
 * "양수=부족"이라는 공통 계약을 지킬 수 있다(이 반전이 이 함수를 naesinGap과
 * 분리한 이유). 소수 첫째 자리 반올림(온보딩 백분위 표시 정밀도와 동일).
 */
export function mogoGap(
  currentMogoPercentile: number | null,
  targetJungsiCut: number | null,
): number | null {
  if (currentMogoPercentile == null || targetJungsiCut == null) return null;
  return Math.round((targetJungsiCut - currentMogoPercentile) * 10) / 10;
}

/**
 * 학습 시간 격차 = 목표 일일 학습 시간(targetDailyHours, 보통 weekIdeal÷7) - 최근
 * 실측 평균(recentAvgHours, GET /api/goal/student의 recentAvgStudyHours). 양수 =
 * 부족, 음수 = 우위. 소수 첫째 자리 반올림.
 */
export function studyGap(
  recentAvgHours: number | null,
  targetDailyHours: number | null,
): number | null {
  if (recentAvgHours == null || targetDailyHours == null) return null;
  return Math.round((targetDailyHours - recentAvgHours) * 10) / 10;
}

export type GapToTargetInputs = {
  naesin: { current: number | null; target: number | null };
  mogo: { current: number | null; target: number | null };
  study: { current: number | null; target: number | null };
};

/**
 * 3행 조립. 각 gap 값이 null이면(둘 중 하나라도 값이 없으면) 그 행 자체를 뺀다 —
 * 3행 전부 null이면 빈 배열을 반환하고, 호출부(GapToTargetCard 렌더 조건)가 카드
 * 자체를 숨긴다.
 */
export function buildGapRows(inputs: GapToTargetInputs): GapRow[] {
  const rows: (GapRow | null)[] = [
    buildNaesinRow(inputs.naesin.current, inputs.naesin.target),
    buildMogoRow(inputs.mogo.current, inputs.mogo.target),
    buildStudyRow(inputs.study.current, inputs.study.target),
  ];
  return rows.filter((row): row is GapRow => row !== null);
}

function buildNaesinRow(
  current: number | null,
  target: number | null,
): GapRow | null {
  const diff = naesinGap(current, target);
  if (diff == null || current == null || target == null) return null;
  return {
    label: "내신 등급",
    description: `현재 ${current.toFixed(2)}등급 → 목표 ${target.toFixed(2)}등급`,
    remaining: formatRemaining(diff, "등급"),
  };
}

function buildMogoRow(
  current: number | null,
  target: number | null,
): GapRow | null {
  const diff = mogoGap(current, target);
  if (diff == null || current == null || target == null) return null;
  return {
    label: "모의고사",
    description: `현재 ${current.toFixed(1)} 백분위 → 목표 ${target.toFixed(1)} 백분위`,
    remaining: formatRemaining(diff, ""),
  };
}

function buildStudyRow(
  current: number | null,
  target: number | null,
): GapRow | null {
  const diff = studyGap(current, target);
  if (diff == null || current == null || target == null) return null;
  return {
    label: "학습 시간",
    description: `현재 ${current.toFixed(1)}시간/일 → 목표 ${target.toFixed(1)}시간/일`,
    remaining: formatRemaining(diff, "시간"),
  };
}

// ---------------------------------------------------------------------------
// 3구간 확장(QA 행295) — 최소 목표 대학·이상 목표 대학이 서로 다른 컷을 갖는 축
// (내신·모의고사)만 대상이다. 학습 시간은 대학 컷이 아니라 학생 자신의 주간 목표
// 시간이라 최소/이상 이원 구조가 없어 대상에서 제외한다(studyGap/buildStudyRow를
// 그대로 둔다 — 호출부가 필요하면 buildGapRows로 학습 시간 행만 따로 뽑아 합친다).
//
// naesinGap/mogoGap을 그대로 재사용한다 — 두 함수 모두 이미 "양수=부족, 음수/0=우위"
// 계약으로 스케일을 정규화해 두었으므로(내신은 작을수록, 백분위는 클수록 우세), 최소
// 컷과 이상 컷 각각에 같은 함수를 두 번 호출하는 것만으로 3구간을 가른다 — 축마다
// 다시 부등호 방향을 판단할 필요가 없다.
// ---------------------------------------------------------------------------

type GapZone = "below-min" | "min-to-ideal" | "above-ideal";

export type ZoneGapRow = GapRow & { zone: GapZone; advice: string };

/** 구간별 규칙 기반 조언 한 줄(팀장 지시 a/b/c 그대로). */
const ZONE_ADVICE: Record<GapZone, string> = {
  "below-min": "기초 실력을 다지며 최소 목표 달성부터 노려보세요.",
  "min-to-ideal": "최소 목표는 달성했어요. 이상 목표에 도전해 보세요.",
  "above-ideal":
    "이상 목표를 넘어섰어요. 지금 페이스를 유지하거나 목표 상향을 검토해 보세요.",
};

/**
 * gapToMin/gapToIdeal은 naesinGap/mogoGap과 같은 부호 계약(양수=부족, 0/음수=도달·우위)을
 * 따르는 값이어야 한다. 이상 컷이 최소 컷보다 항상 더 까다롭다는 전제(호출부 데이터
 * 정합성)를 그대로 둔다 — 이 함수는 그 전제를 검증하지 않는다.
 */
function resolveZone(gapToMin: number, gapToIdeal: number): GapZone {
  if (gapToIdeal <= 0) return "above-ideal";
  if (gapToMin <= 0) return "min-to-ideal";
  return "below-min";
}

function zoneRemainingText(
  zone: GapZone,
  gapToMin: number,
  gapToIdeal: number,
  unit: string,
): string {
  if (zone === "below-min") {
    return `최소 목표까지 ${Math.abs(gapToMin)}${unit} 부족`;
  }
  if (zone === "min-to-ideal") {
    return `이상 목표까지 ${Math.abs(gapToIdeal)}${unit} 부족`;
  }
  // above-ideal: 0이면 정확히 이상 목표에 닿은 경우라 "0등급 여유"처럼 어색한 문구
  // 대신 formatRemaining과 같은 원칙("정확히 도달"은 별도 문구)을 따른다.
  return gapToIdeal === 0
    ? "이상 목표 도달"
    : `이상 목표보다 ${Math.abs(gapToIdeal)}${unit} 여유`;
}

type GapZoneAxisInput = {
  current: number | null;
  min: number | null;
  ideal: number | null;
};

function buildNaesinZoneRow(input: GapZoneAxisInput): ZoneGapRow | null {
  const { current, min, ideal } = input;
  const gapToMin = naesinGap(current, min);
  const gapToIdeal = naesinGap(current, ideal);
  if (gapToMin == null || gapToIdeal == null) return null;
  // naesinGap이 null이 아니면 current/min/ideal 전부 non-null이 보장된다(naesinGap 계약).
  const zone = resolveZone(gapToMin, gapToIdeal);
  return {
    label: "내신 등급",
    description: `현재 ${(current as number).toFixed(2)}등급 → 최소 ${(min as number).toFixed(2)}등급 / 이상 ${(ideal as number).toFixed(2)}등급`,
    remaining: zoneRemainingText(zone, gapToMin, gapToIdeal, "등급"),
    zone,
    advice: ZONE_ADVICE[zone],
  };
}

function buildMogoZoneRow(input: GapZoneAxisInput): ZoneGapRow | null {
  const { current, min, ideal } = input;
  const gapToMin = mogoGap(current, min);
  const gapToIdeal = mogoGap(current, ideal);
  if (gapToMin == null || gapToIdeal == null) return null;
  const zone = resolveZone(gapToMin, gapToIdeal);
  return {
    label: "모의고사",
    description: `현재 ${(current as number).toFixed(1)} 백분위 → 최소 ${(min as number).toFixed(1)} / 이상 ${(ideal as number).toFixed(1)} 백분위`,
    remaining: zoneRemainingText(zone, gapToMin, gapToIdeal, ""),
    zone,
    advice: ZONE_ADVICE[zone],
  };
}

export type GapZoneInputs = {
  naesin: GapZoneAxisInput;
  mogo: GapZoneAxisInput;
};

/**
 * 3구간 확장판 조립. 내신은 컷(normal/special)이 있는 대학만, 모의고사는 jungsi 컷이
 * 있는 대학만 행을 만든다 — min/ideal 어느 한쪽이라도 컷이 없으면(null) 그 축 자체를
 * 결과에서 뺀다(억지 산출 금지, buildGapRows와 같은 원칙).
 */
export function buildZoneGapRows(inputs: GapZoneInputs): ZoneGapRow[] {
  const rows: (ZoneGapRow | null)[] = [
    buildNaesinZoneRow(inputs.naesin),
    buildMogoZoneRow(inputs.mogo),
  ];
  return rows.filter((row): row is ZoneGapRow => row !== null);
}
