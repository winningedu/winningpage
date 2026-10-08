// 학습방향 리포트(#37 내신 / #38 정시) 빌더 — QA 행301.
//
// 원본 target/lib/learningDirectionReport.ts 를 그대로 이식한다(100% 규칙 기반,
// AI 호출 없음 — docs/figma-goal/target-app-analysis.md §4). 판정 트리·밴드 임계값·
// 방향 문구·추천 교재 표는 원문 순서·문자열 그대로 옮긴다.
//
// 이 저장소만의 추가 — 입력 shape 어댑터 2개(resolveNaesinSubjectAverage/
// resolveJungsiSubjectAverage). 온보딩 재설계(qa3-goal2-grades, 병렬 유닛)가
// naesin_scores.groupAverages(과목군 평균 6개 + scale) · mock_exam_scores.rounds
// (회차별 5과목 grade+percentile + track) 새 shape을 도입 중이라, 이 리포트는
// 새 shape을 우선 쓰고 없으면 기존 shape(과목 4개 flat 등급 / 등급→백분위 근사)으로
// 동작해야 한다(팀장 지시). 두 어댑터가 그 분기를 전담하고, assembleReport 이후
// 원본 포팅 로직은 shape을 모른다.

export type ReportKind = "naesin" | "jungsi";
export type DirectionSourceType = "intake" | "naesin" | "mogo";
export type InquiryTrack = "과탐" | "사탐" | "";

export type NaesinSubjectGroup =
  | "국어군"
  | "수학군"
  | "영어군"
  | "사회·역사군"
  | "과학군"
  | "제2외국어군";

export interface SubjectGradeItem {
  key: string;
  label: string;
  grade: number | null;
  // 정시 카드 백분위 병기("백분위 88 · 3등급") 전용 — 원본에는 없는 필드.
  // 밴드·유형 판정에는 쓰지 않는다(등급만 쓴다, §4.2 그대로).
  percentile?: number | null;
  track?: InquiryTrack;
  group?: NaesinSubjectGroup;
  groupLabel?: NaesinSubjectGroup;
}

export interface LearningDirectionReportPayload {
  kind: ReportKind;
  sourceType: DirectionSourceType;
  sourceLabel: string;
  generatedAt: string;
  scaleMax: 5 | 9;
  overallAverage: number | null;
  subjectAverage: SubjectGradeItem[];
  studentType: { title: string; summary: string };
  subjectReports: {
    key: string;
    label: string;
    grade: number | null;
    percentile: number | null;
    pyramidLevel: number | null;
    status: string;
    direction: string;
    books: string[];
  }[];
}

export const NAESIN_SUBJECT_GROUPS: NaesinSubjectGroup[] = [
  "국어군",
  "수학군",
  "영어군",
  "사회·역사군",
  "과학군",
  "제2외국어군",
];

export const DEFAULT_NAESIN_SUBJECT_GROUPS: NaesinSubjectGroup[] = [
  "국어군",
  "수학군",
  "영어군",
  "사회·역사군",
  "과학군",
];

export const NAE_SUBJECT_GROUP_KEY: Record<NaesinSubjectGroup, string> = {
  국어군: "korean",
  수학군: "math",
  영어군: "english",
  사회·역사군: "social_history",
  과학군: "science",
  제2외국어군: "second_language",
};

// ---------------------------------------------------------------------------
// 순수 계산 — §4.2
// ---------------------------------------------------------------------------

export const round2 = (value: number): number => Math.round(value * 100) / 100;

export type GradeBand = "top" | "mid" | "low" | "none";

/** 등급 밴드 — 5등급제 top<=1.7/mid<=3.2, 9등급제 top<=2/mid<=5 (원문 §4.2 그대로). */
export const getBand = (grade: number | null, scaleMax: 5 | 9): GradeBand => {
  if (!grade) return "none";
  if (scaleMax === 5) {
    if (grade <= 1.7) return "top";
    if (grade <= 3.2) return "mid";
    return "low";
  }
  if (grade <= 2) return "top";
  if (grade <= 5) return "mid";
  return "low";
};

