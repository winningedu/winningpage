// Page 3 subject verdicts (22 r44, r45; spec row 75): 내신 (q6s) and mock
// (q6m) are judged inside their own scale, then combined per subject.

import { OPTIONS } from "./options.js";
import { COPY_TEXT } from "./source/copyText.js";
import type {
  DiagnosisV3Answers,
  DiagnosisV3Scores,
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

/** judge-report B D3, PDF p3: "1등급" is a value of 1.0 or better. */
const ONE_GRADE = 1;

/** 22 r44 verdict words, the suffix of the 17 SUBJ_J_ and SUBJ_J1_ copy ids. */
const VERDICT_WORDS: Readonly<Record<SubjectVerdict, string>> = {
  PRIORITY: "우선 보완",
  CHECK: "점검",
  STRENGTH: "강점",
  KEEP: "유지",
};

type Grades = Readonly<Partial<Record<SubjectCode, number>>>;

/** 22 r44: lowest = largest grade, ties all; none when every grade is equal. */
const lowestOf = (grades: Grades): ReadonlySet<SubjectCode> => {
  const entries = SUBJECT_CODES.flatMap((s) => {
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

export function judgeSubjects(
  answers: DiagnosisV3Answers,
): DiagnosisV3Scores["subjects"] {
  const school = answers.q6s ?? {};
  // 22 r45: no q6s (switch off, M3 hidden or left empty) skips the table
  if (!SUBJECT_CODES.some((s) => school[s] !== undefined)) return null;
  const mock: Grades = answers.q6m?.grades ?? {};
  const schoolLowest = lowestOf(school);
  const mockLowest = lowestOf(mock);
  const down = downSubject(answers);
  const verdicts: Partial<Record<SubjectCode, SubjectVerdict>> = {};
  for (const subject of SUBJECT_CODES) {
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
  subject: SubjectCode,
  verdict: SubjectVerdict,
): string {
  const prefix =
    answers.q6m?.grades[subject] === undefined ? "SUBJ_J1_" : "SUBJ_J_";
  const id = `${prefix}${VERDICT_WORDS[verdict]}`;
  if (!(id in COPY_TEXT)) throw new Error(`missing copy ${id}`);
  return id;
}
