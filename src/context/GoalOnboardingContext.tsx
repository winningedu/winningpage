// 목표관리 온보딩(7단계 위저드) 전용 상태 컨텍스트 — 작업 지시 "상태 관리" 절.
// src/context/SignupContext.jsx의 구조 관례(Provider + custom hook + 평평한 state + 부분
// 업데이트 함수들 + sessionStorage 영속)를 그대로 따른다. 회원가입과 마찬가지로
// sessionStorage('goal-onboarding-flow')로 스텝 간 입력을 동기화한다 — 온보딩은
// /app/goal/onboarding/step-1~7로 스텝별 라우트가 쪼개져 있어, React state만으로는
// 새로고침하거나 URL로 직접 진입할 때 이전 단계 입력이 전부 유실되기 때문이다.
//
// localStorage가 아니라 sessionStorage를 쓰는 이유도 회원가입(SignupContext.jsx:1-6)과
// 동일하다: 온보딩 입력에는 내신 성적·목표대학처럼 민감할 수 있는 개인 학업 정보가
// 들어가는데, localStorage는 탭을 닫아도 남아 공용 PC에서 다음 사용자에게 노출될 위험이
// 있다. sessionStorage는 탭 종료 시 자동으로 사라진다.
//
// 민감 필드 제외 검토(SignupContext.jsx:121의 SENSITIVE_FORM_KEYS와 같은 판단): 온보딩
// 입력 항목(학교유형/학년/목표대학/내신/모의고사/공부시간/일과)에는 비밀번호·인증코드 같은
// 항목이 없다. 전부 위저드 진행에 반드시 필요한 값이라 제외 없이 그대로 저장한다.
//
// 완료 판정(markOnboardingDone(), src/lib/goalOnboarding.js)과는 별개의 저장소다 — 그건
// localStorage 플래그로 "온보딩을 끝냈는지"만 기억하고, 여기 sessionStorage는 "입력 중이던
// 값"을 기억한다. 온보딩 완료 시 이 플로우 저장소는 resetOnboardingFlow()로 비운다
// (src/pages/goal/Onboarding.jsx의 handleFinish 참고). QA가 온보딩을 처음부터 다시 보려면
// 완료 플래그(resetOnboarding(), lib/goalOnboarding.js)와 이 입력값 저장소
// (clearOnboardingFlow(), 이 파일) 둘 다 지워야 한다 — 하나만 지우면 RequireGoalAccess의
// 3단계 판정이나 위저드 복구 로직이 이전 상태를 다시 불러온다.
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  MOCK_FLOW,
  MOCK_SUBJECTS,
  NAESIN_EXAM_FLOW,
  NAESIN_SUBJECT_GROUPS,
  WEEK_SCHEDULE_DEFAULT_SCHOOL_END,
  WEEK_SCHEDULE_DEFAULT_SCHOOL_START,
  WEEK_SCHEDULE_DEFAULT_SLEEP,
  WEEK_SCHEDULE_DEFAULT_WAKE,
  WEEK_SCHEDULE_MAX_ACADEMIES,
  WEEKDAY_OPTIONS,
  WEEKEND_KEYS,
} from "@/components/goal/onboarding/onboardingOptions";

const STORAGE_KEY = "goal-onboarding-flow";

export type SchoolType = "general" | "special" | "middle" | "elementary" | null;
export type Grade = "g1" | "g2" | "g3" | null;

interface UniversityChoice {
  university: string;
  department: string;
}

// QA 행290 재설계 — 과목군 1개 항목. avg는 직접 입력 또는 subjects[]에서 자동 산출한
// 값(둘 다 string, 서버 전송 직전에만 숫자로 접는다). subjects가 비어 있으면 avg를
// 그대로 쓰고, subjects가 있으면 그 평균이 avg를 덮어쓴다(NaesinGroupRow가 갱신).
export interface NaesinGroupState {
  avg: string;
  subjects: { name: string; grade: string }[];
}

export type NaesinGroups = Record<string, NaesinGroupState>;

export interface NaesinExamState {
  groups: NaesinGroups;
}