export const getStatus = (grade: number | null, scaleMax: 5 | 9): string => {
  const band = getBand(grade, scaleMax);
  if (band === "top") return "강점 유지 구간";
  if (band === "mid") return "성적 상승 가능 구간";
  if (band === "low") return "기초 재정렬 구간";
  return "입력 대기";
};

const normalizeSubjectKey = (key: string): string => {
  if (key.startsWith("korean_")) return "korean";
  if (key.startsWith("math_")) return "math";
  if (key.startsWith("english_")) return "english";
  if (key.startsWith("social_history_")) return "social_history";
  if (key.startsWith("science_")) return "science";
  if (key.startsWith("second_language_")) return "second_language";
  if (key === "social" || key === "history") return "social_history";
  return key;
};

// ---------------------------------------------------------------------------
// §4.5 공부 방향 문구 전량(원문 그대로 이식)
// ---------------------------------------------------------------------------

const DIRECTIONS: Record<string, Record<GradeBand, string>> = {
  korean: {
    top: "지문 분석 속도와 선지 판단 근거를 정교화해야 합니다. 이미 기본기는 있으므로 문제량보다 오답 근거의 정확도가 중요합니다.",
    mid: "문학·독서·문법 중 실점 단원을 분리하고, 오답 선지가 왜 틀렸는지 문장 단위로 정리해야 합니다.",
    low: "긴 지문 독해 전에 어휘, 중심문장 찾기, 문단 요약 훈련부터 다시 잡아야 합니다.",
    none: "성적 입력 후 국어군 학습 방향을 제시할 수 있습니다.",
  },
  math: {
    top: "고난도 문항 확장보다 조건 해석, 계산 실수 방지, 풀이 시간 단축이 핵심입니다.",
    mid: "개념 누수 단원을 먼저 표시하고, 유형별 반복 후 준킬러 문항으로 확장해야 합니다.",
    low: "개념 예제와 기본 유형을 다시 잡고, 계산 실수 기록표를 병행해야 합니다.",
    none: "성적 입력 후 수학군 학습 방향을 제시할 수 있습니다.",
  },
  english: {
    top: "고난도 빈칸·순서·삽입 중심으로 근거 독해를 강화해야 합니다.",
    mid: "어휘, 문장 구조, 글의 흐름 파악을 함께 잡아야 안정적으로 상승합니다.",
    low: "단어 암기와 구문 해석 루틴을 먼저 고정한 뒤 유형 문제로 넘어가야 합니다.",
    none: "성적 입력 후 영어군 학습 방향을 제시할 수 있습니다.",
  },
  social_history: {
    top: "개념 간 비교, 시대 흐름, 사료·자료 판단에서 실수를 줄이는 것이 중요합니다.",
    mid: "개념 암기 후 선지 판단 기준과 시대·사건 흐름을 함께 정리해야 점수 변동이 줄어듭니다.",
    low: "단원별 핵심어, 큰 시대 흐름, 기본 개념 반복을 먼저 잡아야 합니다.",
    none: "성적 입력 후 사회·역사군 학습 방향을 제시할 수 있습니다.",
  },
  science: {
    top: "개념 암기보다 자료 해석형, 실험 조건 변화 문항 대응을 강화해야 합니다.",
    mid: "단원별 개념 정리와 대표 기출을 연결해 출제 패턴을 잡아야 합니다.",
    low: "핵심 개념어, 공식, 그래프 해석부터 다시 정리해야 합니다.",
    none: "성적 입력 후 과학군 학습 방향을 제시할 수 있습니다.",
  },
  second_language: {
    top: "어휘와 문법 기본기는 유지하되, 학교 기출 표현과 독해 선지 판단을 중심으로 실수를 줄여야 합니다.",
    mid: "어휘·문법·본문 표현을 단원별로 묶어 반복하고, 학교 프린트와 기출 표현을 우선 정리해야 합니다.",
    low: "기초 어휘와 기본 문형부터 다시 정리하고, 짧은 문장 해석과 암기 루틴을 먼저 고정해야 합니다.",
    none: "성적 입력 후 제2외국어군 학습 방향을 제시할 수 있습니다.",
  },
  inq1: {
    top: "탐구는 자료 해석과 시간 관리가 핵심입니다. 고난도 자료형 문항의 조건 변화를 집중적으로 훈련해야 합니다.",
    mid: "개념-기출-오답을 단원별로 묶어 반복해야 합니다.",
    low: "개념 정리 후 쉬운 기출부터 누적해야 합니다.",
    none: "성적 입력 후 탐구 학습 방향을 제시할 수 있습니다.",
  },
  inq2: {
    top: "탐구는 자료 해석과 시간 관리가 핵심입니다. 고난도 자료형 문항의 조건 변화를 집중적으로 훈련해야 합니다.",
    mid: "개념-기출-오답을 단원별로 묶어 반복해야 합니다.",
    low: "개념 정리 후 쉬운 기출부터 누적해야 합니다.",
    none: "성적 입력 후 탐구 학습 방향을 제시할 수 있습니다.",
  },
};

