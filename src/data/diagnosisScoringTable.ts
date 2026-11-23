/**
 * 학습진단 배점표 상수 — 배점표.xlsx 6시트(00_읽는법 / 01_문항별배점 / 02_영역_구성 /
 * 03_서비스추천 / 04_합격가능성 / 05_예시) 이식본.
 *
 * 정본: docs/학습진단-계산엔진-적용명세.md §3.5(선택지 코드 매핑) · §4.2~§4.6 · §6.1.
 * 이 파일은 상수만 갖는다 — 계산은 src/lib/diagnosisScoring.js, 문구는 src/data/diagnosisCopy.js.
 *
 * 두 가지 원칙을 지킨다.
 * 1) 라벨 문자열을 키로 쓰지 않는다. 선택지 라벨은 시안 오탈자를 코드에서 교정한 문자열이라
 *    (q8 '정체되어' 등) 라벨을 키로 쓰면 문구 1자 수정이 침묵 오채점이 된다.
 *    코드는 renewalSurveyQuestions 의 선택지 **서수**로만 부여한다(§3.5).
 * 2) 모든 경계값의 단일 정의처다. 같은 임계를 두 곳에 적으면 미확정 항목(§9)이 확정될 때
 *    한쪽만 바뀌어 라벨과 색이 어긋난다.
 */

/**
 * DiagnosisInput.meta.schemaVersion (§3.2).
 * 정의처는 renewalSurveyQuestions.js 하나다 — 두 곳에 문자열 리터럴을 적어 두면 값이 갈라지는 순간
 * 리포트가 정상 응답을 조용히 폐기하고 픽스처로 떨어진다(에러가 없어 진단이 어렵다).
 * 설문 UI 는 이 배점표를 import 하지 않으므로 의존 방향을 설문 쪽으로 잡았다(번들 분리 유지).
 */
export { SURVEY_SCHEMA_VERSION as SCHEMA_VERSION } from "./renewalSurveyQuestions.js";

/* ------------------------------------------------------------------ *
 * 1. 12영역 — 배점표 02_영역_구성
 * ------------------------------------------------------------------ */

/**
 * 영역 안정 코드 12종. 배열 순서 = §4.2.1 표 순서 = 레이더 축 순서 = 동점 타이브레이커 순서.
 * 한글 라벨은 오탈자 교정 대상이므로 코드가 정본이다(AREA_LABEL 은 표시 전용).
 */
export const PAGE1_AREAS = [
  "GOAL",
  "PLAN",
  "EXEC",
  "TIME",
  "FEEDBACK",
  "STABILITY",
];
export const PAGE2_AREAS = [
  "SUBJECT",
  "PERFORM",
  "INQUIRY",
  "ACTIVITY",
  "RECORD",
  "STRATEGY",
];
export const AREA_CODES = [...PAGE1_AREAS, ...PAGE2_AREAS];

export const AREA_LABEL = {
  GOAL: "목표 설정",
  PLAN: "계획 설계",
  EXEC: "실행 지속",
  TIME: "시간 관리",
  FEEDBACK: "학습 피드백",
  STABILITY: "학습 안정",
  SUBJECT: "교과 관리",
  PERFORM: "수행 대응",
  INQUIRY: "탐구 심화",
  ACTIVITY: "활동 연계",
  RECORD: "기록 정리",
  STRATEGY: "입시 전략",
};

/** 영역별 척도 2문장(§4.2.1 '척도 70점' 열). 평균 × 0.7 = 최대 70점. */
export const AREA_SCALE_MAP = {
  GOAL: ["LK1_01", "LK1_02"],
  PLAN: ["LK1_03", "LK1_04"],
  EXEC: ["LK1_05", "LK1_06"],
  TIME: ["LK1_07", "LK1_08"],
  FEEDBACK: ["LK1_09", "LK1_10"],
  STABILITY: ["LK1_11", "LK1_12"],
  SUBJECT: ["LK2_01", "LK2_02"],
  PERFORM: ["LK2_03", "LK2_04"],
  INQUIRY: ["LK2_05", "LK2_06"],
  ACTIVITY: ["LK2_07", "LK2_08"],
  RECORD: ["LK2_09", "LK2_10"],
  STRATEGY: ["LK2_11", "LK2_12"],
};

/**
 * 체크 감점 기반 만점(§4.2.1 'base' 열). nonScalePart = max(0, base + Σ감점) + aux.
 * GOAL 은 감점 항목이 없고 나머지 30점이 전부 가산형(q3 진학목표 20 + 이유 10)이라 base 0.
 * 감점 합이 base 를 넘는 영역이 4곳(FEEDBACK −21 / PERFORM −31 / INQUIRY −31 / STRATEGY −31)
 * 있으므로 base 부분만 0으로 clamp 한 뒤 aux 를 더한다.
 */
export const AREA_BASE = {
  GOAL: 0,
  PLAN: 30,
  EXEC: 20,
  TIME: 30,
  FEEDBACK: 20,
  STABILITY: 30,
  SUBJECT: 20,
  PERFORM: 30,
  INQUIRY: 30,
  ACTIVITY: 30,
  RECORD: 30,
  STRATEGY: 30,
};

/**
 * 영역별 보조 가산(aux) 출처. scoreAreas 가 이 표를 보고 분기하도록 데이터로 남긴다
 * — 코드에 if 로 흩어 놓으면 §4.2.1 표와 어긋나도 드러나지 않는다.
 * 'GOAL_POINTS' = q3 진학목표 + 목표 선정 이유 / 'TREND' = q8 성적 흐름(각 가산) /
 * 'MOCK_FILL' = q6 모의고사 입력 칸수.
 */
export const AREA_AUX_SOURCE = {
  GOAL: "GOAL_POINTS",
  PLAN: null,
  EXEC: "TREND",
  TIME: null,
  FEEDBACK: "TREND",
  STABILITY: null,
  SUBJECT: "MOCK_FILL",
  PERFORM: null,
  INQUIRY: null,
  ACTIVITY: null,
  RECORD: null,
  STRATEGY: null,
};

/* ------------------------------------------------------------------ *
 * 2. 감점표 — 배점표 01_문항별배점 8번·10번 (§3.5)
 * ------------------------------------------------------------------ */

/**
 * q10(배점표 8번) 학습 방해 요인 13지. 최대 3개, OBS_13 은 배타(감점 0).
 * points 는 전부 음수다 — 부호를 호출부에서 뒤집지 않는다.
 */
