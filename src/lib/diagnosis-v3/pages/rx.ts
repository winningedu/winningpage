// 처방표 of 4p and 6p (22 r53, r69; 20_처방규칙 via prescription.ts).

import { copy, fill } from "../copy.js";
import { LIKERT_LEVELS, type Likert, SCALE_ITEMS } from "../likert.js";
import { formatDue, type Plan, taskText } from "../plan.js";
import type { Engine } from "../report.js";
import type { Prescription, PrescriptionTable } from "../types.js";

const answerLabel = (answer: Likert) => {
  const level = LIKERT_LEVELS[answer];
  if (!level) throw new Error("bad likert " + answer);
  return level.label;
};

/** 01 C item text of a q9 or q11 item. */
const itemText = (engine: Engine, question: "q9" | "q11", no: number) => {
  const items =
    question === "q9" ? SCALE_ITEMS.q9 : SCALE_ITEMS.q11[engine.scores.track];
  const text = items.find((item) => item.no === no)?.text;
  if (text === undefined) throw new Error("no " + question + " item " + no);
  return text;
};

const linkText = (
  plan: Plan,
  link: Prescription["weak"][number]["link"],
): string =>
  link.kind === "task"
    ? formatDue(link.task.date) + " " + taskText(plan, link.task)
    : copy(link.actId);

export function prescriptionTable(
  engine: Engine,
  rx: Prescription,
): PrescriptionTable {
  const plan = engine.scores.plan;
  return {
    intro: copy("RX_INTRO"),
    ...(rx.lever ? { lever: copy(rx.lever) } : {}),
    weak:
      rx.weak.length === 0
        ? { kind: "none", text: copy("RX_NONE_WEAK") }
        : {
            kind: "items",
            items: rx.weak.map((item) => ({
              question: itemText(engine, item.question, item.no),
              target: fill("rx.target", {
                cur: answerLabel(item.answer),
                tgt: answerLabel(item.target),
              }),
              link: linkText(plan, item.link),
            })),
          },
    strong: rx.strong.map((item) => ({
      question: itemText(engine, item.question, item.no),
      answer: answerLabel(item.answer),
    })),
  };
}