const getDirection = (
  key: string,
  grade: number | null,
  scaleMax: 5 | 9,
): string => {
  const band = getBand(grade, scaleMax);
  const subjectKey = normalizeSubjectKey(key);
  if (DIRECTIONS[subjectKey]) return DIRECTIONS[subjectKey][band];
  if (band === "top")
    return "현재 강점 과목군입니다. 실수 방지와 고난도 적용 문제 중심으로 유지 전략을 세워야 합니다.";
  if (band === "mid")
    return "성적 상승 가능성이 있는 과목군입니다. 개념 누수 확인 후 유형 반복을 진행해야 합니다.";
  if (band === "low")
    return "기초 재정렬이 필요한 과목군입니다. 교재 난도를 낮추고 기본 개념부터 다시 점검해야 합니다.";
  return "성적 입력 후 학습 방향을 제시할 수 있습니다.";
};

// ---------------------------------------------------------------------------
// §4.6 추천 교재 전량(원문 그대로 이식)
// ---------------------------------------------------------------------------

const BOOKS: Record<string, Record<GradeBand, string[]>> = {
  korean: {
    top: ["학교 기출 변형", "고난도 독서 지문 분석", "문학 선지 근거 정리"],
    mid: ["자이스토리 국어 기본", "마더텅 국어 기출", "학교 프린트 누적 정리"],
    low: ["매삼비", "매삼문", "국어 개념어 기본서"],
    none: ["성적 입력 후 추천"],
  },
  math: {
    top: ["일품", "블랙라벨", "고난도 기출 선별"],
    mid: ["쎈", "RPM", "마플시너지"],
    low: ["개념원리", "개념쎈", "라이트쎈"],
    none: ["성적 입력 후 추천"],
  },
  english: {
    top: ["고난도 빈칸·순서·삽입 기출", "학교 부교재 변형문제"],
    mid: ["자이스토리 영어", "마더텅 영어", "수능특강 Light"],
    low: ["중학 영문법 총정리", "구문 독해 기본서", "워드마스터 기본"],
    none: ["성적 입력 후 추천"],
  },
  social_history: {
    top: ["수능특강", "기출 선지 분석", "개념·연표 비교표"],
    mid: ["완자 사회/역사", "마더텅 사회·한국사 기출", "학교 프린트 정리"],
    low: ["개념완성 기본서", "단원별 핵심어 노트", "시대 흐름 정리 노트"],
    none: ["성적 입력 후 추천"],
  },
  science: {
    top: ["고난도 기출", "자료 해석형 문제집", "학교 프린트 변형"],
    mid: ["오투", "완자", "마더텅 과학 기출"],
    low: ["완자 기본", "오투 기본", "개념 체크 노트"],
    none: ["성적 입력 후 추천"],
  },
  second_language: {
    top: ["학교 기출 변형", "본문 표현 정리", "고난도 독해 선지 분석"],
    mid: ["교과서 본문 암기", "학교 프린트 정리", "단원별 어휘·문법 노트"],
    low: ["기초 어휘장", "기본 문형 정리", "본문 해석 반복 노트"],
    none: ["성적 입력 후 추천"],
  },
  inq1: {
    top: ["고난도 기출", "자료 해석형 문항", "실전 모의고사"],
    mid: ["수능특강", "마더텅 탐구 기출", "완자"],
    low: ["개념완성 기본서", "쉬운 기출", "단원별 개념 노트"],
    none: ["성적 입력 후 추천"],
  },
  inq2: {
    top: ["고난도 기출", "자료 해석형 문항", "실전 모의고사"],
    mid: ["수능특강", "마더텅 탐구 기출", "완자"],
    low: ["개념완성 기본서", "쉬운 기출", "단원별 개념 노트"],
    none: ["성적 입력 후 추천"],
  },
};

