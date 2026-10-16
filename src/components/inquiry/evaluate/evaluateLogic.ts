// 평가 리포트 표시용 순수 함수. 서버가 확정한 값(점수, 수준, 상태)은 그대로 보여주고,
// 문구 조립과 표 행 모양만 여기서 만든다.
import {
  CHECKLIST_LABELS,
  CORE_ERROR_LABELS,
  EVAL_SECTION_LABELS,
  MAX_EVALUATIONS,
  RUBRIC_ITEM_LABELS,
  SOURCE_STATUS_LABELS,
} from "@/lib/inquiry/labels";
import type {
  EvaluationReport,
  FixItem,
  Level,
  RubricItemResult,
  SectionId,
  SourceCheck,
} from "@/lib/inquiry/types";

export type LevelTone = "good" | "mid" | "low";

export function summaryLine(coreErrorCount: number): string {
  return coreErrorCount > 0
    ? `핵심 오류 ${coreErrorCount}건이 있어요. 총점과 관계없이 제출 전에 반드시 고쳐야 해요`
    : "핵심 오류가 없어요. 먼저 고칠 것을 보완하면 제출할 수 있어요. 점수는 서비스 내부 기준이에요";
}

export function levelTone(level: Level): LevelTone {
  if (level >= 4) return "good";
  if (level === 3) return "mid";
  return "low";
}

export type RubricRow = {
  id: RubricItemResult["id"];
  label: string;
  scoreText: string;
  levelText: string;
  tone: LevelTone;
  metText: string;
  capReason: string | null;
};

export function buildRubricRows(items: RubricItemResult[]): RubricRow[] {
  return items.map((it) => {
    const meta = RUBRIC_ITEM_LABELS[it.id];
    return {
      id: it.id,
      label: meta.label,
      scoreText: `${it.score} / ${meta.maxScore}`,
      levelText: `수준 ${it.level}`,
      tone: levelTone(it.level),
      metText:
        it.unmet.length === 0
          ? `요건 ${it.met.length}개 모두 충족`
          : `미충족: ${it.unmet.join(", ")}`,
      capReason: it.capReason,
    };
  });
}

/** 핵심 오류 카드 한 건의 표시값. */
export function buildCoreErrorRows(errors: EvaluationReport["coreErrors"]) {
  return errors.map((e) => ({
    key: `${e.id}-${e.location}`,
    label: CORE_ERROR_LABELS[e.id],
    location: sectionName(e.location),
    detail: e.detail,
    effect: e.effect,
  }));
}

function sectionName(id: SectionId): string {
  return EVAL_SECTION_LABELS[id];
}

export function buildFixRows(items: FixItem[]) {
  return items.map((f) => ({
    location: sectionName(f.location).split(" ")[0],
    problem: f.problem,
    impact: f.impact,
    action: f.action,
    check: f.check,
  }));
}

export function buildChecklistSummary(
  checklist: EvaluationReport["checklist"],
) {
  return {
    metCount: checklist.filter((c) => c.met).length,
    total: checklist.length,
    unmetNames: checklist
      .filter((c) => !c.met)
      .map((c) => CHECKLIST_LABELS[c.id] ?? c.id),
  };
}

export function buildSourceRows(sources: SourceCheck[]) {
  return sources.map((s) => ({
    text: s.text,
    statusLabel: SOURCE_STATUS_LABELS[s.status],
    note: s.status === "supplied_unverified" ? "직접 확인해 주세요" : null,
  }));
}

const SECTION_ORDER = Object.keys(EVAL_SECTION_LABELS) as SectionId[];

export function buildPlaceholderLines(
  placeholders: Partial<Record<SectionId, number>>,
): string[] {
  return SECTION_ORDER.filter((id) => (placeholders[id] ?? 0) > 0).map(
    (id) => `${sectionName(id)} ${placeholders[id]}개`,
  );
}

/** 남은 재평가 횟수. 평가 실행 상한에서 지금까지 실행한 횟수를 뺀다. */
export function remainingReevaluations(evaluationCount: number): number {
  return Math.max(0, MAX_EVALUATIONS - evaluationCount);
}
