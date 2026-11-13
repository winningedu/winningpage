// 성적 관리(#35) + 대시보드 모의고사/내신 카드가 공유하는 순수 파생 함수.
//
// api/_routes/goal/grades.js 의 회차 레코드({term, value, subjects, ...})를 화면이 쓰는 두 모양으로
// 바꾼다: GoalTable 행(과목별 값 + 평균), KPI/이력 카드용 "최신값·직전 대비 증감".
//
// ⚠ 여기 있는 산술은 전부 단순 뺄셈·평균이다. src/lib/goal/calc/ 의 확률 파이프라인과는
// 무관하다 — 성적 기록 UoW 스코프(팀장 확정)가 "확률 재계산 없음"이라 calc 모듈을 아예
// import 하지 않는다.

// api/_routes/goal/grades.js 회차 레코드 — 호출부(NaesinCard/MockExamCard)가 각자 로컬 타입을
// 이미 선언해 쓰고 있어(예: MockGradeRecord) 여기서는 이 모듈이 실제로 읽는 필드만
// 최소 구조로 잡는다(넓은 index signature 로 호출부의 로컬 타입과 구조적으로 호환된다).
interface GoalGradeRecordLike {
  term: string;
  value: number;
  subjects?: {
    korean?: number | string;
    math?: number | string;
    english?: number | string;
    science?: number | string;
  };
  [key: string]: unknown;
}

export function round1(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 10) / 10;
}

/**
 * 회차 자연 순서(응시/입력 시점) 정렬 키 — 모의고사는 examDate, 내신은 enteredAt을 쓴다
 * (api/_routes/goal/grades.ts validateEntry가 채우는 필드, 둘 중 하나만 존재). 둘 다 없는
 * 방어적 상황(레거시 데이터)에서는 recordedAt(저장 시각)으로 대체한다.
 */
function examOrderKey(record: GoalGradeRecordLike): string {
  const examDate = record.examDate as string | undefined;
  const enteredAt = record.enteredAt as string | undefined;
  const recordedAt = record.recordedAt as string | undefined;
  return examDate || enteredAt || recordedAt || "";
}

/**
 * QA 행288 — latestKpi()/recentHistory()가 배열의 "마지막 원소"를 최신으로 간주해 왔는데,
 * api/_routes/goal/grades.ts upsertRecord()는 회차를 그냥 배열 끝에 append한다. 사용자가 회차를
 * 시간순과 다르게(예: 지난 시험을 나중에 추가) 입력하면 증감이 뒤바뀐다.
 *
 * 회차 라벨(term)은 내신은 자유 입력이라 정렬 키로 못 쓴다("고1 3월" 같은 상수 목록이
 * 없다) — 모의고사도 회차 목록 상수(MOCK_EXAM_ROUNDS)가 매년 갱신되는 "올해 4건" 드롭다운
 * 옵션이라 여러 학년·연도에 걸친 기록을 정렬하는 데는 못 쓴다(연도가 바뀌면 과거 라벨이
 * 그 상수에 아예 없다). 대신 각 회차가 실제로 갖고 있는 날짜 필드(examDate/enteredAt, 응시·
 * 입력 시점 그 자체)로 정렬한다 — 이 값이야말로 "회차의 자연 순서"다.
 *
 * 저장 배열이 이미 정렬돼 있어도(신규 저장은 upsertRecord가 정렬해 넣는다) 과거에 뒤섞인
 * 채 저장된 기존 데이터를 매 읽기마다 복구하기 위해 항상 다시 정렬한다(읽기 시 정렬은
 * 생략 불가 — 임무 지시). 같은 날짜는 원 배열 순서를 유지한다(Array.prototype.sort는
 * stable).
 */
export function sortByExamOrder<T extends GoalGradeRecordLike>(
  records: T[] | null | undefined,
): T[] {
  const list = records || [];
  return [...list].sort((a, b) =>
    examOrderKey(a).localeCompare(examOrderKey(b)),
  );
}

/** api/_routes/goal/grades.js 회차 레코드 배열 → GoalTable rows({term, korean, math, english, science, average}). */
export function toTableRows(records: GoalGradeRecordLike[] | null | undefined) {
  return (records || []).map((record) => ({
    term: record.term,
    korean: record.subjects?.korean,
    math: record.subjects?.math,
    english: record.subjects?.english,
    science: record.subjects?.science,
    average: record.value,
  }));
}

/**
 * KPI 게이지 카드용 "현재 값" — 기록된 회차가 있으면 가장 최근 회차, 없으면 온보딩
 * 베이스라인(goal_students.current_score/current_mogo, fetchGoalStudent()가 이미 갖고
 * 있다)으로 대체한다. 회차를 하나도 추가하지 않은 학생도 카드가 빈 값으로 뜨지 않게 하려는
 * 것이다(온보딩 시점 값은 실데이터이지 목업이 아니다).
 *
 * delta(직전 대비 증감)는 "파생 가능한 것만 보여준다"(팀장 지시) 원칙에 따라 비교 대상이
 * 실제로 있을 때만 계산한다 — 기록이 2건 이상이면 최근 두 회차, 1건뿐이면 그 회차와
 * 베이스라인을 비교(같으면 0 이 아니라 아예 생략 — 같은 값 표시는 정보가 아니다),
 * 0건이면 delta 자체를 만들지 않는다(null).
 */