const getBooks = (
  key: string,
  grade: number | null,
  scaleMax: 5 | 9,
): string[] => {
  const band = getBand(grade, scaleMax);
  const subjectKey = normalizeSubjectKey(key);
  if (BOOKS[subjectKey]) return BOOKS[subjectKey][band];
  if (band === "top")
    return ["고난도 기출", "학교 프린트 변형", "오답 근거 정리"];
  if (band === "mid") return ["개념 기본서", "대표 기출", "단원별 오답노트"];
  if (band === "low")
    return ["기초 개념서", "쉬운 유형 문제집", "핵심 개념 노트"];
  return ["성적 입력 후 추천"];
};

// ---------------------------------------------------------------------------
// §4.3 학생 유형 판정 — 11개 분기, 순서 고정(원문 그대로 이식)
// ---------------------------------------------------------------------------

const average = (values: Array<number | null | undefined>): number | null => {
  const valid = values.filter(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value) && value > 0,
  );
  if (valid.length === 0) return null;
  return round2(valid.reduce((sum, value) => sum + value, 0) / valid.length);
};

export const decideStudentType = (
  subjects: SubjectGradeItem[],
  overallAverage: number | null,
  scaleMax: 5 | 9,
): { title: string; summary: string } => {
  const validSubjects = subjects.filter(
    (subject) =>
      typeof subject.grade === "number" &&
      Number.isFinite(subject.grade) &&
      subject.grade > 0,
  );

  if (validSubjects.length === 0 || !overallAverage) {
    return {
      title: "진단 대기형",
      summary: "과목별 성적 입력 후 학습 유형을 판정할 수 있습니다.",
    };
  }

  const grades = validSubjects.map((subject) => subject.grade as number);
  const best = Math.min(...grades);
  const worst = Math.max(...grades);
  const gap = round2(worst - best);

  const getGrade = (key: string) =>
    validSubjects.find((subject) => normalizeSubjectKey(subject.key) === key)
      ?.grade ?? null;

  const korean = getGrade("korean");
  const math = getGrade("math");
  const english = getGrade("english");
  const science = getGrade("science");
  const socialHistory = getGrade("social_history");

  const coreAverage = average([korean, math, english]);
  const memorizationAverage = average([science, socialHistory]);

  if (scaleMax === 5 && overallAverage <= 1.5 && gap <= 0.7) {
    return {
      title: "압도적 선도형",
      summary: "전 과목 안정성이 높아 상위권 유지와 실수 방지가 핵심입니다.",
    };
  }
  if (scaleMax === 9 && overallAverage <= 2 && gap <= 1) {
    return {
      title: "압도적 선도형",
      summary:
        "정시 과목 전반의 안정성이 높아 고난도 대응과 시간 관리가 핵심입니다.",
    };
  }
  if (math && math - overallAverage >= 0.7) {
    return {
      title: "수학 병목형",
      summary:
        "수학 성적이 전체 성적을 제한하고 있어 개념 누수와 유형 반복을 우선해야 합니다.",
    };
  }
  if (english && english - overallAverage >= 0.7) {
    return {
      title: "영어 브레이크형",
      summary:
        "영어 성적이 전체 안정성을 낮추고 있어 어휘·구문·유형 루틴을 고정해야 합니다.",
    };
  }
  if (korean && korean - overallAverage >= 0.7) {
    return {
      title: "국어 독해 병목형",
      summary:
        "국어 성적이 전체 평균보다 낮아 독해 근거와 선지 판단 훈련이 필요합니다.",
    };
  }
  if (gap >= 1.2) {
    return {
      title: "과목군 편차형",
      summary:
        "강점 과목군과 약점 과목군의 차이가 커서 약점 보완 우선순위 설정이 필요합니다.",
    };
  }
  if (coreAverage && coreAverage <= overallAverage - 0.4) {
    return {
      title: "핵심과목 견인형",
      summary:
        "국어·수학·영어 경쟁력이 있어 탐구·암기 과목군 보완 시 안정성이 커집니다.",
    };
  }
  if (
    memorizationAverage &&
    coreAverage &&
    memorizationAverage <= coreAverage - 0.4
  ) {
    return {
      title: "탐구·암기 견인형",
      summary:
        "사회·역사군과 과학군은 강하지만 국수영 기본 체력 보강이 필요합니다.",
    };
  }
  if (
    (scaleMax === 5 && overallAverage >= 4) ||
    (scaleMax === 9 && overallAverage >= 5)
  ) {
    return {
      title: "기초 재정렬형",
      summary: "교재 난도를 낮추고 개념·반복·오답 루틴을 다시 세워야 합니다.",
    };
  }

  return {
    title: "안정 상위형",
    summary:
      "전반적으로 균형은 있으나 특정 과목군 상승 전략을 통해 평균을 끌어올릴 수 있습니다.",
  };
};