// 내신 섹션 상태 — 고정 4회차 체크박스 방식(구)에서 "마지막 시험 1개 선택 + 그
// 시험까지의 전체 평균 + 최근 시험별 과목군" 방식(신)으로 재설계했다(qa3-held-high-design.md
// §2). lastExam이 ""면 "아직 없음"이고, 그 경우에만 priorNaesinGrade를 쓴다(학년별로 도메인이
// 다르다 — 고1은 중학교 평균 점수 0~100, 고2·고3은 평균 등급 1~9. Step4Naesin이 분기한다).
export interface NaesinState {
  lastExam: string;
  overall: string;
  priorNaesinGrade: string;
  // NAESIN_EXAM_FLOW 12개 키 전부를 항상 채워 둔다 — "마지막 시험"을 바꿔도 다른 시험에
  // 입력해 둔 과목군 값이 사라지지 않게 하기 위해서다(구 naesin[key] 관례와 동일한 이유).
  exams: Record<string, NaesinExamState>;
}

export interface MockSubjectState {
  grade: string;
  // 사용자가 등급 입력 후 고른 백분위 칩 값(문자열). 미선택이면 ""(제출 직전 서버 기본값
  // "안정"/중앙값으로 대체된다 — Step5MockExam이 기본 칩을 미리 선택해 두므로 정상 경로에서는
  // 거의 비지 않는다).
  pct: string;
}

export interface MockRoundState {
  kor: MockSubjectState;
  math: MockSubjectState;
  eng: { grade: string };
  tam1: MockSubjectState;
  tam2: MockSubjectState;
}

// 모의고사 섹션 상태 — 고정 4회차(3/6/9/10월, 학년 무구분) 방식(구)에서 학년별 전체
// 시퀀스(MOCK_FLOW, 고3 5・7모 포함) 방식(신)으로 재설계했다. track은 회차마다 따로 두지
// 않고 섹션 전체에서 하나만 고른다(원본과 동일 — 탐구 선택 과목은 학년 내내 거의 바뀌지
// 않는다는 전제).
export interface MockState {
  lastRound: string;
  track: "과탐" | "사탐" | "";
  rounds: Record<string, MockRoundState>;
}

// 학원(또는 과외) 1건의 등원·하원 시각 — 원본 계약(target/components/IntakeForm.tsx:1814-1920)
// 그대로 0~30 시각쌍이다(자정 넘김은 24 초과로 표현).
export interface AcademySlotInput {
  start: number;
  end: number;
}

// 요일 1행의 하루 일정 — schedule.ts DayPattern 과 같은 계약이다(QA 행293).
// schoolStart/schoolEnd는 hasSchool이 false여도 값을 유지한다 — 토글을 다시 켰을 때
// 입력을 잃지 않기 위해서다(계산에는 hasSchool이 true일 때만 반영된다, schedule.ts 참고).
export interface DayScheduleInput {
  wake: number;
  sleep: number;
  hasSchool: boolean;
  schoolStart: number;
  schoolEnd: number;
  academies: AcademySlotInput[];
}

interface GoalOnboardingState {
  schoolType: SchoolType;
  grade: Grade;
  upperUniversity: UniversityChoice;
  lowerUniversity: UniversityChoice;
  naesin: NaesinState;
  mockExam: MockState;
  studyHours: Record<string, number>;
  weekSchedule: Record<string, DayScheduleInput>;
}

function buildEmptyNaesinGroups(): NaesinGroups {
  return Object.fromEntries(
    NAESIN_SUBJECT_GROUPS.map((group) => [
      group.key,
      { avg: "", subjects: [] } as NaesinGroupState,
    ]),
  );
}

function buildInitialNaesinExams(): Record<string, NaesinExamState> {
  return Object.fromEntries(
    NAESIN_EXAM_FLOW.map((exam) => [
      exam.key,
      { groups: buildEmptyNaesinGroups() },
    ]),
  );
}

function buildInitialNaesin(): NaesinState {
  return {
    lastExam: "",
    overall: "",
    priorNaesinGrade: "",
    exams: buildInitialNaesinExams(),
  };
}

function buildEmptyMockSubject(): MockSubjectState {
  return { grade: "", pct: "" };
}

function buildInitialMockRounds(): Record<string, MockRoundState> {
  return Object.fromEntries(
    MOCK_FLOW.map((round) => [
      round.key,
      {
        kor: buildEmptyMockSubject(),
        math: buildEmptyMockSubject(),
        eng: { grade: "" },
        tam1: buildEmptyMockSubject(),
        tam2: buildEmptyMockSubject(),
      } as MockRoundState,
    ]),
  );
}