export const OBSTACLE_DEDUCTIONS = {
  OBS_01: { area: "PLAN", points: -15 },
  OBS_02: { area: "PLAN", points: -15 },
  OBS_03: { area: "EXEC", points: -12 },
  OBS_04: { area: "EXEC", points: -8 },
  OBS_05: { area: "TIME", points: -18 },
  OBS_06: { area: "FEEDBACK", points: -6 },
  OBS_07: { area: "FEEDBACK", points: -9 },
  OBS_08: { area: "FEEDBACK", points: -6 },
  OBS_09: { area: "TIME", points: -12 },
  OBS_10: { area: "STABILITY", points: -11 },
  OBS_11: { area: "STABILITY", points: -8 },
  OBS_12: { area: "STABILITY", points: -11 },
  OBS_13: { area: null, points: 0 }, // 배타 — '특별히 큰 어려움은 없어요'
};

/**
 * q12(배점표 10번) 활동·입시 어려움 14지. 최대 3개, DIF_14 는 배타(감점 0).
 * 주의: DIF_09(논문·학술자료)는 선택지 순서상 활동 연계 사이에 끼어 있지만 영역은 탐구 심화다.
 */
export const DIFFICULTY_DEDUCTIONS = {
  DIF_01: { area: "SUBJECT", points: -20 },
  DIF_02: { area: "PERFORM", points: -13 },
  DIF_03: { area: "PERFORM", points: -9 },
  DIF_04: { area: "PERFORM", points: -9 },
  DIF_05: { area: "INQUIRY", points: -9 },
  DIF_06: { area: "INQUIRY", points: -13 },
  DIF_07: { area: "ACTIVITY", points: -18 },
  DIF_08: { area: "ACTIVITY", points: -12 },
  DIF_09: { area: "INQUIRY", points: -9 },
  DIF_10: { area: "RECORD", points: -30 },
  DIF_11: { area: "STRATEGY", points: -9 },
  DIF_12: { area: "STRATEGY", points: -13 },
  DIF_13: { area: "STRATEGY", points: -9 },
  DIF_14: { area: null, points: 0 }, // 배타 — '현재는 관련 도움이 크게 필요하지 않아요'
};

/* ------------------------------------------------------------------ *
 * 3. 가산 배점 — 배점표 01_문항별배점 3·5·6·11번 (§4.2.2)
 * 모든 조회는 POINTS[code] ?? 0 폴백을 거친다. undefined/NaN 을 내면
 * 영역 → 종합 → 뱃지 → gap → 긴급도까지 그대로 전파된다.
 * ------------------------------------------------------------------ */

/** q3 진학 목표(0~20). 목표 설정 aux 의 앞부분. */
export const GOAL_LEVEL_POINTS = {
  BOTH: 20,
  UNIV_ONLY: 14,
  MAJOR_ONLY: 14,
  TIER_ONLY: 8,
  UNDECIDED_MULTI: 4,
  NONE: 0,
};

/**
 * q3-target-reason 목표 선정 이유(0~10). 목표 설정 aux 의 뒷부분.
 * goal.reason == null 은 상시 경로다(q3 '아직 구체적인 목표가 없어요' → 이유 문항 미노출) → 0 가산.
 */
export const GOAL_REASON_POINTS = {
  APTITUDE: 10,
  JOB: 10,
  REPUTATION: 5,
  SCORE_FIT: 4,
  PARENT: 3,
  LOCATION: 4,
  UNKNOWN: 0,
};

/**
 * q8 최근 성적 흐름. EXEC·FEEDBACK 에 '각' 가산한다.
 * 실치역은 {2,3,5,8,10} — 6지 전부 2점 이상이고 gradeTrend 는 필수라 '미응답 0' 경로가 없다.
 */
export const TREND_POINTS = {
  UP_MOST: 10,
  UP_PART: 8,
  FLAT: 5,
  DOWN_PART: 3,
  VOLATILE: 2,
  NO_DATA: 5,
};

/**
 * q6 모의고사 입력 칸수 → 교과 관리 aux. 미입력 5점이 기준점이고 채울수록 올라간다(감점 아님).
 * Q-09 확정(2026-08-11) — 배점표 원문 앵커는 0·2·4·6칸뿐이라 홀수(1·3·5칸)는 인접 앵커
 * 선형보간으로 채운다. 앵커 4개(0/2/4/6)는 원문 그대로이고 홀수 칸만 보간값이다.
 * 주의: 「채울수록 올라갑니다」는 이 aux 기준으로만 항상 참이다. scoreAreas 가 최종 점수를
 * roundHalfUp(...,0) 으로 정수화하므로(§4.2.2) 화면 표시 점수 기준으로는 3칸→4칸처럼 일부
 * 구간에서 정수 반올림 후 동점이 발생할 수 있다 — 이는 구조적 결과이며 버그가 아니다.
 */
export const MOCK_FILL_POINTS = { 0: 5, 1: 6, 2: 7, 3: 7.5, 4: 8, 5: 9, 6: 10 };

/** q13 임박 일정 → 긴급도 기본 점수(§4.4 E). */
export const SCHEDULE_POINTS = {
  PA_7D: 30,
  EXAM_2W: 20,
  MONTH_1: 10,
  SUSI: 30,
  NONE: 0,
  UNKNOWN: 5,
};

/* ------------------------------------------------------------------ *
 * 4. 선택지 서수 → 코드 매핑 (§3.5) — 단방향
 * 배열 인덱스 = renewalSurveyQuestions[qN].options 인덱스. 라벨은 키가 아니다.
 * 인덱스 계약이 깨지면 조용히 오채점되므로 적재 검증식(§3.5)을 verify 스크립트 첫 항목에 둔다.
 * ------------------------------------------------------------------ */

