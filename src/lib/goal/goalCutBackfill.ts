// goal_university_cuts 백필(H-2) — 순수 집계.
//
// 서버(api/_lib/goal/cutBackfill.ts)와 scripts/run-goal-cuts-backfill.mjs(1회
// 실행 백필 스크립트)가 이 모듈을 공유한다. **로직을 두 곳에 복제하지
// 않는다** — 복제하면 두 경로의 산출이 갈라지는 드리프트가 생긴다.
// 소스 조회는 DB 접근이라 서버 모듈로 옮겼다. 이 파일은 DB 를 만지지 않는다.

import { normalizeUniversityName } from "./universityNameNormalize.js";

// 🔴 백필 소스 필터의 핵심 축. 기회균형·농어촌·지역인재·특성화고·특수교육은
// **지원 자격이 제한된 전형**이라 일반 학생 기준으로 쓰면 컷이 비현실적으로
// 완화된다. 반면 추천형(학교장추천 등)은 자격제한 전형이 아니고, 일반·교과와
// 둘 다 있는 쌍의 평균 차이가 +0.059등급으로 사실상 동일하다 — 배제하면
// 762쌍이 종합 컷으로 폴백돼 normal 컷이 오히려 느슨해진다(명세 §3-D3).
export const GOAL_BACKFILL_SCREENING_CATEGORIES = ["일반", "추천형"];

export type GoalBackfillYearMode = "prefer2026" | "only2026" | "only2025";

export const GOAL_BACKFILL_YEAR_MODES: {
  value: GoalBackfillYearMode;
  label: string;
}[] = [
  { value: "prefer2026", label: "2026 우선(없으면 2025)" },
  { value: "only2026", label: "2026만" },
  { value: "only2025", label: "2025만" },
];

// admission_results 소스 행 — 서버 cutBackfill.ts 의 소스 조회 select 절
// "university_name, department_name, main_track, grade_70, result_year" 그대로.
export interface GoalBackfillSourceRow {
  university_name: string | null;
  department_name: string | null;
  main_track: string | null;
  grade_70: number | string | null;
  result_year: number | string | null;
}

function goalCutAverage(values: number[]): number | null {
  if (!values.length) return null;
  const sum = values.reduce((acc, v) => acc + v, 0);
  return Math.round((sum / values.length) * 100) / 100;
}

function goalCutQuantile(sorted: number[], q: number): number | null {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  // pos는 0~sorted.length-1 범위이므로 lo/hi 모두 유효 인덱스다.
  if (lo === hi) return sorted[lo]!;
  return (
    Math.round((sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo)) * 100) /
    100
  );
}

// goal_university_cuts_key(cut_type, university_key, department_key)와 같은 축.
// \u0000(NUL) 로 잇는 이유는 그 문자가 값에 섞일 수 없기 때문이다('::' 는 학과명에
// 나타날 수 있다).
export function goalCutConflictKey(
  cutType: string,
  universityKey: string,
  departmentKey: string,
): string {
  return `${cutType}\u0000${universityKey}\u0000${departmentKey}`;
}

type GoalCutType = "normal" | "special";

// goal_university_cuts upsert payload — 아래 computeGoalCutBackfill 헤더 주석의
// "정확히 8개 키" 규약과 동일.
export interface GoalCutBackfillPayload {
  cut_type: GoalCutType;
  university_key: string;
  university_name: string;
  department_key: string;
  department_name: string;
  avg_cut: number;
  source: "admission_results";
  source_year: number;
}

export interface GoalCutBackfillStats {
  universityCount: number;
  pairCount: number;
  totalRows: number;
  normalCount: number;
  specialCount: number;
  year2026Pairs: number;
  year2025Pairs: number;
  excludedStarPairs: number;
  excludedEmptyPairs: number;
  excludedNoTrackPairs: number;
  mergedCount: number;
  distribution: {
    min: number | null;
    p25: number | null;
    median: number | null;
    p75: number | null;
    max: number | null;
  };
  samples: GoalCutBackfillPayload[];
}

export interface GoalCutBackfillResult {
  payloads: GoalCutBackfillPayload[];
  stats: GoalCutBackfillStats;
}