// ---------------------------------------------------------------------------
// 조립 — §4.4
// ---------------------------------------------------------------------------

export interface AssembleReportInput {
  kind: ReportKind;
  sourceType: DirectionSourceType;
  sourceLabel: string;
  subjectAverage: SubjectGradeItem[];
  scaleMax: 5 | 9;
  overallAverageOverride?: number | null | undefined;
}

export function assembleDirectionReport(
  args: AssembleReportInput,
): LearningDirectionReportPayload {
  const calculatedOverallAverage = average(
    args.subjectAverage.map((s) => s.grade),
  );
  const overallAverage =
    args.overallAverageOverride != null &&
    Number.isFinite(args.overallAverageOverride)
      ? round2(args.overallAverageOverride)
      : calculatedOverallAverage;

  const studentType = decideStudentType(
    args.subjectAverage,
    overallAverage,
    args.scaleMax,
  );

  return {
    kind: args.kind,
    sourceType: args.sourceType,
    sourceLabel: args.sourceLabel,
    generatedAt: new Date().toISOString(),
    scaleMax: args.scaleMax,
    overallAverage,
    subjectAverage: args.subjectAverage,
    studentType,
    subjectReports: args.subjectAverage.map((subject) => ({
      key: subject.key,
      label: subject.track
        ? `${subject.label}(${subject.track})`
        : subject.label,
      grade: subject.grade,
      percentile: subject.percentile ?? null,
      pyramidLevel: subject.grade
        ? Math.min(args.scaleMax, Math.max(1, Math.round(subject.grade)))
        : null,
      status: getStatus(subject.grade, args.scaleMax),
      direction: getDirection(subject.key, subject.grade, args.scaleMax),
      books: getBooks(subject.key, subject.grade, args.scaleMax),
    })),
  };
}

// ---------------------------------------------------------------------------
// 입력 shape 어댑터 — 이 저장소 전용(원본에 없음)
// ---------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finitePositive(value: unknown): number | null {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
}