export const OPTION_CODES = {
  Q1_GRADE_LEVEL: ["M3", "H1", "H2", "H3", "RETAKE"],
  Q2_SCHOOL_TYPE: [
    "GENERAL",
    "AUTONOMOUS",
    "SPECIAL",
    "VOCATIONAL",
    "MIDDLE",
    "ETC",
    "NONE",
  ],
  Q3_LEVEL: [
    "BOTH",
    "UNIV_ONLY",
    "MAJOR_ONLY",
    "TIER_ONLY",
    "UNDECIDED_MULTI",
    "NONE",
  ],
  Q3_REASON: [
    "APTITUDE",
    "JOB",
    "REPUTATION",
    "SCORE_FIT",
    "PARENT",
    "LOCATION",
    "UNKNOWN",
  ],
  // 3번째 선택지는 T2 에서 '성취평가제 중심' → '중학생 평균'으로 교체된다(§2.2). 서수는 불변.
  Q4_SYSTEM: ["NINE", "FIVE", "MIDDLE_AVG", "UNKNOWN"],
  Q8_TREND: ["UP_MOST", "UP_PART", "FLAT", "DOWN_PART", "VOLATILE", "NO_DATA"],
  // 점수에는 쓰이지 않지만(trendSubject 는 표시 전용) 코드로 정규화한다 — 이 값은 sessionStorage 에
  // 영속화되므로 라벨을 그대로 담으면 문항 1자 수정이 과거 응답을 미지 값으로 만든다(§3.5).
  Q8_FOLLOWUP: [
    "KOREAN",
    "MATH",
    "ENGLISH",
    "SOCIAL",
    "SCIENCE",
    "INQUIRY",
    "MULTIPLE",
    "UNKNOWN",
  ],
  OBSTACLE: [
    "OBS_01",
    "OBS_02",
    "OBS_03",
    "OBS_04",
    "OBS_05",
    "OBS_06",
    "OBS_07",
    "OBS_08",
    "OBS_09",
    "OBS_10",
    "OBS_11",
    "OBS_12",
    "OBS_13",
  ],
  DIFFICULTY: [
    "DIF_01",
    "DIF_02",
    "DIF_03",
    "DIF_04",
    "DIF_05",
    "DIF_06",
    "DIF_07",
    "DIF_08",
    "DIF_09",
    "DIF_10",
    "DIF_11",
    "DIF_12",
    "DIF_13",
    "DIF_14",
  ],
  SCHEDULE: ["PA_7D", "EXAM_2W", "MONTH_1", "SUSI", "NONE", "UNKNOWN"],
  WISH: [
    "WISH_01",
    "WISH_02",
    "WISH_03",
    "WISH_04",
    "WISH_05",
    "WISH_06",
    "WISH_07",
    "WISH_08",
    "WISH_09",
    "WISH_10",
  ],
  Q16: ["HIGH", "BORDER", "HARD", "NONE", "UNKNOWN"],
  Q17: [
    "CONNECTED",
    "UNLINKED",
    "GRADE_OK",
    "INQUIRY_OK",
    "AVERAGE",
    "UNKNOWN",
    // "잘 모르겠어요" 신설(QA 행348). 처음엔 UNKNOWN 을 재사용했으나 코드 중복이 라벨 중복·
    // React key 충돌을 일으켜 2026-09-02 UNSURE 로 분리(JONGHAP_DELTA.UNSURE 동일 -5).
    "UNSURE",
  ],
  Q18: [
    "CONFIDENT",
    "BASIC",
    "RECORD_WEAK",
    "NOT_STARTED",
    "NO_INTERVIEW",
    "UNKNOWN",
  ],
};

/** OPTION_CODES 각 키가 어느 문항의 options 를 참조하는지 — 적재 검증식(§3.5)이 쓴다. */
export const OPTION_SOURCE_QUESTION = {
  Q1_GRADE_LEVEL: "q1",
  Q2_SCHOOL_TYPE: "q2",
  Q3_LEVEL: "q3",
  Q3_REASON: "q3-target-reason",
  Q4_SYSTEM: "q4",
  Q8_TREND: "q8",
  Q8_FOLLOWUP: "q8-followup",
  OBSTACLE: "q10",
  DIFFICULTY: "q12",
  SCHEDULE: "q13",
  WISH: "q14",
  Q16: "q16",
  Q17: "q17",
  Q18: "q18",
};

/** 리커트 안정 키(§3.3). LK1_nn = q9.statements[nn-1], LK2_nn = q11.statements[nn-1]. */
export const LIKERT1_KEYS = Array.from(
  { length: 12 },
  (_, i) => `LK1_${String(i + 1).padStart(2, "0")}`,
);
export const LIKERT2_KEYS = Array.from(
  { length: 12 },
  (_, i) => `LK2_${String(i + 1).padStart(2, "0")}`,
);

/** 배타 선택지 — 고르면 같은 문항의 다른 선택이 해제되고 감점이 0이 된다. */
export const EXCLUSIVE_CODES = { OBSTACLE: "OBS_13", DIFFICULTY: "DIF_14" };

/* ------------------------------------------------------------------ *
 * 5. 입력 도메인 — §3.4
 *
 * 입력 허용 범위·마스크 표는 여기 두지 않는다. renewalSurveyQuestions.js 의
 * GRADE_SYSTEM_INPUT_RULES 가 정본이고, 여기 사본을 두면 두 표가 갈라져
 * "화면에서 통과한 값이 채점에서 정의역 밖으로 떨어지는" 사고가 난다(그 사본은 소비자가 0건이었다).
 * 등급 체계별로 숨겨지는 칸(중학생 평균의 모의고사·최근시험)도 문항 데이터의
 * group.hiddenWhenGradeSystem 이 정본이며, normalizeAnswers 가 그 선언을 그대로 읽는다.
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * 6. 서비스 추천 — 배점표 03_서비스추천 (§4.5)
 * ------------------------------------------------------------------ */

export const SERVICE_CODES = [
  "GOAL_CARE",
  "PERFORM_SUPPORT",
  "DEEP_INQUIRY",
  "SELF_REVIEW",
  "GROWTH_DESIGN",
  "CALL_MENTOR",
];

export const SERVICE_LABEL = {
  GOAL_CARE: "위닝 목표관리",
  PERFORM_SUPPORT: "위닝 수행평가",
  DEEP_INQUIRY: "위닝 심화탐구",
  SELF_REVIEW: "위닝 자기평가서",
  GROWTH_DESIGN: "위닝 성장설계",
  CALL_MENTOR: "위닝 콜멘토",
};

/**
 * 적합도 100점 = 어려움 50 + 희망 20 + 영역 30.
 * threshold 는 "n개 체크 시 50점"의 n — 자기평가서만 1이다.
 *
 * F-17(2026-08-12 확정, Q-14①② 종결) — 체크 1·2개(threshold 미만)일 때 배분 방식을
 * **비례 배분**으로 확정한다(`diagnosisScoring.rankServices` 의
 * `min(50, 50×체크수/threshold)` 식 그대로 — 이번에 새로 바꾼 로직은 없다). all-or-nothing
 * (threshold 미만이면 0점)은 채택하지 않는다 — 05_예시·`docs/학습진단-계산엔진-적용명세.md:1255`
 * 실측대로 현재 입력 분포에서는 체크수=threshold 인 경우만 검증돼 두 방식이 같은 값을 냈지만,
 * 어려움을 1~2개만 체크한 학생의 신호를 0으로 버리는 것은 "체크한 만큼은 반영한다"는 적합도
 * 설계 의도(§4.5)에 맞지 않는다고 판단했다. 영역 30점도 min(가장 약한 영역)이 아니라
 * mean(linkedAreas 평균)을 그대로 확정한다 — 서비스 하나가 연결 영역 여러 개를 다루므로 그중
 * 하나만으로 적합도를 정하면 나머지 연결 영역의 신호가 사라진다.
 * SERVICE_CODES 순서 = 동점 타이브레이커 순서.
 */
