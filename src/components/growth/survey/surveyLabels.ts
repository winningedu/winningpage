// 학생 조사 24문항의 화면 문구. 서버 SURVEY_QUESTIONS 에는 라벨이 없어 key 별로 여기 둔다.
// 문구와 선택지 원문은 시안 texts/632-302_학생_조사.txt 에서 옮겼다(번호는 key 에서 유도한다).
// 선택지 순서와 값은 서버 options 와 같아야 한다(저장 값이 곧 선택지 문자열이라서).
// surveyLabels.test.ts 가 서버 문항 key, options 와의 1:1 일치를 검증한다.

export type SurveyLabel = {
  title: string;
  options?: readonly string[];
};

export const SURVEY_LABELS: Readonly<Record<string, SurveyLabel>> = {
  q1: { title: "새로운 내용을 배울 때 무엇부터 했나요?" },
  q2: { title: "자료와 사람들의 요구가 달랐을 때 무엇을 확인했나요?" },
  q3: {
    title: "마감까지 일주일 남았을 때 어떻게 진행하나요?",
    options: ["미리 나눠서", "마지막에 몰아서", "둘 다", "상황에 따라 다름"],
  },
  q4: {
    title: "혼자 할 때와 함께 할 때 중 어느 쪽이 편한가요?",
    options: ["혼자", "함께", "둘 다", "상황에 따라 다름"],
  },
  q5: {
    title: "진로가 어느 정도 정해졌나요?",
    options: ["정해짐", "고민 중", "탐색 중"],
  },
  q6: { title: "관심 있는 분야는 무엇인가요?" },
  q7: { title: "불편하거나 이상하다고 느낀 장면이 있나요?" },
  q8: { title: "성적과 별개로 더 배우고 싶은 과목은 무엇인가요?" },
  q9: { title: "그 관심은 어떻게 생겼나요?" },
  q10: { title: "희망 학과" },
  q11: { title: "희망 대학" },
  q12: { title: "스스로 찾아본 것이 있나요?" },
  q13: {
    title: "해본 탐구 방식을 모두 고르세요",
    options: [
      "글쓰기와 비평",
      "영상과 콘텐츠 제작",
      "설계와 만들기",
      "관찰과 인터뷰",
    ],
  },
  q14: { title: "해보고 싶은 방식과 부담되는 방식은 무엇인가요?" },
  q15: { title: "생각이 달라진 경험이 있나요?" },
  q16: { title: "기억에 남는 콘텐츠와 그때 궁금해진 점은 무엇인가요?" },
  q17: { title: "활동 하나를 골라 막힌 점, 한 일, 결과를 적어 주세요" },
  q18: { title: "누구에게 어떤 도움이 되었나요?" },
  q19: { title: "의견이 달랐을 때 무엇을 했나요?" },
  q20: { title: "학급이나 학교에 기여한 일이 있나요?" },
  q21: { title: "강점은 무엇이고, 그것이 드러난 최근 장면은 무엇인가요?" },
  q22: { title: "아쉬운 점과 필요한 도움은 무엇인가요?" },
  q23: {
    title: "학교에 원하는 과목이 개설되어 있나요?",
    options: ["개설됨", "일부만", "개설 안 됨", "모름"],
  },
  q24: {
    title: "일주일에 쓸 수 있는 시간은 얼마인가요?",
    options: ["2시간 이하", "2시간에서 5시간", "5시간 이상", "모름"],
  },
};

export const SURVEY_COPY = {
  textPlaceholder: "답을 적어 주세요",
  shortAnswerHint: "조금 더 자세히 적으면 분석이 정확해져요",
  departmentEmpty: "아직 고르지 않았어요",
  departmentPlaceholder: "학과 이름, 계열, 분야를 입력하세요",
  universitiesEmpty: "아직 고르지 않았어요",
  universitiesPlaceholder: "대학 이름을 입력하세요. 두 곳까지 고를 수 있어요",
  noResult: "목록에 없어요. 직접 적어 주세요.",
  addCustomDepartment: "직접 적은 학과로 추가",
  addCustomUniversity: "직접 적은 대학으로 추가",
  customDepartmentNote:
    "직접 적은 학과는 반영과목 자동 대조가 제한될 수 있어요.",
} as const;