function buildInitialMockExam(): MockState {
  return {
    lastRound: "",
    track: "",
    rounds: buildInitialMockRounds(),
  };
}

function buildInitialStudyHours(): Record<string, number> {
  return Object.fromEntries(WEEKDAY_OPTIONS.map((day) => [day.key, 0]));
}

// 요일 1행 기본값 — 평일은 등교, 주말은 등교 아님(원본 DAYS_CONFIG, schedule.ts와 동일 배정).
// schoolStart/schoolEnd는 hasSchool과 무관하게 기본값을 채워 둔다(토글 On 전환 시 빈 값이
// 아니라 바로 편집 가능한 기본 시각이 뜨도록).
function buildDefaultDaySchedule(hasSchool: boolean): DayScheduleInput {
  return {
    wake: WEEK_SCHEDULE_DEFAULT_WAKE,
    sleep: WEEK_SCHEDULE_DEFAULT_SLEEP,
    hasSchool,
    schoolStart: WEEK_SCHEDULE_DEFAULT_SCHOOL_START,
    schoolEnd: WEEK_SCHEDULE_DEFAULT_SCHOOL_END,
    academies: [],
  };
}

function buildInitialWeekSchedule(): Record<string, DayScheduleInput> {
  return Object.fromEntries(
    WEEKDAY_OPTIONS.map(({ key }) => [
      key,
      buildDefaultDaySchedule(!WEEKEND_KEYS.includes(key)),
    ]),
  );
}

// 저장소가 비어있거나(최초 진입) 초기화(resetOnboardingFlow)할 때 쓰는 기본값. 매번 새
// 객체를 만들어 반환한다 — 스텝 컴포넌트들이 참조를 공유해 서로 오염시키지 않도록.
function buildDefaultState(): GoalOnboardingState {
  return {
    schoolType: null, // 'general' | 'special' | 'middle' | 'elementary' | null
    grade: null, // 'g1' | 'g2' | 'g3' | null — general/special 경로에서만 사용
    upperUniversity: { university: "", department: "" },
    lowerUniversity: { university: "", department: "" },
    naesin: buildInitialNaesin(),
    mockExam: buildInitialMockExam(),
    studyHours: buildInitialStudyHours(),
    weekSchedule: buildInitialWeekSchedule(),
  };
}

function readStoredFlow(): Partial<GoalOnboardingState> | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (error) {
    // JSON 파싱 실패, 또는 사파리 프라이빗 모드 등으로 sessionStorage 접근 자체가 막힌
    // 경우 모두 여기로 떨어진다 — SignupContext.jsx:108-119와 동일한 방어 수준.
    console.error("goal-onboarding-flow 세션 저장소 읽기 오류:", error);
    return null;
  }
}

function writeStoredFlow(state: GoalOnboardingState) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error("goal-onboarding-flow 세션 저장소 쓰기 오류:", error);
  }
}

function clearStoredFlow() {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error("goal-onboarding-flow 세션 저장소 초기화 오류:", error);
  }
}

// 저장된 값 중 defaults에 없는 키(예: 저장 이후 NAESIN_EXAMS/MOCK_EXAM_ROUNDS 등 데이터
// 정의가 바뀌어 시험/과목 구성이 달라진 경우)는 버리고, defaults 키 기준으로만 한 겹 병합한다.
// 스키마 드리프트로 더 이상 존재하지 않는 키가 되살아나는 걸 막기 위한 방어다.
function mergeKeyedObject<T extends Record<string, object>>(
  defaults: T,
  stored: T | undefined,
): T {
  if (!stored || typeof stored !== "object") return defaults;

  return Object.fromEntries(
    Object.entries(defaults).map(([key, defaultValue]) => {
      const storedValue = stored[key];
      if (!storedValue || typeof storedValue !== "object")
        return [key, defaultValue];
      return [key, { ...defaultValue, ...storedValue }];
    }),
  ) as T;
}