export const SERVICE_RULES = {
  GOAL_CARE: {
    items: [
      "OBS_01",
      "OBS_02",
      "OBS_03",
      "OBS_04",
      "OBS_05",
      "OBS_06",
      "OBS_07",
      "OBS_08",
      "OBS_09",
    ],
    threshold: 3,
    wishOptions: ["WISH_01", "WISH_02", "WISH_03", "WISH_04"],
    linkedAreas: ["PLAN", "EXEC", "TIME", "FEEDBACK"],
  },
  PERFORM_SUPPORT: {
    items: ["DIF_02", "DIF_03", "DIF_04"],
    threshold: 3,
    wishOptions: ["WISH_05"],
    linkedAreas: ["PERFORM"],
  },
  DEEP_INQUIRY: {
    items: ["DIF_05", "DIF_06", "DIF_09"],
    threshold: 3,
    wishOptions: ["WISH_06"],
    linkedAreas: ["INQUIRY"],
  },
  SELF_REVIEW: {
    items: ["DIF_10"],
    threshold: 1,
    wishOptions: ["WISH_07"],
    linkedAreas: ["RECORD"],
  },
  GROWTH_DESIGN: {
    items: ["DIF_07", "DIF_08", "DIF_11", "DIF_12", "DIF_13"],
    threshold: 3,
    wishOptions: ["WISH_01", "WISH_08", "WISH_09"],
    linkedAreas: ["ACTIVITY", "STRATEGY"],
  },
  CALL_MENTOR: {
    items: ["OBS_10", "OBS_11", "OBS_12"],
    threshold: 3,
    wishOptions: ["WISH_08", "WISH_09", "WISH_10"],
    linkedAreas: ["STABILITY"],
  },
};

/**
 * q19 자유 서술 감지 단어 18개(배점표 17번 원문 "위닝 콜멘토 어려움 +10점").
 *
 * 확정(Q-36 해소, 사용자 확정 2026-08-11): 이 목록으로 만든 가산 +10은 콜멘토 적합도 **점수에서
 * 제거했다**. 판정이 `freeText.includes(keyword)` 부분 문자열 매칭이라 오탐이 구조적이다 —
 * '울' → '서울대 가고 싶어요' · '울산에서 통학해요' 가 걸리고, '비교'·'혼자' 는 부정문
 * ('비교하지 않으려 해요' · '혼자 있는 시간이 좋아요')에서 걸린다. 추천 구간 경계(80/65/50)를
 * 한 칸 넘겨 1순위 서비스를 바꿀 수 있는데, 한 문장 키워드 매칭은 그 정도 권한을 정당화할 근거가
 * 못 된다는 것이 결정 사유다.
 *
 * 목록 자체(감지 대상)는 배점표 원문 그대로 유지한다 — 감지는 계속하고, `detectEmotionalSignal()`
 * (diagnosisScoring.js)이 `{ hit, matchedKeywords }` 구조로 뽑아 점수와 분리된 신호로만 낸다.
 * 실제 배점은 후속 작업(LLM 분류 또는 어드민 수동 배점, docs/학습진단-마무리-항목.md B절) 몫이다.
 * 원래 가산치는 10 이었다(§4.5 원문) — 후속 배점 작업에서 값을 되살릴 때 참조한다.
 */
export const CALL_MENTOR_KEYWORDS = [
  "불안",
  "걱정",
  "무섭",
  "막막",
  "답답",
  "우울",
  "힘들",
  "지치",
  "포기",
  "의욕",
  "자신감",
  "비교",
  "눈치",
  "부담",
  "스트레스",
  "혼자",
  "외로",
  "울",
];

/** 적합도 버킷 상한(§4.5). 합이 100이라 fit <= 100 불변식의 근거가 된다. */
export const SERVICE_PART_CAPS = { difficulty: 50, wish: 20, area: 30 };

/**
 * 학년별 **시점 무관** 후보 제한(배점표 1번). null 이면 이 표에서는 제한하지 않는다.
 *
 * H3 는 여기서 계속 null 이다 — 고3 제한은 시점(6월)에 걸리는 조건부 규칙이라 학년만으로는
 * 판정되지 않는다. 그 분기는 이 표가 아니라 diagnosisScoring.serviceCandidates 가 §11 의
 * SERVICE_H3_LATE_* 를 읽어 처리한다(Q-13). 이 표에 H3 를 채우면 1~5월 진단자까지 함께 잘린다.
 */
export const SERVICE_GRADE_FILTER = {
  M3: ["GOAL_CARE", "CALL_MENTOR"],
  H1: null,
  H2: null,
  H3: null,
  RETAKE: ["GOAL_CARE", "CALL_MENTOR"],
};

/* ------------------------------------------------------------------ *
 * 7. 경계값 — 모든 임계의 단일 정의처 (§4.4 · §6.1)
 * ------------------------------------------------------------------ */

/** 5단계 등급(§4.4 A). 상단 포함(>=)으로 통일 — 원문은 '80+'만 명시(Q-11). */
export const SCORE_BANDS = { L1: 80, L2: 70, L3: 60, L4: 45 };

/**
 * {grade} 라벨 5종(§5.2). levelOf 전용이며 STATE_LABEL(stateOf)과 절대 혼용하지 않는다.
 * L5 는 배점표 02 표기 '우선 보완 필요'를 채택했다. 문구집 02 구분 문자열은 'L5 우선 보완',
 * STATE_LABEL.page2.WEAK 는 '우선 보완'이라 셋의 문자열이 서로 다르다 — 미확정 Q-34.
 */
export const LEVEL_LABEL = {
  L1: "안정",
  L2: "양호",
  L3: "점검 필요",
  L4: "보완 필요",
  L5: "우선 보완 필요",
};

/**
 * 확정: 배점표 02_영역_구성 "영역 상태 … (70·60·45 기준)" (Q-32 해소, 사용자 확정 2026-08-11).
 * 승인된 디자인 샘플(renewalReportSample)이 함의하던 40/50/70 경계는 폐기됐다 — 배점표 원문이
 * 직접 명시한 70/60/45 가 정본이다.
 * stateOf 라벨과 toneOf 색이 **둘 다** 여기서 파생된다(STATE_TONE 참조).
 */
export const AREA_BAND_THRESHOLDS = { TOP: 70, MID: 60, LOW: 45 };

/** 영역 상태 화면 라벨(§4.4 B). 03_진단서술 조회 키는 이게 아니다 — diagnosisCopy 의 NARRATIVE_STATE_LABEL. */
export const STATE_LABEL = {
  page1: { TOP: "상위", MID: "보통", LOW: "보완 필요", WEAK: "취약" },
  page2: { TOP: "양호", MID: "점검 필요", LOW: "보완 필요", WEAK: "우선 보완" },
};

/** 상태 → tone(§7.3). 별도 임계를 두지 않는다 — Q-32 를 뒤집으면 라벨과 색이 함께 움직여야 한다. */
export const STATE_TONE = {
  TOP: "blue",
  MID: "blue",
  LOW: "amber",
  WEAK: "red",
};

