// 표지 표시값(명세 No.134~136)과 01장 본문(No.145~148). 학생 이름은 담지 않는다.

import { formatGradeLabel } from "../../../../src/components/report/formatGradeLabel.js";
import type {
  ReportCh01,
  ReportCover,
} from "../../../../src/lib/selfeval/reportTypes.js";
import type { ReadBody } from "./body.js";
import type { Ch02Result } from "./ch02.js";
import { subjectTitle } from "./copy.js";
import { coverDate } from "./date.js";
import type { BuildInput } from "./inputs.js";

export function buildCover(input: BuildInput): ReportCover {
  const { session } = input;
  const name =
    session.area === "subject" ? session.subject : session.activityName;
  if (name === null || name.trim() === "") {
    throw new Error("리포트 표지에 쓸 과목명이나 활동명이 없습니다.");
  }
  return {
    gradeLabel: formatGradeLabel(input.profileGrade),
    savedAt: coverDate(input.savedAt, input.timeZone),
    subjectTitle: subjectTitle(name),
    academicYear: session.academicYear,
    steps: input.steps,
  };
}

export function buildCh01(
  input: BuildInput,
  body: ReadBody,
  ch02: Ch02Result,
): ReportCh01 {
  const { session, charCount } = input;
  const target = session.targetChars;
  const measured =
    session.targetCharsMode === "with_space"
      ? charCount.withSpace
      : charCount.withoutSpace;
  return {
    paragraphs: body.paragraphs.map((p) => ({
      sentences: p.map((s) => ({
        n: s.n,
        text: s.text,
        tags: s.refs.flatMap((r) => ch02.tagOf(r.refId) ?? []),
        needsConfirm: s.needsConfirm,
      })),
    })),
    charCount,
    targetChars: target,
    targetCharsMode: session.targetCharsMode,
    diffPercent:
      target === null || target <= 0
        ? null
        : Math.round(((measured - target) / target) * 1000) / 10,
    paragraphCount: body.paragraphs.length,
    sentenceCount: body.sentences.length,
  };
}
