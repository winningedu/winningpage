// 05장 성장 흐름과 다음 단계(명세 No.165~170, 197, 202). 집계, 단계 카드, 다음 단계 후보는 코드가 정하고
// 후보마다 모델 문장 하나만 붙는다. 개발 참고 박스는 그리지 않는다.

import type {
  ReportCh04,
  ReportCh05,
  ReportNextStep,
  ReportNextStepKey,
  ReportTextCard,
} from "../../../../src/lib/selfeval/reportTypes.js";
import type { ReadBody } from "./body.js";
import type { Ch02Result, RecordInfo } from "./ch02.js";
import { completionText, NEXT_STEP_MAX } from "./copy.js";
import type { BuildInput, StageSource } from "./inputs.js";

export type NextStepCandidate = {
  key: ReportNextStepKey;
  tag: string;
  /** 검증의 고치면 좋은 곳 문장(verification_fix 만). */
  improvement?: string;
};

const tagNumber = (tag: string) => Number(tag.slice(1));

function textCard<T>(
  source: StageSource<T>,
  pick: (v: T) => { text: string; date: string | null },
): ReportTextCard {
  if (source.state !== "ok") {
    return { state: source.state, text: null, date: null };
  }
  const { text, date } = pick(source.value);
  return { state: "ok", text, date };
}

/** 다음 단계 후보(No.169). 후보 순서 ① 에서 ⑤ 로 한 건씩 찾고 4건에서 멈춘다. */
export function findNextStepCandidates(
  input: BuildInput,
  body: ReadBody,
  ch02: Ch02Result,
): NextStepCandidate[] {
  const out: NextStepCandidate[] = [];
  const infos = [...ch02.info.values()];
  const byTagOrder = (a: string, b: string) => tagNumber(a) - tagNumber(b);

  const memoTag = (id: string) => ch02.memoTags.get(id) as string;
  const sentencesOfMemo = (id: string) =>
    body.sentences.filter((s) => s.refs.some((r) => r.refId === id));

  // ③ 한계 문장과 이어지고 실천이 시작된 근거.
  const actionTags: string[] = [];
  for (const s of body.sentences) {
    const hasLimitation = s.refs.some((r) => r.item === "limitation");
    if (!hasLimitation) continue;
    for (const r of s.refs) {
      if (r.item !== "action") continue;
      const tag = r.kind === "memo" ? memoTag(r.refId) : ch02.tagOf(r.refId);
      if (tag !== null) actionTags.push(tag);
    }
  }
  const verifyTag = [...new Set(actionTags)].sort(byTagOrder)[0] ?? null;

  // ① 반영됐지만 한 문장에만 쓰인 수기. 가장 늦게 쓴 메모 하나.
  const single = [...input.memos]
    .filter(
      (m) => sentencesOfMemo(m.id).length === 1 && memoTag(m.id) !== verifyTag,
    )
    .sort((a, b) => b.writtenAt.localeCompare(a.writtenAt))[0];
  if (single !== undefined) {
    out.push({ key: "memo_detail", tag: memoTag(single.id) });
  }

  // ② 진행 중이라 반영하지 않은 기록.
  const going = infos
    .filter(
      (i) =>
        i.role === "in_progress" && i.record.recordStatus === "in_progress",
    )
    .map((i) => i.tag)
    .sort(byTagOrder)[0];
  if (going !== undefined) out.push({ key: "finish_in_progress", tag: going });

  if (verifyTag !== null) out.push({ key: "verify_action", tag: verifyTag });

  // ④ 미반영이면서 다른 과목 추천이 붙은 기록.
  const rows = ch02.ch02.subjects.flatMap((s) => s.rows);
  const elsewhere = rows.find(
    (r) => r.role === "unreflected" && r.recommendation !== null,
  );
  if (elsewhere !== undefined) {
    out.push({ key: "use_elsewhere", tag: elsewhere.tag });
  }

  // ⑤ 검증의 고치면 좋은 곳 상위 항목. 가장 많이 인용된 기록 꼬리표를 붙인다.
  if (input.topImprovement !== null) {
    const top = infos
      .filter((i) => i.sentenceNumbers.length > 0)
      .sort(
        (a, b) =>
          b.sentenceNumbers.length - a.sentenceNumbers.length ||
          byTagOrder(a.tag, b.tag),
      )[0];
    if (top !== undefined) {
      out.push({
        key: "verification_fix",
        tag: top.tag,
        improvement: input.topImprovement,
      });
    }
  }
  return out.slice(0, NEXT_STEP_MAX);
}

function tagCard(infos: RecordInfo[], kind: "performance" | "deep") {
  const ofKind = infos
    .filter((i) => i.kind === kind)
    .sort((a, b) => tagNumber(a.tag) - tagNumber(b.tag));
  return {
    items: ofKind
      .filter((i) => i.sentenceNumbers.length > 0)
      .map((i) => ({ tag: i.tag, subject: i.subject })),
    inProgressTags: ofKind
      .filter((i) => i.record.recordStatus === "in_progress")
      .map((i) => i.tag),
  };
}

export function buildCh05(
  input: BuildInput,
  body: ReadBody,
  ch02: Ch02Result,
  ch04: ReportCh04 | null,
  text: (id: string) => string | null,
): ReportCh05 {
  const infos = [...ch02.info.values()];
  const completed = infos.filter((i) => i.record.recordStatus === "completed");
  const reflected = completed.filter((i) => i.sentenceNumbers.length > 0);
  const reflectedSubjects = new Set(reflected.map((i) => i.subject));
  const linked = body.sentences.filter(
    (s) => s.refs.length > 0 || s.student,
  ).length;
  const nextSteps: ReportNextStep[] = findNextStepCandidates(
    input,
    body,
    ch02,
  ).map((c) => ({ key: c.key, tag: c.tag, text: text(`next:${c.key}`) }));
  return {
    counts: {
      completedReports: completed.length,
      subjectCount: new Set(
        completed.map((i) => i.subject).filter((s) => s !== ""),
      ).size,
      reflectedReports: reflected.length,
      reflectedMemos: ch04?.reflectedCount ?? 0,
      linkedSubjects: ch02.ch02.subjects
        .map((s) => s.subject)
        .filter((s) => s !== "" && reflectedSubjects.has(s)),
    },
    cards: {
      diagnosis: textCard(input.stages.diagnosis, (v) => ({
        text: v.sentence,
        date: v.date,
      })),
      goal: textCard(input.stages.goal, (v) => ({
        text: v.sentence,
        date: null,
      })),
      growth: textCard(input.stages.growth, (v) => ({
        text: v.sentence,
        date: null,
      })),
      performance: tagCard(infos, "performance"),
      inquiry: tagCard(infos, "deep"),
      selfeval: {
        total: body.sentences.length,
        linked,
        allLinked: linked === body.sentences.length,
        text: completionText(body.sentences.length, linked),
      },
    },
    nextSteps,
  };
}