/** 우선순위 뱃지(§4.4 C). PAGE1 6영역 점수 오름차순. 정확히 6개 — 불변식으로 검사한다. */
export const BADGES = ["1순위", "2순위", "3순위", "4순위", "점검", "유지"];

/** 목표 점수(§4.4 D). gap = TARGET_SCORE − PAGE1 최저 영역 점수. */
export const TARGET_SCORE = 75;

/** 서비스 추천 구간(§4.5). LOW 미만이면 리포트에서 제외한다. */
export const SERVICE_BANDS = { HIGH: 80, MID: 65, LOW: 50 };

// 2026-09-02 QA 시트 행 343으로 게이트 폐기 — 종전엔 SERVICE_RANK2_MIN_FIT(65)·
// SERVICE_RANK2_MAX_DIFF(20) 두 상수로 "65점 이상이고 1순위와 20점 이내면 함께 노출"(배점표 03)
// 을 강제했으나, tier 필터 통과 후보가 둘 이상인데도 대부분 카드가 1장만 나오는 문제가 있어
// rankServices() 가 후보 2개 이상이면 항상 2순위를 채우도록 바뀌었다. 다른 참조가 없어 상수째
// 삭제한다.

/** 긴급도 구간(§4.4 E). 0~19 낮음 / 20~34 보통 / 35~49 높음 / 50 이상 매우 높음. */
export const URGENCY_BANDS = { L4: 50, L3: 35, L2: 20 };

/**
 * 긴급도 4단계 화면 라벨. 창작이 아니다 — 배점표 141행 원문
 * "0~19 낮음 / 20~34 보통 / 35~49 높음 / 50 이상 매우 높음"이 URGENCY_BANDS 와 1:1로 대응한다
 * (배점표 251행 '50점 · 매우 높음'도 같은 라벨을 쓴다).
 * LEVEL_LABEL(5단계)·STATE_LABEL(4상태)과 절대 혼용하지 않는다 — 셋은 서로 다른 축이다.
 */
export const URGENCY_LEVEL_LABEL = {
  L1: "낮음",
  L2: "보통",
  L3: "높음",
  L4: "매우 높음",
};

/**
 * 긴급도 카운트 임계 40. 다른 모든 경계(45/60/70/80)와 어긋나는 유일한 값이지만 원문 그대로다.
 * AREA_BAND_THRESHOLDS 와 별도 상수로 유지한다 — Q-32 확정과 무관하게 40은 따라가지 않는다(Q-12 해소).
 */
export const URGENCY_AREA_THRESHOLD = 40;

/**
 * 확정: 배점표 산식은 "11번 점수 + (40점 미만 영역 수 × 10)"이고 영역 범위를 별도로 제한하지
 * 않는다(Q-12 해소, 사용자 확정 2026-08-11). 배점표가 정의하는 영역은 PAGE1 6개 + PAGE2 6개 =
 * 12개뿐이므로 ALL_12 가 곧 "문서가 정의하는 전체 영역"이다. 05_예시("40점 미만 영역 3개")는
 * PAGE1 6영역만으로는 1개뿐이라 이 해석에서만 재현된다.
 */
export const URGENCY_SCOPE = "ALL_12"; // 'ALL_12' | 'PAGE1'

/** 2페이지 강점 임계(§5.1). STR_NONE 문구에서 역산한 값이라 임계·개수·대상 모두 미확정 Q-07. */
export const STRENGTH_THRESHOLD = 60;

/* ------------------------------------------------------------------ *
 * 8. 합격 가능성 — 배점표 04_합격가능성 · 14~16번 (§4.6)
 * ------------------------------------------------------------------ */

/** 소신/안정 판정의 등급 여유폭. 9등급 스케일 등급 차 0.30. */
export const ADMISSION_MARGIN = 0.3;

/** 입결 비교표 행 키. 값이 null 인 행은 표에서 자동 제외한다(배점표 04 주석). */
export const ADMISSION_ROW_KEYS = ["cut50", "cut70", "avg", "mine"];

/**
 * 미확정 Q-28 — 사용자 확정 시 이 값만 바꾸면 된다.
 * A4: 50% 컷만 있고 70% 컷이 없는 대학의 구간 판정 규칙이 원문에 없다. null(=BAND_NODATA 폴백)을
 * 내고 값을 창작하지 않는다. rev.1 코드는 이 경로에서 안정권 학생을 무조건 '위험'으로 표시했다.
 */
export const BAND_NODATA = null;

/**
 * F-02(2026-08-12 확정, Q-35 종결) — 자율형·사립고/특목고 전용 입결 마스터는 만들지 않는다.
 * 별도 마스터의 데이터 출처·조회 규칙이 원문에 없고(존재하지 않는 데이터), 종전엔
 * `admissionMasterKey()`가 'SPECIAL_TODO' 키를 산출만 하고 실제 조회는 항상 일반 마스터
 * 단일 경로로 흘렀다 — 소비처가 끝까지 0곳이었다(검증: `grep -rn admissionMasterKey src/`).
 * 존재하지 않는 데이터를 전제로 한 미완 분기를 남겨 두는 대신 제거하고, 일반 마스터 단일
 * 경로를 확정으로 못박는다. 학교 유형(schoolType)이 입결 해석에 미치는 한계는 여기 문서화한다
 * — 자사고·특목고는 통상 일반고와 내신 커트라인 형성이 달라 일반 마스터 비교의 정확도가
 * 낮을 수 있으나, 화면에 새 캡션을 만들어 알리지는 않는다(§4.6 caption 은 대학·학과·전형·연도만
 * 다룬다 — 학교 유형 캡션은 발주 대상이지 이번 범위가 아니다). schoolType 자체는 계속 수집·
 * 표시(StudentInfoBlock '학교 유형')되며 이 결정은 입결 비교 로직에만 적용된다.
 * 재도입 조건: 별도 마스터 데이터가 실제로 만들어지면, 그때 조회 키 분기를 새로 추가한다
 * (지금 미리 분기를 만들어 두지 않는 이유는 데이터 스키마를 예측할 수 없기 때문이다).
 */

/**
 * 확률 가감(%p) — 배점표 14·15·16번. 합의 실제 범위는 **−30 ~ +15** 이다.
 * (2026-08-11 정정) 종전 주석의 "−25 ~ +15"는 오류였다. 최소는 HARD(−15) + UNKNOWN(−5) +
 * NOT_STARTED(−10) = −30 이다.
 * 이 가감은 한 학생 안에서 상수다(내신과 무관한 14~16번 응답에서만 나온다) — 그래서 내신이
 * 나빠질수록 확률이 내려가는 단조성은 §11 밴드 기준값·EDGE 만으로 성립하고, 가감 폭이 −30 까지
 * 벌어져도 clamp 가 단조 함수라 깨지지 않는다.
 */
