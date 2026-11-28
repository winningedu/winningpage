/**
 * 무료진단 설문 문항 데이터 (17문항 / 5스텝)
 * Figma: hsokTD6OilcNEXyCR24sn4 / 1889:13222 ("설문조사 선택한 상태"), 1889:8753 ("설문조사 ver2")
 *        + 1889:9045, 1889:9491, 1889:9866, 1889:10355, 1889:10656
 *
 * docs/학습진단-계산엔진-적용명세.md §2(설문 변경사항)·§3(응답 스키마) 반영본.
 * - 구 q5(평균 내신 기준 7지) · 구 q7(학기별 평균 5칸)은 배점표·시안 어디에도 없어 삭제했다(§2.2).
 *   결과 분포 3 / 3 / 2 / 4 / 5 = 17. `getRemainingAfterStep()` 은 문항 수를 세므로
 *   스텝1 하단 라벨이 16 → 14 로 자동 변경된다(§2.3).
 * - page: 1~5 = 시안 프레임 5개(8753 / 9045 / 9491 / 9866 / 10656)와 1:1 대응하는 스텝 번호.
 * - number: 카드 뱃지 숫자. 삭제된 5·7 자리를 메우지 않고 시안 뱃지(4·6·8…)를 그대로 둔다.
 *   1~17 재번호 여부는 미확정 — TODO(Q-02).
 * - q3 / q8 안에 중첩된 조건부 문항은 number:null + extra.embeddedIn 으로 표시하며
 *   부모와 동일한 page 를 갖는다.
 *   (extra.dependsOn.questionId 답변이 채워지면 부모 QuestionCard 안에서 노출)
 * - maxSelect: 복수선택 최대 개수. 없으면 무제한.
 * - exclusiveValues: 선택 시 같은 문항의 다른 선택을 모두 해제해야 하는 배타 선택지(라벨 기준 — OptionGroup 용).
 *
 * 채점 부착 데이터 (§3.5 — 채점 엔진은 라벨 문자열이 아니라 아래 코드로 채점한다)
 * - scoringId    : 배점표(01_문항별배점) 문항 번호. 화면 뱃지(number)와 다르다(§2.1 대조표).
 * - optionCodes  : options 와 **같은 서수**로 정렬된 코드 배열. 라벨 1자 수정이 침묵 오채점으로
 *                  이어지지 않도록 코드는 인덱스로만 부여한다. 라벨→코드 변환은 getOptionCode() 사용.
 * - exclusiveCodes : exclusiveValues 의 코드 표현(§3.5 적재 검증식이 마지막 원소를 요구한다).
 * - statements   : 리커트 문장을 { key, text } 로 승격했다(§3.3). 저장 키가 서수('0'..'11')가 아니라
 *                  안정 키(LK1_01..)가 되어 문장 순서를 바꿔도 과거 응답의 의미가 보존된다.
 *                  LikertMatrix.normalizeStatement 가 string | {key,text} 를 모두 받으므로 컴포넌트 무수정.
 *
 * 입력 규격 (§3.4)
 * - requiredFields : grade-grid 처럼 여러 칸을 한 문항으로 묶는 타입에서 **칸 단위 필수**를 지정한다.
 *                    isAnswered('grade-grid') 는 그룹 내 아무 칸이나 채워지면 true 라, 모의고사 1칸만
 *                    채우고도 naesinOverall = null 로 리포트에 도달하는 경로가 열려 있었다(B-08).
 * - extra.validationDependsOn : 입력 도메인이 형제 문항 응답에 종속됨을 선언한다. answers 전체를 가진
 *                    QuestionCardList 가 이 키를 읽어 GRADE_SYSTEM_INPUT_RULES 를 골라 constraint
 *                    prop 하나만 내린다(§6.3 B-12 — answers 전체를 하위로 뿌리지 않는다).
 * - field.scale    : 'NAESIN' = 등급 체계에 종속되는 칸 / 'MOCK' = 체계와 무관하게 정수 1~9 고정.
 * - group.hiddenWhenGradeSystem : 해당 체계에서 그룹 전체를 숨긴다(중학생 평균은 '등급' 개념이 없다).
 */

/**
 * 응답 저장 스키마 버전.
 *
 * 이 값이 바뀌면 이전 버전으로 저장된 answers 는 **복원하지 않고 버린다**. 마이그레이션을 쓰지 않는 이유:
 * 리커트 저장 키가 서수('0'..'11') → 안정 키('LK1_01'..)로 바뀌었는데, 구 응답의 '0' 이 어느 문장이었는지는
 * 문장 순서가 그 사이 바뀌지 않았다는 보장이 있어야만 복원 가능하다(그 보장이 없어서 키를 승격한 것이다).
 * 게다가 q5·q7 삭제와 q4 선택지 도메인 전환(등급 → 100점 만점)까지 겹쳐, 잘못 복원된 값은 조용히 오채점된다.
 * 영속화 계층(SurveyStepShell)은 저장 시 이 값을 함께 기록하고, 복원 시 불일치하면 폐기해야 한다.
 */
