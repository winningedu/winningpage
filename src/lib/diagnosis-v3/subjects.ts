// Page 3 subject verdicts (22 r44, r45; spec row 75): 내신 (q6s) and mock
// (q6m) are judged inside their own scale, then combined per subject.

import { middleToNine } from "./gradeConvert.js";
import { OPTIONS, trackOf } from "./options.js";
import { COPY_TEXT } from "./source/copyText.js";
import type {
  DiagnosisV3Answers,
  DiagnosisV3Scores,
  MiddleSubjectCode,
  SubjectCode,
  SubjectVerdict,
} from "./types.js";

/** 13 F12 order (국, 수, 영, 사, 과), also the q8s ordinals 1..5 (14 r33-r37). */
export const SUBJECT_CODES: readonly SubjectCode[] = [
  "KOR",
  "MATH",
  "ENG",
  "SOC",
  "SCI",
];

/**
 * M3 q6s subjects: the five above plus 역사 (customer answer 2026-11-24
 * 학습진단 5번). The key is not the mock 한국사 key HIST.
 */
export const MIDDLE_SUBJECT_CODES: readonly MiddleSubjectCode[] = [
  ...SUBJECT_CODES,
  "HISTORY",
];

/**
 * M3 overall average: mean of the six scores, rounded half up to 0.1. Table 10
 * steps by 0.1, so the stored q6 is exactly a table key. null until all six
 * subjects are present.
 */
export const middleAverage = (
  scores: Readonly<Partial<Record<MiddleSubjectCode, number>>>,
): number | null => {
  const values = MIDDLE_SUBJECT_CODES.map((s) => scores[s]);
  if (values.some((v) => v === undefined)) return null;
  const sum = (values as number[]).reduce((a, b) => a + b, 0);
  return (
    Math.round(
      Number(((sum / MIDDLE_SUBJECT_CODES.length) * 10).toPrecision(15)),
    ) / 10
  );
};

/** judge-report B D3, PDF p3: "1등급" is a value of 1.0 or better. */
const ONE_GRADE = 1;

/** 22 r44 verdict words, the suffix of the 17 SUBJ_J_ and SUBJ_J1_ copy ids. */
const VERDICT_WORDS: Readonly<Record<SubjectVerdict, string>> = {
  PRIORITY: "우선 보완",
  CHECK: "점검",
  STRENGTH: "강점",
  KEEP: "유지",
};

type Grades = Readonly<Partial<Record<MiddleSubjectCode, number>>>;

/**
 * 16 r8: q4 성취평가제 takes 원점수 (12 r5-r9), where larger is better, so the
 * 22 r44 grade ranking does not apply. Lead decision: skip (SUBJ_SKIP_NOTE).
 */
export const ACHIEVEMENT_Q4 = OPTIONS.q4.find(
  (o) => o.code === "12_환산_성취평가제",
)?.ordinal;
if (ACHIEVEMENT_Q4 === undefined) throw new Error("no q4 성취평가제 option");

/** 22 r44: lowest = largest grade, ties all; none when every grade is equal. */
const lowestOf = (
  grades: Grades,
  codes: readonly MiddleSubjectCode[],
): ReadonlySet<MiddleSubjectCode> => {
  const entries = codes.flatMap((s) => {
    const grade = grades[s];
    return grade === undefined ? [] : [[s, grade] as const];
  });
  const values = entries.map(([, g]) => g);
  const max = Math.max(...values);
  if (values.every((g) => g === max)) return new Set();
  return new Set(entries.filter(([, g]) => g === max).map(([s]) => s));
};

/** 22 r44: 7-1 = that subject AND 7-2 = 내려갔어요 (DIR:DOWN). */
const downSubject = (answers: DiagnosisV3Answers): SubjectCode | null => {
  const dir = OPTIONS.q8d.find((o) => o.ordinal === answers.q8d)?.code;
  if (dir !== "DIR:DOWN" || answers.q8s === undefined) return null;
  return SUBJECT_CODES[answers.q8s - 1] ?? null;
};

/** M3 q6s as 9-grade values from table 10; a score the table lacks is left out. */
const middleGrades = (answers: DiagnosisV3Answers): Grades =>
  Object.fromEntries(
    MIDDLE_SUBJECT_CODES.flatMap((s) => {
      const score = answers.q6s?.[s];
      const grade = score === undefined ? null : middleToNine(score);
      return grade === null ? [] : [[s, grade] as const];
    }),
  );

export function judgeSubjects(
  answers: DiagnosisV3Answers,
): DiagnosisV3Scores["subjects"] {
  // M3 has no mock and enters 원점수 for six subjects: table 10 makes them
  // grades, whatever its q4 says
  const middle = trackOf(answers.q1) === "M3";
  if (!middle && answers.q4 === ACHIEVEMENT_Q4) return null;
  const codes = middle ? MIDDLE_SUBJECT_CODES : SUBJECT_CODES;
  const school = middle ? middleGrades(answers) : (answers.q6s ?? {});
  // 22 r45: no q6s (switch off or left empty) skips the table
  if (!codes.some((s) => school[s] !== undefined)) return null;
  const mock: Grades = answers.q6m?.grades ?? {};
  const schoolLowest = lowestOf(school, codes);
  const mockLowest = lowestOf(mock, SUBJECT_CODES);
  const down = downSubject(answers);
  const verdicts: Partial<Record<MiddleSubjectCode, SubjectVerdict>> = {};
  for (const subject of codes) {
    const grade = school[subject];
    if (grade === undefined) continue;
    const mockGrade = mock[subject];
    const lowSchool = schoolLowest.has(subject);
    const isDown = down === subject;
    if (mockGrade === undefined) {
      // 22 r44: mock missing, judged on 내신 alone
      verdicts[subject] =
        lowSchool || isDown
          ? "CHECK"
          : grade <= ONE_GRADE
            ? "STRENGTH"
            : "KEEP";
      continue;
    }
    const lowMock = mockLowest.has(subject);
    verdicts[subject] =
      lowSchool && lowMock
        ? "PRIORITY"
        : lowSchool || lowMock || isDown
          ? "CHECK"
          : grade <= ONE_GRADE && mockGrade <= ONE_GRADE
            ? "STRENGTH"
            : "KEEP";
  }
  return verdicts;
}

/** 22 r44 E: SUBJ_J_ when the subject has a mock grade, else SUBJ_J1_. */
export function subjectTextId(
  answers: DiagnosisV3Answers,
  subject: MiddleSubjectCode,
  verdict: SubjectVerdict,
): string {
  const prefix =
    answers.q6m?.grades[subject] === undefined ? "SUBJ_J1_" : "SUBJ_J_";
  const id = `${prefix}${VERDICT_WORDS[verdict]}`;
  if (!(id in COPY_TEXT)) throw new Error(`missing copy ${id}`);
  return id;
}