export const CSAT_MIN_DELTA = {
  HIGH: 5,
  BORDER: -5,
  HARD: -15,
  NONE: 0,
  UNKNOWN: -5,
};
export const JONGHAP_DELTA = {
  CONNECTED: 5,
  UNLINKED: 0,
  GRADE_OK: 0,
  INQUIRY_OK: 0,
  AVERAGE: 0,
  UNKNOWN: -5,
  // q17 "잘 모르겠어요"(2026-09-02 코드 분리) — UNKNOWN 과 같은 감점.
  UNSURE: -5,
};
export const INTERVIEW_DELTA = {
  CONFIDENT: 5,
  BASIC: 0,
  RECORD_WEAK: -5,
  NOT_STARTED: -10,
  NO_INTERVIEW: 0,
  UNKNOWN: -5,
};

/**
 * deprecated(2026-08-11) — 단일 전역 기준값으로는 밴드별 확률을 담을 수 없어 폐기했다.
 * 정본은 §11 ADMISSION_BAND_BASE_PROBABILITY 다. successProbability 는 더 이상 이 값을 읽지 않는다.
 * 키를 남겨 두는 이유는 verify 스크립트가 "전역 기준값을 되살리지 않았다"를 이 null 로 단언하기
 * 때문이다 — 삭제하면 그 회귀 방어가 함께 사라진다.
 */
export const BASE_PROBABILITY = null;

/**
 * 확률 정의역. 상한은 반드시 100 미만이어야 한다 — 100이 되면 렌더 문자열이
 * '합격 가능성 예측 100%'가 되어 06_금지어 '결과 단정'의 "100%"와 문자 그대로 일치한다.
 */
export const PROB_MIN = 5;
export const PROB_MAX = 95;

/* ------------------------------------------------------------------ *
 * 9. 문구 폴백 — 이 파일에 두지 않는다
 * COPY_FALLBACK 의 정의처는 src/data/diagnosisCopy.js 하나다(Q-29 확정으로 VALUE_MISSING 만 남았다).
 * 여기서 재수출하면 엔진(diagnosisScoring → 이 파일)이 문구 모듈을 전이 import 하게 되어
 * "엔진은 문구 모듈을 import 하지 않는다"(§6.2 계층 계약)가 깨진다.
 * 소비자(diagnosisReport)는 diagnosisCopy.js 에서 직접 가져간다.
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * 10. 검산 픽스처 — 배점표 05_예시 (§8 CASE-01~05)
 * verify 스크립트가 소비한다. pending: true 는 실패가 아니라 WARN 으로만 출력하고
 * 종료코드에 반영하지 않는다 — 재현 불가가 확정된 케이스이기 때문이다.
 * ------------------------------------------------------------------ */

export const EXAMPLE_CASES = [
  {
    id: "EX-01",
    spec: "CASE-01",
    title: "계획 설계 단일 영역 (05_예시 ①~④)",
    pending: false,
    input: {
      likert1: { LK1_03: 50, LK1_04: 25 }, // '보통이다' / '별로 그렇지 않다'
      obstacles: ["OBS_02"],
    },
    expected: {
      scaleMean: 37.5,
      scalePart: 26.25, // 배점표 표기는 26.3이지만 중간값이라 반올림하지 않는다
      nonScalePart: 15,
      areaScore: { PLAN: 41 },
    },
  },
  {
    id: "EX-02",
    spec: "CASE-02",
    title: "종합·등급·시급 영역·목표 부족분·뱃지 (05_예시)",
    pending: false,
    input: {
      areaScores: {
        GOAL: 77,
        PLAN: 41,
        EXEC: 39,
        TIME: 56,
        FEEDBACK: 60,
        STABILITY: 65,
      },
    },
    expected: {
      page1Overall: 56.3, // 338 / 6 = 56.333
      level: "L4",
      lowestArea: "EXEC",
      lowestScore: 39,
      gap: 36, // 75 − 39
      badges: {
        EXEC: "1순위",
        PLAN: "2순위",
        TIME: "3순위",
        FEEDBACK: "4순위",
        STABILITY: "점검",
        GOAL: "유지",
      },
    },
  },
  {
    id: "EX-03",
    spec: "CASE-03",
    title: "긴급도 (05_예시)",
    // Q-12 해소(사용자 확정) — URGENCY_SCOPE = ALL_12 가 정본이다. PAGE2 값은 05_예시 원문에
    // 없어 합성했지만, 집계 범위 자체는 03_서비스추천 산식이 12영역 전체를 전제하므로 가정이 아니다.
    pending: false,
    input: { schedule: "EXAM_2W", lowAreaCount: 3 },
    expected: { urgencyScore: 50, urgencyLevel: "L4" },
  },
  {
    id: "EX-04",
    spec: "CASE-05",
    title: "서비스 1순위 (05_예시)",
    // Q-14 해소(사용자 확정) — 05_예시의 "목표관리 73점"은 문서 오기다. 산식(어려움 50 + 희망 20 +
    // 영역 30)대로 계산하면 85.3 이 정답이다: 어려움 50(OBS_01~03 3/3 체크) + 희망 20(WISH_02) +
    // 영역 15.3(30 × (100 − mean(41,39,56,60)=49)/100). fit=85.3 은 SERVICE_BANDS.HIGH(80) 이상이라
    // tier 도 MID 가 아니라 HIGH 다.
    pending: false,
    input: { areaScores: { PLAN: 41, EXEC: 39, TIME: 56, FEEDBACK: 60 } },
    expected: { service: "GOAL_CARE", fit: 85.3, tier: "HIGH" },
  },
  {
    id: "EX-05",
    spec: "CASE-04",
    title: "합격 가능성 (05_예시)",
    pending: false,
    input: { mine: 3.24, cuts: { cut50: null, cut70: 2.56, finalAvg: null } },
    expected: {
      band: "RISK", // 3.24 > 2.56 + 0.30
      rows: [
        { key: "cut70", value: 2.56, diff: 0.68 },
        { key: "mine", value: 3.24, diff: null },
      ],
    },
  },
];

/** 비-pending 단언이 이 수 아래로 떨어지면 verify 스크립트가 공허하게 통과한 것이다. */
export const EXAMPLE_CASES_MIN_ASSERTIONS = 5;

/* ================================================================== *
 * 11. 자체 결정 상수 — 원본 근거 없음
 *
 * 이 블록 안의 값은 배점표·문구집·시안 어디에도 근거가 없고 우리가 정한 것이다. 로직에
 * 인라인하지 않고 전부 여기에 모아 두는 이유는 하나다 — 원저자 답이 오면 **이 블록의 값만
 * 교체하면 끝나야** 한다. 로직(diagnosisScoring.js)은 이 표를 읽기만 하고 숫자를 갖지 않는다.
 *
 * 각 상수 위 주석에 `// 자체 결정(2026-08-11) — 원본 근거 없음. 확정 시 이 값만 교체. 관련 Q-nn`
 * 형식을 지킨다. 근거가 **있는** 값은 이 블록에 두지 않는다(예: URGENCY_LEVEL_LABEL 은 배점표
 * 141행 원문이라 §7 에 있다).
 * ================================================================== */