export const SURVEY_SCHEMA_VERSION = "2026-08-fd2";

/**
 * 등급 체계별 내신 입력 규격 (§3.4).
 *
 * 값 범위(min/max)와 마스크(pattern)는 역할이 다르다 — 마스크는 "타이핑을 허용할 문자열 형태",
 * min/max 는 "확정된 값의 도메인"이다. 마스크를 도메인까지 좁히면 `1` 을 치는 도중(`1` → `10`)에
 * 입력이 막혀 100 을 아예 칠 수 없다(현행 단일 상수 /^\d{0,2}(\.\d{0,2})?$/ 의 실제 증상).
 * UNKNOWN 은 NINE 과 동일 규격을 쓰되 채점에서는 값을 무시한다(§3.4).
 *
 * 이 표가 저장소 전체의 유일한 정의처다. 한때 diagnosisScoringTable.js 가 같은 표를 채점 쪽에서
 * 한 벌 더 들고 있었는데, 소비자가 0건인 채로 갈라질 자리만 만들고 있었다 — 사본을 되살리지 마라.
 * 채점이 도메인 검사를 하게 되면 이 상수를 import 한다.
 */
export const GRADE_SYSTEM_INPUT_RULES = {
  NINE: {
    code: "NINE",
    min: 1,
    max: 9,
    decimals: 2,
    pattern: /^\d(\.\d{0,2})?$/,
  },
  FIVE: {
    code: "FIVE",
    min: 1,
    max: 5,
    decimals: 2,
    pattern: /^[1-5](\.\d{0,2})?$/,
  },
  MIDDLE_AVG: {
    code: "MIDDLE_AVG",
    min: 0,
    max: 100,
    decimals: 1,
    pattern: /^\d{0,3}(\.\d)?$/,
  },
  UNKNOWN: {
    code: "UNKNOWN",
    min: 1,
    max: 9,
    decimals: 2,
    pattern: /^\d(\.\d{0,2})?$/,
  },
};

// 모의고사 6칸은 등급 체계와 무관하게 정수 1~9 고정이다 — 배점표 5번이 "과목별 모의고사 등급"의
// 입력 개수만 쓰기 때문에 체계별로 분기할 근거가 없다(§3.4).
export const MOCK_GRADE_INPUT_RULE = {
  code: "MOCK",
  min: 1,
  max: 9,
  decimals: 0,
  pattern: /^[1-9]$/,
};