interface GoalCutBackfillPairEntry {
  uni: string;
  dept: string;
  years: Map<number, { gyogwa: number[]; jonghap: number[] }>;
}

// 입결 소스 행 → 백필 payload + 미리보기 통계. 순수 함수다(DB 접근 없음).
//
// 유도 규칙(명세 §3-D3 확정):
//   - (btrim(대학명), btrim(학과명)) 별로 묶는다.
//   - 연도 폴백: 2026 행이 하나라도 있으면 2026 만, 없으면 2025.
//   - normal = 교과 avg(grade_70), 교과가 없으면 종합 avg.
//   - special = 종합 avg(grade_70), 종합이 없으면 교과 avg.
//     (일반고는 학생부교과, 특목·자사고는 학생부종합이 주 전형이다.
//      둘 다 있는 2,531쌍에서 종합 컷이 평균 +0.679등급 완화된다.)
//   - 소수 2자리 반올림. min/max 는 체계적 비관·낙관 편향을 준다.
//
// payload 에 싣는 키는 정확히 8개이고 **모든 행이 동일**하다 — PostgREST
// 는 배열 안 객체들의 키 집합이 다르면 누락 키를 default/null 로 해석한다.
// 🔴 is_active 와 note 는 싣지 않는다: 신규 행은 DB DEFAULT 를 받고, 기존
// 행은 관리자가 설정한 노출·메모가 그대로 남는다. 백필이 관리자 조치를
// 되돌리면 guideText 의 약속("노출을 끄면 온보딩에서도 사라집니다")을
// 백필이 깨는 셈이 된다(명세 §4-2-H-2 2단계).
export function computeGoalCutBackfill(
  sourceRows: GoalBackfillSourceRow[] | null | undefined,
  yearMode: GoalBackfillYearMode,
): GoalCutBackfillResult {
  const byPair = new Map<string, GoalCutBackfillPairEntry>();
  (sourceRows || []).forEach((r) => {
    const uni = normalizeUniversityName(String(r.university_name ?? "").trim());
    const dept = String(r.department_name ?? "").trim();
    if (!uni) return;
    const grade = Number(r.grade_70);
    if (!Number.isFinite(grade)) return;
    const year = Number(r.result_year);
    const pairKey = `${uni}\u0000${dept}`;
    let entry = byPair.get(pairKey);
    if (!entry) {
      entry = { uni, dept, years: new Map() };
      byPair.set(pairKey, entry);
    }
    let buckets = entry.years.get(year);
    if (!buckets) {
      buckets = { gyogwa: [], jonghap: [] };
      entry.years.set(year, buckets);
    }
    const track = String(r.main_track ?? "").trim();
    if (track === "교과") buckets.gyogwa.push(grade);
    else if (track === "종합") buckets.jonghap.push(grade);
  });

  let excludedStarPairs = 0;
  let excludedEmptyPairs = 0;
  let excludedNoTrackPairs = 0;
  let year2026Pairs = 0;
  let year2025Pairs = 0;
  const rawPayloads: GoalCutBackfillPayload[] = [];

  byPair.forEach((entry) => {
    // 학과명 정제 — 아래에 해당하면 행을 만들지 않는다(명세 §4-2-H-2 3단계).
    // 현재 데이터에서 둘 다 실효 0건이지만, 입결 재적재 대비 방어로 남긴다.
    if (entry.dept.includes("(*)")) {
      excludedStarPairs += 1;
      return;
    }
    if (!entry.dept) {
      excludedEmptyPairs += 1;
      return;
    }

    // 연도 선택은 "그 연도에 행이 있는가"가 아니라 **"그 연도에 교과·종합
    // 행이 있는가"**로 판정한다. 전자로 두면 2026 에 논술·실기 행만 있고
    // 2025 에 교과가 있는 조합이 폴백을 잃고 통째로 버려진다(2026 을 고른
    // 뒤 아래 normal/special 이 둘 다 null 이 되어 excludedNoTrackPairs 로
    // 빠진다). dev 실측으로 지금은 해당 조합 0건이지만(전체 6,641쌍 중
    // lost_fallback 0), 입결 재적재 때 실재하게 되는 잠복 결함이라 여기서
    // 막는다. 현재 데이터에서는 산출 결과가 바뀌지 않는다.
    const hasTrackRows = (year: number) => {
      const b = entry.years.get(year);
      return !!b && (b.gyogwa.length > 0 || b.jonghap.length > 0);
    };

    let usedYear: number | null = null;
    if (yearMode === "only2026") usedYear = hasTrackRows(2026) ? 2026 : null;
    else if (yearMode === "only2025")
      usedYear = hasTrackRows(2025) ? 2025 : null;
    else if (hasTrackRows(2026)) usedYear = 2026;
    else if (hasTrackRows(2025)) usedYear = 2025;
    if (usedYear === null) {
      // 어느 연도에도 교과·종합이 없는 쌍(논술·실기뿐). 연도 자체가 없어
      // 대상 밖인 쌍(only2026 모드에서 2026 행이 없는 등)과 구분해 센다.
      const inScope =
        yearMode === "only2026"
          ? entry.years.has(2026)
          : yearMode === "only2025"
            ? entry.years.has(2025)
            : entry.years.size > 0;
      if (inScope) excludedNoTrackPairs += 1;
      return;
    }

    const buckets = entry.years.get(usedYear);
    if (!buckets) return;
    const gyogwa = goalCutAverage(buckets.gyogwa);
    const jonghap = goalCutAverage(buckets.jonghap);
    const normal = gyogwa ?? jonghap;
    const special = jonghap ?? gyogwa;
    if (normal === null || special === null) {
      // main_track 이 논술·실기뿐인 쌍. 현재 데이터에서는 0건이다.
      excludedNoTrackPairs += 1;
      return;
    }

    if (usedYear === 2026) year2026Pairs += 1;
    else year2025Pairs += 1;

    // university_key := university_name, department_key := department_name.
    // 두 유일성 인덱스를 동치로 유지해야 upsert 가 안전하다(명세 §3-D5).
    (
      [
        ["normal", normal],
        ["special", special],
      ] as [GoalCutType, number][]
    ).forEach(([cutType, avgCut]) => {
      rawPayloads.push({
        cut_type: cutType,
        university_key: entry.uni,
        university_name: entry.uni,
        department_key: entry.dept,
        department_name: entry.dept,
        avg_cut: avgCut,
        source: "admission_results",
        source_year: usedYear,
      });
    });
  });

  // payload dedupe — 청크를 만들기 직전에 최종 중복을 병합한다. 한 청크
  // 안에 같은 (cut_type, university_key, department_key)가 두 번 들어가면
  // Postgres 가 21000 "ON CONFLICT DO UPDATE command cannot affect row a
  // second time" 로 **청크 전체를 실패시킨다**(dev 실측 확인). 현재
  // 데이터로는 충돌 0이지만 입결 재적재로 표기 변형이 들어오는 즉시
  // 재현되므로 방어를 둔다. 나중 항목이 앞 항목을 덮는다.
  const merged = new Map<string, GoalCutBackfillPayload>();
  let mergedCount = 0;
  rawPayloads.forEach((p) => {
    const key = goalCutConflictKey(
      p.cut_type,
      p.university_key,
      p.department_key,
    );
    if (merged.has(key)) mergedCount += 1;
    merged.set(key, p);
  });
  const payloads = Array.from(merged.values());

  const cutValues = payloads.map((p) => p.avg_cut).sort((a, b) => a - b);
  const universities = new Set(payloads.map((p) => p.university_key));
  const pairs = new Set(
    payloads.map((p) => `${p.university_key}\u0000${p.department_key}`),
  );
  const samples = payloads
    .slice()
    .sort(
      (a, b) =>
        a.university_name.localeCompare(b.university_name) ||
        a.department_name.localeCompare(b.department_name) ||
        a.cut_type.localeCompare(b.cut_type),
    )
    .slice(0, 20);

  return {
    payloads,
    stats: {
      universityCount: universities.size,
      pairCount: pairs.size,
      totalRows: payloads.length,
      normalCount: payloads.filter((p) => p.cut_type === "normal").length,
      specialCount: payloads.filter((p) => p.cut_type === "special").length,
      year2026Pairs,
      year2025Pairs,
      excludedStarPairs,
      excludedEmptyPairs,
      excludedNoTrackPairs,
      mergedCount,
      distribution: {
        min: cutValues[0] ?? null,
        p25: goalCutQuantile(cutValues, 0.25),
        median: goalCutQuantile(cutValues, 0.5),
        p75: goalCutQuantile(cutValues, 0.75),
        max: cutValues[cutValues.length - 1] ?? null,
      },
      samples,
    },
  };
}