/* ---- F-01 합격 확률 (Q-03 · Q-04) ---- */

/**
 * 밴드별 확률 기준값(%p).
 *
 * 자체 결정(2026-08-11) — 원본 근거 없음. 확정 시 이 값만 교체. 관련 Q-03
 *
 * 20%p 등간으로 뒀다. 양 끝을 95/5 까지 밀지 않은 것은 의도다 — 안정 구간에 95를 주면 과신을,
 * 위험 구간에 5를 주면 단념을 유발한다. 폐기된 BASE_PROBABILITY(전역 단일값)와 달리 밴드별
 * 값을 갖는 이유는 밴드 자체가 내신-컷 거리의 판정 결과이기 때문이다.
 * 불변식: 값은 STABLE > FIT > REACH > RISK 내림차순이고, 인접 간격(20)이
 * |EDGE| 합(5+5=10)보다 커야 한다 — 그래야 EDGE 보정이 밴드 순서를 뒤집지 못한다.
 */
export const ADMISSION_BAND_BASE_PROBABILITY = {
  STABLE: 75,
  FIT: 55,
  REACH: 35,
  RISK: 15,
};

/**
 * 열린 구간 보정(%p).
 *
 * 자체 결정(2026-08-11 신설 · 2026-08-12 RISK 다단 확장) — 원본 근거 없음. 확정 시 이 값만 교체.
 * 관련 Q-03 / G-2 WARN 3
 *
 * STABLE 과 RISK 는 한쪽이 열린 구간이라 밴드만으로는 "컷보다 1등급 여유"와 "컷 언저리"가
 * 똑같은 확률을 받는다. 그 둘을 가르는 최소 보정이다. 폭을 새로 만들지 않고 기존
 * ADMISSION_MARGIN(0.30)을 그대로 재사용해 경계를 잡는다(diagnosisScoring.admissionBandEdge).
 *   STABLE_DEEP   : mine <= c50 − 1 × ADMISSION_MARGIN
 *   RISK_FAR      : mine >  c70 + 2 × ADMISSION_MARGIN
 *   RISK_VERY_FAR : mine >  c70 + 4 × ADMISSION_MARGIN (RISK_FAR 를 대체, 가산 아님)
 *
 * RISK_VERY_FAR — 종전엔 RISK_FAR 보정(-5)이 "컷+0.6등급"을 넘는 순간 한 번만 걸리고 그 뒤로는
 * 거리와 무관하게 포화됐다(내신 3.41·5.00·9.00이 전부 같은 p — 실측). 문턱을 하나 더 둬 "많이
 * 위험"과 "극단적으로 위험"을 가른다. 폭은 RISK_FAR 경계(2×MARGIN)를 그대로 두 배 해 재사용한다
 * (새 배수 감각을 만들지 않는다). STABLE 방향은 대칭 확장하지 않는다 — "매우 안정"이 더 안정해
 * 보이는 것은 학생에게 위험하지 않아 이번 범위에 포함하지 않았다(WARN 3 은 RISK 만 지적했다).
 */
export const ADMISSION_BAND_EDGE_ADJUST = {
  STABLE_DEEP: 5,
  RISK_FAR: -5,
  RISK_VERY_FAR: -10,
};

/**
 * 확률 표기 구간 라벨. 상한 내림차순 최초 매치(p >= min)이며 **산술이 없다**.
 *
 * 자체 결정(2026-08-11) — 원본 근거 없음. 확정 시 이 값만 교체. 관련 Q-03 · Q-04
 *
 * 점추정 %를 학생에게 내지 않는다 — 합격 확률은 진로 판단에 쓰이므로 정밀한 척하면 안 된다.
 * 문구집 06_금지어 '결과 단정' 행의 대체 표현 열이 지정한 '합격 가능성 예상 범위'가 이 표기의
 * 근거다(시안 2967:8223 의 점추정 '22%'는 채택하지 않았다).
 *
 * 두 끝이 구조적 안전장치다. 하단은 '0%'를 쓰지 않고 '10% 미만'으로 두어 불합격 단정을 피하고,
 * 상단은 p >= 90 도 '80~90%'로 의도적으로 캡한다 — 표가 명시 문자열이라 리팩터링으로 '100%'가
 * 되살아날 경로가 아예 없다(계산식으로 만들면 PROB_MAX 가 100 이 되는 순간 되살아난다).
 */
export const PROB_RANGE_LABELS = [
  { min: 80, label: "80~90%" },
  { min: 70, label: "70~80%" },
  { min: 60, label: "60~70%" },
  { min: 50, label: "50~60%" },
  { min: 40, label: "40~50%" },
  { min: 30, label: "30~40%" },
  { min: 20, label: "20~30%" },
  { min: 10, label: "10~20%" },
  { min: 0, label: "10% 미만" },
];

/**
 * 확률 노출 위치.
 *
 * 자체 결정(2026-08-11) — 원본 근거 없음. 확정 시 이 값만 교체. 관련 Q-04
 *
 * 'SCREEN_EXTRA' = 인쇄 A4 2장은 시안 승인 상태 그대로 두고(밴드 4글자), 범위 라벨은 화면 전용
 * 확장 영역에만 싣는다. 'HEADLINE_SLOT' 으로 바꾸면 admission_headline 의 {prob} 자리에 범위를
 * 채워 인쇄에도 나간다. 시안대로 되돌리는 비용을 이 한 줄로 묶어 둔다.
 */
export const PROB_DISPLAY_MODE = "SCREEN_EXTRA"; // 'SCREEN_EXTRA' | 'HEADLINE_SLOT'

/* ---- F-03 학생 유형 나머지 4종 (Q-05) ---- */

/**
 * 유형 판정 임계.
 *
 * 자체 결정(2026-08-11) — 원본 근거 없음. 확정 시 이 값만 교체. 관련 Q-05
 *
 * 문구집 01_유형문구의 서술을 점수 조합으로 옮긴 것이다. 임계는 전부 기존 상수를 재사용했고
 * **신규 숫자는 BALANCED.spreadMax 하나뿐**이다.
 *   SYSTEM_STABLE '흐름이 안정적으로 돌아가고 있습니다'  → 약한 고리가 없다
 *   BALANCED      '두드러진 강점이나 약점 없이 전반이 비슷' → 산포가 좁다
 *   PLAN_HEAVY    '계획은 구체적이나 감당보다 크게 잡혀'    → 계획 높고 실행 낮다
 *   GOAL_EXEC_GAP '목표는 분명하나 할 일 단위로 분해가 안 됨' → 목표 높고 계획·실행 낮다
 * PLAN 조건이 PLAN_HEAVY 와 정반대라 마지막 둘은 상호배타다.
 */
