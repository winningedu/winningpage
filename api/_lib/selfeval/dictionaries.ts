// 자기평가서 사전과 채점표 상수. 고객사 의견으로 문구와 배점이 바뀔 수 있어(명세 No.89)
// 한 곳에 모아 둔다. 나중에 설정값 테이블로 옮길 때 이 파일만 바꾸면 된다.

import type { ScoreItemKey } from "./types.js";

/** 상투어. 등장 횟수를 글자 수로 나눈 밀도로 쓴다. */
export const CLICHES: readonly string[] = [
  "인상적",
  "우수함",
  "뛰어남",
  "탁월",
  "성실",
  "적극적으로 참여",
  "열심히",
  "기여함",
  "돋보임",
  "모습을 보임",
  "능력이 우수",
  "노력하는 모습",
];

/** 합격을 암시하는 표현. 위닝 점수는 학교 채점 예측이 아니라서 본문과 안내에 쓰지 않는다. */
export const FORBIDDEN_PHRASES: readonly string[] = [
  "합격 가능성",
  "합격 가능",
  "합격률",
  "합격 확률",
  "입학 가능성",
  "확실히 합격",
  "예측",
];

/** 판단이 드러나는 낱말(§6 2). */
export const JUDGMENT_WORDS: readonly string[] = [
  "판단",
  "결론",
  "해석",
  "부족",
  "타당",
  "적절",
  "선택",
  "포기",
  "수정",
];

/** 직접 만든 흔적을 보는 낱말(§6 4). */
export const SELF_MADE_WORDS: readonly string[] = [
  "직접",
  "제작",
  "만들",
  "설계",
  "구성",
  "작성",
];

/** 자료로 확인되지 않는 느낌 표현(§6 14). */
export const FEELING_PATTERNS: readonly RegExp[] = [
  /느꼈다/,
  /깨달았다/,
  /같았다/,
  /인상 깊/,
  /뿌듯/,
  /보람/,
  /흥미로웠다/,
];

/** 자료명으로 보는 명사 끝(§2 21). */
export const SOURCE_SUFFIXES: readonly string[] = [
  "표",
  "자료",
  "데이터",
  "보고서",
  "논문",
  "그래프",
  "통계",
];

export const SCHOOL_NAME_PATTERN = /[가-힣]+(고등학교|고교)/;

export type ScoreRubricRow = {
  key: ScoreItemKey;
  label: string;
  max: number;
  /** 상위 25% 와 하위 25% 보유율 차이(p). 문항 대응은 위닝 고유 항목이라 null. */
  discrimination: number | null;
  /** 모델이 판정할 확인 문장. 명세 No.53 문구 그대로. */
  checks: readonly string[];
};

export const SCORE_RUBRIC: readonly ScoreRubricRow[] = [
  {
    key: "judgment",
    label: "판단",
    max: 25,
    discrimination: 70,
    checks: [
      "그 자료, 결과로 무엇을 판단했는지가 문장으로 있는가",
      "판단 근거가 되는 구체적 자료가 함께 제시되는가",
    ],
  },
  {
    key: "limitation",
    label: "한계",
    max: 15,
    discrimination: 46,
    checks: [
      "틀린 것, 오차, 일반화의 한계를 밝혔는가",
      "한계를 인식한 계기나 근거가 함께 있는가",
    ],
  },
  {
    key: "link",
    label: "연계와 발전",
    max: 15,
    discrimination: 39,
    checks: [
      "앞 활동의 이름과 그 활동이 남긴 것이 언급되는가",
      "앞 활동에서 이번 활동으로 이어진 이유가 있는가",
    ],
  },
  {
    key: "source",
    label: "자료 특정",
    max: 10,
    discrimination: 43,
    checks: [
      "자료를 고유명사로 특정했는가",
      "자료를 수치나 형식으로 특정했는가",
    ],
  },
  {
    key: "numbers",
    label: "수치와 근거",
    max: 10,
    discrimination: 39,
    checks: ["수치나 식이 근거로 쓰였는가", "수치가 두 개 이상 등장하는가"],
  },
  {
    key: "start",
    label: "출발점",
    max: 10,
    discrimination: 32,
    checks: [
      "수업의 어느 대목에서 출발했는지 밝혔는가",
      "계기가 된 질문이나 상황이 드러나는가",
    ],
  },
  {
    key: "next",
    label: "후속",
    max: 5,
    discrimination: 27,
    checks: [
      "다음 질문이나 다음 단계를 지목했는가",
      "그 질문이 이번 활동의 한계나 결과와 이어지는가",
    ],
  },
  {
    key: "prompt",
    label: "문항 대응",
    max: 10,
    discrimination: null,
    checks: [
      "학교가 제시한 문항이 요구하는 것에 직접 답했는가",
      "문항의 핵심 낱말이 본문에 반영되는가",
    ],
  },
];

/** 판별력이 약해 채점에서 뺀 항목. 학생에게 뺀 이유를 보여 준다. */
export const EXCLUDED_ITEMS: readonly { label: string; note: string }[] = [
  {
    label: "협업과 나눔",
    note: "상위 46% 와 하위 39% 로 차이 +7p 라 판별력이 약해 채점에서 뺐다",
  },
  {
    label: "날짜 괄호 기재",
    note: "상위 2% 와 하위 5% 로 차이 -4p 라 채점에서 뺐다",
  },
];

/** 고치면 좋은 곳 안내. 항목별로 무엇을 어떻게 넣으면 되는지 한 문장(명세 No.59). */
export const IMPROVEMENT_HINTS: Record<ScoreItemKey, string> = {
  judgment:
    "자료나 결과를 본 뒤 무엇을 판단했는지를 한 문장으로 쓰고, 그 판단의 근거가 된 자료를 함께 적어 보세요",
  limitation:
    "틀린 점이나 일반화할 수 없는 범위를 한 문장으로 밝히고, 그렇게 본 이유를 덧붙여 보세요",
  link: "앞선 활동의 이름과 거기서 남은 것을 쓰고, 그래서 이번 활동으로 이어졌다는 이유를 적어 보세요",
  source:
    "참고한 자료를 이름으로 적고, 표나 그래프 같은 형식이나 수치로 어떤 자료인지 알 수 있게 해 보세요",
  numbers:
    "결과에 쓴 수치나 식을 두 개 이상 넣고, 그 수치가 무엇을 보여 주는지 함께 적어 보세요",
  start:
    "수업의 어느 단원이나 대목에서 출발했는지와 계기가 된 질문을 한 문장으로 넣어 보세요",
  next: "다음에 확인하고 싶은 질문을 쓰고, 이번 활동의 한계나 결과와 어떻게 이어지는지 적어 보세요",
  prompt:
    "학교가 낸 문항이 묻는 것에 바로 답하는 문장을 넣고, 문항의 핵심 낱말을 본문에 써 보세요",
};

/** 화면 하단 고지 4줄(명세 No.92). */
export const NOTICE_LINES: readonly string[] = [
  "자기평가서는 학생이 제출하는 문서예요. 세부능력 및 특기사항은 선생님이 기재해요",
  "점수와 판정은 위닝 내부 기준이에요. 학교 채점 결과나 학생부 평가 예측이 아니에요",
  "생활기록부 원문은 받지 않아요",
  "생성에 실패하면 차감된 이용 횟수는 자동으로 복구돼요",
];

/** 문장 어미 규칙(명세 No.11). 고객사 의견으로 바뀔 수 있어 상수로 둔다. */
export const SENTENCE_STYLE = "했다";