// 내 정보 수정 화면(Profile.tsx/TargetUniversity.tsx)이 서버에 저장된 naesin_scores/
// mock_exam_scores(intake.ts 모양, 이 컨텍스트의 naesin/mockExam과 거의 같은 필드명)로
// 편집 폼을 미리 채울 때도 이 함수를 그대로 쓴다 — FLOW 12/14개 키를 빈 값으로 채우는
// 규칙을 편집 화면에서 다시 구현하면 두 벌이 갈린다.
export function buildInitialState(
  stored: Partial<GoalOnboardingState> | null,
): GoalOnboardingState {
  const defaults = buildDefaultState();
  if (!stored) return defaults;

  return {
    ...defaults,
    ...stored,
    upperUniversity: {
      ...defaults.upperUniversity,
      ...(stored.upperUniversity || {}),
    },
    lowerUniversity: {
      ...defaults.lowerUniversity,
      ...(stored.lowerUniversity || {}),
    },
    // naesin/mockExam은 이제 "고정 회차 키 → 값" 평평한 레코드가 아니라 exams/rounds
    // 서브필드만 그런 형태다 — mergeKeyedObject를 최상위에 바로 쓰면 lastExam/overall/track
    // 같은 평평한 필드가 "값이 object가 아니다"에 걸려 전부 defaults로 되돌아간다. 평평한
    // 필드는 얕은 스프레드로, exams/rounds만 키 단위로 병합한다.
    naesin: {
      ...defaults.naesin,
      ...(stored.naesin || {}),
      exams: mergeKeyedObject(
        defaults.naesin.exams,
        (stored.naesin as GoalOnboardingState["naesin"] | undefined)?.exams,
      ),
    },
    mockExam: {
      ...defaults.mockExam,
      ...(stored.mockExam || {}),
      rounds: mergeKeyedObject(
        defaults.mockExam.rounds,
        (stored.mockExam as GoalOnboardingState["mockExam"] | undefined)
          ?.rounds,
      ),
    },
    studyHours: { ...defaults.studyHours, ...(stored.studyHours || {}) },
    // 필드명이 dailySchedule → weekSchedule로 바뀌었다(QA 행293) — 옛 세션 저장값은
    // stored.weekSchedule이 애초에 없어 defaults로만 채워진다(버전 키 없이도 자동 이행,
    // mergeKeyedObject가 요일별로 없는 키는 defaults를 쓴다).
    weekSchedule: mergeKeyedObject(defaults.weekSchedule, stored.weekSchedule),
  };
}

// QA/디버깅 전용 — 저장된 "입력값"만 지운다. 완료 플래그(localStorage)는 별개 저장소라
// lib/goalOnboarding.js의 resetOnboarding()이 따로 관리한다. 온보딩을 처음부터 다시
// 보려면 두 함수를 함께 호출해야 한다(하나만 지우면 RequireGoalAccess의 완료 판정 또는
// 이 컨텍스트의 복구 로직이 이전 상태를 다시 불러온다). Provider 마운트 여부와 무관하게
// 콘솔 등에서도 바로 호출할 수 있도록 모듈 레벨 함수로 export한다.
export function clearOnboardingFlow() {
  clearStoredFlow();
}

interface GoalOnboardingContextValue extends GoalOnboardingState {
  setSchoolType: (schoolType: SchoolType) => void;
  setGrade: (grade: Grade) => void;
  setUpperUniversity: (partial: Partial<UniversityChoice>) => void;
  setLowerUniversity: (partial: Partial<UniversityChoice>) => void;
  setNaesinLastExam: (examKey: string) => void;
  setNaesinOverall: (value: string) => void;
  setPriorNaesinGrade: (value: string) => void;
  setNaesinGroupAvg: (examKey: string, groupKey: string, avg: string) => void;
  setNaesinGroupSubjects: (
    examKey: string,
    groupKey: string,
    subjects: { name: string; grade: string }[],
  ) => void;
  setMockLastRound: (roundKey: string) => void;
  setMockTrack: (track: "과탐" | "사탐" | "") => void;
  updateMockSubject: (
    roundKey: string,
    subjectKey: "kor" | "math" | "tam1" | "tam2",
    partial: Partial<MockSubjectState>,
  ) => void;
  setMockEnglishGrade: (roundKey: string, grade: string) => void;
  setStudyHour: (dayKey: string, value: number) => void;
  setWeekScheduleDay: (
    dayKey: string,
    partial: Partial<Omit<DayScheduleInput, "academies">>,
  ) => void;
  addAcademy: (dayKey: string) => void;
  removeAcademy: (dayKey: string, index: number) => void;
  updateAcademy: (
    dayKey: string,
    index: number,
    partial: Partial<AcademySlotInput>,
  ) => void;
  copyWeekScheduleDay: (fromDayKey: string, toDayKey: string) => void;
  resetOnboardingFlow: () => void;
}