// ---------------------------------------------------------------------------
// jungsi(정시) 백필 — 행296·332(QA3 §9-5 결정3). normal/special과 소스 필터·
// 집계축이 다르므로 별도 함수로 둔다(억지로 한 함수에 합치면 두 축의 조건이
// 서로 새는 위험이 더 크다).
//
//   - grade_70(내신 등급) 대신 percentile(모의고사 백분위)을 쓴다. 2026-09-02
//     dev 실측으로는 0행이지만(향후 xlsx 업로드로 채워질 컬럼,
//     admissionResultsBulkXlsx.ts가 이미 수용한다), 데이터가 들어오는 즉시
//     동작하도록 지금 이 경로를 열어 둔다 — 폴백 상수로 메우지 않는다.
//   - screening_category 필터가 없다. 일반/추천형만 남기는 위 필터는 "지원
//     자격 제한 전형이 수시 컷을 완화시키는" 문제였고(§3-D3), 정시는 수능
//     성적만으로 지원하는 전형이라 같은 왜곡 축이 없다.
//   - main_track(교과/종합) 구분이 없다 — jungsi 컷은 (대학, 학과)당 1개다.
//   - 연도 폴백은 yearMode 파라미터가 아니라 "그 쌍에서 percentile이 있는
//     가장 최근 result_year"를 그때그때 고른다(팀장 지시).
//   - 같은 (쌍, 연도)에 행이 여럿이면 평균(소수 2자리, goalCutAverage 재사용).
// ---------------------------------------------------------------------------

