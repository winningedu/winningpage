// 3p 성적 (22 r38-r46).

import { copy, fill } from "../copy.js";
import { EXAM_ITEM, EXAM_ITEM_LABEL, EXAM_OPTION } from "../examOps.js";
import { LIKERT_LEVELS } from "../likert.js";
import { OPTIONS } from "../options.js";
import type { Engine } from "../report.js";
import { SUBJECT_CODES, subjectTextId } from "../subjects.js";
import type { MockSubjectCode, Page3, SubjectCode } from "../types.js";
import { gpaText, trendText } from "./p1.js";

// 13 F12 subjects plus 한국사 (types MockSubjectCode, judge-report R3)
const MOCK_CODES: readonly MockSubjectCode[] = [...SUBJECT_CODES, "HIST"];

const EXAM_OPS_IDS = {
  RISK: "EXAMOPS_RISK",
  MID: "EXAMOPS_MID",
  OK: "EXAMOPS_OK",
} as const;

const hundredths = (grade: number) => Math.round(grade * 100);

/** 22 r41: 6-2 against 6, on the 0.01 grid. */
const recentText = (q6: number, q6r: number | undefined) => {
  if (q6r === undefined) return copy("GRD_RECENT_NA");
  const diff = hundredths(q6r) - hundredths(q6);
  if (diff === 0) return copy("GRD_RECENT_SAME");
  // a smaller grade number is better: 6-2 < 6 is UP
  return fill(diff < 0 ? "GRD_RECENT_UP" : "GRD_RECENT_DOWN", {
    d: Math.abs(diff) / 100,
  });
};

const gradesOf = <S extends MockSubjectCode>(
  codes: readonly S[],
  grades: Readonly<Partial<Record<S, number>>>,
) =>
  codes.flatMap((subject) => {
    const grade = grades[subject];
    return grade === undefined ? [] : [{ subject, grade }];
  });

const examOpsEvidence = (answers: Engine["answers"]) => {
  const answer = answers.q9.items[EXAM_ITEM - 1];
  const word = answer === undefined ? undefined : LIKERT_LEVELS[answer]?.label;
  if (word === undefined) throw new Error("missing q9 item " + EXAM_ITEM);
  const examRoom = answers.q10?.includes(EXAM_OPTION)
    ? OPTIONS.q10.find((o) => o.ordinal === EXAM_OPTION)?.label
    : undefined;
  return {
    item: EXAM_ITEM_LABEL,
    answer: word,
    ...(examRoom === undefined ? {} : { examRoom }),
  };
};

export function buildPage3(engine: Engine): Page3 {
  const { answers, scores } = engine;
  const school = gradesOf<SubjectCode>(SUBJECT_CODES, answers.q6s ?? {});
  const verdicts = scores.subjects;
  return {
    // 22 r38: 7번 option number, NA when unanswered
    title: copy("GRD_HEAD_" + (answers.q8 ?? "NA")),
    lead: copy("GRD_LEAD"),
    gpa: gpaText(answers),
    recent: recentText(answers.q6, answers.q6r),
    trend: trendText(answers),
    // 22 r43: shown with 6-1 grades (the switch hides 6-1 otherwise)
    ...(school.length > 0
      ? {
          bars: {
            school,
            ...(answers.q6m
              ? {
                  mock: {
                    month: answers.q6m.month,
                    grades: gradesOf(MOCK_CODES, answers.q6m.grades),
                  },
                }
              : {}),
          },
        }
      : {}),
    // 22 r44 table, else 22 r45
    subjects: verdicts
      ? {
          kind: "table",
          rows: SUBJECT_CODES.flatMap((subject) => {
            const verdict = verdicts[subject];
            return verdict === undefined
              ? []
              : [
                  {
                    subject,
                    verdict,
                    text: copy(subjectTextId(answers, subject, verdict)),
                  },
                ];
          }),
          note: copy("SUBJ_RULE_NOTE"),
        }
      : { kind: "skip", note: copy("SUBJ_SKIP_NOTE") },
    // 22 r46
    examOps: {
      heading: copy("EXAMOPS_TITLE"),
      body: copy(EXAM_OPS_IDS[scores.examOps]),
    },
    // spec row 76: 응답 근거 (8-15 응답어, 10번 15항목 선택 여부) from 21 C35
    examOpsEvidence: examOpsEvidence(answers),
  };
}