export const renewalSurveyQuestions = [
  {
    id: "q1",
    number: 1,
    scoringId: 1,
    page: 1,
    category: "기본정보",
    title: "현재 학년을 선택해 주세요",
    helper: "하나만 선택해 주세요.",
    type: "radio-chip",
    options: [
      "중학생",
      "고등학교 1학년",
      "고등학교 2학년",
      "고등학교 3학년",
      "N수생",
    ],
    optionCodes: ["M3", "H1", "H2", "H3", "RETAKE"],
    extra: {},
  },
  {
    id: "q2",
    number: 2,
    // 배점 계산에는 쓰이지 않는다(수집·표시 전용). 단 4.6 입결 마스터 조회 기준으로는 쓰인다 — TODO(Q-35).
    scoringId: 2,
    page: 1,
    category: "기본정보",
    title: "현재 재학 중인 학교 유형을 선택해 주세요.",
    helper: "하나만 선택해 주세요.",
    type: "radio-chip",
    options: [
      "일반고",
      "자율형・사립고",
      "특목고",
      "특성화고",
      "중학교",
      "기타",
      "해당 없음",
    ],
    optionCodes: [
      "GENERAL",
      "AUTONOMOUS",
      "SPECIAL",
      "VOCATIONAL",
      "MIDDLE",
      "ETC",
      "NONE",
    ],
    extra: {},
  },
  {
    id: "q3",
    number: 3,
    scoringId: 3,
    page: 1,
    category: "목표설정",
    title: "현재 진학 목표는 어느 정도 정해져 있나요?",
    helper: "하나만 선택해 주세요.",
    type: "radio-row",
    options: [
      "목표 대학과 학과가 모두 정해져 있어요",
      "목표 대학만 정해져 있어요",
      "희망 학과나 계열만 정해져 있어요",
      "대략적인 대학 수준만 생각하고 있어요",
      "여러 목표 사이에서 고민하고 있어요",
      "아직 구체적인 목표가 없어요",
    ],
    optionCodes: [
      "BOTH",
      "UNIV_ONLY",
      "MAJOR_ONLY",
      "TIER_ONLY",
      "UNDECIDED_MULTI",
      "NONE",
    ],
    extra: {},
  },
  {
    id: "q3-target-university",
    number: null,
    // 점수 무관(수집 전용) — goal.targetUniversity 로만 흐른다.
    scoringId: null,
    page: 1,
    category: null,
    // `(선택입력)` 표기는 선택 상태 시안(1889:13222)에만 있던 것이며 정본(8753)에는 없음.
    title: "목표대학",
    helper: null,
    type: "text",
    options: [],
    extra: {
      embeddedIn: "q3",
      dependsOn: { questionId: "q3" },
      placeholder: "예) 성균관대학교",
    },
  },
  {
    id: "q3-target-major",
    number: null,
    scoringId: null,
    page: 1,
    category: null,
    // `(선택입력)` 표기는 선택 상태 시안(1889:13222)에만 있던 것이며 정본(8753)에는 없음.
    title: "희망 학과 또는 모집단위",
    helper: null,
    type: "text",
    options: [],
    extra: {
      embeddedIn: "q3",
      dependsOn: { questionId: "q3" },
      placeholder: "예) 경영학과",
    },
  },
  {
    id: "q3-target-reason",
    // Figma 원문 라벨이 q3-target-major 와 중복 표기된 오탈자 — 사용자 확정 문구로 교체
    number: null,
    // 배점표 3번의 '목표 선정 이유' 가산(GOAL_REASON_POINTS)이 이 문항을 쓴다.
    scoringId: 3,
    page: 1,
    category: null,
    title: "목표 선정 이유",
    helper: null,
    type: "radio-row",
    options: [
      "해당 분야에 관심과 적성이 있어서",
      "희망 직업과 연결되어 있어서",
      "대학의 인지도나 선호도가 높아서",
      "현재 성적으로 지원할 수 있을 거 같아서",
      "부모님이나 주변의 권유로",
      "지역이나 통학 조건이 적합해서",
      "아직 충분히 알아보지 못했어요",
    ],
    optionCodes: [
      "APTITUDE",
      "JOB",
      "REPUTATION",
      "SCORE_FIT",
      "PARENT",
      "LOCATION",
      "UNKNOWN",
    ],
    extra: {
      embeddedIn: "q3",
      dependsOn: { questionId: "q3" },
    },
  },
  {
    id: "q4",
    // 2026-09-02 QA 행 348: 학년 자동 결정으로 전환, 화면 노출 안 함. number: null 이라
    // surveyMainQuestions(number != null 필터)에서 빠져 카드가 렌더되지 않는다 — id·scoringId·
    // options·optionCodes 는 그대로 두어 채점(codeOf("Q4_SYSTEM", answers.q4))과 과거 저장
    // 응답(UNKNOWN 포함) 호환 경로를 건드리지 않는다. 새 응답의 q4 값은
    // getGradeSystemLabelForGradeLevel(q1 라벨)이 자동으로 채운다(SurveyStepShell.setAnswer).
    number: null,
    scoringId: 4,
    page: 2,
    category: "기본정보",
    title: "현재 적용되는 내신 등급 체계를 선택해 주세요.",
    helper: "하나만 선택해 주세요.",
    type: "radio-row",
    // 3번째 선택지는 라벨 교체가 아니라 **입력 도메인 전환**이다(§2.2): '성취평가제 중심' → '중학생 평균'.
    // naesinOverall 의 정의역이 등급 1~9 에서 100점 만점 평균점수로 바뀌므로 q6 의 마스크·범위·
    // placeholder 가 함께 움직인다(GRADE_SYSTEM_INPUT_RULES.MIDDLE_AVG).
    // F-13(2026-08-12 확정, Q-31 종결) — 고교 성취평가제(A~E) 전용 선택지는 추가하지 않는다.
    // 시안(1889:9104/9109/9114)도 처음부터 3지(9등급제/5등급제/중학생 평균)만 표기했다 — '잘
    // 모르겠어요'는 그 3지에 없던 이탈구(escape hatch)로 시안에 없는 4번째 항목이지 성취평가제의
    // 대체재로 설계된 게 아니다. 즉 구현(4지 선택지)이 이미 시안과 일치하며, 성취평가제 학생이
    // '잘 모르겠어요'로 흡수되는 것은 폴백이 아니라 원래부터 지원 범위 밖인 입력 도메인이다.
    // 9등급 환산표를 새로 만드는 대신 F-12(UNKNOWN 표시 개선)로 원값이라도 보여주는 쪽을
    // 택했다 — 성취평가제 학생도 q6 원값 입력은 보존되고 gpa 표시에 '(체계 미확인)' 접미어만 붙는다.
    // QA 행348 이후 UNKNOWN 은 새 응답에서 더 이상 선택될 수 없다(q1 매핑에 없음) — 과거 저장된
    // "잘 모르겠어요" 응답을 읽는 채점 경로 호환용으로만 남긴다.
    options: ["9등급제", "5등급제", "중학생 평균", "잘 모르겠어요"],
    optionCodes: ["NINE", "FIVE", "MIDDLE_AVG", "UNKNOWN"],
    extra: {},
  },
  {
    id: "q6",
    number: 4,
    scoringId: 5,
    page: 2,
    category: "성적입력",
    title: "현재 성적을 입력해 주세요",
    // 구 q5(평균 내신 산출 기준 7지)가 삭제되면서 "어떤 기준의 평균인지"를 특정하던 유일한 문항이
    // 사라졌다. 기준이 없으면 4.6 에서 서로 다른 산출 기준의 값이 같은 교과 컷과 직접 비교된다 →
    // 헬퍼로 기준을 고정한다(§2.3).
    helper: "내신 전체 평균은 전 과목 평균 기준으로 입력해 주세요.",
    type: "grade-grid",
    options: [],
    // 그룹 단위 isAnswered 는 모의고사 1칸만 채워도 통과시킨다 → 전체 평균을 칸 단위로 필수화한다(B-08).
    requiredFields: ["overall_avg"],
    extra: {
      // 등급 체계(q4)에 따라 마스크·범위·표시 칸이 달라진다 — QuestionCardList 가 이 키를 읽는다.
      validationDependsOn: "q4",
      groups: [
        {
          key: "overall",
          label: "내신 전체 평균 (필수)",
          // QA 행348(2026-09-02) — q4 카드가 사라진 대신 등급 체계를 라벨에 괄호로 표기한다.
          // 중학생 평균(MIDDLE_AVG)·미지(UNKNOWN)는 기존 라벨을 그대로 쓴다(label 폴백).
          labelBySystem: {
            NINE: "내신 전체 평균 (9등급) (필수)",
            FIVE: "내신 전체 평균 (5등급) (필수)",
          },
          fields: [
            {
              key: "overall_avg",
              label: "전체 평균",
              scale: "NAESIN",
              required: true,
              placeholder: "3.24",
              // 중학생 평균은 100점 만점이라 등급 예시(3.24)가 오히려 오입력을 유도한다.
              placeholderBySystem: { MIDDLE_AVG: "88.5" },
            },
          ],
        },
        {
          // 시안 3795:24003 신규 그룹. 배점표에 없어 점수에는 쓰이지 않는다 — TODO(Q-23) 표시 용도 확정 대기.
          key: "recent_exam",
          label: "최근에 본 시험 평균 등급 (선택)",
          // 중학생에게는 '등급' 개념이 성립하지 않는다(§3.4).
          hiddenWhenGradeSystem: ["MIDDLE_AVG"],
          fields: [
            {
              key: "recent_exam_avg",
              label: "전체 평균 등급",
              scale: "NAESIN",
              placeholder: "3.00",
            },
          ],
        },
        {
          key: "mock_exam",
          label: "최근 모의고사 등급",
          hiddenWhenGradeSystem: ["MIDDLE_AVG"],
          fields: [
            {
              key: "mock_korean",
              label: "국어 등급",
              scale: "MOCK",
              placeholder: "1~9",
            },
            {
              key: "mock_math",
              label: "수학",
              scale: "MOCK",
              placeholder: "1~9",
            },
            {
              key: "mock_english",
              label: "영어",
              scale: "MOCK",
              placeholder: "1~9",
            },
            {
              key: "mock_social",
              label: "사회",
              scale: "MOCK",
              placeholder: "1~9",
            },
            {
              key: "mock_science",
              label: "과학",
              scale: "MOCK",
              placeholder: "1~9",
            },
            {
              key: "mock_korean_history",
              label: "한국사",
              scale: "MOCK",
              placeholder: "1~9",
            },
          ],
        },
      ],
    },
  },
  {
    id: "q8",
    number: 5,
    scoringId: 6,
    page: 2,
    category: "기본정보",
    title: "최근 성적은 어떤 흐름을 보이고 있나요?",
    helper: "하나만 선택해 주세요.",
    type: "radio-row",
    options: [
      "대부분의 과목이 상승하고 있어요",
      "일부 과목은 상승하고 일부는 비슷해요",
      "큰 변화 없이 정체되어 있어요",
      "일부 과목이 하락하고 있어요",
      "과목마다 성적 변동이 큰 편이에요",
      "아직 비교할 시험 결과가 부족해요",
    ],
    optionCodes: [
      "UP_MOST",
      "UP_PART",
      "FLAT",
      "DOWN_PART",
      "VOLATILE",
      "NO_DATA",
    ],
    extra: {},
  },
  {
    id: "q8-followup",
    // 결정 B9=(b): 선택지에 '여러 과목'이 있으므로 단일선택이 설계 의도. chip-multi → radio-chip.
    number: null,
    // 점수 무관(trendSubject 는 표시 전용).
    scoringId: null,
    page: 2,
    category: null,
    title: "성적 변화가 가장 큰 과목",
    helper: null,
    type: "radio-chip",
    options: [
      "국어",
      "수학",
      "영어",
      "사회",
      "과학",
      "탐구",
      "여러 과목",
      "잘 모르겠어요",
    ],
    optionCodes: [
      "KOREAN",
      "MATH",
      "ENGLISH",
      "SOCIAL",
      "SCIENCE",
      "INQUIRY",
      "MULTIPLE",
      "UNKNOWN",
    ],
    extra: {
      embeddedIn: "q8",
      dependsOn: { questionId: "q8" },
    },
  },
  {
    id: "q9",
    number: 6,
    scoringId: 7,
    page: 3,
    category: "기본정보",
    title: "다음 문장이 현재 자신의 모습과 얼마나 가까운지 선택해 주세요.",
    helper: "",
    type: "likert",
    options: [],
    extra: {
      scale: [
        "매우 그렇다",
        "대체로 그렇다",
        "보통이다",
        "별로 그렇지 않다",
        "전혀 그렇지 않다",
      ],
      // LK1_nn = 배점표 7번 nn번 문장. 저장 키가 곧 이 key 다(§3.3).
      statements: [
        {
          key: "LK1_01",
          text: "다음 시험에서 달성하고 싶은 성적이나 등급이 구체적으로 정해져 있다",
        },
        {
          key: "LK1_02",
          text: "목표를 위해 어떤 과목과 단원을 먼저 공부해야 하는지 알고 있다",
        },
        {
          key: "LK1_03",
          text: "해야 할 공부를 주간 또는 일간 단위의 구체적인 분량으로 나누고 있다",
        },
        {
          key: "LK1_04",
          text: "시험, 수행평가, 학교 일정까지 고려해 계획을 조정하고 있다",
        },
        {
          key: "LK1_05",
          text: "세운 계획의 70% 이상을 실제로 완료하는 편이다",
        },
        {
          key: "LK1_06",
          text: "해야 할 공부를 미루지 않고 정해진 시간에 시작하는 편이다",
        },
        {
          key: "LK1_07",
          text: "평일과 주말에 일정한 공부 시간을 확보하고 있다",
        },
        {
          key: "LK1_08",
          text: "취약 과목과 중요한 과목에 시간을 우선 배분하고 있다",
        },
        { key: "LK1_09", text: "틀린 문제의 원인을 구분해 다시 확인하고 있다" },
        {
          key: "LK1_10",
          text: "시험 결과를 보고 공부 방법이나 계획을 수정한다",
        },
        {
          key: "LK1_11",
          text: "성적이 기대보다 낮아도 학습 리듬을 비교적 빠르게 회복한다",
        },
        {
          key: "LK1_12",
          text: "해야 할 일이 많거나 불안할 때도 공부를 시작할 수 있다",
        },
      ],
    },
  },
  {
    // 1889:9491 의 Q10 (13지). 1889:9866 / 1889:10355 에 뱃지 "10" 으로 그려진 14지 문항은
    // 별개 문항이며 12번이 확정이다(q12 참조).
    id: "q10",
    number: 7,
    scoringId: 8,
    page: 3,
    category: "기본정보",
    // QA 행350 — 한 줄로 길게 이어지던 질문을 본문/보조 지시 두 줄로 나눈다. 보조 지시 문구는
    // 기존 helper와 동일 문구를 그대로 title 2행으로 옮긴 것이라 helper는 비운다(중복 렌더 방지).
    // QuestionCard가 whitespace-pre-line으로 렌더한다.
    title:
      "최근 학습을 가장 자주 방해하는 요인은 무엇인가요?\n최대 3개를 선택해 주세요",
    helper: null,
    type: "checkbox-row",
    maxSelect: 3,
    exclusiveValues: ["특별히 큰 어려움은 없어요"],
    exclusiveCodes: ["OBS_13"],
    options: [
      "무엇부터 공부해야 할지 모르겠어요",
      "계획을 너무 크게 세워 자주 밀려요",
      "계획은 있지만 시작을 자주 미뤄요",
      "휴대전화나 영상 때문에 집중이 끊겨요",
      "학교와 학원 일정 때문에 자습 시간이 부족해요",
      "특정 과목의 공부 방법을 모르겠어요",
      "문제를 풀고도 오답 정리를 하지 못해요",
      "공부한 시간에 비해 성적이 잘 오르지 않아요",
      "수행평가와 시험 준비가 자주 겹쳐요",
      "성적과 입시에 대한 불안이 커요",
      "주변 학생과 비교하면서 자신감이 떨어져요",
      "공부에 대한 의욕이 많이 줄었어요",
      "특별히 큰 어려움은 없어요",
    ],
    optionCodes: [
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
    extra: {},
  },
  {
    id: "q11",
    number: 8,
    scoringId: 9,
    page: 4,
    category: "기본정보",
    title: "다음 문장이 현재 자신의 모습과 얼마나 가까운지 선택해 주세요.",
    helper: "",
    type: "likert",
    options: [],
    extra: {
      scale: [
        "매우 그렇다",
        "대체로 그렇다",
        "보통이다",
        "별로 그렇지 않다",
        "전혀 그렇지 않다",
      ],
      // LK2_nn = 배점표 9번 nn번 문장.
      statements: [
        {
          key: "LK2_01",
          text: "과목별 성적과 학습 상태를 비교해 강점과 약점을 알고 있다",
        },
        {
          key: "LK2_02",
          text: "취약 과목을 보완하기 위한 구체적인 학습 방법이 있다",
        },
        {
          key: "LK2_03",
          text: "수행평가 안내문에서 평가 기준과 제출 조건을 파악할 수 있다",
        },
        {
          key: "LK2_04",
          text: "수행평가를 시험 준비와 겹치지 않게 미리 준비하는 편이다",
        },
        {
          key: "LK2_05",
          text: "교과에서 배운 개념을 탐구 주제로 발전시킬 수 있다",
        },
        {
          key: "LK2_06",
          text: "신뢰할 수 있는 자료를 활용해 단순 조사 이상의 분석을 만들 수 있다",
        },
        {
          key: "LK2_07",
          text: "이전에 한 활동을 새로운 탐구로 심화하거나 확장할 수 있다",
        },
        {
          key: "LK2_08",
          text: "교과 활동과 진로 관심을 자연스럽게 연결할 수 있다",
        },
        {
          key: "LK2_09",
          text: "활동에서 맡은 역할과 실제 수행 과정을 구체적으로 설명할 수 있다",
        },
        {
          key: "LK2_10",
          text: "활동을 통해 배운 점과 성장한 점을 자기평가서로 정리할 수 있다",
        },
        {
          key: "LK2_11",
          text: "희망 대학과 학과에서 중요하게 보는 요소를 알고 있다",
        },
        {
          key: "LK2_12",
          text: "현재 성적과 학생부를 기준으로 앞으로 보완할 부분을 알고 있다",
        },
      ],
    },
  },
  {
    // 1889:9866 / 1889:10355 의 두 번째 "10" 뱃지 카드(14지). 뱃지 숫자는 시안 오기이며
    // 실제 문항 번호는 12번으로 확정됨.
    id: "q12",
    number: 9,
    scoringId: 10,
    page: 4,
    category: "기본정보",
    // QA 행350 — q10과 동일 사유(위 주석 참고).
    title:
      "학교 활동이나 입시 준비에서 현재 가장 어려운 부분은 무엇인가요?\n최대 3개를 선택해 주세요",
    helper: null,
    type: "checkbox-row",
    maxSelect: 3,
    exclusiveValues: ["현재는 관련 도움이 크게 필요하지 않아요"],
    exclusiveCodes: ["DIF_14"],
    options: [
      "과목별 성적을 어떻게 관리해야 할지 모르겠어요",
      "수행평가 안내문을 해석하기 어려워요",
      "수행평가 주제를 정하기 어려워요",
      "자료를 찾고 글의 구조를 구성하기 어려워요",
      "기본적인 보고서는 쓸 수 있지만 깊이가 부족해요",
      "교과 내용을 심화 탐구로 발전시키기 어려워요",
      "진로와 교과 활동을 연결하기 어려워요",
      "이전에 했던 활동과 겹치지 않는 주제를 만들기 어려워요",
      "논문이나 학술자료를 활용하기 어려워요",
      "활동 후 자기평가서를 작성하기 어려워요",
      "학생부의 강점과 부족한 점을 모르겠어요",
      "목표 대학의 입결과 전형을 해석하기 어려워요",
      "지원 대학의 도전·적정·안정 범위를 모르겠어요",
      "현재는 관련 도움이 크게 필요하지 않아요",
    ],
    optionCodes: [
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
    extra: {},
  },
  {
    id: "q13",
    number: 10,
    scoringId: 11,
    page: 4,
    category: "기본정보",
    title: "현재 준비 중인 일정 중 가장 가까운 것은 무엇인가요?",
    helper: "하나만 선택해 주세요.",
    type: "radio-row",
    options: [
      "7일 이내 수행평가",
      "2주 이내 시험 또는 수행평가",
      "한 달 이내 중요한 일정",
      "수시 원서 접수 준비",
      "당장 급한 일정 없음",
      "잘 모르겠어요",
    ],
    optionCodes: ["PA_7D", "EXAM_2W", "MONTH_1", "SUSI", "NONE", "UNKNOWN"],
    extra: {},
  },
  {
    id: "q14",
    number: 11,
    scoringId: 12,
    page: 4,
    category: "기본정보",
    title: "어떤 방식의 도움을 받을 때 가장 잘 실천할 수 있을 것 같아요?",
    helper: "최대 2개를 선택해 주세요.",
    type: "checkbox-row",
    maxSelect: 2,
    options: [
      "성적과 문제점 분석",
      "주 1회 계획 점검",
      "매일 공부량 관리",
      "과목별 공부 방법 피드백",
      "수행평가 집중 지원",
      "심화탐구 설계",
      "자기평가서 정리",
      "지원 가능 대학 분석",
      "수시전략 상담",
      "멘토와 고민 상담",
    ],
    optionCodes: [
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
    extra: {},
  },
  {
    id: "q15",
    number: 12,
    scoringId: 13,
    page: 5,
    category: "기본정보",
    title: "목표 대학 입결 조회",
    helper: null,
    type: "cascade",
    // 목표 대학 미정 학생(q3 "아직 구체적인 목표가 없어요" 등)도 진단을 완주할 수 있어야 한다.
    // 채점 명세(엑셀 08_합격가능성)에 "입결 자료 없음 → 보조 점수 70 중립, 구간 미산출" 경로가
    // 이미 존재하므로 q15 미응답도 정상 채점 가능 — 진행 필수 요건에서 제외한다.
    optional: true,
    options: [],
    extra: {
      // G-1d(2026-08-12) — 정적 플레이스홀더를 useAdmissionCascade.js 의 실측 옵션 표기와 동기화했다
      // ('건국대학교'→'건국대', '학생부종합'→'종합', 'KU자기추천'→'일반전형'). 정본 마스터가
      // 축약형이라 첫 렌더(플레이스홀더)와 실제 선택값이 다른 표기 체계로 보이던 문제(F-19)를 닫는다.
      // 예시 텍스트일 뿐 조회 키가 아니므로 값이 바뀌어도 조회는 깨지지 않는다.
      levels: [
        { key: "university", label: "대학 선택", placeholder: "건국대" },
        {
          key: "department",
          label: "학과 또는 모집단위",
          placeholder: "경영학과",
        },
        { key: "admissionType", label: "전형 유형", placeholder: "종합" },
        { key: "detailType", label: "세부 전형명", placeholder: "일반전형" },
      ],
    },
  },
  {
    id: "q16",
    number: 13,
    scoringId: 14,
    page: 5,
    category: "기본정보",
    title: "수능 최저 예상은 어떠신가요?",
    helper: "하나만 선택해 주세요.",
    type: "radio-row",
    options: [
      "충족 가능성이 높아요",
      "경계 수준이에요",
      "충족하기 어려워요",
      "수능최저가 없어요",
      "잘 모르겠어요",
    ],
    optionCodes: ["HIGH", "BORDER", "HARD", "NONE", "UNKNOWN"],
    extra: {},
  },
  {
    id: "q17",
    number: 14,
    scoringId: 15,
    page: 5,
    category: "기본정보",
    title: "학생부종합 준비 상태는 어떠신가요?",
    helper: "하나만 선택해 주세요.",
    type: "radio-row",
    options: [
      "여러 학년에 걸쳐 이어져 있어요",
      "활동은 있지만 연결되지 않아요",
      "성적은 괜찮지만 탐구가 부족해요",
      "탐구는 많지만 성적이 부족해요",
      "모두 평균적인 수준이에요",
      "강점과 부족한 점을 모르겠어요",
      // QA 행348 — "잘 모르겠어요" 추가. 위의 "강점과 부족한 점을 모르겠어요"와 별개 선택지지만
      // 둘 다 '준비 상태를 판단하지 못함'이라는 같은 의미라 새 코드를 만들지 않고 기존 UNKNOWN을
      // 그대로 재사용한다(JONGHAP_DELTA.UNKNOWN=-5, q18의 "잘 모르겠어요"와 동일 처리 원칙).
      "잘 모르겠어요",
    ],
    optionCodes: [
      "CONNECTED",
      "UNLINKED",
      "GRADE_OK",
      "INQUIRY_OK",
      "AVERAGE",
      "UNKNOWN",
      // 2026-09-02 — 두 선택지가 같은 코드(UNKNOWN)를 쓰면 어드민 문구 오버라이드
      // (`q17.option.UNKNOWN`)가 두 칩에 같이 걸려 라벨이 중복되고 React key도 충돌했다
      // (설문 콘솔 "Encountered two children with the same key"). 별도 코드로 분리하되
      // 채점은 JONGHAP_DELTA.UNSURE = UNKNOWN 과 같은 -5 로 둔다.
      "UNSURE",
    ],
    extra: {},
  },
  {
    id: "q18",
    number: 15,
    scoringId: 16,
    page: 5,
    category: "기본정보",
    title: "면접 준비 상태는 어떠신가요?",
    helper: "하나만 선택해 주세요.",
    type: "radio-row",
    options: [
      "충분히 연습했고 자신 있어요",
      "기본은 말할 수 있지만 후속이 어려워요",
      "학생부 정리가 부족해요",
      "준비를 시작하지 못했어요",
      "면접이 없는 전형이에요",
      "잘 모르겠어요",
    ],
    optionCodes: [
      "CONFIDENT",
      "BASIC",
      "RECORD_WEAK",
      "NOT_STARTED",
      "NO_INTERVIEW",
      "UNKNOWN",
    ],
    extra: {},
  },
  {
    id: "q19",
    number: 16,
    // 배점표 17번 — 감지 단어 18개로 콜멘토 '어려움' 가산에 실제로 쓰인다(§2.2).
    scoringId: 17,
    page: 5,
    category: "기본정보",
    title:
      "최근 공부나 입시와 관련하여 가장 답답했던 상황을 한 문장으로 적어 주세요.",
    helper: null,
    type: "text",
    multiline: true,
    // 주관식 자유서술 — 선택입력이라 스텝 진행(제출) 요건에서 제외한다.
    optional: true,
    options: [],
    extra: {
      // 시안 입력 영역 992 × 105 px = 62rem × 6.5625rem, 콘텐츠 상단 정렬(items-start)
      placeholder:
        "예) 성적은 오르지 않고 해야 할 활동은 많은데 무엇부터 해야 할지 모르겠어요.",
    },
  },
];

/**
 * 라벨 → 선택지 코드 (§3.5).
 *
 * 저장된 answers 는 OptionGroup 이 넣은 **라벨 문자열**이라 코드로 가려면 서수를 한 번 경유해야 한다.
 * 이 함수를 거치면 라벨 오탈자 교정이 UI 와 채점에 동시에 반영된다. 미지 라벨·코드 미부착 문항은 null.
 */
export function getOptionCode(questionId, label) {
  const question = renewalSurveyQuestions.find(
    (item) => item.id === questionId,
  );
  if (!question?.optionCodes) return null;
  const index = question.options.indexOf(label);
  return index === -1 ? null : (question.optionCodes[index] ?? null);
}

/**
 * 코드 → 선택지 라벨 (getOptionCode 의 역변환). q4 카드가 화면에서 사라진 뒤
 * getGradeSystemLabelForGradeLevel 이 answers.q4 에 저장할 라벨 문자열을 만드는 데 쓴다 —
 * 채점(codeOf("Q4_SYSTEM", answers.q4))이 여전히 라벨 문자열을 기대하므로 코드를 answers 에
 * 직접 넣지 않는다(§3.5 계약 유지).
 */
function getOptionLabel(questionId, code) {
  const question = renewalSurveyQuestions.find(
    (item) => item.id === questionId,
  );
  if (!question?.optionCodes) return null;
  const index = question.optionCodes.indexOf(code);
  return index === -1 ? null : (question.options[index] ?? null);
}

/**
 * QA 행348(2026-09-02) — q4(등급 체계) 선택 단계를 없애고 q1(학년)으로 자동 결정한다.
 * 매핑: 중학생(M3) → 중학생 평균, 고1·고2(H1·H2) → 5등급제, 고3·N수생(H3·RETAKE) → 9등급제.
 * UNKNOWN 은 매핑에 없다 — 새 응답에서는 다시 나오지 않고 과거 저장 응답 호환 경로로만 남는다.
 */
const GRADE_SYSTEM_BY_GRADE_LEVEL = {
  M3: "MIDDLE_AVG",
  H1: "FIVE",
  H2: "FIVE",
  H3: "NINE",
  RETAKE: "NINE",
};

/**
 * q1(학년) 라벨 → q4(등급 체계) 라벨. SurveyStepShell.setAnswer 가 q1 응답이 바뀔 때마다 호출해
 * answers.q4 를 함께 갱신한다 — q6(성적 입력)의 마스크·범위(GRADE_SYSTEM_INPUT_RULES)가
 * extra.validationDependsOn: "q4" 로 이 값에 매여 있어 채점 로직·q6 자체는 손대지 않는다.
 * 미지 q1 라벨(또는 q1 미응답)은 null — 호출부가 그때는 answers.q4 를 건드리지 않는다.
 */
export function getGradeSystemLabelForGradeLevel(gradeLevelLabel) {
  const gradeLevelCode = getOptionCode("q1", gradeLevelLabel);
  const gradeSystemCode = gradeLevelCode
    ? GRADE_SYSTEM_BY_GRADE_LEVEL[gradeLevelCode]
    : null;
  return gradeSystemCode ? getOptionLabel("q4", gradeSystemCode) : null;
}