/** 레거시(4과목 flat) 회차 엔트리 — grades.ts records[] 원소 또는 report.ts가 조립한 온보딩 대체 엔트리. */
export type LegacyScoreEntry =
  | {
      value?: number | null;
      subjects?: Record<string, number | null | undefined>;
    }
  | null
  | undefined;

export type NaesinInputResolution = {
  subjectAverage: SubjectGradeItem[];
  scaleMax: 5 | 9;
  overallAverageOverride?: number | null;
  snapshot: unknown;
};

/**
 * 내신 과목군 평균 입력 해석 — 새 shape(naesin_scores.groupAverages, qa3-goal2-grades
 * 병렬 유닛) 우선, 없으면 레거시 4과목 flat 등급으로 폴백한다.
 *
 * 새 shape: { overall, scale: 5|9, groupAverages: { korean, math, english,
 * social_history, science, second_language } } — 이미 과목군 단위로 평균된 값이라
 * 원본의 buildNaesinSubjectAverage(여러 시험 회차를 한 풀에 모아 평균)를 다시 태울
 * 필요가 없다. 값이 있는 그룹만 목록에 넣되(§4.1 규칙과 동일하게 usedGroups =
 * 기본 5개 ∪ 값 있는 그룹) NAESIN_SUBJECT_GROUPS 순서를 지킨다.
 *
 * 레거시 폴백: grade(고3 여부)로 scaleMax를 정하고, entry.subjects(4과목: korean/
 * math/english/science)가 있으면 그대로, 없으면 entry.value 하나를 4과목 모두에
 * 채운다(aggregate.ts buildNaesinSubjectMetrics의 hasSubjects 판정과 동일 규약).
 * 4과목뿐이라 사회·역사군/제2외국어군은 만들지 않는다 — 원본 데이터에 그 구분이
 * 없기 때문이다(판단 지점).
 */
export function resolveNaesinSubjectAverage(
  naesinScores: unknown,
  legacyEntry: LegacyScoreEntry,
  grade: string | null | undefined,
): NaesinInputResolution {
  const scores = isPlainObject(naesinScores) ? naesinScores : {};
  const groupAverages = scores.groupAverages;

  if (isPlainObject(groupAverages)) {
    const scaleMax: 5 | 9 = scores.scale === 9 ? 9 : 5;
    const usedGroups = new Set<NaesinSubjectGroup>(
      DEFAULT_NAESIN_SUBJECT_GROUPS,
    );
    NAESIN_SUBJECT_GROUPS.forEach((group) => {
      const key = NAE_SUBJECT_GROUP_KEY[group];
      if (finitePositive(groupAverages[key]) != null) usedGroups.add(group);
    });

    const subjectAverage: SubjectGradeItem[] = NAESIN_SUBJECT_GROUPS.filter(
      (group) => usedGroups.has(group),
    ).map((group) => {
      const key = NAE_SUBJECT_GROUP_KEY[group];
      const raw = finitePositive(groupAverages[key]);
      return {
        key,
        label: group,
        grade: raw != null ? round2(raw) : null,
        group,
        groupLabel: group,
      };
    });

    const overallRaw = finitePositive(scores.overall);

    return {
      subjectAverage,
      scaleMax,
      overallAverageOverride: overallRaw != null ? round2(overallRaw) : null,
      snapshot: {
        source: "groupAverages",
        overall: scores.overall,
        scale: scores.scale,
        groupAverages,
      },
    };
  }

  const scaleMax: 5 | 9 = grade === "고3" ? 9 : 5;
  const hasSubjects = isPlainObject(legacyEntry?.subjects);
  const legacyGroups: { key: string; label: NaesinSubjectGroup }[] = [
    { key: "korean", label: "국어군" },
    { key: "math", label: "수학군" },
    { key: "english", label: "영어군" },
    { key: "science", label: "과학군" },
  ];

  const subjectAverage: SubjectGradeItem[] = legacyGroups.map(
    ({ key, label }) => {
      const raw = hasSubjects
        ? legacyEntry?.subjects?.[key]
        : legacyEntry?.value;
      const grade2 = finitePositive(raw);
      return {
        key,
        label,
        grade: grade2 != null ? round2(grade2) : null,
        group: label,
        groupLabel: label,
      };
    },
  );

  return {
    subjectAverage,
    scaleMax,
    snapshot: { source: "legacy", entry: legacyEntry ?? null },
  };
}