// admission_results 소스 행 — 서버 cutBackfill.ts 의 정시 소스 조회 select 절
// "university_name, department_name, percentile, result_year" 그대로.
export interface GoalJungsiBackfillSourceRow {
  university_name: string | null;
  department_name: string | null;
  percentile: number | string | null;
  result_year: number | string | null;
}

// goal_university_cuts upsert payload — cut_type이 항상 'jungsi'인 것만 다르고
// 나머지 7개 키는 GoalCutBackfillPayload와 동일한 규약(§ computeGoalCutBackfill
// 머리말 "정확히 8개 키" 주석과 동일한 이유).
interface GoalJungsiCutBackfillPayload {
  cut_type: "jungsi";
  university_key: string;
  university_name: string;
  department_key: string;
  department_name: string;
  avg_cut: number;
  source: "admission_results";
  source_year: number;
}

interface GoalJungsiCutBackfillStats {
  universityCount: number;
  pairCount: number;
  totalRows: number;
  excludedStarPairs: number;
  excludedEmptyPairs: number;
  mergedCount: number;
  distribution: {
    min: number | null;
    p25: number | null;
    median: number | null;
    p75: number | null;
    max: number | null;
  };
  samples: GoalJungsiCutBackfillPayload[];
}

export interface GoalJungsiCutBackfillResult {
  payloads: GoalJungsiCutBackfillPayload[];
  stats: GoalJungsiCutBackfillStats;
}

interface GoalJungsiBackfillPairEntry {
  uni: string;
  dept: string;
  years: Map<number, number[]>;
}