const GoalOnboardingContext = createContext<GoalOnboardingContextValue | null>(
  null,
);

export function GoalOnboardingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(() => buildInitialState(readStoredFlow()));

  useEffect(() => {
    writeStoredFlow(state);
  }, [state]);

  const setSchoolType = useCallback((schoolType: SchoolType) => {
    // 유형을 바꾸면 이전 유형에서 고르던 학년 선택은 더 이상 유효하지 않으므로 함께 초기화한다.
    setState((prev) => ({ ...prev, schoolType, grade: null }));
  }, []);

  const setGrade = useCallback((grade: Grade) => {
    // 학년을 바꾸면 priorNaesinGrade 도 함께 비운다(setSchoolType 이 grade 를 비우는 것과 같은
    // 연쇄 무효화). 같은 한 칸이 학년마다 다른 의미를 갖기 때문이다 — 고1에서 "중학교 평균"으로
    // 넣은 값이 고2로 바꾸면 화면 라벨만 "고1까지 누적"으로 바뀐 채 그대로 제출되고, 서버 분기도
    // '중3' 치환(페널티 +0.10)에서 remainingNaesin=6 오버라이드로 통째로 뒤집힌다.
    // 실제로 바뀔 때만 비운다 — 같은 학년을 다시 눌렀다고 입력을 날리지 않는다.
    setState((prev) =>
      prev.grade === grade
        ? prev
        : {
            ...prev,
            grade,
            naesin: { ...prev.naesin, priorNaesinGrade: "" },
          },
    );
  }, []);

  const setUpperUniversity = useCallback(
    (partial: Partial<UniversityChoice>) => {
      setState((prev) => ({
        ...prev,
        upperUniversity: { ...prev.upperUniversity, ...partial },
      }));
    },
    [],
  );

  const setLowerUniversity = useCallback(
    (partial: Partial<UniversityChoice>) => {
      setState((prev) => ({
        ...prev,
        lowerUniversity: { ...prev.lowerUniversity, ...partial },
      }));
    },
    [],
  );

  // 마지막으로 본 내신 시험 선택. NAESIN_EXAM_FLOW 키 또는 "아직 없음"이면 "".
  const setNaesinLastExam = useCallback((examKey: string) => {
    setState((prev) => ({
      ...prev,
      naesin: { ...prev.naesin, lastExam: examKey },
    }));
  }, []);

  const setNaesinOverall = useCallback((value: string) => {
    setState((prev) => ({
      ...prev,
      naesin: { ...prev.naesin, overall: value },
    }));
  }, []);

  // 내신 "아직 없음" 특례 입력 — 고1은 중학교 평균 점수(0~100), 고2・고3은 이전 학년까지의
  // 평균 등급(1~9). Step4Naesin이 grade로 도메인을 분기한다.
  const setPriorNaesinGrade = useCallback((value: string) => {
    setState((prev) => ({
      ...prev,
      naesin: { ...prev.naesin, priorNaesinGrade: value },
    }));
  }, []);

  const setNaesinGroupAvg = useCallback(
    (examKey: string, groupKey: string, avg: string) => {
      setState((prev) => {
        // examKey/groupKey는 항상 buildInitialNaesinExams/buildEmptyNaesinGroups로
        // 채워진 기존 키다.
        const exam = prev.naesin.exams[examKey]!;
        const group = exam.groups[groupKey]!;
        return {
          ...prev,
          naesin: {
            ...prev.naesin,
            exams: {
              ...prev.naesin.exams,
              [examKey]: {
                groups: { ...exam.groups, [groupKey]: { ...group, avg } },
              },
            },
          },
        };
      });
    },
    [],
  );

  // "세부 과목" 편집 — subjects 배열이 바뀔 때마다 군 평균(avg)을 유효 등급의 단순
  // 평균(round2)으로 자동 재계산한다(원본 NaesinSubjectEditor 규칙, target-app-analysis.md
  // §4.2와 동일). 유효 등급이 하나도 없으면 avg를 비워 "미입력"으로 되돌린다 — 빈 값을
  // 0으로 접으면 그 군이 실제로 0등급을 받은 것처럼 보인다.
  const setNaesinGroupSubjects = useCallback(
    (
      examKey: string,
      groupKey: string,
      subjects: { name: string; grade: string }[],
    ) => {
      setState((prev) => {
        const exam = prev.naesin.exams[examKey]!;
        const group = exam.groups[groupKey]!;
        const validGrades = subjects
          .map((s) => Number(s.grade))
          .filter((n) => Number.isFinite(n) && n >= 1 && n <= 9);
        const avg =
          validGrades.length > 0
            ? String(
                Math.round(
                  (validGrades.reduce((a, b) => a + b, 0) /
                    validGrades.length) *
                    100,
                ) / 100,
              )
            : "";
        return {
          ...prev,
          naesin: {
            ...prev.naesin,
            exams: {
              ...prev.naesin.exams,
              [examKey]: {
                groups: {
                  ...exam.groups,
                  [groupKey]: { ...group, subjects, avg },
                },
              },
            },
          },
        };
      });
    },
    [],
  );

  // 마지막으로 본 모의고사 선택. MOCK_FLOW 키 또는 "없음"이면 "".
  const setMockLastRound = useCallback((roundKey: string) => {
    setState((prev) => ({
      ...prev,
      mockExam: { ...prev.mockExam, lastRound: roundKey },
    }));
  }, []);

  const setMockTrack = useCallback((track: "과탐" | "사탐" | "") => {
    setState((prev) => ({ ...prev, mockExam: { ...prev.mockExam, track } }));
  }, []);

  const updateMockSubject = useCallback(
    (
      roundKey: string,
      subjectKey: "kor" | "math" | "tam1" | "tam2",
      partial: Partial<MockSubjectState>,
    ) => {
      setState((prev) => {
        // roundKey는 항상 buildInitialMockRounds로 채워진 기존 키다.
        const round = prev.mockExam.rounds[roundKey]!;
        return {
          ...prev,
          mockExam: {
            ...prev.mockExam,
            rounds: {
              ...prev.mockExam.rounds,
              [roundKey]: {
                ...round,
                [subjectKey]: { ...round[subjectKey], ...partial },
              },
            },
          },
        };
      });
    },
    [],
  );

  const setMockEnglishGrade = useCallback((roundKey: string, grade: string) => {
    setState((prev) => {
      const round = prev.mockExam.rounds[roundKey]!;
      return {
        ...prev,
        mockExam: {
          ...prev.mockExam,
          rounds: {
            ...prev.mockExam.rounds,
            [roundKey]: { ...round, eng: { grade } },
          },
        },
      };
    });
  }, []);

  const setStudyHour = useCallback((dayKey: string, value: number) => {
    setState((prev) => ({
      ...prev,
      studyHours: { ...prev.studyHours, [dayKey]: value },
    }));
  }, []);

  // 요일 1행의 시각·토글 필드(wake/sleep/hasSchool/schoolStart/schoolEnd) 부분 갱신.
  // academies는 별도 함수(addAcademy/removeAcademy/updateAcademy)로 다룬다 — 배열은
  // 부분 스프레드로 안전하게 병합되지 않기 때문.
  const setWeekScheduleDay = useCallback(
    (dayKey: string, partial: Partial<Omit<DayScheduleInput, "academies">>) => {
      setState((prev) => ({
        ...prev,
        weekSchedule: {
          ...prev.weekSchedule,
          // dayKey는 항상 buildInitialWeekSchedule로 채워진 기존 키다.
          [dayKey]: { ...prev.weekSchedule[dayKey]!, ...partial },
        },
      }));
    },
    [],
  );

  const addAcademy = useCallback((dayKey: string) => {
    setState((prev) => {
      const day = prev.weekSchedule[dayKey]!;
      // WEEK_SCHEDULE_MAX_ACADEMIES는 Step7이 UI에서 이미 버튼을 숨겨 막는다 —
      // 여기서도 방어해 컨텍스트 단독 호출(테스트 등)에서 상한을 넘기지 못하게 한다.
      if (day.academies.length >= WEEK_SCHEDULE_MAX_ACADEMIES) return prev;
      return {
        ...prev,
        weekSchedule: {
          ...prev.weekSchedule,
          [dayKey]: {
            ...day,
            academies: [...day.academies, { start: 17, end: 19 }],
          },
        },
      };
    });
  }, []);

  const removeAcademy = useCallback((dayKey: string, index: number) => {
    setState((prev) => {
      const day = prev.weekSchedule[dayKey]!;
      return {
        ...prev,
        weekSchedule: {
          ...prev.weekSchedule,
          [dayKey]: {
            ...day,
            academies: day.academies.filter((_, i) => i !== index),
          },
        },
      };
    });
  }, []);

  const updateAcademy = useCallback(
    (dayKey: string, index: number, partial: Partial<AcademySlotInput>) => {
      setState((prev) => {
        const day = prev.weekSchedule[dayKey]!;
        return {
          ...prev,
          weekSchedule: {
            ...prev.weekSchedule,
            [dayKey]: {
              ...day,
              academies: day.academies.map((slot, i) =>
                i === index ? { ...slot, ...partial } : slot,
              ),
            },
          },
        };
      });
    },
    [],
  );

  // "○요일 일정 가져오기" — 원본(target/components/IntakeForm.tsx `copyDaySchedule`)과
  // 동일하게 fromDayKey의 값 전체(academies 포함, 깊은 복사)를 toDayKey에 그대로 옮긴다.
  const copyWeekScheduleDay = useCallback(
    (fromDayKey: string, toDayKey: string) => {
      setState((prev) => {
        const source = prev.weekSchedule[fromDayKey]!;
        return {
          ...prev,
          weekSchedule: {
            ...prev.weekSchedule,
            [toDayKey]: {
              ...source,
              academies: source.academies.map((slot) => ({ ...slot })),
            },
          },
        };
      });
    },
    [],
  );

  // 온보딩 완료(7단계 "다음") 시 호출한다 — 저장된 입력값을 비우고 컨텍스트 state도
  // 초기값으로 되돌린다. src/pages/goal/Onboarding.jsx의 handleFinish가
  // submitGoalIntake()가 성공(200)/이미 완료(409)를 반환한 직후 이 함수를 호출하도록
  // 배선돼 있다(SignupContext의 resetSignup()과 같은 역할). 2026-08-11 이전엔
  // markOnboardingDone() 직후 호출이었으나, 이제 완료 판정은 서버(goal_students)가
  // 정본이라 클라이언트 완료 플래그를 세우는 절차 자체가 없어졌다.
  const resetOnboardingFlow = useCallback(() => {
    clearStoredFlow();
    setState(buildDefaultState());
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      setSchoolType,
      setGrade,
      setUpperUniversity,
      setLowerUniversity,
      setNaesinLastExam,
      setNaesinOverall,
      setPriorNaesinGrade,
      setNaesinGroupAvg,
      setNaesinGroupSubjects,
      setMockLastRound,
      setMockTrack,
      updateMockSubject,
      setMockEnglishGrade,
      setStudyHour,
      setWeekScheduleDay,
      addAcademy,
      removeAcademy,
      updateAcademy,
      copyWeekScheduleDay,
      resetOnboardingFlow,
    }),
    [
      state,
      setSchoolType,
      setGrade,
      setUpperUniversity,
      setLowerUniversity,
      setNaesinLastExam,
      setNaesinOverall,
      setPriorNaesinGrade,
      setNaesinGroupAvg,
      setNaesinGroupSubjects,
      setMockLastRound,
      setMockTrack,
      updateMockSubject,
      setMockEnglishGrade,
      setStudyHour,
      setWeekScheduleDay,
      addAcademy,
      removeAcademy,
      updateAcademy,
      copyWeekScheduleDay,
      resetOnboardingFlow,
    ],
  );

  return (
    <GoalOnboardingContext.Provider value={value}>
      {children}
    </GoalOnboardingContext.Provider>
  );
}

export function useGoalOnboarding() {
  const ctx = useContext(GoalOnboardingContext);

  if (!ctx) {
    throw new Error(
      "useGoalOnboarding은 GoalOnboardingProvider 내부에서만 사용할 수 있습니다.",
    );
  }

  return ctx;
}