export function latestKpi(
  records: GoalGradeRecordLike[] | null | undefined,
  {
    fallbackValue = null,
    fallbackRound = "",
  }: {
    // exactOptionalPropertyTypes: 호출부가 optional 필드에서 온 값(undefined 포함)을
    // 그대로 넘기므로 명시적으로 undefined를 허용한다(값 자체 처리 로직은 그대로).
    fallbackValue?: number | null | undefined;
    fallbackRound?: string | undefined;
  } = {},
) {
  const list = sortByExamOrder(records);

  if (list.length > 0) {
    // list.length > 0으로 이미 확인됨.
    const latest = list[list.length - 1]!;
    const prev = list.length > 1 ? list[list.length - 2] : null;
    const compareTo = prev ? prev.value : fallbackValue;
    const delta =
      compareTo != null && compareTo !== latest.value
        ? round1(latest.value - compareTo)
        : null;

    return { round: latest.term, value: latest.value, delta };
  }

  return {
    round: fallbackRound || "기록 없음",
    value: fallbackValue,
    delta: null,
  };
}

/**
 * latestKpi()의 원시 delta(그냥 뺄셈 latest-compareTo)를 GoalGaugeCard가 기대하는
 * "개선폭(항상 양수, ▲ 초록)" 관례로 바꾼다.
 *
 * GoalGaugeCard는 delta의 방향·색을 lowerIsBetter로 다시 계산하지 않고 항상 ▲ 초록으로
 * 그린다(원래 mockGrades.kpi.delta가 이미 "개선폭"으로 사전 계산돼 있었기 때문 —
 * GoalGaugeCard.jsx 헤더 주석 참고). 등급(lowerIsBetter=true)은 값이 내려가야 개선이라
 * latestKpi의 원시 diff(latest-compareTo)가 음수로 나온다 — 그대로 넘기면 "▲-0.26"처럼
 * 부호와 화살표가 어긋난다. 회귀(악화)했을 때 표시할 배지 스타일은 시안에 정의가 없어
 * (DeltaBadge.jsx 주석 "하락 상태 미정의") null로 접어 숨긴다("파생 불가 항목은 숨김"
 * 원칙과 일치).
 */
export function improvementDelta(
  rawDelta: number | null | undefined,
  lowerIsBetter: boolean,
): number | null {
  if (rawDelta == null) return null;
  const isImprovement = lowerIsBetter ? rawDelta < 0 : rawDelta > 0;
  return isImprovement ? round1(Math.abs(rawDelta)) : null;
}

/**
 * 카드형 "기록한 성적" 이력(최신순 최대 count건) — 4022:5403 모의고사 카드 변형용.
 * 각 원소에 직전 회차(시간순 바로 앞) 대비 증감을 함께 계산해 붙인다. 첫 회차(비교 대상
 * 없음)는 delta: null — 호출부가 "-"로 렌더한다(시안 그대로).
 */
export function recentHistory(
  records: GoalGradeRecordLike[] | null | undefined,
  count = 3,
) {
  const list = sortByExamOrder(records);
  const withDelta = list.map((record, index) => ({
    ...record,
    // index > 0으로 이미 확인됨.
    delta: index > 0 ? round1(record.value - list[index - 1]!.value) : null,
  }));
  return withDelta.slice(-count).reverse();
}

// 설문(온보딩)에서 입력한 점수를 성적 관리 표에 읽기 전용 첫 행으로 보여 주는 행. 회차 기록이
// 아니므로 toTableRows 와 섞지 않고, 평균, 증감, 차트 계산에는 넣지 않는다. 값이 없거나 0(미입력)이면 null.
export const SURVEY_BASELINE_TERM = "설문 입력";

export function naesinBaselineRow(convertedGrade: number | null | undefined) {
  if (convertedGrade == null || !(convertedGrade > 0)) return null;
  return { term: SURVEY_BASELINE_TERM, average: convertedGrade };
}

type StoredPct = { pct?: unknown } | undefined;

const pctOf = (value: StoredPct) =>
  typeof value?.pct === "number" ? value.pct : null;

const mean = (values: number[]) =>
  values.length
    ? round1(values.reduce((a, b) => a + b, 0) / values.length)
    : null;

/**
 * 모의고사 설문 행. 종합 백분위(calcJeongsiCompositeFE)가 저장된 모든 회차(mockInput.rounds)를
 * 쓰므로 국어, 수학, 탐구 칸도 같은 회차 전체의 평균이다. 탐구는 회차별로 두 과목 평균을 낸 뒤
 * 회차끼리 평균한다. 값이 없는 과목과 영어(설문이 등급으로 받음) 칸은 비운다. rounds 모양이 없으면 평균만 보인다.
 */
export function mockBaselineRow(
  currentMogo: number | null | undefined,
  mockInput: Record<string, unknown> | null | undefined,
) {
  if (currentMogo == null || !(currentMogo > 0)) return null;
  const rounds = Object.values(
    (mockInput?.rounds ?? {}) as Record<
      string,
      Record<string, StoredPct> | undefined
    >,
  );
  const pcts = (
    pick: (r: Record<string, StoredPct> | undefined) => number | null,
  ) => rounds.map(pick).filter((v): v is number => v !== null);
  const korean = mean(pcts((r) => pctOf(r?.kor)));
  const math = mean(pcts((r) => pctOf(r?.math)));
  const science = mean(
    pcts((r) =>
      mean(
        [pctOf(r?.tam1), pctOf(r?.tam2)].filter((v): v is number => v !== null),
      ),
    ),
  );
  return {
    term: SURVEY_BASELINE_TERM,
    ...(korean !== null ? { korean } : {}),
    ...(math !== null ? { math } : {}),
    ...(science !== null ? { science } : {}),
    average: currentMogo,
  };
}