export type JungsiRound =
  | {
      track?: string;
      kor?: { grade?: number | null; pct?: number | null };
      math?: { grade?: number | null; pct?: number | null };
      eng?: { grade?: number | null; pct?: number | null };
      tam1?: { grade?: number | null; pct?: number | null };
      tam2?: { grade?: number | null; pct?: number | null };
    }
  | null
  | undefined;

export type JungsiInputResolution = {
  subjectAverage: SubjectGradeItem[];
  scaleMax: 5 | 9;
  snapshot: unknown;
};

/** 백분위(0~100) → 9등급 GRADE_PERCENTILE 역조회. api/goal/report.ts percentileToGrade와 동일 규칙. */
function percentileToGrade9(
  percentile: number,
  gradePercentile: Record<number, { min: number; max: number }>,
): number {
  const p = Math.min(100, Math.max(0, percentile));
  for (let g = 1; g <= 9; g += 1) {
    const band = gradePercentile[g];
    if (band && p >= band.min && p <= band.max) return g;
  }
  return p >= 96 ? 1 : 9;
}

/**
 * 정시 과목 입력 해석 — 새 shape(mock_exam_scores.rounds[], qa3-goal2-grades 병렬
 * 유닛) 우선, 없으면 레거시 4과목 백분위 flat으로 폴백한다.
 *
 * 새 shape 라운드: { track: '과탐'|'사탐', kor/math/eng/tam1/tam2: {grade, pct} } —
 * 5과목(국/수/영/탐구1/탐구2)이 이미 등급+백분위 쌍으로 들어온다. tam1/tam2 라벨에
 * track을 그대로 붙인다(§4.4 `label = track ? \`${label}(${track})\` : label`).
 *
 * 레거시 폴백: report.ts buildJeongsiPeriodOptions가 이미 onboarding 고정 회차를
 * gradeToPercentileMidpoint로 백분위 근사해 grades.ts records[]와 같은 4과목
 * (korean/math/english/science) 백분위 shape으로 통일해 두므로, 여기서는 그 값을
 * percentileToGrade로 등급 환산만 하면 된다(등급→밴드 중앙값 근사, 팀장 설계).
 */