// jungsi 입결 소스 행 → 백필 payload + 미리보기 통계. 순수 함수다(DB 접근 없음).
export function computeGoalJungsiCutBackfill(
  sourceRows: GoalJungsiBackfillSourceRow[] | null | undefined,
): GoalJungsiCutBackfillResult {
  const byPair = new Map<string, GoalJungsiBackfillPairEntry>();
  (sourceRows || []).forEach((r) => {
    const uni = normalizeUniversityName(String(r.university_name ?? "").trim());
    const dept = String(r.department_name ?? "").trim();
    if (!uni) return;
    // NOTE: Number(null) === 0 이라 곧장 Number() 변환하면 "값 없음"이 "백분위
    // 0"(합법 값, admin/configs/goal.ts:227 주석과 같은 함정)으로 둔갑한다.
    // null/undefined/빈 문자열을 먼저 걸러 그 오염을 막는다.
    if (
      r.percentile === null ||
      r.percentile === undefined ||
      r.percentile === ""
    )
      return;
    const percentile = Number(r.percentile);
    if (!Number.isFinite(percentile)) return;
    const year = Number(r.result_year);
    if (!Number.isFinite(year)) return;
    const pairKey = `${uni}\u0000${dept}`;
    let entry = byPair.get(pairKey);
    if (!entry) {
      entry = { uni, dept, years: new Map() };
      byPair.set(pairKey, entry);
    }
    let bucket = entry.years.get(year);
    if (!bucket) {
      bucket = [];
      entry.years.set(year, bucket);
    }
    bucket.push(percentile);
  });

  let excludedStarPairs = 0;
  let excludedEmptyPairs = 0;
  const rawPayloads: GoalJungsiCutBackfillPayload[] = [];

  byPair.forEach((entry) => {
    // normal/special 경로와 같은 학과명 방어(위 computeGoalCutBackfill 3단계 주석).
    if (entry.dept.includes("(*)")) {
      excludedStarPairs += 1;
      return;
    }
    if (!entry.dept) {
      excludedEmptyPairs += 1;
      return;
    }

    // 최신 result_year 우선(팀장 지시) — 그 쌍에서 percentile이 존재하는 연도 중 최댓값.
    const latestYear = Math.max(...entry.years.keys());
    const values = entry.years.get(latestYear)!;
    const avgCut = goalCutAverage(values);
    if (avgCut === null) return;

    rawPayloads.push({
      cut_type: "jungsi",
      university_key: entry.uni,
      university_name: entry.uni,
      department_key: entry.dept,
      department_name: entry.dept,
      avg_cut: avgCut,
      source: "admission_results",
      source_year: latestYear,
    });
  });

  // 같은 dedupe 규약(위 computeGoalCutBackfill 머리말 참고) — 한 청크 안 중복
  // (cut_type, university_key, department_key)는 PostgREST 21000으로 청크
  // 전체를 실패시키므로 여기서 미리 병합한다. 나중 항목이 앞 항목을 덮는다.
  const merged = new Map<string, GoalJungsiCutBackfillPayload>();
  let mergedCount = 0;
  rawPayloads.forEach((p) => {
    const key = goalCutConflictKey(
      p.cut_type,
      p.university_key,
      p.department_key,
    );
    if (merged.has(key)) mergedCount += 1;
    merged.set(key, p);
  });
  const payloads = Array.from(merged.values());

  const cutValues = payloads.map((p) => p.avg_cut).sort((a, b) => a - b);
  const universities = new Set(payloads.map((p) => p.university_key));
  const pairs = new Set(
    payloads.map((p) => `${p.university_key}\u0000${p.department_key}`),
  );
  const samples = payloads
    .slice()
    .sort(
      (a, b) =>
        a.university_name.localeCompare(b.university_name) ||
        a.department_name.localeCompare(b.department_name),
    )
    .slice(0, 20);

  return {
    payloads,
    stats: {
      universityCount: universities.size,
      pairCount: pairs.size,
      totalRows: payloads.length,
      excludedStarPairs,
      excludedEmptyPairs,
      mergedCount,
      distribution: {
        min: cutValues[0] ?? null,
        p25: goalCutQuantile(cutValues, 0.25),
        median: goalCutQuantile(cutValues, 0.5),
        p75: goalCutQuantile(cutValues, 0.75),
        max: cutValues[cutValues.length - 1] ?? null,
      },
      samples,
    },
  };
}