export const TYPE_RULES = {
  // page1MinArea = AREA_BAND_THRESHOLDS.TOP(70), page1Overall = SCORE_BANDS.L1(80)
  SYSTEM_STABLE: { page1MinArea: 70, page1Overall: 80 },
  // ★유일한 신규 숫자. TOP(70) − MID(60) 구간 폭과 같게 맞췄다 — 한 구간 안에 다 들어오면 '평탄'.
  BALANCED: { spreadMax: 10 },
  // planMin = TOP(70), execMax = MID(60)
  PLAN_HEAVY: { planMin: 70, execMax: 60 },
  GOAL_EXEC_GAP: { goalMin: 70, planMax: 70, execMax: 60 },
};

/* ---- F-15 불성실 응답 판정 (Q-16) ---- */

/**
 * 직선 응답 판정 표본 하한.
 *
 * 자체 결정(2026-08-11) — 원본 근거 없음. 확정 시 이 값만 교체. 관련 Q-16
 *
 * 리커트 24문장(LIKERT1 12 + LIKERT2 12) 중 응답값이 있는 문장 수의 하한이다. 하한을 두는 이유는
 * 오탐 방지다 — 4문장만 답하고 그게 같은 것은 우연히도 흔한데, 그 학생에게 '응답을 다시 확인해
 * 주세요'라고 말하는 것은 모욕이 된다.
 */
export const SINCERITY_MIN_ANSWERED = 20;

/**
 * 최빈값과 먼 응답(거리 >= SINCERITY_OFFMODE_MIN_DISTANCE) 허용 개수.
 *
 * 자체 결정(2026-08-11 신설 · 2026-08-12 판정식 개정) — 원본 근거 없음. 확정 시 이 값만 교체. 관련 Q-16
 *
 * 0(=완전 동일)이 아닌 이유가 문구 원문에 있다 — SINCERITY_BANNER 가 "응답이 **대부분** 같은
 * 항목으로 선택되어"라고 적혀 있어 100% 동일을 요구하지 않는다.
 * 실측 임계(2026-08-12 개정 후 — 인접 척도 응답은 offmode 로 세지 않는다):
 *   answered=24 → 값이 최빈값과 2칸(50) 이상 떨어진 응답 2개 이하 / answered=20 → 동일 기준.
 * G-2(WARN 2) — 종전 식(최빈값과 정확히 다르면 전부 offmode)은 22개 '매우 그렇다' + 2개
 * '그렇다'(인접 1칸) 조합을 오탐 flagged 했다. SINCERITY_OFFMODE_MIN_DISTANCE 로 "얼마나 먼
 * 응답인가"를 먼저 거른 뒤에만 이 개수 상한을 적용한다.
 *
 * 수집하지 않아 쓸 수 없는 신호: 응답 소요시간·IP·재응시 이력(미수집), 역채점 문항(q9·q11 문장이
 * 전부 같은 방향 서술이라 부재), 배타 선택지 동시 선택(진짜 어려움이 없는 학생과 구분 불가),
 * q19 공백(선택 입력이라 무의미).
 */
export const SINCERITY_MAX_OFFMODE = 2;

/**
 * offmode 판정 최소 거리(리커트 값 단위, 0/25/50/75/100 중 1칸=25).
 *
 * 자체 결정(2026-08-12) — 원본 근거 없음. 확정 시 이 값만 교체. 관련 F-15 / Q-16 / G-2 WARN 2
 *
 * 종전엔 최빈값과 값이 정확히 다르면 무조건 offmode 로 셌다 — 22개 '매우 그렇다'(100) + 2개
 * '그렇다'(75) 조합이 실제로 flagged 됐다(오탐 실측). 인접 척도(1칸)를 오가는 것은 리커트
 * 응답의 정상 편차이지 직선 응답의 증거가 아니다. 2칸(=50) 이상 떨어진 값만 세면 위 예시가
 * offmodeCount=0 이 되어 더 이상 flagged 되지 않는다. 값을 늘리면(예: 75) 판정이 더 관대해지고,
 * 줄이면(예: 25 — 사실상 종전 방식) 더 엄격해진다.
 */
export const SINCERITY_OFFMODE_MIN_DISTANCE = 50;

/* ---- F-06 고3 6월 이후 서비스 2종 제한 (Q-13) ---- */

/**
 * 규칙 자체는 원문이다 — 배점표 28행 "고등학교 3학년 추천 서비스 후보 6종 전부 (6월 이후 가입은 2종)".
 * 원문이 비운 두 칸(어느 2종인가 / 기준일을 무엇으로 재는가)만 아래에서 자체 결정한다.
 */

/**
 * 제한이 시작되는 달(KST 기준, 이 달 1일 00:00 부터 포함).
 *
 * 자체 결정(2026-08-11) — 원본 근거 없음. 확정 시 이 값만 교체. 관련 Q-13
 * (달 숫자 6 자체는 원문이고, '6월 포함'이라는 경계 해석이 자체 결정이다 — 한국어 관용상
 *  '6월 이후'는 6월을 포함한다고 읽었다.)
 */
export const SERVICE_H3_LATE_MONTH = 6;

/**
 * 제한 시 남기는 2종.
 *
 * 자체 결정(2026-08-11) — 원본 근거 없음. 확정 시 이 값만 교체. 관련 Q-13
 *
 * 배점표 01 시트에서 '2종'이 등장하는 다른 두 행(M3 25행 · N수생 29행)이 둘 다
 * `목표관리 · 콜멘토`로 명시돼 있다. 같은 표 안에서 같은 축약어가 다른 것을 가리킬 근거가 없어
 * 동일 2종을 채택했다(SERVICE_GRADE_FILTER.M3/RETAKE 와도 일치).
 */
export const SERVICE_H3_LATE_CODES = ["GOAL_CARE", "CALL_MENTOR"];

/* ---- F-22 입결 컷 조회 실패 전파 ---- */

/**
 * 조회 실패 센티널. `fetchAdmissionCuts` 가 "정상 조회했으나 컷 없음(null)"과 "조회 실패"를
 * 구분해 돌려주기 위한 값이다. 창작한 **문구**가 아니라 창작한 **신호**라 이 블록에 둔다.
 *
 * 판별은 반드시 참조 동일성(`result === ADMISSION_FETCH_ERROR`)으로 한다 — `result == null`
 * 같은 느슨한 비교를 쓰면 센티널이 다시 결측으로 뭉개져 F-22 가 그대로 되살아난다.
 * freeze 해 두는 이유는 호출부가 이 객체에 필드를 얹어 상태를 오염시키는 것을 막기 위해서다.
 */
export const ADMISSION_FETCH_ERROR = Object.freeze({
  error: "ADMISSION_FETCH_FAILED",
});