export function resolveJungsiSubjectAverage(
  mockExamScores: unknown,
  legacyEntry: LegacyScoreEntry,
  gradePercentile: Record<number, { min: number; max: number }>,
): JungsiInputResolution {
  const scores = isPlainObject(mockExamScores) ? mockExamScores : {};
  // 실제 저장 shape(api/goal/intake.ts, qa3-goal2-grades 병렬 유닛)은 rounds가 배열이
  // 아니라 회차 키(MOCK_FLOW 순서로 삽입된) → 회차 객체 Record이고, track은 회차별이
  // 아니라 mock_exam_scores 최상위 필드 하나다(탐구 선택 과목은 온보딩 섹션 전체에서
  // 한 번만 고른다). Object 키 삽입 순서가 학년순(MOCK_FLOW)이므로 Object.values의
  // 마지막 원소가 곧 lastRound(가장 최근 회차)다.
  const roundsRecord = isPlainObject(scores.rounds)
    ? (scores.rounds as Record<string, JungsiRound>)
    : {};
  const roundList = Object.values(roundsRecord);
  const round = roundList.length > 0 ? roundList[roundList.length - 1] : null;
  const track: InquiryTrack =
    scores.track === "사탐" ? "사탐" : scores.track === "과탐" ? "과탐" : "";

  if (round) {
    const items: {
      key: string;
      label: string;
      src: { grade?: number | null; pct?: number | null } | undefined;
      track?: InquiryTrack;
    }[] = [
      { key: "korean", label: "국어", src: round.kor },
      { key: "math", label: "수학", src: round.math },
      { key: "english", label: "영어", src: round.eng },
      { key: "inq1", label: "탐구1", src: round.tam1, track },
      { key: "inq2", label: "탐구2", src: round.tam2, track },
    ];
    const subjectAverage: SubjectGradeItem[] = items.map(
      ({ key, label, src, track: t }) => {
        const grade = finitePositive(src?.grade);
        const percentile =
          src?.pct != null && Number.isFinite(Number(src.pct))
            ? Number(src.pct)
            : null;
        return {
          key,
          label,
          grade: grade != null ? round2(grade) : null,
          percentile,
          track: t ?? "",
        };
      },
    );
    return {
      subjectAverage,
      scaleMax: 9,
      snapshot: { source: "rounds", round },
    };
  }

  const hasSubjects = isPlainObject(legacyEntry?.subjects);
  const legacyItems = [
    { key: "korean", label: "국어" },
    { key: "math", label: "수학" },
    { key: "english", label: "영어" },
    { key: "science", label: "탐구" },
  ];
  const subjectAverage: SubjectGradeItem[] = legacyItems.map(
    ({ key, label }) => {
      const raw = hasSubjects
        ? legacyEntry?.subjects?.[key]
        : legacyEntry?.value;
      const num = typeof raw === "number" ? raw : Number(raw);
      const percentile = Number.isFinite(num)
        ? Math.min(100, Math.max(0, num))
        : null;
      const grade =
        percentile != null
          ? percentileToGrade9(percentile, gradePercentile)
          : null;
      return { key, label, grade, percentile };
    },
  );

  return {
    subjectAverage,
    scaleMax: 9,
    snapshot: { source: "legacy", entry: legacyEntry ?? null },
  };
}

// ---------------------------------------------------------------------------
// 최상위 진입점
// ---------------------------------------------------------------------------

export interface BuildGoalDirectionReportArgs {
  kind: ReportKind;
  sourceType: DirectionSourceType;
  sourceLabel: string;
  grade: string | null | undefined;
  naesinScores?: unknown;
  mockExamScores?: unknown;
  legacyEntry?: LegacyScoreEntry;
  gradePercentile?: Record<number, { min: number; max: number }>;
}

export interface BuildGoalDirectionReportResult {
  payload: LearningDirectionReportPayload;
  snapshot: unknown;
}

/** report.ts/grades.ts/intake.ts 공용 진입점 — 입력 shape 판단 + 원본 포팅 로직 조립을 한 번에 한다. */
export function buildGoalDirectionReport(
  args: BuildGoalDirectionReportArgs,
): BuildGoalDirectionReportResult {
  if (args.kind === "naesin") {
    const resolved = resolveNaesinSubjectAverage(
      args.naesinScores,
      args.legacyEntry,
      args.grade,
    );
    const payload = assembleDirectionReport({
      kind: "naesin",
      sourceType: args.sourceType,
      sourceLabel: args.sourceLabel,
      subjectAverage: resolved.subjectAverage,
      scaleMax: resolved.scaleMax,
      overallAverageOverride: resolved.overallAverageOverride,
    });
    return { payload, snapshot: resolved.snapshot };
  }

  // biome-ignore lint/style/noNonNullAssertion: gradePercentile은 kind==='jungsi' 호출부(report.ts)가 항상 GRADE_PERCENTILE 상수를 넘긴다.
  const resolved = resolveJungsiSubjectAverage(
    args.mockExamScores,
    args.legacyEntry,
    args.gradePercentile!,
  );
  const payload = assembleDirectionReport({
    kind: "jungsi",
    sourceType: args.sourceType,
    sourceLabel: args.sourceLabel,
    subjectAverage: resolved.subjectAverage,
    scaleMax: resolved.scaleMax,
  });
  return { payload, snapshot: resolved.snapshot };
}
